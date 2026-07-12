// Preload — runs before the game's JS in an isolated context, but shares the
// page's DOM + localStorage (storage is per-origin, not per-world). Exposes the
// Steam/premium build flag and the Steam feature bridge, and hydrates the save
// from Steam Cloud BEFORE the game's profile.js reads localStorage.
const { contextBridge, ipcRenderer } = require('electron');

const PROFILE_KEY = 'wallop_profile_v1';   // must match src/js/profile.js
const CLOUD_META_KEY = 'wallop_cloud_t';   // last-applied cloud timestamp (local mirror)

contextBridge.exposeInMainWorld('__WALLOP_STEAM', true);

// ── Boot-time cloud hydration (newer-wins) ──────────────────────────────────
// Pull the cloud envelope synchronously so it lands before any game module runs.
// If the cloud copy is newer than what we last applied locally, overwrite the
// local save. Otherwise keep local (it's the freshest play state on this box).
(function hydrateFromCloud() {
  try {
    const env = ipcRenderer.sendSync('wallop:cloud-load'); // { t, data } | null
    if (!env || typeof env.data !== 'string') return;
    const localMetaT = parseInt(window.localStorage.getItem(CLOUD_META_KEY) || '0', 10) || 0;
    const hasLocal = !!window.localStorage.getItem(PROFILE_KEY);
    if (!hasLocal || env.t > localMetaT) {
      window.localStorage.setItem(PROFILE_KEY, env.data);
      window.localStorage.setItem(CLOUD_META_KEY, String(env.t));
      console.log('[WALLOP steam] save hydrated from Steam Cloud (t=' + env.t + ')');
    }
  } catch (e) { /* offline / no steam / quota — game boots from local as normal */ }
})();

const steamReady = (() => { try { return !!ipcRenderer.sendSync('wallop:steam-ready'); } catch (e) { return false; } })();

// ── Steam feature bridge (window.WallopSteam) ───────────────────────────────
// Absent on web/mobile; the game-side src/js/steam.js feature-detects it.
contextBridge.exposeInMainWorld('WallopSteam', {
  isReady: () => steamReady,
  unlock: (api) => ipcRenderer.invoke('wallop:unlock', api),
  // Resolves to { rank, previousRank, changed } | null. force=true → ForceUpdate.
  submitScore: (board, value, force) => ipcRenderer.invoke('wallop:submit-score', board, value, force),
  // Resolves to { displayType, entries: [{ rank, score, name, isSelf }] } | null.
  // mode: 'global' | 'friends' | 'around'.
  fetchLeaderboard: (board, mode, count) => ipcRenderer.invoke('wallop:fetch-leaderboard', board, mode, count),
  // Persist the profile blob to Steam Cloud. Stamps a timestamp so this machine's
  // local mirror stays in sync with what we just wrote (keeps newer-wins honest).
  cloudSave: (blob) => {
    const t = Date.now();
    try { window.localStorage.setItem(CLOUD_META_KEY, String(t)); } catch (e) {}
    return ipcRenderer.invoke('wallop:cloud-save', blob, t);
  },
  openAchievements: () => ipcRenderer.invoke('wallop:open-achievements'),
});

// Display controls for the in-game Settings menu (absent on web/mobile).
contextBridge.exposeInMainWorld('WallopDesktop', {
  setDisplayMode: (mode) => ipcRenderer.invoke('wallop:setDisplayMode', mode),
  setResolution: (w, h) => ipcRenderer.invoke('wallop:setResolution', w, h),
});
