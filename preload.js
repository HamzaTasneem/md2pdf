const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  search: (rootDir, query) => ipcRenderer.invoke('fs:search', { rootDir, query }),
  renderFile: (filePath) => ipcRenderer.invoke('md:render', filePath),
  renderText: (text) => ipcRenderer.invoke('md:renderText', text),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  exportPdf: (opts) => ipcRenderer.invoke('pdf:export', opts),
  exportBatch: (opts) => ipcRenderer.invoke('pdf:exportBatch', opts),
  watchFile: (filePath) => ipcRenderer.invoke('watch:set', filePath),
  importUrl: (url, dir) => ipcRenderer.invoke('net:importUrl', { url, dir }),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  openItem: (p) => ipcRenderer.invoke('shell:openItem', p),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onBatchProgress: (cb) => ipcRenderer.on('batch-progress', (_e, data) => cb(data)),
  onFileChanged: (cb) => ipcRenderer.on('file-changed', (_e, filePath) => cb(filePath))
});
