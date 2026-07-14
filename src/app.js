const $ = (id) => document.getElementById(id);
const preview = $('preview');
const codeView = $('codeView');
const pdfFrame = $('pdfFrame');
const page = $('page');
const previewWrap = $('previewWrap');
const sidebar = $('sidebar');
const splitter = $('splitter');
const tree = $('tree');
const treeEmpty = $('treeEmpty');
const toast = $('toast');
const ctxMenu = $('ctxMenu');

const BUILTIN_PRESETS = {
  'REMAP Gold': { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 14, accent: '#b8860b', text: '#111111' },
  'Plain B&W': { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 14, accent: '#111111', text: '#111111' }
};

const state = {
  rootDir: null,
  currentFile: null,
  currentKind: null,
  dirty: false,
  view: 'preview',
  settings: {
    fontFamily: "'Segoe UI', Arial, sans-serif",
    fontSize: 14,
    accent: '#b8860b',
    text: '#111111',
    pageSize: 'A4',
    landscape: false,
    measure: 'full',
    margin: 0.5,
    hf: false
  },
  pdfBase: null
};

let toastTimer = null;
let toastPath = null;

function showToast(msg, { error = false, path = null, sticky = false } = {}) {
  toast.textContent = msg;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  toastPath = path;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (toast.hidden = true), 6000);
}

toast.addEventListener('click', () => {
  if (toastPath) window.api.showItem(toastPath);
  toast.hidden = true;
});

/* ---------- settings & presets ---------- */

function userPresets() {
  try {
    return JSON.parse(localStorage.getItem('md2pdf.presets') || '{}');
  } catch {
    return {};
  }
}

function rebuildPresetSelect(selected) {
  const sel = $('presetSelect');
  sel.innerHTML = '';
  const names = ['Custom', ...Object.keys(BUILTIN_PRESETS), ...Object.keys(userPresets())];
  for (const n of names) {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  }
  sel.value = selected || 'Custom';
}

function applyPreset(name) {
  const p = BUILTIN_PRESETS[name] || userPresets()[name];
  if (!p) return;
  Object.assign(state.settings, p);
  $('fontSelect').value = p.fontFamily;
  $('sizeSelect').value = String(p.fontSize);
  $('accentInput').value = p.accent;
  $('textInput').value = p.text;
  applySettings();
}

function applySettings() {
  const s = state.settings;
  preview.style.setProperty('--font-body', s.fontFamily);
  preview.style.setProperty('--font-size', s.fontSize + 'px');
  preview.style.setProperty('--accent', s.accent);
  preview.style.setProperty('--text', s.text);
  if (s.measure && s.measure !== 'full') {
    preview.style.maxWidth = Number(s.measure) + 'ch';
    preview.style.marginLeft = 'auto';
    preview.style.marginRight = 'auto';
  } else {
    preview.style.maxWidth = '';
    preview.style.marginLeft = '';
    preview.style.marginRight = '';
  }
  page.style.width = s.landscape ? '1123px' : '';
  localStorage.setItem('md2pdf.settings', JSON.stringify(s));
}

function loadSettings() {
  try {
    Object.assign(state.settings, JSON.parse(localStorage.getItem('md2pdf.settings') || '{}'));
  } catch {}
  const s = state.settings;
  $('fontSelect').value = s.fontFamily;
  if (!$('fontSelect').value) $('fontSelect').selectedIndex = 0;
  $('sizeSelect').value = String(s.fontSize);
  $('accentInput').value = s.accent;
  $('textInput').value = s.text;
  $('pageSelect').value = s.pageSize;
  $('orientSelect').value = s.landscape ? 'landscape' : 'portrait';
  $('measureSelect').value = String(s.measure);
  if (!$('measureSelect').value) $('measureSelect').value = 'full';
  $('marginSelect').value = String(s.margin);
  if (!$('marginSelect').value) $('marginSelect').value = '0.5';
  $('hfCheck').checked = !!s.hf;
  rebuildPresetSelect(localStorage.getItem('md2pdf.preset') || 'Custom');
  applySettings();
}

function markCustomPreset() {
  $('presetSelect').value = 'Custom';
  localStorage.setItem('md2pdf.preset', 'Custom');
}

/* ---------- view modes ---------- */

async function renderMermaidIn(container) {
  const blocks = Array.from(container.querySelectorAll('code.language-mermaid'));
  if (!blocks.length || !window.mermaid) return;
  for (const code of blocks) {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    code.closest('pre').replaceWith(div);
  }
  try {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    await mermaid.run({ querySelector: '#preview .mermaid' });
  } catch {}
}

function setView(view) {
  state.view = view;
  localStorage.setItem('md2pdf.view', view);
  $('viewPreviewBtn').classList.toggle('active', view === 'preview');
  $('viewCodeBtn').classList.toggle('active', view === 'code');
  if (state.currentKind === 'pdf') return;
  preview.hidden = view !== 'preview';
  codeView.hidden = view !== 'code';
  if (view === 'preview' && state.dirty) {
    window.api.renderText(codeView.value).then(({ html }) => {
      preview.innerHTML = html;
      renderMermaidIn(preview);
    });
  }
}

function setDirty(dirty) {
  state.dirty = dirty;
  const name = state.currentFile ? state.currentFile.split(/[\\/]/).pop() : '';
  $('currentFileName').textContent = name ? (dirty ? '● ' : '') + name : '';
}

/* ---------- opening files ---------- */

function addRecent(filePath) {
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem('md2pdf.recent') || '[]');
  } catch {}
  recent = [filePath, ...recent.filter((p) => p !== filePath)].slice(0, 8);
  localStorage.setItem('md2pdf.recent', JSON.stringify(recent));
  renderRecent();
}

function renderRecent() {
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem('md2pdf.recent') || '[]');
  } catch {}
  $('recentWrap').hidden = !recent.length;
  const list = $('recentList');
  list.innerHTML = '';
  for (const p of recent) {
    const item = document.createElement('div');
    item.className = 'flat-item';
    const isPdf = /\.pdf$/i.test(p);
    item.innerHTML = `<span class="icon${isPdf ? ' pdf' : ''}">${isPdf ? '▤' : '▪'}</span>`;
    const name = document.createElement('span');
    name.textContent = p.split(/[\\/]/).pop();
    item.appendChild(name);
    item.title = p;
    item.addEventListener('click', () => openPath(p));
    list.appendChild(item);
  }
}

function confirmDiscard() {
  return !state.dirty || confirm('You have unsaved changes. Discard them?');
}

function setPdfView(param) {
  if (!state.pdfBase) return;
  document.querySelectorAll('#pdfBar button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === param)
  );
  pdfFrame.src = 'about:blank';
  setTimeout(() => {
    pdfFrame.src = state.pdfBase + '#' + param;
  }, 30);
}

document.querySelectorAll('#pdfBar button').forEach((b) =>
  b.addEventListener('click', () => setPdfView(b.dataset.view))
);

function showPdf(filePath) {
  state.currentFile = filePath;
  state.currentKind = 'pdf';
  window.api.watchFile(null);
  page.hidden = true;
  pdfFrame.hidden = false;
  previewWrap.classList.add('pdf-mode');
  state.pdfBase = 'file:///' + filePath.replace(/\\/g, '/');
  setPdfView('view=FitH');
  $('pdfBar').hidden = false;
  setDirty(false);
  $('currentFileName').textContent = filePath.split(/[\\/]/).pop();
  $('currentFileName').title = filePath;
  updateButtons();
}

async function showMd(filePath, labelEl) {
  try {
    const [{ html }, raw] = await Promise.all([
      window.api.renderFile(filePath),
      window.api.readFile(filePath)
    ]);
    state.currentFile = filePath;
    state.currentKind = 'md';
    previewWrap.classList.remove('pdf-mode');
    pdfFrame.hidden = true;
    pdfFrame.src = 'about:blank';
    $('pdfBar').hidden = true;
    page.hidden = false;
    preview.innerHTML = html;
    renderMermaidIn(preview);
    codeView.value = raw;
    setDirty(false);
    $('currentFileName').title = filePath;
    setView(state.view);
    window.api.watchFile(filePath);
    document.querySelectorAll('.label.active, .flat-item.active').forEach((n) => n.classList.remove('active'));
    if (labelEl) labelEl.classList.add('active');
    updateButtons();
  } catch (err) {
    showToast('Could not open file: ' + err.message, { error: true });
  }
}

function openPath(filePath, labelEl) {
  if (!confirmDiscard()) return;
  addRecent(filePath);
  if (/\.pdf$/i.test(filePath)) {
    document.querySelectorAll('.label.active, .flat-item.active').forEach((n) => n.classList.remove('active'));
    if (labelEl) labelEl.classList.add('active');
    showPdf(filePath);
  } else {
    showMd(filePath, labelEl);
  }
}

async function saveCurrent() {
  if (!state.currentFile || state.currentKind !== 'md' || !state.dirty) return;
  try {
    await window.api.writeFile(state.currentFile, codeView.value);
    setDirty(false);
    const { html } = await window.api.renderText(codeView.value);
    preview.innerHTML = html;
    renderMermaidIn(preview);
    showToast('Saved ' + state.currentFile.split(/[\\/]/).pop());
  } catch (err) {
    showToast('Save failed: ' + err.message, { error: true });
  }
}

/* ---------- file tree ---------- */

function makeNode(entry) {
  const node = document.createElement('div');
  node.className = 'node';
  const label = document.createElement('div');
  label.className = 'label';
  const icon = document.createElement('span');
  icon.className = 'icon' + (entry.kind === 'pdf' ? ' pdf' : '');
  icon.textContent = entry.isDir ? '▸' : entry.kind === 'pdf' ? '▤' : '▪';
  const name = document.createElement('span');
  name.textContent = entry.name;
  label.append(icon, name);
  node.appendChild(label);

  if (entry.isDir) {
    let children = null;
    label.addEventListener('click', async () => {
      if (children) {
        const open = children.style.display !== 'none';
        children.style.display = open ? 'none' : '';
        icon.textContent = open ? '▸' : '▾';
        return;
      }
      children = document.createElement('div');
      children.className = 'children';
      node.appendChild(children);
      icon.textContent = '▾';
      try {
        const entries = await window.api.listDir(entry.path);
        if (!entries.length) {
          const empty = document.createElement('div');
          empty.className = 'label';
          empty.style.color = '#aaa';
          empty.textContent = '(empty)';
          children.appendChild(empty);
        }
        for (const e of entries) children.appendChild(makeNode(e));
      } catch (err) {
        showToast(err.message, { error: true });
      }
    });
    label.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, entry);
    });
  } else {
    label.addEventListener('click', () => openPath(entry.path, label));
  }
  return node;
}

async function loadRoot(dirPath) {
  state.rootDir = dirPath;
  localStorage.setItem('md2pdf.rootDir', dirPath);
  tree.innerHTML = '';
  treeEmpty.style.display = 'none';
  $('filesHead').hidden = false;
  try {
    const entries = await window.api.listDir(dirPath);
    for (const e of entries) tree.appendChild(makeNode(e));
    if (!entries.length) {
      treeEmpty.style.display = '';
      treeEmpty.textContent = 'No Markdown files in this folder';
    }
  } catch (err) {
    treeEmpty.style.display = '';
    showToast(err.message, { error: true });
  }
}

/* ---------- context menu / batch export ---------- */

function showCtxMenu(x, y, entry) {
  ctxMenu.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'item';
  item.textContent = 'Export all to PDF';
  item.addEventListener('click', async () => {
    ctxMenu.hidden = true;
    showToast('Exporting folder…', { sticky: true });
    try {
      const { total, failed } = await window.api.exportBatch({
        dirPath: entry.path,
        settings: state.settings
      });
      if (!total) showToast('No Markdown files in that folder', { error: true });
      else if (failed.length)
        showToast(`Exported ${total - failed.length}/${total} PDFs — failed: ${failed.join(', ')}`, { error: true });
      else showToast(`Exported ${total} PDF${total === 1 ? '' : 's'} to ${entry.name} — click to open folder`, { path: entry.path });
    } catch (err) {
      showToast('Batch export failed: ' + err.message, { error: true });
    }
  });
  ctxMenu.appendChild(item);
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.hidden = false;
}

window.addEventListener('click', () => (ctxMenu.hidden = true));
window.addEventListener('blur', () => (ctxMenu.hidden = true));

window.api.onBatchProgress(({ done, total, name }) => {
  showToast(`Exporting ${done}/${total}: ${name}`, { sticky: done < total });
});

/* ---------- search ---------- */

let searchTimer = null;

$('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) {
    $('searchResults').hidden = true;
    $('browser').hidden = false;
    return;
  }
  searchTimer = setTimeout(async () => {
    if (!state.rootDir) {
      showToast('Open a folder first to search', { error: true });
      return;
    }
    const results = await window.api.search(state.rootDir, q);
    const box = $('searchResults');
    box.innerHTML = '';
    $('browser').hidden = true;
    box.hidden = false;
    if (!results.length) {
      const none = document.createElement('div');
      none.className = 'side-head';
      none.textContent = 'No matches';
      box.appendChild(none);
      return;
    }
    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'flat-item';
      const icon = document.createElement('span');
      icon.className = 'icon' + (r.kind === 'pdf' ? ' pdf' : '');
      icon.textContent = r.kind === 'pdf' ? '▤' : '▪';
      const name = document.createElement('span');
      name.textContent = r.name;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = r.path.slice(state.rootDir.length + 1, -(r.name.length + 1)) || '.';
      item.append(icon, name, sub);
      item.title = r.path;
      item.addEventListener('click', () => openPath(r.path, item));
      box.appendChild(item);
    }
  }, 250);
});

/* ---------- export ---------- */

async function doExport(ask) {
  if (!state.currentFile || state.currentKind !== 'md') return;
  if (state.dirty) await saveCurrent();
  const btn = $('exportBtn');
  btn.disabled = true;
  showToast('Exporting…', { sticky: true });
  try {
    const out = await window.api.exportPdf({
      filePath: state.currentFile,
      settings: state.settings,
      ask
    });
    if (out) showToast('Saved ' + out + ' — click to show in folder', { path: out });
    else toast.hidden = true;
  } catch (err) {
    showToast('Export failed: ' + err.message, { error: true });
  } finally {
    btn.disabled = false;
    updateButtons();
  }
}

function updateButtons() {
  const canExport = !!state.currentFile && state.currentKind === 'md';
  $('exportBtn').disabled = !canExport;
  $('exportAsBtn').disabled = !canExport;
  $('viewPreviewBtn').disabled = state.currentKind === 'pdf';
  $('viewCodeBtn').disabled = state.currentKind === 'pdf';
}

/* ---------- sidebar resize / collapse ---------- */

function setSidebarCollapsed(collapsed) {
  sidebar.classList.toggle('collapsed', collapsed);
  splitter.classList.toggle('collapsed', collapsed);
  localStorage.setItem('md2pdf.sidebarCollapsed', collapsed ? '1' : '');
}

$('collapseBtn').addEventListener('click', () =>
  setSidebarCollapsed(!sidebar.classList.contains('collapsed'))
);

let resizing = false;

splitter.addEventListener('mousedown', (e) => {
  resizing = true;
  splitter.classList.add('dragging');
  document.body.classList.add('resizing');
  e.preventDefault();
});

splitter.addEventListener('dblclick', () => setSidebarCollapsed(true));

window.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const w = Math.min(Math.round(window.innerWidth * 0.6), Math.max(150, e.clientX));
  sidebar.style.width = w + 'px';
});

window.addEventListener('mouseup', () => {
  if (!resizing) return;
  resizing = false;
  splitter.classList.remove('dragging');
  document.body.classList.remove('resizing');
  localStorage.setItem('md2pdf.sidebarWidth', sidebar.style.width);
});

/* ---------- drag & drop ---------- */

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const p = window.api.getPathForFile(file);
  if (p && /\.(md|markdown|mdown|mkd|pdf)$/i.test(p)) openPath(p);
  else showToast('Drop a Markdown or PDF file', { error: true });
});

/* ---------- watch mode ---------- */

window.api.onOpenFile((filePath) => {
  openPath(filePath);
  if (!state.rootDir) {
    const parent = filePath.replace(/[\\/][^\\/]*$/, '');
    if (parent) loadRoot(parent);
  }
});

window.api.onFileChanged((filePath) => {
  if (filePath !== state.currentFile) return;
  if (state.dirty) {
    showToast('File changed on disk — save to overwrite or reopen to reload', { error: true });
    return;
  }
  showMd(filePath, document.querySelector('.label.active, .flat-item.active'));
});

/* ---------- toolbar wiring ---------- */

$('openFolderBtn').addEventListener('click', async () => {
  const dir = await window.api.openFolder();
  if (dir) loadRoot(dir);
});

$('refreshBtn').addEventListener('click', () => {
  if (state.rootDir) loadRoot(state.rootDir);
});

$('importUrlBtn').addEventListener('click', () => {
  const box = $('urlBox');
  box.hidden = !box.hidden;
  if (!box.hidden) {
    const dir = localStorage.getItem('md2pdf.importDir');
    $('importDirBtn').title =
      'Choose the folder imports are saved to\nCurrent: ' + (dir || 'Documents\\MD2PDF Imports');
    $('urlInput').focus();
  }
});

$('importDirBtn').addEventListener('click', async () => {
  const dir = await window.api.openFolder();
  if (!dir) return;
  localStorage.setItem('md2pdf.importDir', dir);
  $('importDirBtn').title = 'Choose the folder imports are saved to\nCurrent: ' + dir;
  showToast('Imports will be saved to ' + dir);
});

$('urlInput').addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    $('urlBox').hidden = true;
    return;
  }
  if (e.key !== 'Enter') return;
  const url = e.target.value.trim();
  if (!url) return;
  e.target.disabled = true;
  showToast('Importing…', { sticky: true });
  try {
    const out = await window.api.importUrl(url, localStorage.getItem('md2pdf.importDir') || null);
    e.target.value = '';
    $('urlBox').hidden = true;
    showToast('Imported ' + out + ' — click to show in folder', { path: out });
    openPath(out);
    if (state.rootDir && out.toLowerCase().startsWith(state.rootDir.toLowerCase())) loadRoot(state.rootDir);
  } catch (err) {
    showToast('Import failed: ' + err.message, { error: true });
  } finally {
    e.target.disabled = false;
  }
});

$('exportBtn').addEventListener('click', () => doExport(false));
$('exportAsBtn').addEventListener('click', () => doExport(true));

$('viewPreviewBtn').addEventListener('click', () => setView('preview'));
$('viewCodeBtn').addEventListener('click', () => setView('code'));

codeView.addEventListener('input', () => setDirty(true));

$('presetSelect').addEventListener('change', (e) => {
  localStorage.setItem('md2pdf.preset', e.target.value);
  if (e.target.value !== 'Custom') applyPreset(e.target.value);
});

$('presetAddBtn').addEventListener('click', () => {
  const input = $('presetName');
  input.hidden = !input.hidden;
  if (!input.hidden) input.focus();
});

$('presetName').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.hidden = true;
    return;
  }
  if (e.key !== 'Enter') return;
  const name = e.target.value.trim();
  if (!name || name === 'Custom' || BUILTIN_PRESETS[name]) return;
  const presets = userPresets();
  const s = state.settings;
  presets[name] = { fontFamily: s.fontFamily, fontSize: s.fontSize, accent: s.accent, text: s.text };
  localStorage.setItem('md2pdf.presets', JSON.stringify(presets));
  localStorage.setItem('md2pdf.preset', name);
  rebuildPresetSelect(name);
  e.target.value = '';
  e.target.hidden = true;
  showToast('Preset "' + name + '" saved');
});

$('fontSelect').addEventListener('change', (e) => {
  state.settings.fontFamily = e.target.value;
  markCustomPreset();
  applySettings();
});
$('sizeSelect').addEventListener('change', (e) => {
  state.settings.fontSize = Number(e.target.value);
  markCustomPreset();
  applySettings();
});
$('accentInput').addEventListener('input', (e) => {
  state.settings.accent = e.target.value;
  markCustomPreset();
  applySettings();
});
$('textInput').addEventListener('input', (e) => {
  state.settings.text = e.target.value;
  markCustomPreset();
  applySettings();
});
$('measureSelect').addEventListener('change', (e) => {
  state.settings.measure = e.target.value;
  applySettings();
});
$('marginSelect').addEventListener('change', (e) => {
  state.settings.margin = Number(e.target.value);
  applySettings();
});
$('pageSelect').addEventListener('change', (e) => {
  state.settings.pageSize = e.target.value;
  applySettings();
});
$('orientSelect').addEventListener('change', (e) => {
  state.settings.landscape = e.target.value === 'landscape';
  applySettings();
});
$('hfCheck').addEventListener('change', (e) => {
  state.settings.hf = e.target.checked;
  applySettings();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'F5') {
    e.preventDefault();
    if (state.rootDir) loadRoot(state.rootDir);
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'p' || k === 'e') {
    e.preventDefault();
    doExport(false);
  } else if (k === 's') {
    e.preventDefault();
    saveCurrent();
  } else if (k === 'b') {
    e.preventDefault();
    setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
  }
});

/* ---------- init ---------- */

loadSettings();
updateButtons();
renderRecent();
setView(localStorage.getItem('md2pdf.view') || 'preview');
const savedWidth = localStorage.getItem('md2pdf.sidebarWidth');
if (savedWidth) sidebar.style.width = savedWidth;
if (localStorage.getItem('md2pdf.sidebarCollapsed') === '1') setSidebarCollapsed(true);
const savedRoot = localStorage.getItem('md2pdf.rootDir');
if (savedRoot) loadRoot(savedRoot);
