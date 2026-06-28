// WALLOP desktop (Steam) wrapper — Electron main process.
//
// Serves the game from a custom secure origin (wallop://) rather than file://,
// because Chromium blocks ES-module scripts loaded over file:// (CORS). The
// custom scheme is registered as standard + secure so modules + fetch work and
// the page runs in a normal secure context.
//
// Dev (`npm start`): serves the repo root (index.html + src/ + assets/) so you
//   don't have to assemble www/ first.
// Packaged: serves the bundled `game/` (assembled by build-www.py → ../www,
//   copied via extraResources).

const { app, BrowserWindow, protocol, net, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'game')   // packaged: extraResources/game
  : path.join(__dirname, '..');                // dev: repo root

protocol.registerSchemesAsPrivileged([{
  scheme: 'wallop',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    backgroundColor: '#0d1126',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null); // no menu bar in the shipped game
  win.loadURL('wallop://local/index.html');

  // F11 toggles fullscreen; Esc leaves it (quality-of-life on desktop).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.key === 'Escape' && win.isFullScreen()) { win.setFullScreen(false); e.preventDefault(); }
  });
}

app.whenReady().then(() => {
  protocol.handle('wallop', (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    const filePath = path.join(GAME_ROOT, rel);
    // Guard against path traversal outside the game root.
    if (!filePath.startsWith(GAME_ROOT)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
