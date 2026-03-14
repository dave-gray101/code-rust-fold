# Rust Fold

A VS Code extension providing enhanced fold/unfold keyboard shortcuts for Rust (`.rs`) files.
Uses **rust-analyzer's LSP document symbols** for structural items and a fast regex scanner for comments and `use` statements.

---

## Features

Toggle-fold any of these syntactical element groups independently, or in any combination:

| Element | Chord | Description |
|---|---|---|
| Comments | `Ctrl+K Ctrl+Shift+;` | Line comments (`//`) and block comments |
| Doc Comments | `Ctrl+K Ctrl+Shift+'` | `///` and `//!` doc-comment blocks |
| Functions | `Ctrl+K Ctrl+Shift+F` | `fn` and method bodies |
| Impls | `Ctrl+K Ctrl+Shift+I` | `impl` blocks |
| Structs | `Ctrl+K Ctrl+Shift+S` | `struct` definitions |
| Enums | `Ctrl+K Ctrl+Shift+E` | `enum` definitions |
| Traits | `Ctrl+K Ctrl+Shift+T` | `trait` definitions |
| Modules | `Ctrl+K Ctrl+Shift+M` | `mod` blocks |
| Macros | `Ctrl+K Ctrl+Shift+A` | `macro_rules!` and proc-macros |
| Use Statements | `Ctrl+K Ctrl+Shift+U` | Groups of `use` imports |
| Tests | `Ctrl+K Ctrl+Shift+X` | `#[test]` functions and `#[cfg(test)]` modules |
| Everything | `Ctrl+K Ctrl+Shift+Z` | All of the above at once |
| Group Picker | `Ctrl+K Ctrl+Shift+G` | Multi-select quick-pick to fold any combination |

All keybindings are **toggle**: pressing once folds, pressing again unfolds.  
Explicit **Fold** and **Unfold** variants for each category are available in the Command Palette (no default keybinding).

### Macro Safety

Macros are treated as a distinct category. A `macro_rules!` body that happens to look like a struct will **only** fold when you use the Macros toggle — never when you toggle structs, enums, etc.

---

## Requirements

- **rust-analyzer** extension must be installed and active in the workspace.
  Structural folding (functions, structs, impls, etc.) is powered by rust-analyzer's document symbol provider.
  Comment and `use`-statement folding works without rust-analyzer.

---

## Installation (from source)

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) (comes with Node.js)
- VS Code 1.85 or later

### Steps

```bash
git clone <repo-url>
cd code-rust-fold
npm install
npm run compile
```

Then either:
- **F5 to test** (see [Testing](#testing-the-extension) below), or
- **Package and install** the `.vsix` file (see [Packaging](#packaging-a-vsix))

---

## Testing the Extension

### Method 1 — F5 (Extension Development Host)

This is the fastest way to test without installing anything permanently.

1. Open the `code-rust-fold` folder in VS Code:
   ```
   File → Open Folder → select code-rust-fold/
   ```
2. Make sure the TypeScript output is up to date:
   ```
   Ctrl+Shift+B  (runs the default build task: npm compile)
   ```
   Or run manually in a terminal:
   ```bash
   npm run compile
   ```
3. Press **F5** (or go to **Run → Start Debugging**).  
   A new VS Code window labeled **[Extension Development Host]** will open.
4. In the **Extension Development Host** window, open any `.rs` file.
5. Make sure **rust-analyzer** is active in that window (check the status bar — it should show `rust-analyzer`).
6. Use any of the keyboard shortcuts listed above.

> **Tip:** If the Extension Development Host window opens but the commands do nothing, wait a few seconds for rust-analyzer to finish indexing, then try again.

### Method 2 — Watch mode (auto-recompile on save)

For iterative development, use the watch task so changes recompile automatically:

```bash
npm run watch
```

Or via the task runner: `Ctrl+Shift+P` → **Tasks: Run Task** → **npm: watch**.

Then press F5 as above. The Extension Development Host will pick up recompiled output when you reload it (`Ctrl+R` inside the host window).

### Available VS Code tasks (`Ctrl+Shift+B` / Tasks: Run Task)

| Task | Description |
|---|---|
| `npm: compile` | One-shot TypeScript compile (default build task, also runs before F5) |
| `npm: watch` | Continuous compile on save |
| `Package VSIX` | Compiles then runs `vsce package` to produce the `.vsix` |

---

## Settings

Open VS Code settings (`Ctrl+,`) and search for **Rust Fold**:

| Setting | Default | Description |
|---|---|---|
| `rustFold.foldBodyOnly` | `true` | Fold only the `{ }` body of an item. Set to `false` to include leading attributes and doc-comment lines in the fold. |
| `rustFold.requireRustAnalyzer` | `false` | Show a warning notification when rust-analyzer is not detected as active. |
| `rustFold.groupPickerRememberSelection` | `false` | Remember the last Group Picker selection per workspace. |

---

## Command Palette

All commands are available via `Ctrl+Shift+P` → search **"Rust:"**:

- `Rust: Toggle Fold <Category>` — toggle keybinding equivalents
- `Rust: Fold <Category>` — explicit fold (no keybinding)
- `Rust: Unfold <Category>` — explicit unfold (no keybinding)
- `Rust: Toggle Fold Group...` — opens the multi-select picker

---

## Packaging a `.vsix`

`@vscode/vsce` is included as a local devDependency. To build the package:

```bash
npm run package
```

Or from the VS Code task runner (`Ctrl+Shift+P` → **Tasks: Run Task** → **Package VSIX**).

This compiles TypeScript first, then produces `code-rust-fold-<version>.vsix` in the workspace root.

Install it in VS Code via:

```
Extensions sidebar → ··· menu (top-right) → Install from VSIX...
```

Or from the command line:

```bash
code --install-extension code-rust-fold-0.1.0.vsix
```

---

## Project Structure

```
code-rust-fold/
  .vscode/
    launch.json        VS Code debug configuration (enables F5)
    tasks.json         Build tasks (compile / watch / package)
    .vscodeignore      Controls which files are excluded from the .vsix
  src/
    extension.ts       activate() — registers all 39 commands and doc-close listener
    foldController.ts  Toggle state (via workspaceState), orchestrates fold pipeline
    symbolProvider.ts  Wraps rust-analyzer LSP symbols, partitions into 8 typed buckets
    commentScanner.ts  Regex scanner for comments and use-statement groups
    macroDetector.ts   Disambiguates macro_rules / proc-macros from mod blocks
    foldExecutor.ts    Issues editor.fold / editor.unfold commands
    types.ts           Shared types (FoldTargetKind, FoldRange, FoldDirection, etc.)
  out/                 Compiled JS output (generated by tsc, excluded from .vsix src)
  package.json         Extension manifest (commands, keybindings, settings)
  tsconfig.json        TypeScript config
```

---

## Known Limitations (MVP)

- **Toggle state is persisted in `workspaceState`.** The extension stores whether each element category is currently folded per document URI, so the state survives extension host restarts and VS Code reloads. The one edge case: if you manually fold/unfold regions using VS Code's built-in commands (e.g. `Ctrl+Shift+[`), the extension's persisted state won't reflect that change. The next toggle will still do the right thing — it just bases its decision on the last state *it* set, not on the editor's actual current state.
- **rust-analyzer must finish indexing** before structural folds will work. On first open of a large workspace this can take 5–30 seconds.
- **Keybindings are en-US only.** Non-US keyboard layouts may have conflicts on some of the chord suffixes.
- **Inline macros** (e.g. `vec![...]` on a single line) are not foldable — they have no multi-line body to collapse.

## FAQ

Q: AI? Yes. This is 100% vibecoded to be a good-enough extension for personal use.
