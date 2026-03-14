import * as vscode from 'vscode';
import { FoldRange } from './types';

/**
 * Regex patterns that identify the start of each structural kind.
 * Must match from the beginning of a (possibly indented) line.
 * We deliberately exclude `struct Foo;` (unit struct with no body) and
 * `mod foo;` (external mod declaration) — they have no `{` body to fold.
 */
const KIND_PATTERNS = {
    impls:     /^\s*(?:pub\s*(?:\([^)]*\)\s*)?)?(?:unsafe\s+)?impl\b/,
    functions: /^\s*(?:pub\s*(?:\([^)]*\)\s*)?)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s*(?:"[^"]*"\s*)?)?fn\s+\w/,
    structs:   /^\s*(?:pub\s*(?:\([^)]*\)\s*)?)?struct\s+\w/,
    enums:     /^\s*(?:pub\s*(?:\([^)]*\)\s*)?)?enum\s+\w/,
    traits:    /^\s*(?:pub\s*(?:\([^)]*\)\s*)?)?(?:unsafe\s+)?trait\s+\w/,
    mods:      /^\s*(?:pub\s*(?:\([^)]*\)\s*)?)?mod\s+\w/,
} as const;

export type SyntaxKind = keyof typeof KIND_PATTERNS;

/**
 * Pure text-based fallback scanner for structural Rust constructs.
 *
 * Used when rust-analyzer is unavailable or has not yet indexed the document.
 * Handles line comments, block comments, string literals, and raw string
 * literals so that braces inside them do not confuse the depth counter.
 */
export class SyntaxScanner {

    scan(doc: vscode.TextDocument, kind: SyntaxKind): FoldRange[] {
        const pattern = KIND_PATTERNS[kind];
        const fullText = doc.getText();
        const ranges: FoldRange[] = [];

        for (let lineIdx = 0; lineIdx < doc.lineCount; lineIdx++) {
            const lineText = doc.lineAt(lineIdx).text;
            if (!pattern.test(lineText)) { continue; }

            // Find the position (in fullText) of the start of this line
            const lineOffset = doc.offsetAt(new vscode.Position(lineIdx, 0));

            // Find the opening `{` for this construct, skipping comments/strings
            const openOffset = this.findOpenBrace(fullText, lineOffset);
            if (openOffset === -1) { continue; }

            // For mods: skip `mod foo;` (no body)
            if (kind === 'mods') {
                // If there is a `;` before the first `{` on the same logical span, skip
                const between = fullText.slice(lineOffset, openOffset);
                if (between.includes(';')) { continue; }
            }

            // Find the matching closing brace
            const closeOffset = this.findMatchingClose(fullText, openOffset);
            if (closeOffset === -1) { continue; }

            const openLine  = doc.positionAt(openOffset).line;
            const closeLine = doc.positionAt(closeOffset).line;

            if (closeLine <= openLine) { continue; } // single-line, nothing to fold
            ranges.push({ startLine: openLine, endLine: closeLine });

            // Skip ahead past the closing brace so we don't re-check lines
            // inside this block for top-level matches (they belong to inner items).
            // We advance lineIdx to just before the line after the closing brace
            // so the outer for-loop's i++ lands on closeLine + 1 next iteration.
            // NOTE: for nested items (functions inside impl) this intentionally
            // skips them — the RA-based path handles nesting; this fallback only
            // produces top-level ranges.
            lineIdx = closeLine; // outer for does lineIdx++
        }

        return ranges;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Starting at `from`, advances through `text` skipping comments and string
     * literals, and returns the offset of the first `{` found.
     * Returns -1 if none found before the end of the text.
     */
    private findOpenBrace(text: string, from: number): number {
        let i = from;
        while (i < text.length) {
            const ch = text[i];
            const skip = this.trySkipNonCode(text, i);
            if (skip !== -1) { i = skip; continue; }
            if (ch === '{') { return i; }
            // If we hit a `;` before `{`, this construct has no body (e.g. `mod foo;`)
            if (ch === ';') { return -1; }
            i++;
        }
        return -1;
    }

    /**
     * `text[openIdx]` must be `{`.
     * Scans forward counting brace depth and returns the offset of the matching `}`.
     * Returns -1 if unbalanced.
     */
    private findMatchingClose(text: string, openIdx: number): number {
        let depth = 0;
        let i = openIdx;
        while (i < text.length) {
            const ch = text[i];
            const skip = this.trySkipNonCode(text, i);
            if (skip !== -1) { i = skip; continue; }
            if (ch === '{') { depth++; }
            else if (ch === '}') {
                depth--;
                if (depth === 0) { return i; }
            }
            i++;
        }
        return -1;
    }

    /**
     * If position `i` starts a non-code region (comment, string literal, char
     * literal), returns the position AFTER that region.  Otherwise returns -1.
     */
    private trySkipNonCode(text: string, i: number): number {
        const ch = text[i];

        // Line comment //
        if (ch === '/' && text[i + 1] === '/') {
            const nl = text.indexOf('\n', i);
            return nl === -1 ? text.length : nl + 1;
        }

        // Block comment /* ... */
        if (ch === '/' && text[i + 1] === '*') {
            const close = text.indexOf('*/', i + 2);
            return close === -1 ? text.length : close + 2;
        }

        // Raw string literal  r#..."#  /  r##..."##  etc.
        if (ch === 'r' && (text[i + 1] === '"' || text[i + 1] === '#')) {
            return this.skipRawString(text, i);
        }

        // Regular string literal "..."
        if (ch === '"') {
            return this.skipString(text, i);
        }

        // Char literal '.' or escaped '\x'
        // Distinguishes from lifetime 'a by requiring a closing quote
        if (ch === '\'') {
            return this.skipCharLiteral(text, i);
        }

        return -1;
    }

    private skipString(text: string, start: number): number {
        let i = start + 1; // skip opening "
        while (i < text.length) {
            const ch = text[i];
            if (ch === '\\') { i += 2; continue; } // escape sequence
            if (ch === '"') { return i + 1; }
            i++;
        }
        return text.length;
    }

    private skipRawString(text: string, start: number): number {
        let i = start + 1; // skip 'r'
        let hashes = 0;
        while (i < text.length && text[i] === '#') { hashes++; i++; }
        if (i >= text.length || text[i] !== '"') { return -1; } // not a raw string
        i++; // skip opening "
        const closing = '"' + '#'.repeat(hashes);
        const closeIdx = text.indexOf(closing, i);
        return closeIdx === -1 ? text.length : closeIdx + closing.length;
    }

    private skipCharLiteral(text: string, start: number): number {
        // Only treat as char literal if it matches 'x' or '\x' pattern
        // (lifetimes look like 'identifier without a closing quote)
        let i = start + 1;
        if (i >= text.length) { return -1; }
        if (text[i] === '\\') { i++; } // escape
        i++; // the char itself
        if (i < text.length && text[i] === '\'') { return i + 1; }
        return -1; // it's a lifetime, not a char literal
    }
}
