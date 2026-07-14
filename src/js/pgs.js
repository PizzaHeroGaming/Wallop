// pgs.js — game-side Play Games Services bridge (achievements + leaderboards).
//
// Mobile/Android only. Talks to window.AndroidGames (GamesBridge.java). Every
// export no-ops off-Android or when the player is signed out, mirroring steam.js
// so the shared trigger layer in steam.js can drive BOTH platforms from the same
// call sites. Cloud save is separate (cloud.js / SavesBridge).
//
// PGS leaderboards formatted as "Time" interpret the raw score as MILLISECONDS,
// but the game works in seconds — so we submit seconds×1000 for time boards and
// convert entries back to seconds on read, keeping the shared UI formatting
// (LB_CATEGORIES fmt) identical across Steam and mobile.
import { pgsAchId, pgsBoardId } from './pgs-ids.js?v=62487c8';

function bridge() { return (typeof window !== 'undefined' && window.AndroidGames) || null; }

export function available() {
  const b = bridge();
  try { return !!(b && typeof b.isSignedIn === 'function' && b.isSignedIn()); }
  catch (e) { return false; }
}

// ENDLESS + FASTWIN are time boards (seconds); LEVEL + WEEKLY are plain numbers.
function isTimeBoard(board) {
  return board && (board.indexOf('LB_ENDLESS') === 0 || board.indexOf('LB_FASTWIN') === 0);
}
function isWeekly(board) { return board && board.indexOf('LB_WEEKLY_KILLS') === 0; }

// ── Achievements — fire-and-forget standard unlocks (JS owns the threshold) ──
export function unlock(api) {
  const id = pgsAchId(api);
  if (!id || !available()) return;
  try { bridge().unlock(id); } catch (e) { /* ignore */ }
}

// ── async result plumbing (submit + fetch use a token→resolver map) ──────────
let _seq = 1;
const _pending = new Map();
if (typeof window !== 'undefined') {
  window.__onPgsResult = function (token, b64) {
    const resolve = _pending.get(token);
    if (!resolve) return;
    _pending.delete(token);
    let data = null;
    try { data = b64 ? JSON.parse(decodeURIComponent(escape(atob(b64)))) : null; } catch (e) {}
    resolve(data);
  };
}
function _call(invoke) {
  return new Promise((resolve) => {
    const token = _seq++;
    _pending.set(token, resolve);
    try { invoke(token); }
    catch (e) { _pending.delete(token); resolve(null); return; }
    // Safety timeout so a dropped native callback can't leak a pending promise.
    setTimeout(() => { if (_pending.has(token)) { _pending.delete(token); resolve(null); } }, 8000);
  });
}

// Submit a score. Resolves to { rank } | null.
export function submitScore(board, value) {
  const id = pgsBoardId(board);
  if (!id || !available() || !isFinite(value)) return Promise.resolve(null);
  const raw = isTimeBoard(board) ? Math.round(value * 1000) : Math.round(value);
  return _call((token) => bridge().submitScore(token, id, raw, isWeekly(board)));
}

// Fetch entries. Resolves to { entries:[{rank,score,name,isSelf}] } | null, with
// `score` in the same units the UI expects (seconds for time boards).
export function fetchLeaderboard(board, mode = 'global', count = 20) {
  const id = pgsBoardId(board);
  if (!id || !available()) return Promise.resolve(null);
  const timeBoard = isTimeBoard(board);
  return _call((token) => bridge().fetchLeaderboard(token, id, mode, count, isWeekly(board)))
    .then((data) => {
      if (!data || !Array.isArray(data.entries)) return data;
      if (timeBoard) data.entries.forEach((e) => { e.score = (e.score || 0) / 1000; });
      return data;
    });
}

// Open native PGS UIs (fallbacks if we ever want a "view on Google Play Games" button).
export function showAchievements() { if (available()) try { bridge().showAchievements(); } catch (e) {} }
export function showLeaderboard(board) {
  if (!available()) return;
  try { bridge().showLeaderboard(pgsBoardId(board) || ''); } catch (e) { /* ignore */ }
}
