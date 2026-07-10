const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');

const escHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

marked.use({ gfm: true, breaks: false });
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang === 'mermaid') return escHtml(code);
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

const looksLikeRow = (l) => /^\s*\|/.test(l);
const isFence = (l) => /^\s*(```|~~~)/.test(l);

function splitCells(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

const isSepCell = (c) => /^:?-+:?$/.test(c);
const isSepRow = (cells) => cells.some(isSepCell) && cells.every((c) => c === '' || isSepCell(c));
const isEmptyRow = (cells) => cells.every((c) => c === '');

// Rebuilds a run of pipe rows: drops empty rows (the "empty rows on top of
// the table" case), keeps exactly one separator after the header, pads
// ragged rows so every row has the same column count.
function fixTableBlock(block) {
  if (block.length < 2) return block;
  const rows = block.map(splitCells);
  const kept = [];
  let sepAlign = null;
  for (const cells of rows) {
    if (isSepRow(cells)) {
      if (!sepAlign) sepAlign = cells;
      continue;
    }
    if (isEmptyRow(cells)) continue;
    kept.push(cells);
  }
  if (kept.length === 0) return [];
  const cols = Math.max(...kept.map((r) => r.length));
  const norm = kept.map((r) => {
    const c = r.slice(0, cols);
    while (c.length < cols) c.push('');
    return c;
  });
  const align = (sepAlign || []).slice(0, cols).map((c) => (isSepCell(c) ? c : '---'));
  while (align.length < cols) align.push('---');
  const fmt = (r) => '| ' + r.join(' | ') + ' |';
  return [fmt(norm[0]), fmt(align), ...norm.slice(1).map(fmt)];
}

function fixMarkdown(src) {
  src = src.replace(/\r\n/g, '\n');
  src = src.replace(/\u00A0/g, ' ').replace(/[\u200B\u200C\uFEFF]/g, '');
  const lines = src.split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  const out = [];
  let i = 0;
  let inFence = false;
  while (i < lines.length) {
    const line = lines[i];
    if (isFence(line)) {
      inFence = !inFence;
      out.push(line);
      i++;
      continue;
    }
    if (!inFence && looksLikeRow(line)) {
      const block = [];
      while (i < lines.length && looksLikeRow(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      const fixed = fixTableBlock(block);
      if (fixed.length) {
        if (out.length && out[out.length - 1].trim() !== '') out.push('');
        out.push(...fixed, '');
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function extractFrontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: src };
  const data = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line
        .slice(i + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (k && v && !k.includes(' ')) data[k] = v;
    }
  }
  return { fm: data, body: src.slice(m[0].length) };
}

function frontMatterHtml(fm) {
  if (!fm) return '';
  const entries = Object.entries(fm);
  if (!entries.length) return '';
  const title = fm.title || fm.Title;
  const rest = entries.filter(([k]) => k.toLowerCase() !== 'title');
  let html = '<header class="fm">';
  if (title) html += `<div class="fm-title">${esc(title)}</div>`;
  if (rest.length) {
    html +=
      '<div class="fm-meta">' +
      rest.map(([k, v]) => `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join('') +
      '</div>';
  }
  html += '</header>';
  return html;
}

function renderMarkdown(md) {
  const { fm, body } = extractFrontMatter(md);
  return frontMatterHtml(fm) + marked.parse(fixMarkdown(body));
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DEFAULTS = {
  fontFamily: "'Segoe UI', Arial, sans-serif",
  fontSize: 14,
  accent: '#b8860b',
  text: '#111111',
  measure: 'full',
  margin: 0.5
};

function buildDoc(bodyHtml, title, settings, css, mermaidUrl) {
  const s = { ...DEFAULTS, ...(settings || {}) };
  const measure =
    s.measure && s.measure !== 'full'
      ? `.markdown-body { max-width: ${Number(s.measure)}ch; margin-left: auto; margin-right: auto; }`
      : '';
  const mermaid = mermaidUrl
    ? `<script src="${esc(mermaidUrl)}"></script>
<script>
window.__ready = (async () => {
  const blocks = Array.from(document.querySelectorAll('code.language-mermaid'));
  for (const code of blocks) {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    code.closest('pre').replaceWith(div);
  }
  if (blocks.length && window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    await mermaid.run();
  }
  return true;
})().catch(() => true);
</script>`
    : '<script>window.__ready = Promise.resolve(true);</script>';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${css}</style>
<style>
:root {
  --font-body: ${s.fontFamily};
  --font-size: ${s.fontSize}px;
  --accent: ${s.accent};
  --text: ${s.text};
}
body { margin: 0; }
${measure}
</style>
</head>
<body class="markdown-body">
${bodyHtml}
${mermaid}
</body>
</html>`;
}

module.exports = { fixMarkdown, renderMarkdown, buildDoc, esc, DEFAULTS };
