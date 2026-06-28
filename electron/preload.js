// Preload — runs before the game's JS in an isolated context. Exposes the
// Steam/premium build flag that renderer.js's isSteamBuild() reads, so the game
// enables premium behaviour (2× slice economy; ads already gated off on desktop).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__WALLOP_STEAM', true);
