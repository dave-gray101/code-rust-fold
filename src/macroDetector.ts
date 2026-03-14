import * as vscode from 'vscode';

/**
 * Determines whether a DocumentSymbol returned by rust-analyzer represents
 * a macro invocation / macro_rules definition rather than a plain `mod` block
 * or function.
 *
 * rust-analyzer symbol kind mappings (as of 2024):
 *   macro_rules! foo  →  kind=Module,   detail contains "macro_rules"
 *   proc-macro crate  →  kind=Function, detail contains "proc_macro"
 *   derive macro      →  kind=Function, detail contains "proc_macro_derive"
 *   attribute macro   →  kind=Function, detail contains "proc_macro_attribute"
 *   fn-like macro inv →  kind=Module or Function, name ends with "!"
 *
 * We also scan the symbol's selection range text in the document to confirm.
 */
export class MacroDetector {
    /**
     * Returns true if the symbol should be classified as a MACRO (not a mod/fn).
     */
    isMacro(symbol: vscode.DocumentSymbol, doc: vscode.TextDocument): boolean {
        const detail = (symbol.detail ?? '').toLowerCase();

        // rust-analyzer sets detail to "macro_rules" for macro_rules! definitions
        if (detail.includes('macro_rules')) {
            return true;
        }

        // Proc-macro annotations in detail
        if (
            detail.includes('proc_macro') ||
            detail.includes('proc macro')
        ) {
            return true;
        }

        // Some RA versions use the name with a trailing "!" for macro invocations
        if (symbol.name.endsWith('!')) {
            return true;
        }

        // Scan the actual source text at the symbol's selection range start line
        // to look for `macro_rules!` keyword
        const startLine = symbol.selectionRange.start.line;
        if (startLine < doc.lineCount) {
            const lineText = doc.lineAt(startLine).text;
            if (/\bmacro_rules\s*!/.test(lineText)) {
                return true;
            }
            // Proc-macro attribute just above the symbol — look one line up
            if (startLine > 0) {
                const prevLine = doc.lineAt(startLine - 1).text;
                if (
                    prevLine.includes('#[proc_macro') ||
                    prevLine.includes('#[proc_macro_derive') ||
                    prevLine.includes('#[proc_macro_attribute')
                ) {
                    return true;
                }
            }
        }

        // Check the broader range start line (e.g. when RA puts attributes in range)
        const rangeStart = symbol.range.start.line;
        if (rangeStart !== startLine && rangeStart < doc.lineCount) {
            const rangeLineText = doc.lineAt(rangeStart).text;
            if (/\bmacro_rules\s*!/.test(rangeLineText)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns true if the symbol is a `mod` block (not a macro).
     * A symbol must be SymbolKind.Module AND not classified as a macro.
     */
    isPlainMod(symbol: vscode.DocumentSymbol, doc: vscode.TextDocument): boolean {
        return (
            symbol.kind === vscode.SymbolKind.Module &&
            !this.isMacro(symbol, doc)
        );
    }
}
