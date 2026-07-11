const vscode = require('vscode');
const path = require('path');
const { exportPdf, listMarkdown, MD_EXT } = require('./exporter');

const ASSETS = path.join(__dirname, 'assets');

function getSettings() {
  const c = vscode.workspace.getConfiguration('md2pdf');
  return {
    fontFamily: c.get('fontFamily'),
    fontSize: c.get('fontSize'),
    accent: c.get('accentColor'),
    text: c.get('textColor'),
    measure: c.get('lineWidth'),
    margin: c.get('pageMargin'),
    pageSize: c.get('pageSize'),
    landscape: c.get('orientation') === 'landscape',
    hf: c.get('headerFooter'),
    browserPath: c.get('browserPath')
  };
}

async function exportOne(uri) {
  const file = uri ? uri.fsPath : vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!file || !MD_EXT.test(file)) {
    vscode.window.showErrorMessage('MD2PDF: select a Markdown file first.');
    return;
  }
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
  if (doc && doc.isDirty) await doc.save();
  const out = file.replace(MD_EXT, '') + '.pdf';
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `MD2PDF: exporting ${path.basename(file)}…` },
      () => exportPdf(file, out, getSettings(), ASSETS)
    );
    const action = await vscode.window.showInformationMessage(
      `MD2PDF: saved ${path.basename(out)}`,
      'Open PDF'
    );
    if (action === 'Open PDF') vscode.env.openExternal(vscode.Uri.file(out));
  } catch (err) {
    vscode.window.showErrorMessage('MD2PDF: export failed — ' + err.message);
  }
}

async function exportFolder(uri) {
  if (!uri) {
    vscode.window.showErrorMessage('MD2PDF: right-click a folder in the Explorer.');
    return;
  }
  let files;
  try {
    files = await listMarkdown(uri.fsPath);
  } catch (err) {
    vscode.window.showErrorMessage('MD2PDF: ' + err.message);
    return;
  }
  if (!files.length) {
    vscode.window.showWarningMessage('MD2PDF: no Markdown files in that folder.');
    return;
  }
  const settings = getSettings();
  const failed = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'MD2PDF: batch export', cancellable: true },
    async (progress, token) => {
      for (let i = 0; i < files.length; i++) {
        if (token.isCancellationRequested) return;
        const f = files[i];
        progress.report({
          message: `${i + 1}/${files.length}: ${path.basename(f)}`,
          increment: 100 / files.length
        });
        try {
          await exportPdf(f, f.replace(MD_EXT, '') + '.pdf', settings, ASSETS);
        } catch {
          failed.push(path.basename(f));
        }
      }
    }
  );
  if (failed.length) {
    vscode.window.showWarningMessage(
      `MD2PDF: exported ${files.length - failed.length}/${files.length} — failed: ${failed.join(', ')}`
    );
  } else {
    vscode.window.showInformationMessage(`MD2PDF: exported ${files.length} PDF${files.length === 1 ? '' : 's'}.`);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('md2pdf.export', exportOne),
    vscode.commands.registerCommand('md2pdf.exportFolder', exportFolder)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
