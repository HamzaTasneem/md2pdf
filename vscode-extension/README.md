# MD2PDF for VS Code

Export Markdown files to clean, themed PDFs — right from the Explorer or editor. Same engine as the [MD2PDF desktop app](https://github.com/HamzaTasneem/md2pdf): your Markdown is rendered with GitHub-flavored parsing, repaired, themed, and printed through Chrome's print engine, so the output matches Chrome's print-to-PDF exactly.

## Usage

- Right-click a `.md` file in the Explorer → **MD2PDF: Export to PDF**
- Right-click inside a Markdown editor → **MD2PDF: Export to PDF** (saves unsaved changes first)
- Right-click a folder → **MD2PDF: Export all Markdown in folder to PDF**

The PDF is saved next to the source file with the same name.

## Features

- Black & white theme with gold headings/bold/links by default — every color, font and size configurable
- Automatic table repair: drops empty rows above tables, promotes the real header row, inserts missing separators, pads ragged columns
- Syntax-highlighted code blocks (highlight.js) and rendered Mermaid diagrams
- YAML front matter shown as a styled title block
- Line width (typographic measure), page margins, page size, optional title/date header and page-number footer

## Requirements

A local install of **Chrome, Edge, or Chromium**. The extension auto-detects common locations; if yours isn't found, set `md2pdf.browserPath`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `md2pdf.fontFamily` | `'Segoe UI', Arial, sans-serif` | Body font (CSS value) |
| `md2pdf.fontSize` | `14` | Base font size (px) |
| `md2pdf.accentColor` | `#b8860b` | Headings, bold, links |
| `md2pdf.textColor` | `#111111` | Body text |
| `md2pdf.lineWidth` | `full` | Max characters per line: `full`, `90`, `80`, `70`, `60` |
| `md2pdf.pageMargin` | `0.5` | Margins in inches |
| `md2pdf.pageSize` | `A4` | `A4`, `Letter`, or `Legal` |
| `md2pdf.headerFooter` | `false` | Title + date header, "Page X of Y" footer |
| `md2pdf.browserPath` | *(auto)* | Chrome/Edge executable override |

## Building from source

```bash
cd vscode-extension
npm install        # also copies mermaid/highlight.js assets
npx @vscode/vsce package
code --install-extension md2pdf-1.0.0.vsix
```

## License

[MIT](../LICENSE)
