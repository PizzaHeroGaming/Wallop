// cloud.js — Cloud save via Play Games Saved Games (Android only).
//
// Model: LAST-WRITE-WINS by timestamp. The whole wallop_profile_v1 JSON is the
// snapshot; each push carries a `__savedAt`. On startup we compare the cloud
// snapshot's timestamp against the local one and the newer wins wholesale:
//   - Fresh reinstall / new device → cloud newer than (absent) local → restored.
//   - Reset or offline progress → local newer → it wins and is pushed up, so a
//     reset actually sticks and offline play isn't lost.
//
// (Whole-profile last-write-wins — the same model Athanor settled on — rather
// than field-wise merge: a merge can never express a reset and quietly diverges.
// The trade-off, two devices played offline keep only the most-recent, is an
// acceptable edge case for a casual single-player game.)
//
// First cloud-enabled boot on a device has no local timestamp (localTs === 0);
// to stop a smaller/older cloud from clobbering real existing local progress we
// only adopt the cloud in that case if it carries MORE progress (progressScore).
//
// In a browser / Steam (no window.PlayCloud) or for a signed-out player, every
// entry point no-ops silently and the game runs exactly as before.
import { Profile } from './profile.js?v=b17d24e';
// NOTE: no import from ui.js — we signal a profile swap via the
// 'wallop:profilechanged' event instead, so there's no cloud↔ui import cycle.

const TS_KEY = 'wallop_cloud_ts';          // local state's last-modified timestamp
const LAST_SAVE_KEY = 'wallop_cloud_last_save'; // last SUCCESSFUL cloud commit (ms)

let active = false;
let pushTimer = null;
let dirty = false;                  // local changes not yet pushed
let suppressNextPush = false;       // set while adopting cloud, so the adopt's
                                    // own save() doesn't immediately re-push

function bridge() { return window.PlayCloud; }
function nowMs() { return Date.now(); }

function getLocalTs() {
  try { return parseInt(localStorage.getItem(TS_KEY) || '0', 10) || 0; }
  catch (e) { return 0; }
}
function setLocalTs(ts) {
  try { localStorage.setItem(TS_KEY, String(ts)); } catch (e) { /* ignore */ }
}
function getLastSaveMs() {
  try { return parseInt(localStorage.getItem(LAST_SAVE_KEY) || '0', 10) || 0; }
  catch (e) { return 0; }
}
function setLastSaveMs(ts) {
  try { localStorage.setItem(LAST_SAVE_KEY, String(ts)); } catch (e) { /* ignore */ }
}

function isReady() {
  try {
    return !!(bridge() &&
      typeof bridge().isSignedIn === 'function' &&
      bridge().isSignedIn());
  } catch (e) { return false; }
}

// Coarse "how much progress" score — only used to break the first-sync tie when
// the local save has no timestamp yet. Bigger = more progress.
function progressScore(p) {
  if (!p) return 0;
  let s = p.slices || 0;
  s += Object.keys(p.unlocked || {}).length * 100;
  s += Object.values(p.boostLevels || {}).reduce((a, b) => a + (b || 0), 0) * 40;
  s += Object.keys(p.unlockedArenas || {}).length * 200;
  if (p.stats) s += (p.stats.totalKills || 0) + (p.stats.runsWon || 0) * 50;
  s += Object.values(p.endlessBest || {}).reduce((a, b) => a + (b || 0), 0);
  return s;
}

function init() {
  if (!bridge()) return;   // browser / Steam / unwrapped → local-only
  // PGS auth resolves async after start, so poll briefly for a signed-in state
  // before giving up.
  let attempts = 0;
  (function poll() {
    attempts++;
    if (isReady()) { startSync(); return; }
    if (attempts < 20) setTimeout(poll, 300);   // ~6s ceiling
  })();
}

function startSync() {
  active = true;
  window.__onCloudLoad = onCloudLoad;
  window.__onCloudSaved = onCloudSaved;
  // Every local Profile.save() now schedules a debounced push.
  Profile.onSave(schedulePush);
  // Pull the cloud snapshot once; onCloudLoad decides the winner.
  try { bridge().load(); } catch (e) { /* ignore */ }
  // Flush immediately when the app backgrounds/closes — the most reliable save
  // point, right before the OS might kill the process.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dirty) pushNow();
  });
}

// ---- Load + last-write-wins reconciliation ---------------------------
// Native hands us the cloud snapshot: base64-encoded JSON, or null.
function onCloudLoad(b64) {
  try {
    if (!b64) { pushNow(); return; }             // no cloud yet → seed from local
    const cloud = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!cloud || typeof cloud !== 'object') { pushNow(); return; }
    const cloudTs = (typeof cloud.__savedAt === 'number') ? cloud.__savedAt : 0;
    const localTs = getLocalTs();

    let cloudWins;
    if (localTs === 0) {
      // First cloud-enabled boot on this device: only adopt if cloud has more,
      // so a smaller/older cloud never wipes real local progress.
      cloudWins = progressScore(cloud) > progressScore(Profile.get());
    } else {
      cloudWins = cloudTs > localTs;
    }

    if (cloudWins) adoptCloud(cloud, cloudTs);
    else pushNow();                               // local authoritative → push up
  } catch (e) {
    pushNow();                                    // unreadable cloud → keep local
  }
}

// Replace local progress with the cloud's (it won the timestamp compare).
function adoptCloud(cloud, ts) {
  const obj = Object.assign({}, cloud);
  delete obj.__savedAt;                           // strip the sync stamp
  setLocalTs(ts || nowMs());                      // set BEFORE adopt so the
  suppressNextPush = true;                        // resulting save doesn't re-push
  const ok = Profile.adoptCloudState(obj);
  if (ok) {
    // ui.js listens for this and refreshes the menu currency / armory.
    try { window.dispatchEvent(new Event('wallop:profilechanged')); } catch (e) {}
  }
}

// ---- Push (debounced + dirty-gated) ---------------------------------
function schedulePush() {
  if (!active) return;
  if (suppressNextPush) { suppressNextPush = false; return; }
  dirty = true;
  setLocalTs(nowMs());                            // local state just changed
  if (pushTimer) clearTimeout(pushTimer);
  // 2s debounce — coalesces a burst of saves; background-flush covers a close
  // before the timer fires.
  pushTimer = setTimeout(pushNow, 2000);
}

function pushNow() {
  if (!active) return;
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  dirty = false;
  try {
    const obj = JSON.parse(Profile.serialize());
    obj.__savedAt = getLocalTs() || nowMs();
    showSaving();
    bridge().save(JSON.stringify(obj));
  } catch (e) { hideIndicator(); }
}

// Native fires this when a cloud write completes (or fails). Drives the little
// #cloud-sync indicator + records the last successful save time for Settings.
function onCloudSaved(success) {
  if (success) { setLastSaveMs(nowMs()); showSaved(); }
  else hideIndicator();
}

// ---- #cloud-sync indicator (transient "SAVING…" → "SAVED") ----------
// The element lives in every build but only ever animates on Android (pushNow
// runs only when signed in), so web/Steam just leave it hidden.
let _indicatorEl;              // resolved lazily; false if absent
let _savedHideTimer = null;
function indicator() {
  if (_indicatorEl === undefined) _indicatorEl = document.getElementById('cloud-sync') || false;
  return _indicatorEl || null;
}
function _setIndicator(cls, text) {
  const el = indicator(); if (!el) return;
  el.classList.remove('hidden', 'saving', 'saved');
  if (cls) el.classList.add(cls);
  const t = el.querySelector('.cloud-sync-text');
  if (t && text) t.textContent = text;
}
function showSaving() {
  if (_savedHideTimer) { clearTimeout(_savedHideTimer); _savedHideTimer = null; }
  _setIndicator('saving', 'SAVING…');
}
function showSaved() {
  _setIndicator('saved', 'SAVED');
  const el = indicator(); if (!el) return;
  _savedHideTimer = setTimeout(() => { el.classList.add('hidden'); }, 1600);
}
function hideIndicator() {
  const el = indicator(); if (el) el.classList.add('hidden');
}

// ---- Public API for the Settings "CLOUD SAVE" section ----------------
// Force a save right now (the manual "BACK UP" button). Returns false if there's
// no signed-in cloud to push to.
function backupNow() {
  if (!active) return false;
  pushNow();
  return true;
}
// Snapshot for the Settings UI: is this an Android build at all, is the player
// signed in, and when did we last successfully save.
function getStatus() {
  return {
    available: !!bridge(),     // true on Android (bridge injected), false web/Steam
    signedIn: isReady(),       // bridge present AND authenticated
    lastSavedMs: getLastSaveMs(),
  };
}

export const Cloud = { init, isAvailable: isReady, backupNow, getStatus };
