const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const { renderMarkdown, buildDoc, esc } = require('./lib/render');

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

function candidateBrowsers() {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    return [
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium'
  ];
}

function findBrowser(configured) {
  if (configured && fsSync.existsSync(configured)) return configured;
  for (const p of candidateBrowsers()) {
    if (fsSync.existsSync(p)) return p;
  }
  throw new Error(
    'No Chrome/Edge/Chromium found. Set "md2pdf.browserPath" in settings to your browser executable.'
  );
}

async function exportPdf(mdPath, outPath, settings, assetsDir) {
  if (!MD_EXT.test(mdPath)) throw new Error('Not a Markdown file: ' + mdPath);
  const md = await fs.readFile(mdPath, 'utf8');
  const title = path.basename(mdPath).replace(MD_EXT, '');
  const css =
    (await fs.readFile(path.join(assetsDir, 'markdown.css'), 'utf8')) +
    '\n' +
    (await fs.readFile(path.join(assetsDir, 'hljs.css'), 'utf8'));
  const mermaidPath = path.join(assetsDir, 'mermaid.min.js');
  const mermaidUrl = fsSync.existsSync(mermaidPath) ? pathToFileURL(mermaidPath).href : null;
  const doc = buildDoc(renderMarkdown(md), title, settings, css, mermaidUrl);
  const tmp = path.join(os.tmpdir(), `md2pdf-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, doc, 'utf8');

  const browser = await puppeteer.launch({
    executablePath: findBrowser(settings.browserPath),
    headless: true,
    args: ['--allow-file-access-from-files']
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load', timeout: 30000 });
    await Promise.race([
      page.evaluate(() => window.__ready),
      new Promise((r) => setTimeout(r, 10000))
    ]);
    const m = Number(settings.margin) || 0.5;
    const hf = !!settings.hf;
    const opts = {
      path: outPath,
      printBackground: true,
      format: settings.pageSize || 'A4',
      margin: {
        top: (hf ? Math.max(m, 0.65) : m) + 'in',
        bottom: (hf ? Math.max(m, 0.6) : m) + 'in',
        left: m + 'in',
        right: m + 'in'
      }
    };
    if (hf) {
      opts.displayHeaderFooter = true;
      opts.headerTemplate = `<div style="font-size:8px;width:100%;padding:0 ${m}in;display:flex;justify-content:space-between;color:#999;font-family:'Segoe UI',Arial,sans-serif;"><span>${esc(
        title
      )}</span><span class="date"></span></div>`;
      opts.footerTemplate = `<div style="font-size:8px;width:100%;text-align:center;color:#999;font-family:'Segoe UI',Arial,sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;
    }
    await page.pdf(opts);
  } finally {
    await browser.close();
    fs.unlink(tmp).catch(() => {});
  }
  return outPath;
}

async function listMarkdown(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && MD_EXT.test(e.name))
    .map((e) => path.join(dirPath, e.name))
    .sort();
}

module.exports = { exportPdf, listMarkdown, findBrowser, MD_EXT };
