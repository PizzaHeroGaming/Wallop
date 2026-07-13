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

const { app, BrowserWindow, protocol, net, Menu, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const steam = require('./steam');

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
      // Disable DevTools entirely in the shipped build so players can't open the
      // console to edit their save or spoof leaderboard/achievement calls. Stays
      // on in dev (`npm start`) for debugging.
      devTools: !app.isPackaged,
    },
  });
  Menu.setApplicationMenu(null); // no menu bar in the shipped game
  if (!app.isPackaged) win.webContents.session.clearCache(); // dev: always load fresh modules
  win.loadURL('wallop://local/index.html');

  // F11 toggles fullscreen. Esc is intentionally NOT intercepted — the game uses
  // it to pause / open the menu (and to release pointer lock). Fullscreen mode is
  // owned by the in-game Settings menu, not the OS Esc key.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    // F12 toggles DevTools in dev only — no-op (and blocked above) in the shipped build.
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  // Steam must be up before the window loads: preload.js does a synchronous
  // cloud-load to hydrate the save before the game's profile.js reads it.
  steam.registerIpc();
  steam.initSteam();

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

  // Display controls driven by the in-game Settings menu.
  ipcMain.handle('wallop:setDisplayMode', (e, mode) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (mode === 'fullscreen') {
      win.setFullScreen(true);
    } else if (mode === 'borderless') {
      win.setFullScreen(false);
      win.maximize();
    } else { // windowed
      win.setFullScreen(false);
      win.unmaximize();
      win.center();
    }
  });
  ipcMain.handle('wallop:setResolution', (e, w, h) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isFullScreen()) return; // resolution only applies windowed
    win.unmaximize();
    win.setSize(Math.round(w), Math.round(h));
    win.center();
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try { steam.shutdownSteam(); } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
