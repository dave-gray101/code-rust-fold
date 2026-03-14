import * as vscode from 'vscode';

/** The logical target group a fold operation acts on. */
export type FoldTargetKind =
    | 'comments'
    | 'docComments'
    | 'functions'
    | 'impls'
    | 'structs'
    | 'enums'
    | 'traits'
    | 'mods'
    | 'macros'
    | 'use'
    | 'tests'
    | 'all';

/** A resolved line-based range to fold (0-indexed, matching VS Code internals). */
export interface FoldRange {
    /** The line containing the opening brace / start of the foldable region (0-indexed). */
    startLine: number;
    /** The last line of the region (0-indexed). */
    endLine: number;
}

/** Direction of a fold operation. */
export type FoldDirection = 'fold' | 'unfold' | 'toggle';

/** What the group-picker quick-pick stores per item. */
export interface GroupPickerItem extends vscode.QuickPickItem {
    targetKind: FoldTargetKind;
}
