// electron/steam.js — Steamworks bridge (MAIN process).
//
// Runs steamworks-ffi-node in the main process (node) and exposes a tiny, safe
// surface to the renderer over IPC (see preload.js → window.WallopSteam). Keeping
// Steam in the main process lets the game window stay locked down
// (contextIsolation:true, nodeIntegration:false) — the renderer never touches
// the native FFI layer directly.
//
// steamworks-ffi-node loads steam_api64.dll at runtime via Koffi FFI (no native
// compilation). Everything degrades gracefully: if Steam isn't running, the SDK
// dll isn't found, or a call throws, we log once and no-op. The game must never
// break because Steam is unavailable (dev, non-Steam launch, offline, etc).
//
// Supported: achievements, Steam Cloud, overlay, AND leaderboards (find/create,
// upload score, download Global/Friends/AroundUser entries with global rank).

const { ipcMain, app } = require('electron');
const path = require('path');

const APP_ID = 4910280;                 // WALLOP — matches steam_appid.txt
const CLOUD_FILE = 'wallop_profile_v1.json';

let steam = null;                       // the SteamworksSDK singleton (or null)
let ready = false;
let loggedUnavailable = false;
let callbackTimer = null;

// Leaderboard enums (numeric). Imported lazily inside initSteam so a missing
// module never throws at require-time.
let LB = null;

// Per-board sort + display config. findOrCreateLeaderboard creates the board with
// these on first upload, so no manual Steamworks-dashboard step is required.
// Names must stay stable once players have posted scores.
function boardConfig() {
  const { LeaderboardSortMethod: S, LeaderboardDisplayType: D } = LB;
  const survival = { sort: S.Descending, display: D.TimeSeconds }; // longer = better
  return {
    // Endless: survive as long as possible (seconds), per arena.
    LB_ENDLESS_PINES:   survival,
    LB_ENDLESS_SLOPES:  survival,
    LB_ENDLESS_GLACIER: survival,
    // Normal-run survival time, per arena.
    LB_SURVIVAL_PINES:   survival,
    LB_SURVIVAL_SLOPES:  survival,
    LB_SURVIVAL_GLACIER: survival,
    // Misc numeric / time boards.
    LB_HIGH_LEVEL: { sort: S.Descending, display: D.Numeric },
    LB_MOST_KILLS: { sort: S.Descending, display: D.Numeric },
    LB_FAST_WIN:   { sort: S.Ascending,  display: D.TimeSeconds }, // faster = better
  };
}
let BOARD_CONFIG = null;

function warnOnce(msg, err) {
  if (loggedUnavailable) return;
  loggedUnavailable = true;
  console.warn('[WALLOP steam] ' + msg + (err ? ' — ' + (err.message || err) : ''));
}

// Absolute path to the folder that contains redistributable_bin/win64/steam_api64.dll.
function resolveSdkPath() {
  if (app && app.isPackaged) {
    // Packaged: the dll is copied into resources/steamworks_sdk via extraResources.
    return path.join(process.resourcesPath, 'steamworks_sdk');
  }
  // Dev: the SDK that ships in the repo.
  return path.join(__dirname, '..', 'steamworks_sdk_164', 'sdk');
}

// Initialize once, before the game window loads. Returns true if Steam is live.
function initSteam() {
  if (ready) return true;
  let mod;
  try {
    mod = require('steamworks-ffi-node');
  } catch (e) {
    warnOnce('steamworks-ffi-node not installed; Steam features disabled', e);
    return false;
  }
  try {
    LB = mod; // enums (LeaderboardSortMethod, etc.) are exported off the module root
    BOARD_CONFIG = boardConfig();
    const SDK = mod.SteamworksSDK || mod.default;
    steam = SDK.getInstance();
    steam.setSdkPath(resolveSdkPath());
    // init() returns false (rather than throwing) if Steam isn't running / owned.
    const ok = steam.init({ appId: APP_ID });
    if (!ok) {
      warnOnce('Steam client not running or app not owned; features disabled');
      steam = null; return false;
    }
    ready = true;
    const name = safe(() => steam.friends.getPersonaName(), '?');
    console.log(`[WALLOP steam] connected as "${name}" (app ${APP_ID})`);
    // Pump Steam callbacks so async leaderboard results + overlay events resolve.
    callbackTimer = setInterval(() => { try { steam.runCallbacks(); } catch (e) {} }, 250);
    return true;
  } catch (e) {
    warnOnce('Steam init failed; features disabled', e);
    steam = null; ready = false;
    return false;
  }
}

function shutdownSteam() {
  if (callbackTimer) { clearInterval(callbackTimer); callbackTimer = null; }
  if (steam && ready) { try { steam.shutdown(); } catch (e) {} }
  ready = false;
}

function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

// ── Achievements ──────────────────────────────────────────────────────────
// unlockAchievement is idempotent (Steam only toasts the first time) and calls
// StoreStats internally, so we can fire-and-forget without a pre-check.
async function unlock(apiName) {
  if (!ready || !steam || !apiName) return false;
  try {
    const ok = await steam.achievements.unlockAchievement(apiName);
    if (ok) console.log('[WALLOP steam] achievement unlocked:', apiName);
    return ok;
  } catch (e) {
    console.warn('[WALLOP steam] unlock failed for', apiName, e && e.message);
    return false;
  }
}

// ── Steam Cloud ───────────────────────────────────────────────────────────
// The game save is one localStorage blob wrapped in a { t, data } envelope with a
// millisecond timestamp so boot-time hydration can do newer-wins across machines.
function cloudRead() {
  if (!ready || !steam) return null;
  try {
    if (!steam.cloud.isCloudEnabledForApp() || !steam.cloud.isCloudEnabledForAccount()) return null;
    if (!steam.cloud.fileExists(CLOUD_FILE)) return null;
    const res = steam.cloud.fileRead(CLOUD_FILE);
    if (!res || !res.success || !res.data) return null;
    const env = JSON.parse(res.data.toString());
    if (env && typeof env.t === 'number' && typeof env.data === 'string') return env;
    return null;
  } catch (e) {
    console.warn('[WALLOP steam] cloudRead failed', e && e.message);
    return null;
  }
}

function cloudWrite(blob, t) {
  if (!ready || !steam || typeof blob !== 'string') return false;
  try {
    if (!steam.cloud.isCloudEnabledForApp() || !steam.cloud.isCloudEnabledForAccount()) return false;
    const env = JSON.stringify({ t: t || Date.now(), data: blob });
    return steam.cloud.fileWrite(CLOUD_FILE, Buffer.from(env, 'utf8'));
  } catch (e) {
    console.warn('[WALLOP steam] cloudWrite failed', e && e.message);
    return false;
  }
}

// ── Leaderboards ────────────────────────────────────────────────────────────
// Cache resolved leaderboard handles by name so repeated submit/fetch don't
// re-find every time.
const _lbCache = new Map();
async function _handleFor(board) {
  if (_lbCache.has(board)) return _lbCache.get(board);
  const cfg = BOARD_CONFIG[board] || { sort: LB.LeaderboardSortMethod.Descending, display: LB.LeaderboardDisplayType.Numeric };
  const info = await steam.leaderboards.findOrCreateLeaderboard(board, cfg.sort, cfg.display);
  const handle = info ? info.handle : null;
  if (handle != null) _lbCache.set(board, handle);
  return handle;
}

// Upload a score. Returns { rank, previousRank, changed } or null. KeepBest so a
// worse run never overwrites the player's best.
async function submitScore(board, value) {
  if (!ready || !steam || !isFinite(value)) return null;
  try {
    const handle = await _handleFor(board);
    if (handle == null) return null;
    const res = await steam.leaderboards.uploadScore(
      handle, Math.round(value), LB.LeaderboardUploadScoreMethod.KeepBest);
    if (!res || !res.success) return null;
    return { rank: res.globalRankNew, previousRank: res.globalRankPrevious, changed: res.scoreChanged };
  } catch (e) {
    console.warn('[WALLOP steam] submitScore failed for', board, e && e.message);
    return null;
  }
}

// Download entries. mode: 'global' | 'friends' | 'around'. Returns
// { displayType, entries: [{ rank, score, steamId, name, isSelf }] } or null.
async function fetchLeaderboard(board, mode = 'global', count = 20) {
  if (!ready || !steam) return null;
  try {
    const handle = await _handleFor(board);
    if (handle == null) return null;
    const cfg = BOARD_CONFIG[board] || { display: LB.LeaderboardDisplayType.Numeric };
    const R = LB.LeaderboardDataRequest;
    let request = R.Global, start = 1, end = count;
    if (mode === 'friends') { request = R.Friends; start = 0; end = 0; } // Friends returns all
    else if (mode === 'around') { request = R.GlobalAroundUser; start = -Math.floor(count / 2); end = Math.ceil(count / 2); }
    const raw = await steam.leaderboards.downloadLeaderboardEntries(handle, request, start, end);
    const mySteamId = safe(() => String(steam.getStatus().steamId), '');
    const myName = safe(() => steam.friends.getPersonaName(), 'You');
    const entries = (raw || []).map((e) => {
      const isSelf = mySteamId && String(e.steamId) === mySteamId;
      let name = isSelf ? myName : safe(() => steam.friends.getFriendPersonaName(e.steamId), '') || '';
      if (!name) name = 'Player';
      return { rank: e.globalRank, score: e.score, steamId: String(e.steamId), name, isSelf: !!isSelf };
    });
    return { displayType: cfg.display, entries };
  } catch (e) {
    console.warn('[WALLOP steam] fetchLeaderboard failed for', board, e && e.message);
    return null;
  }
}

// ── Overlay ─────────────────────────────────────────────────────────────────
function openAchievementsOverlay() {
  if (!ready || !steam) return;
  try { steam.overlay.activateGameOverlay('Achievements'); } catch (e) {}
}

// ── IPC wiring (renderer ⇄ main) ─────────────────────────────────────────────
function registerIpc() {
  ipcMain.on('wallop:steam-ready', (e) => { e.returnValue = ready; });
  ipcMain.on('wallop:cloud-load', (e) => { e.returnValue = cloudRead(); }); // sync — used at boot in preload
  ipcMain.handle('wallop:unlock', (e, api) => unlock(api));
  ipcMain.handle('wallop:submit-score', (e, board, value) => submitScore(board, value));
  ipcMain.handle('wallop:fetch-leaderboard', (e, board, mode, count) => fetchLeaderboard(board, mode, count));
  ipcMain.handle('wallop:cloud-save', (e, blob, t) => cloudWrite(blob, t));
  ipcMain.handle('wallop:open-achievements', () => openAchievementsOverlay());
}

module.exports = {
  initSteam, shutdownSteam, registerIpc,
  unlock, cloudRead, cloudWrite, submitScore, fetchLeaderboard,
  isReady: () => ready,
};
