import * as vscode from 'vscode';
import { FoldRange } from './types';

/**
 * Issues VS Code fold / unfold commands for a given set of line ranges.
 *
 * Toggle decision is made upstream in FoldController (which persists state in
 * workspaceState). This class only executes explicit fold or unfold operations.
 *
 * VS Code's `editor.fold` command accepts `{ selectionLines: number[] }` where
 * each number is the 0-based line of the opening brace.
 */
export class FoldExecutor {

    fold(_editor: vscode.TextEditor, ranges: FoldRange[]): void {
        if (ranges.length === 0) { return; }
        const startLines = ranges.map(r => r.startLine);
        for (const batch of chunk(startLines, 200)) {
            vscode.commands.executeCommand('editor.fold', {
                selectionLines: batch,
                levels: 1,
            });
        }
    }

    unfold(_editor: vscode.TextEditor, ranges: FoldRange[]): void {
        if (ranges.length === 0) { return; }
        const startLines = ranges.map(r => r.startLine);
        for (const batch of chunk(startLines, 200)) {
            vscode.commands.executeCommand('editor.unfold', {
                selectionLines: batch,
            });
        }
    }
}

function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}
