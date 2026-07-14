const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { pathToFileURL } = require('url');
const { renderMarkdown, buildDoc, esc } = require('./src/render');

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;
const PDF_EXT = /\.pdf$/i;
const OPENABLE = /\.(md|markdown|mdown|mkd|pdf)$/i;
let win = null;

function fileFromArgv(argv) {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-'))
    .reverse()
    .find((a) => OPENABLE.test(a) && fsSync.existsSync(a));
}
let cssCache = null;
let watcher = null;

async function getCss() {
  if (!cssCache) {
    const base = await fs.readFile(path.join(__dirname, 'src', 'markdown.css'), 'utf8');
    let hljsCss = '';
    try {
      hljsCss = await fs.readFile(path.join(__dirname, 'src', 'vendor', 'hljs.css'), 'utf8');
    } catch {}
    cssCache = base + '\n' + hljsCss;
  }
  return cssCache;
}

function mermaidUrl() {
  const p = path.join(__dirname, 'src', 'vendor', 'mermaid.min.js');
  return fsSync.existsSync(p) ? pathToFileURL(p).href : null;
}

function appIcon() {
  const ico = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  return fsSync.existsSync(ico) ? ico : undefined;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 860,
    minHeight: 500,
    backgroundColor: '#f4f4f2',
    title: 'MD2PDF',
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.once('did-finish-load', () => {
    const f = fileFromArgv(process.argv);
    if (f) win.webContents.send('open-file', path.resolve(f));
  });
}

async function listDir(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dirPath, e.name);
    if (e.isDirectory()) {
      result.push({ name: e.name, path: full, isDir: true, kind: 'dir' });
    } else if (MD_EXT.test(e.name)) {
      result.push({ name: e.name, path: full, isDir: false, kind: 'md' });
    } else if (PDF_EXT.test(e.name)) {
      result.push({ name: e.name, path: full, isDir: false, kind: 'pdf' });
    }
  }
  result.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return result;
}

async function searchFiles(rootDir, query) {
  const q = query.toLowerCase();
  const results = [];
  async function walk(dir, depth) {
    if (depth > 6 || results.length >= 100) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= 100) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else if ((MD_EXT.test(e.name) || PDF_EXT.test(e.name)) && e.name.toLowerCase().includes(q)) {
        results.push({ name: e.name, path: full, isDir: false, kind: MD_EXT.test(e.name) ? 'md' : 'pdf' });
      }
    }
  }
  await walk(rootDir, 0);
  return results;
}

async function renderFile(filePath) {
  if (!MD_EXT.test(filePath)) throw new Error('Not a Markdown file');
  const md = await fs.readFile(filePath, 'utf8');
  return { html: renderMarkdown(md), title: path.basename(filePath).replace(MD_EXT, '') };
}

async function exportPdf(filePath, settings, outPath) {
  const { html, title } = await renderFile(filePath);
  const doc = buildDoc(html, title, settings, await getCss(), mermaidUrl());
  const tmp = path.join(app.getPath('temp'), `md2pdf-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, doc, 'utf8');
  const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await printer.loadFile(tmp);
    await Promise.race([
      printer.webContents.executeJavaScript('window.__ready'),
      new Promise((r) => setTimeout(r, 10000))
    ]);
    const m = Number(settings.margin) || 0.5;
    const hf = !!settings.hf;
    const opts = {
      printBackground: true,
      pageSize: settings.pageSize || 'A4',
      landscape: !!settings.landscape,
      margins: {
        top: hf ? Math.max(m, 0.65) : m,
        bottom: hf ? Math.max(m, 0.6) : m,
        left: m,
        right: m
      }
    };
    if (hf) {
      opts.displayHeaderFooter = true;
      opts.headerTemplate = `<div style="font-size:8px;width:100%;padding:0 ${m}in;display:flex;justify-content:space-between;color:#999;font-family:'Segoe UI',Arial,sans-serif;"><span>${esc(
        title
      )}</span><span class="date"></span></div>`;
      opts.footerTemplate = `<div style="font-size:8px;width:100%;text-align:center;color:#999;font-family:'Segoe UI',Arial,sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;
    }
    const pdf = await printer.webContents.printToPDF(opts);
    await fs.writeFile(outPath, pdf);
  } finally {
    printer.destroy();
    fs.unlink(tmp).catch(() => {});
  }
  return outPath;
}

function registerIpc() {
  ipcMain.handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('fs:listDir', (_e, dirPath) => listDir(dirPath));

  ipcMain.handle('fs:search', (_e, { rootDir, query }) => searchFiles(rootDir, query));

  ipcMain.handle('md:render', (_e, filePath) => renderFile(filePath));

  ipcMain.handle('md:renderText', (_e, text) => ({ html: renderMarkdown(String(text)) }));

  ipcMain.handle('fs:readFile', async (_e, filePath) => {
    if (!MD_EXT.test(filePath)) throw new Error('Not a Markdown file');
    return fs.readFile(filePath, 'utf8');
  });

  ipcMain.handle('fs:writeFile', async (_e, { filePath, content }) => {
    if (!MD_EXT.test(filePath)) throw new Error('Not a Markdown file');
    await fs.writeFile(filePath, String(content), 'utf8');
    return true;
  });

  ipcMain.handle('pdf:export', async (_e, { filePath, settings, ask }) => {
    let outPath = filePath.replace(MD_EXT, '') + '.pdf';
    if (ask) {
      const r = await dialog.showSaveDialog(win, {
        defaultPath: outPath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (r.canceled) return null;
      outPath = r.filePath;
    }
    return exportPdf(filePath, settings || {}, outPath);
  });

  ipcMain.handle('pdf:exportBatch', async (_e, { dirPath, settings }) => {
    const entries = await listDir(dirPath);
    const files = entries.filter((x) => x.kind === 'md');
    let done = 0;
    const failed = [];
    for (const f of files) {
      try {
        await exportPdf(f.path, settings || {}, f.path.replace(MD_EXT, '') + '.pdf');
      } catch {
        failed.push(f.name);
      }
      done++;
      if (win) win.webContents.send('batch-progress', { done, total: files.length, name: f.name });
    }
    return { total: files.length, failed };
  });

  ipcMain.handle('watch:set', (_e, filePath) => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (!filePath || !MD_EXT.test(filePath)) return;
    let t = null;
    try {
      watcher = fsSync.watch(filePath, () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (win) win.webContents.send('file-changed', filePath);
        }, 300);
      });
    } catch {}
  });

  ipcMain.handle('net:importUrl', async (_e, { url, dir }) => {
    let u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) throw new Error('URL must start with http:// or https://');
    const gh = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (gh) u = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
    const res = await net.fetch(u);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (text.length > 10 * 1024 * 1024) throw new Error('File too large (over 10 MB)');
    const targetDir = dir || path.join(app.getPath('documents'), 'MD2PDF Imports');
    await fs.mkdir(targetDir, { recursive: true });
    let base = decodeURIComponent(path.basename(new URL(u).pathname)) || 'imported';
    base = base.replace(/[<>:"/\\|?*]/g, '_').trim() || 'imported';
    if (!MD_EXT.test(base)) base += '.md';
    let out = path.join(targetDir, base);
    let n = 1;
    while (fsSync.existsSync(out)) {
      out = path.join(targetDir, base.replace(MD_EXT, '') + `-${n++}.md`);
    }
    await fs.writeFile(out, text, 'utf8');
    return out;
  });

  ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('shell:openItem', (_e, p) => shell.openPath(p));
}

async function runSmoke(input, output) {
  const settings = {
    hf: process.argv.includes('--hf'),
    landscape: process.argv.includes('--landscape')
  };
  await exportPdf(path.resolve(input), settings, path.resolve(output));
  console.log('SMOKE OK: ' + path.resolve(output));
}

const isSmoke = process.argv.includes('--smoke');

if (!isSmoke) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', (_e, argv) => {
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.focus();
      const f = fileFromArgv(argv);
      if (f) win.webContents.send('open-file', path.resolve(f));
    });
  }
}

app.whenReady().then(async () => {
  if (isSmoke) {
    const smokeIdx = process.argv.indexOf('--smoke');
    try {
      await runSmoke(process.argv[smokeIdx + 1], process.argv[smokeIdx + 2]);
      app.exit(0);
    } catch (err) {
      console.error('SMOKE FAIL: ' + err.message);
      app.exit(1);
    }
    return;
  }
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
