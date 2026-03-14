import * as vscode from 'vscode';
import { FoldTargetKind, FoldDirection, GroupPickerItem } from './types';
import { SymbolProvider } from './symbolProvider';
import { CommentScanner } from './commentScanner';
import { FoldExecutor } from './foldExecutor';
import { FoldRange } from './types';

const GROUP_PICKER_STATE_KEY = 'rustFold.groupPickerLastSelection';
/** workspaceState key prefix: `rustFold.folded.<uri>.<kind>` → boolean */
const FOLD_STATE_PREFIX = 'rustFold.folded.';

const ALL_KINDS: FoldTargetKind[] = [
    'comments', 'docComments', 'functions', 'impls', 'structs',
    'enums', 'traits', 'mods', 'macros', 'use', 'tests',
];

/**
 * Orchestrates the full fold/unfold pipeline:
 *   1. Resolve toggle direction using persisted workspaceState.
 *   2. Gather ranges for the requested target kind(s).
 *   3. Delegate execution to FoldExecutor.
 *   4. Persist the new fold state to workspaceState.
 *
 * Toggle state is stored per (documentUri, FoldTargetKind) in workspaceState so
 * it survives extension host restarts and VS Code reloads.
 */
export class FoldController {
    private readonly symbolProvider = new SymbolProvider();
    private readonly commentScanner = new CommentScanner();
    private readonly executor = new FoldExecutor();

    constructor(private readonly context: vscode.ExtensionContext) {}

    /** Entry point for all fold operations triggered by commands. */
    async execute(
        kind: FoldTargetKind,
        direction: FoldDirection,
        editor?: vscode.TextEditor
    ): Promise<void> {
        const activeEditor = editor ?? vscode.window.activeTextEditor;
        if (!activeEditor) { return; }

        if (activeEditor.document.languageId !== 'rust') { return; }

        this.warnIfNoRustAnalyzer(activeEditor.document);

        if (kind === 'all') {
            await this.executeAll(direction, activeEditor);
            return;
        }

        const uri = activeEditor.document.uri.toString();
        const shouldFold = this.resolveDirection(direction, uri, kind);
        const ranges = await this.getRanges(kind, activeEditor.document);

        if (shouldFold) {
            this.executor.fold(activeEditor, ranges);
        } else {
            this.executor.unfold(activeEditor, ranges);
        }
        await this.setFolded(uri, kind, shouldFold);
    }

    /** Show the group picker quick-pick and fold the chosen groups. */
    async executeGroupPicker(direction: FoldDirection): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'rust') { return; }

        const rememberSelection: boolean = vscode.workspace
            .getConfiguration('rustFold')
            .get('groupPickerRememberSelection', false);

        const allItems: GroupPickerItem[] = [
            { label: 'Comments',      targetKind: 'comments' },
            { label: 'Doc Comments',  targetKind: 'docComments' },
            { label: 'Functions',     targetKind: 'functions' },
            { label: 'Impls',         targetKind: 'impls' },
            { label: 'Structs',       targetKind: 'structs' },
            { label: 'Enums',         targetKind: 'enums' },
            { label: 'Traits',        targetKind: 'traits' },
            { label: 'Modules',       targetKind: 'mods' },
            { label: 'Macros',        targetKind: 'macros' },
            { label: 'Use Statements',targetKind: 'use' },
            { label: 'Tests',         targetKind: 'tests' },
        ];

        // Restore previous selection if the setting is on
        let previousSelection: string[] = [];
        if (rememberSelection) {
            previousSelection = this.context.workspaceState.get<string[]>(GROUP_PICKER_STATE_KEY, []);
        }

        const pickItems: GroupPickerItem[] = allItems.map(item => ({
            ...item,
            picked: previousSelection.includes(item.targetKind),
        }));

        const picked = await vscode.window.showQuickPick<GroupPickerItem>(
            pickItems,
            {
                canPickMany: true,
                placeHolder: 'Select element types to fold/unfold',
                title: 'Rust Fold: Toggle Fold Group',
            }
        );

        if (!picked || picked.length === 0) { return; }

        if (rememberSelection) {
            await this.context.workspaceState.update(
                GROUP_PICKER_STATE_KEY,
                picked.map(p => p.targetKind)
            );
        }

        const uri = activeEditor.document.uri.toString();

        // For a group toggle: fold if ANY of the picked kinds is currently unfolded
        let shouldFold: boolean;
        if (direction === 'fold') {
            shouldFold = true;
        } else if (direction === 'unfold') {
            shouldFold = false;
        } else {
            shouldFold = picked.some(p => !this.isFolded(uri, p.targetKind));
        }

        for (const item of picked) {
            const ranges = await this.getRanges(item.targetKind, activeEditor.document);
            if (shouldFold) {
                this.executor.fold(activeEditor, ranges);
            } else {
                this.executor.unfold(activeEditor, ranges);
            }
            await this.setFolded(uri, item.targetKind, shouldFold);
        }
    }

    /** Called by extension when a document is closed. No active cleanup needed. */
    onDocumentClosed(_doc: vscode.TextDocument): void {}

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private async executeAll(direction: FoldDirection, editor: vscode.TextEditor): Promise<void> {
        const uri = editor.document.uri.toString();

        let shouldFold: boolean;
        if (direction === 'fold') {
            shouldFold = true;
        } else if (direction === 'unfold') {
            shouldFold = false;
        } else {
            // Fold if ANY sub-kind is currently unfolded
            shouldFold = ALL_KINDS.some(k => !this.isFolded(uri, k));
        }

        for (const k of ALL_KINDS) {
            const ranges = await this.getRanges(k, editor.document);
            if (shouldFold) {
                this.executor.fold(editor, ranges);
            } else {
                this.executor.unfold(editor, ranges);
            }
            await this.setFolded(uri, k, shouldFold);
        }
    }

    /**
     * Resolve a FoldDirection of 'toggle' into a concrete boolean.
     * Uses persisted workspaceState: defaults to folding (true) on first use.
     */
    private resolveDirection(direction: FoldDirection, uri: string, kind: FoldTargetKind): boolean {
        if (direction === 'fold')   { return true; }
        if (direction === 'unfold') { return false; }
        // toggle: invert the last known state (default: not folded → fold)
        return !this.isFolded(uri, kind);
    }

    private isFolded(uri: string, kind: FoldTargetKind): boolean {
        return this.context.workspaceState.get<boolean>(
            `${FOLD_STATE_PREFIX}${uri}.${kind}`,
            false
        );
    }

    private async setFolded(uri: string, kind: FoldTargetKind, folded: boolean): Promise<void> {
        await this.context.workspaceState.update(
            `${FOLD_STATE_PREFIX}${uri}.${kind}`,
            folded
        );
    }

    private async getRanges(kind: FoldTargetKind, doc: vscode.TextDocument): Promise<FoldRange[]> {
        switch (kind) {
            case 'comments':
                return [
                    ...this.commentScanner.scanLineComments(doc),
                    ...this.commentScanner.scanBlockComments(doc),
                ];
            case 'docComments':
                return this.commentScanner.scanDocComments(doc);
            case 'use':
                return this.commentScanner.scanUseStatements(doc);
            default: {
                const symbolSet = await this.symbolProvider.getSymbolRanges(doc);
                if (!symbolSet) { return []; }
                switch (kind) {
                    case 'functions': return symbolSet.functions;
                    case 'impls':     return symbolSet.impls;
                    case 'structs':   return symbolSet.structs;
                    case 'enums':     return symbolSet.enums;
                    case 'traits':    return symbolSet.traits;
                    case 'mods':      return symbolSet.mods;
                    case 'macros':    return symbolSet.macros;
                    case 'tests':     return symbolSet.tests;
                    default:          return [];
                }
            }
        }
    }

    private warnIfNoRustAnalyzer(doc: vscode.TextDocument): void {
        const shouldWarn: boolean = vscode.workspace
            .getConfiguration('rustFold')
            .get('requireRustAnalyzer', false);
        if (!shouldWarn) { return; }

        // Check if any rust-analyzer extension is active by looking for a known command
        vscode.commands.getCommands(true).then(cmds => {
            const hasRA = cmds.some(c =>
                c.startsWith('rust-analyzer.') || c.startsWith('rustAnalyzer.')
            );
            if (!hasRA) {
                vscode.window.showWarningMessage(
                    'Rust Fold: rust-analyzer does not appear to be active. ' +
                    'Structural folding (functions, structs, etc.) will not work. ' +
                    'Disable this warning in settings: rustFold.requireRustAnalyzer'
                );
            }
        });
    }
}


