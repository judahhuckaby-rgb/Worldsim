// Minimal, safe bridge between the game page and the desktop shell (updates + external links).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('desktop-info'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  onUpdateStatus: cb => ipcRenderer.on('update-status', (_e, status) => cb(status)),
});
