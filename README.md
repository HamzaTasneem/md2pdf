# MD2PDF

Browse Markdown files and export them to PDF with Chrome-quality output — as a desktop app or a VS Code extension.

Built for the everyday case: AI tools and note apps produce piles of `.md` files, and turning them into clean, printable PDFs usually means opening a browser and hitting Ctrl+P. MD2PDF does that in one click, with consistent typography and automatic cleanup of the broken tables LLMs love to produce.

## Features

- **File explorer** — open a folder, browse Markdown (and PDF) files in a resizable VS Code-style sidebar with filename search, recent files, and drag-and-drop
- **Preview / Code views** — rendered preview or an editable source view (Ctrl+S saves)
- **One-click PDF export** — saves `<name>.pdf` next to the source file, using Chromium's print engine so output matches Chrome's print-to-PDF exactly
- **Batch export** — right-click a folder → "Export all to PDF"
- **Theming** — font, size, accent and text colors, with saveable presets. Default: black & white with gold headings and highlights
- **Typography controls** — line width (60–90 characters or full), page margins, page size (A4/Letter/Legal)
- **Headers & footers** — optional title + date header and "Page X of Y" footer
- **Markdown repair** — drops empty rows on top of tables, promotes the real header, inserts missing separator rows, pads ragged columns, strips zero-width/non-breaking junk characters
- **Rich rendering** — GFM tables, syntax-highlighted code (highlight.js), Mermaid diagrams, YAML front matter as a styled title block
- **Watch mode** — auto-refreshes the preview when the file changes on disk
- **In-app PDF viewer** — click any exported PDF in the tree to inspect it without leaving the app

## Desktop app

**Windows installer:** download `MD2PDF-Setup-<version>.exe` from the [releases page](https://github.com/HamzaTasneem/md2pdf/releases) and run it. You get a desktop shortcut, and `.md` files gain an "Open with → MD2PDF" entry in Explorer.

**From source:**

```bash
git clone https://github.com/HamzaTasneem/md2pdf.git
cd md2pdf
npm install
npm start
```

On Windows you can also double-click `run.cmd`. Build your own installer with `npm run dist` (electron-builder; mac/linux targets are configured too).

Headless export (no window):

```bash
npx electron . --smoke input.md output.pdf
```

## VS Code extension

The [`vscode-extension/`](vscode-extension/) folder contains the same pipeline as a VS Code extension: right-click any `.md` file (or folder) in the Explorer → **Export to PDF**. It renders with the same theme engine and prints through your locally installed Chrome or Edge. See its [README](vscode-extension/README.md) for setup and settings.

## How it works

Markdown → cleanup pass (`fixMarkdown`) → [marked](https://github.com/markedjs/marked) with GFM + highlight.js → a standalone themed HTML document → Chromium `printToPDF`. Mermaid blocks are rendered in the page before printing, so diagrams appear as vector graphics in the PDF.

## License

[MIT](LICENSE)
