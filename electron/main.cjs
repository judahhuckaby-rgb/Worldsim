// Electron shell for the Windows desktop build, with self-updating from GitHub Releases.
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

// The portable exe can't replace itself; only the installed (NSIS) build auto-updates.
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;
let win = null;
let updater = null;

function send(status) {
  if (win && !win.isDestroyed()) win.webContents.send('update-status', status);
}

function setupAutoUpdate() {
  if (isPortable || !app.isPackaged) return;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch (e) {
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', info => send({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('download-progress', p => send({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', info => send({ state: 'ready', version: info.version }));
  updater.on('error', err => send({ state: 'error', message: String(err && err.message ? err.message : err) }));
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 3 * 60 * 60 * 1000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    title: 'WorldSim Ages',
    backgroundColor: '#0d1424',
    icon: path.join(__dirname, '..', 'dist', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('desktop-info', () => ({ version: app.getVersion(), portable: isPortable, autoUpdate: !isPortable && app.isPackaged }));
ipcMain.handle('install-update', () => { if (updater) updater.quitAndInstall(false, true); });
ipcMain.handle('check-update', () => { if (updater) return updater.checkForUpdates().then(() => true).catch(() => false); return false; });
ipcMain.handle('open-external', (_e, url) => { if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url); });

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
