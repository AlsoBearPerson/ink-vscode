# ink README

Support for Inkle's [Ink](https://github.com/inkle/ink) language in Visual Studio Code.

## Features

- Syntax highlighting using the .tmLanguage file included in the Ink source repository.
- Accurate word count in Ink files. Ignores comments, knot/stitch declarations and logic blocks, counting only actual content text.
- IntelliSense completion for divert targets.
- Show definition support for knots
- Node (knot/stitch) count in Ink files.
- Sensible language configuration defaults for Ink.

## Publishing

> Since this is a fork, I'm not publishing to the VS Code Marketplace, and am instead only publishing locally.

To package the extension:

	npm run package

To install it thereafter:

	code --install-extension <output>.vsix

## Release Notes

### 1.3.1
- Distinguish knots from functions in completion and go-to-symbol
- Hooked up document symbol provider so Ctrl+Shift+O can be used to navigate to knots, stitches, labels, and functions
- Suggest unimplemented diverts when typing a knot. When typing == suggest the names from any existing -> diverts that point to a divert target that hasn't been implemented yet.
- Fix knot syntax parsing. Official docs indicate a knot is specified by two or more equals signs, but the previous regex only matched exactly three.
- Fixed: More permissive cursor placement for Go to Definition. Navigation now works as expected when the cursor is placed immediately before the first character or immediately after the last character in the symbol.

### 1.3.0
- Completions now support labels
- Show definitions now works on knots as divert targets

### 1.2.0
- Add basic support for IntelliSense, providing completions for knots and stitches of the current knot; triggered by typing ->

### 1.1.0
- Add word/node count feature.

### 1.0.0

Initial release.

# License

MIT. See LICENSE.
