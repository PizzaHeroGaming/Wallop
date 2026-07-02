// electron/steam.js — Steamworks bridge (MAIN process).
//
// Runs steamworks.js in the main process (node) and exposes a tiny, safe surface
// to the renderer over IPC (see preload.js → window.WallopSteam). Keeping Steam
// in the main process lets the game window stay locked down
// (contextIsolation:true, nodeIntegration:false) — the renderer never touches
// the native module directly.
//
// Everything degrades gracefully: if Steam isn't running, the SDK isn't present,
// or a call throws, we log once and no-op. The game must never break because
// Steam is unavailable (dev, non-Steam launch, offline, etc).
//
// Supported by steamworks.js 0.4.0: achievements + Steam Cloud + overlay.
// NOT supported: leaderboards (no namespace in 0.4.0) — submitScore is a
// documented stub that logs and no-ops until we add a native leaderboard path.

const { ipcMain } = require('electron');

const APP_ID = 4910280;                 // WALLOP — matches steam_appid.txt
const CLOUD_FILE = 'wallop_profile_v1.json';

let steam = null;                       // the steamworks.js client (or null)
let ready = false;
let loggedUnavailable = false;

function warnOnce(msg, err) {
  if (loggedUnavailable) return;
  loggedUnavailable = true;
  console.warn('[WALLOP steam] ' + msg + (err ? ' — ' + (err.message || err) : ''));
}

// Initialize once, before the game window loads. Returns true if Steam is live.
function initSteam() {
  if (ready) return true;
  let sw;
  try {
    sw = require('steamworks.js');
  } catch (e) {
    warnOnce('steamworks.js not installed; Steam features disabled', e);
    return false;
  }
  try {
    // init() throws if the Steam client isn't running or the app isn't owned.
    steam = sw.init(APP_ID);
    ready = true;
    const name = safe(() => steam.localplayer.getName(), '?');
    console.log(`[WALLOP steam] connected as "${name}" (app ${APP_ID})`);
    // NOTE: the in-game overlay (achievement toasts / Shift+Tab) is intentionally
    // NOT enabled here. steamworks.js's electronEnableSteamOverlay() appends the
    // `in-process-gpu` + `disable-direct-composition` command-line switches, which
    // MUST be set before app.whenReady() and carry a real perf risk for a 60fps
    // WebGL game. Achievements still unlock server-side without it (they show in
    // the Steam client). If we want the in-game toast, call
    // electronEnableSteamOverlay(true) at the TOP of main.js (pre-ready) and
    // perf-test it. Tracked as a follow-up.
    return true;
  } catch (e) {
    warnOnce('Steam client not running or app not owned; features disabled', e);
    steam = null; ready = false;
    return false;
  }
}

function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

// ── Achievements ──────────────────────────────────────────────────────────
// Fire-and-forget. Guarded by isActivated so we never re-toast. steamworks.js
// activate() persists (SetAchievement + StoreStats) internally.
function unlock(apiName) {
  if (!ready || !steam || !apiName) return false;
  try {
    if (steam.achievement.isActivated(apiName)) return true;
    const ok = steam.achievement.activate(apiName);
    if (ok) console.log('[WALLOP steam] achievement unlocked:', apiName);
    return ok;
  } catch (e) {
    console.warn('[WALLOP steam] unlock failed for', apiName, e && e.message);
    return false;
  }
}

// ── Steam Cloud ───────────────────────────────────────────────────────────
// The game save is one localStorage blob. We wrap it in an envelope with a
// millisecond timestamp so boot-time hydration can do newer-wins across
// machines. Returns { t, data } or null.
function cloudRead() {
  if (!ready || !steam) return null;
  try {
    if (!steam.cloud.isEnabledForApp() || !steam.cloud.isEnabledForAccount()) return null;
    if (!steam.cloud.fileExists(CLOUD_FILE)) return null;
    const raw = steam.cloud.readFile(CLOUD_FILE);
    const env = JSON.parse(raw);
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
    if (!steam.cloud.isEnabledForApp() || !steam.cloud.isEnabledForAccount()) return false;
    const env = JSON.stringify({ t: t || Date.now(), data: blob });
    return steam.cloud.writeFile(CLOUD_FILE, env);
  } catch (e) {
    console.warn('[WALLOP steam] cloudWrite failed', e && e.message);
    return false;
  }
}

// ── Leaderboards (NOT available in steamworks.js 0.4.0) ─────────────────────
// Kept as a documented stub so the game-side submitScore() calls are already in
// place. When we add leaderboard support (steamworks.js upgrade or a native
// addition against the raw SDK's ISteamUserStats), only this function changes.
function submitScore(board, value) {
  if (!ready) return false;
  console.log(`[WALLOP steam] submitScore("${board}", ${value}) — leaderboards not yet implemented (no-op)`);
  return false;
}

// ── Overlay ─────────────────────────────────────────────────────────────────
function openAchievementsOverlay() {
  if (!ready || !steam) return;
  try { steam.overlay.activateDialog(6 /* Achievements */); } catch (e) {}
}

// ── IPC wiring (renderer ⇄ main) ─────────────────────────────────────────────
function registerIpc() {
  ipcMain.on('wallop:steam-ready', (e) => { e.returnValue = ready; });
  ipcMain.on('wallop:cloud-load', (e) => { e.returnValue = cloudRead(); }); // sync — used at boot in preload
  ipcMain.handle('wallop:unlock', (e, api) => unlock(api));
  ipcMain.handle('wallop:submit-score', (e, board, value) => submitScore(board, value));
  ipcMain.handle('wallop:cloud-save', (e, blob, t) => cloudWrite(blob, t));
  ipcMain.handle('wallop:open-achievements', () => openAchievementsOverlay());
}

module.exports = { initSteam, registerIpc, unlock, cloudRead, cloudWrite, submitScore, isReady: () => ready };
