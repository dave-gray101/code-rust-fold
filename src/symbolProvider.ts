import * as vscode from 'vscode';
import { FoldRange } from './types';
import { MacroDetector } from './macroDetector';

/**
 * Wraps vscode.executeDocumentSymbolProvider and converts the RA symbol tree
 * into per-category arrays of FoldRange, respecting the `rustFold.foldBodyOnly`
 * configuration setting.
 */
export class SymbolProvider {
    private readonly macroDetector = new MacroDetector();

    /**
     * Fetches document symbols from rust-analyzer and partitions them into
     * category buckets. Returns null if RA is not available / returns nothing.
     */
    async getSymbolRanges(doc: vscode.TextDocument): Promise<SymbolRangeSet | null> {
        let rawSymbols: vscode.DocumentSymbol[];
        try {
            const result = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                doc.uri
            );
            if (!result || result.length === 0) {
                return null;
            }
            rawSymbols = result;
        } catch {
            return null;
        }

        const foldBodyOnly: boolean = vscode.workspace
            .getConfiguration('rustFold')
            .get('foldBodyOnly', true);

        const set: SymbolRangeSet = {
            functions: [],
            impls: [],
            structs: [],
            enums: [],
            traits: [],
            mods: [],
            macros: [],
            tests: [],
        };

        this.walkSymbols(rawSymbols, doc, foldBodyOnly, set, false);
        return set;
    }

    private walkSymbols(
        symbols: vscode.DocumentSymbol[],
        doc: vscode.TextDocument,
        foldBodyOnly: boolean,
        set: SymbolRangeSet,
        insideCfgTestMod: boolean
    ): void {
        for (const sym of symbols) {
            const range = this.resolveRange(sym, doc, foldBodyOnly);

            switch (sym.kind) {
                case vscode.SymbolKind.Function:
                case vscode.SymbolKind.Method: {
                    if (this.macroDetector.isMacro(sym, doc)) {
                        if (range) { set.macros.push(range); }
                    } else if (insideCfgTestMod || this.isTestFunction(sym)) {
                        if (range) { set.tests.push(range); }
                    } else {
                        if (range) { set.functions.push(range); }
                    }
                    break;
                }

                case vscode.SymbolKind.Class: {
                    // RA maps `impl` blocks to SymbolKind.Class
                    if (range) { set.impls.push(range); }
                    // recurse into impl to find methods
                    if (sym.children?.length) {
                        this.walkSymbols(sym.children, doc, foldBodyOnly, set, insideCfgTestMod);
                    }
                    continue; // already recursed
                }

                case vscode.SymbolKind.Struct: {
                    if (range) { set.structs.push(range); }
                    break;
                }

                case vscode.SymbolKind.Enum: {
                    if (range) { set.enums.push(range); }
                    break;
                }

                case vscode.SymbolKind.Interface: {
                    // RA maps `trait` to Interface
                    if (range) { set.traits.push(range); }
                    if (sym.children?.length) {
                        this.walkSymbols(sym.children, doc, foldBodyOnly, set, insideCfgTestMod);
                    }
                    continue;
                }

                case vscode.SymbolKind.Module: {
                    if (this.macroDetector.isMacro(sym, doc)) {
                        if (range) { set.macros.push(range); }
                    } else {
                        const isCfgTest = this.isCfgTestMod(sym, doc);
                        if (range) { set.mods.push(range); }
                        // recurse into mod — functions inside a cfg(test) mod are tests
                        if (sym.children?.length) {
                            this.walkSymbols(sym.children, doc, foldBodyOnly, set, insideCfgTestMod || isCfgTest);
                        }
                    }
                    continue;
                }

                default:
                    break;
            }

            // recurse children for any other node types
            if (sym.children?.length) {
                this.walkSymbols(sym.children, doc, foldBodyOnly, set, insideCfgTestMod);
            }
        }
    }

    /**
     * Resolves the foldable range for a symbol.
     *
     * When foldBodyOnly=true we want to fold starting at the line containing
     * the opening `{`. We scan forward from the selection range to find it.
     * When foldBodyOnly=false we use the full symbol range (includes attributes).
     */
    private resolveRange(
        sym: vscode.DocumentSymbol,
        doc: vscode.TextDocument,
        foldBodyOnly: boolean
    ): FoldRange | null {
        const fullEnd = sym.range.end.line;

        if (!foldBodyOnly) {
            const start = sym.range.start.line;
            if (start >= fullEnd) { return null; }
            return { startLine: start, endLine: fullEnd };
        }

        // Body-only: find the line with the opening `{` starting from selection range
        const searchFrom = sym.selectionRange.start.line;
        for (let i = searchFrom; i <= fullEnd && i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.includes('{')) {
                if (i >= fullEnd) { return null; } // single-line item, nothing to fold
                return { startLine: i, endLine: fullEnd };
            }
        }
        return null;
    }

    /** A function is a test if its name starts with `test_` or is exactly `test`. */
    private isTestFunction(sym: vscode.DocumentSymbol): boolean {
        return sym.name === 'test' || sym.name.startsWith('test_');
    }

    /**
     * Returns true if a mod symbol has a `#[cfg(test)]` or `#[test]` attribute
     * on or immediately above it.
     */
    private isCfgTestMod(sym: vscode.DocumentSymbol, doc: vscode.TextDocument): boolean {
        const checkLine = (lineNum: number): boolean => {
            if (lineNum < 0 || lineNum >= doc.lineCount) { return false; }
            const text = doc.lineAt(lineNum).text;
            return text.includes('#[cfg(test)]') || text.includes('#[test]');
        };
        const start = sym.range.start.line;
        return checkLine(start) || checkLine(start - 1) || checkLine(start - 2);
    }
}

export interface SymbolRangeSet {
    functions: FoldRange[];
    impls: FoldRange[];
    structs: FoldRange[];
    enums: FoldRange[];
    traits: FoldRange[];
    mods: FoldRange[];
    macros: FoldRange[];
    tests: FoldRange[];
}
