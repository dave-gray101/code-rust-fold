import * as vscode from 'vscode';
import { FoldController } from './foldController';
import { FoldTargetKind, FoldDirection } from './types';

export function activate(context: vscode.ExtensionContext): void {
    const controller = new FoldController(context);

    // Clean up fold state when documents are closed
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => controller.onDocumentClosed(doc))
    );

    // ── Toggle commands (with keybindings) ────────────────────────────────────

    const toggleBindings: Array<[string, FoldTargetKind]> = [
        ['rustFold.toggleComments',    'comments'],
        ['rustFold.toggleDocComments', 'docComments'],
        ['rustFold.toggleFunctions',   'functions'],
        ['rustFold.toggleImpls',       'impls'],
        ['rustFold.toggleStructs',     'structs'],
        ['rustFold.toggleEnums',       'enums'],
        ['rustFold.toggleTraits',      'traits'],
        ['rustFold.toggleMods',        'mods'],
        ['rustFold.toggleMacros',      'macros'],
        ['rustFold.toggleUse',         'use'],
        ['rustFold.toggleTests',       'tests'],
        ['rustFold.toggleAll',         'all'],
    ];

    for (const [commandId, kind] of toggleBindings) {
        context.subscriptions.push(
            vscode.commands.registerCommand(commandId, () =>
                controller.execute(kind, 'toggle')
            )
        );
    }

    // Group picker toggle
    context.subscriptions.push(
        vscode.commands.registerCommand('rustFold.toggleGroup', () =>
            controller.executeGroupPicker('toggle')
        )
    );

    // ── Explicit fold/unfold commands (palette-only, no keybindings) ──────────

    const explicitBindings: Array<[string, FoldTargetKind, FoldDirection]> = [
        ['rustFold.foldComments',      'comments',    'fold'],
        ['rustFold.unfoldComments',    'comments',    'unfold'],
        ['rustFold.foldDocComments',   'docComments', 'fold'],
        ['rustFold.unfoldDocComments', 'docComments', 'unfold'],
        ['rustFold.foldFunctions',     'functions',   'fold'],
        ['rustFold.unfoldFunctions',   'functions',   'unfold'],
        ['rustFold.foldImpls',         'impls',       'fold'],
        ['rustFold.unfoldImpls',       'impls',       'unfold'],
        ['rustFold.foldStructs',       'structs',     'fold'],
        ['rustFold.unfoldStructs',     'structs',     'unfold'],
        ['rustFold.foldEnums',         'enums',       'fold'],
        ['rustFold.unfoldEnums',       'enums',       'unfold'],
        ['rustFold.foldTraits',        'traits',      'fold'],
        ['rustFold.unfoldTraits',      'traits',      'unfold'],
        ['rustFold.foldMods',          'mods',        'fold'],
        ['rustFold.unfoldMods',        'mods',        'unfold'],
        ['rustFold.foldMacros',        'macros',      'fold'],
        ['rustFold.unfoldMacros',      'macros',      'unfold'],
        ['rustFold.foldUse',           'use',         'fold'],
        ['rustFold.unfoldUse',         'use',         'unfold'],
        ['rustFold.foldTests',         'tests',       'fold'],
        ['rustFold.unfoldTests',       'tests',       'unfold'],
        ['rustFold.foldAll',           'all',         'fold'],
        ['rustFold.unfoldAll',         'all',         'unfold'],
    ];

    for (const [commandId, kind, direction] of explicitBindings) {
        context.subscriptions.push(
            vscode.commands.registerCommand(commandId, () =>
                controller.execute(kind, direction)
            )
        );
    }
}

export function deactivate(): void {
    // Nothing to clean up — all resources are disposed via context.subscriptions
}
