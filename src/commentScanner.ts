import * as vscode from 'vscode';
import { FoldRange } from './types';

/**
 * Scans a document's text for comment blocks and `use` statement groups,
 * returning foldable line ranges. This is used for targets that rust-analyzer
 * does not surface as document symbols.
 */
export class CommentScanner {

    /**
     * Returns ranges for all line-comment blocks (`//`) that are NOT doc-comments.
     * Consecutive `//` lines (excluding `///` and `//!`) are grouped into one range.
     */
    scanLineComments(doc: vscode.TextDocument): FoldRange[] {
        const ranges: FoldRange[] = [];
        let blockStart = -1;
        let prevLine = -2;

        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text.trimStart();
            const isLineComment = text.startsWith('//') && !text.startsWith('///') && !text.startsWith('//!');

            if (isLineComment) {
                if (blockStart === -1) {
                    blockStart = i;
                }
                prevLine = i;
            } else {
                if (blockStart !== -1 && prevLine > blockStart) {
                    ranges.push({ startLine: blockStart, endLine: prevLine });
                }
                blockStart = -1;
                prevLine = -2;
            }
        }
        // flush trailing block
        if (blockStart !== -1 && prevLine > blockStart) {
            ranges.push({ startLine: blockStart, endLine: prevLine });
        }
        return ranges;
    }

    /**
     * Returns ranges for block comments (slash-star ... star-slash).
     * Each block comment is its own range (must span at least 2 lines to be foldable).
     */
    scanBlockComments(doc: vscode.TextDocument): FoldRange[] {
        const ranges: FoldRange[] = [];
        const fullText = doc.getText();
        let searchFrom = 0;

        while (searchFrom < fullText.length) {
            const openIdx = fullText.indexOf('/*', searchFrom);
            if (openIdx === -1) { break; }

            // Skip if this is inside a string literal — simple heuristic:
            // count unescaped quotes before openIdx on the same line.
            const lineStart = fullText.lastIndexOf('\n', openIdx) + 1;
            const prefix = fullText.slice(lineStart, openIdx);
            if (this.isInsideString(prefix)) {
                searchFrom = openIdx + 2;
                continue;
            }

            const closeIdx = fullText.indexOf('*/', openIdx + 2);
            if (closeIdx === -1) { break; }

            const startLine = doc.positionAt(openIdx).line;
            const endLine = doc.positionAt(closeIdx + 1).line;

            if (endLine > startLine) {
                ranges.push({ startLine, endLine });
            }
            searchFrom = closeIdx + 2;
        }
        return ranges;
    }

    /**
     * Returns ranges for doc-comment blocks (`///` and `//!`).
     * Consecutive doc-comment lines are grouped.
     */
    scanDocComments(doc: vscode.TextDocument): FoldRange[] {
        const ranges: FoldRange[] = [];
        let blockStart = -1;
        let prevLine = -2;

        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text.trimStart();
            const isDoc = text.startsWith('///') || text.startsWith('//!');

            if (isDoc) {
                if (blockStart === -1) {
                    blockStart = i;
                }
                prevLine = i;
            } else {
                if (blockStart !== -1 && prevLine > blockStart) {
                    ranges.push({ startLine: blockStart, endLine: prevLine });
                }
                blockStart = -1;
                prevLine = -2;
            }
        }
        if (blockStart !== -1 && prevLine > blockStart) {
            ranges.push({ startLine: blockStart, endLine: prevLine });
        }
        return ranges;
    }

    /**
     * Returns ranges covering groups of consecutive `use` statements.
     * A group ends when a non-`use`, non-blank, non-comment line is encountered.
     * Single `use` lines that are alone are included (VS Code will fold them
     * only if folding providers support it; we pass them and let the executor decide).
     */
    scanUseStatements(doc: vscode.TextDocument): FoldRange[] {
        const ranges: FoldRange[] = [];
        let groupStart = -1;
        let lastUseLine = -1;

        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text.trim();
            const isUse = text.startsWith('use ') || text.startsWith('pub use ') || text.startsWith('pub(crate) use ');
            const isBlankOrComment = text === '' || text.startsWith('//') || text.startsWith('/*') || text.startsWith('*');

            if (isUse) {
                if (groupStart === -1) {
                    groupStart = i;
                }
                lastUseLine = i;
            } else if (isBlankOrComment) {
                // allow blank/comment lines within a use group
            } else {
                if (groupStart !== -1) {
                    ranges.push({ startLine: groupStart, endLine: lastUseLine });
                    groupStart = -1;
                    lastUseLine = -1;
                }
            }
        }
        if (groupStart !== -1) {
            ranges.push({ startLine: groupStart, endLine: lastUseLine });
        }
        return ranges;
    }

    /** Naively checks whether a line prefix indicates we are inside a string. */
    private isInsideString(prefix: string): boolean {
        let inStr = false;
        let i = 0;
        while (i < prefix.length) {
            const ch = prefix[i];
            if (ch === '"' && (i === 0 || prefix[i - 1] !== '\\')) {
                inStr = !inStr;
            }
            i++;
        }
        return inStr;
    }
}
