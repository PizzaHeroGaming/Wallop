// Preload — runs before the game's JS in an isolated context. Exposes the
// Steam/premium build flag that renderer.js's isSteamBuild() reads, so the game
// enables premium behaviour (2× slice economy; ads already gated off on desktop).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__WALLOP_STEAM', true);

// Display controls for the in-game Settings menu (no-op equivalents don't exist
// on web/mobile, where window.WallopDesktop is simply absent).
contextBridge.exposeInMainWorld('WallopDesktop', {
  setDisplayMode: (mode) => ipcRenderer.invoke('wallop:setDisplayMode', mode),
  setResolution: (w, h) => ipcRenderer.invoke('wallop:setResolution', w, h),
});
