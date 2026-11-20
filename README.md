# Plan Annotator

Plan Annotator lets you attach comments to selected text in Obsidian Markdown notes without changing the note itself. Annotations are stored in the current vault's plugin data.

## Use

1. Select text in an open Markdown note.
2. Open the **Comments** view in the right sidebar.
3. Enter a comment and choose **Add comment**. The selected text remains the annotation context when focus moves to the sidebar.
4. Use the annotation list to copy one comment, copy all comments for the active note, delete one comment, or delete all comments for the active note. The selection preview shows which text the next comment will annotate.

The plugin does not modify note contents. Keep normal vault backups to preserve plugin data.

## What's new in 1.0.1

- Added **Delete All** for comments on the active note.
- Added hover and pressed feedback to sidebar buttons.
- Added a live preview of the selected text above the comment input.

## Development

```sh
npm ci
npm run dev
npm run build
```

`npm run build` type-checks the plugin and generates `main.js` for Obsidian.
