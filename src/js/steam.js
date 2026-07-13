// src/js/steam.js — game-side Steam features bridge.
//
// Thin, defensive wrapper over window.WallopSteam (exposed by the Electron
// preload on the desktop/Steam build). EVERY export no-ops unless we're on the
// Steam build AND the bridge is present, so this file is completely inert on the
// web and mobile builds — no gameplay changes, just taps.
//
// Responsibilities:
//   • unlock achievements (deduped so we never spam IPC)
//   • submit + fetch leaderboard scores (arena×difficulty matrix + weekly board)
//   • push the save to Steam Cloud at run-end
//   • keep a tiny lifetime ledger (kills / chests / slices earned) for the
//     counter-based achievements the Profile schema doesn't already track.
//
// Achievement + leaderboard API names must match the Steamworks dashboard
// exactly — see docs/STEAMWORKS_FEATURES_SPEC.md.

import { isSteamBuild } from './renderer.js?v=b20c8b7';
import { Profile, CATALOG } from './profile.js?v=b20c8b7';

const PROFILE_KEY = 'wallop_profile_v1';
const LEDGER_KEY  = 'wallop_steam_v1';

// ── Lifetime ledger (Steam builds only) ─────────────────────────────────────
function _loadLedger() { try { return JSON.parse(localStorage.getItem(LEDGER_KEY)) || {}; } catch (e) { return {}; } }
const _L = Object.assign({ kills: 0, chests: 0, slices: 0 }, _loadLedger());
function _saveLedger() { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(_L)); } catch (e) {} }

// ── Availability ────────────────────────────────────────────────────────────
function _bridge() { return (typeof window !== 'undefined' && window.WallopSteam) || null; }
export function steamAvailable() { return isSteamBuild() && !!_bridge(); }

// ── Core primitives ─────────────────────────────────────────────────────────
const _sent = new Set(); // in-session dedupe so per-frame checks fire IPC once
export function unlock(api) {
  if (!api || !steamAvailable() || _sent.has(api)) return;
  _sent.add(api);
  try { _bridge().unlock(api); } catch (e) {}
}
// Resolves to { rank, previousRank, changed } | null (null on web/mobile/error).
export function submitScore(board, value) {
  if (!steamAvailable() || !isFinite(value)) return Promise.resolve(null);
  try { return Promise.resolve(_bridge().submitScore(board, Math.round(value))); }
  catch (e) { return Promise.resolve(null); }
}
// Resolves to { displayType, entries:[{rank,score,name,isSelf}] } | null.
// mode: 'global' | 'friends' | 'around'.
export function fetchLeaderboard(board, mode = 'global', count = 20) {
  if (!steamAvailable()) return Promise.resolve(null);
  try { return Promise.resolve(_bridge().fetchLeaderboard(board, mode, count)); }
  catch (e) { return Promise.resolve(null); }
}
export function cloudSave() {
  if (!steamAvailable()) return;
  try { const blob = localStorage.getItem(PROFILE_KEY); if (blob) _bridge().cloudSave(blob); } catch (e) {}
}

// ── Per-run state (triple-threat tracking) ──────────────────────────────────
let _runBosses = new Set();
export function newRun() {
  _runBosses = new Set();
  syncMeta(); // re-evaluate roster/signature achievements each run
}

// ── Achievement triggers (called from game code; all safe on web) ────────────
// Rush Hour: 5,000 kills in a SINGLE run (per-run flex; deduped so the per-frame
// check only fires IPC once).
export function checkRunKills(kills) { if (kills >= 5000) unlock('ACH_RUSH_HOUR'); }

export function bossKilled(tier) {
  if (!steamAvailable()) return;
  if (tier === 'mini1') { unlock('ACH_SAUCE_SLINGER'); _runBosses.add('mini1'); }
  else if (tier === 'mini2') { unlock('ACH_HAMMER_CHEF'); _runBosses.add('mini2'); }
  // 'final' is credited on victory (see runEnded) — the final boss also appears
  // at the end of earlier stages, so we must not fire the win achievement here.
}

export function checkGold(gold) { if (gold >= 2500) unlock('ACH_GOLD_2500'); }

export function checkLevel(level) {
  if (level >= 5)   unlock('ACH_FIRST_DELIVERY'); // "First Delivery" — first real step
  if (level >= 50)  unlock('ACH_LEVEL_50');
  if (level >= 150) unlock('ACH_LEVEL_150');
  if (level >= 300) unlock('ACH_LEVEL_300');
}

export function checkLoadout(weapons, armor, tomes) {
  if (weapons >= 3 && armor >= 3 && tomes >= 3) unlock('ACH_FULL_LOADOUT');
}
export function weaponMaxed() { unlock('ACH_MAX_WEAPON'); }

export function chestOpened() {
  if (!steamAvailable()) return;
  _L.chests++; _saveLedger();
  if (_L.chests >= 250) unlock('ACH_CHESTS_250');
}

export function slicesEarned(n) {
  if (!steamAvailable() || !n) return;
  _L.slices += n; _saveLedger();
  if (_L.slices >= 500) unlock('ACH_SLICE_BARON');
}

export function arenaCleared(arenaSlug) {
  if (arenaSlug === 'pepperoni_pines') unlock('ACH_CLEAR_PINES');
  else if (arenaSlug === 'sundried_slopes') unlock('ACH_CLEAR_SLOPES');
  else if (arenaSlug === 'frostbite_glacier') unlock('ACH_CLEAR_GLACIER');
}

export function challengeCompleted() { unlock('ACH_OVERACHIEVER'); }

// Lifetime / meta achievements derived from Profile state.
export function syncMeta() {
  if (!steamAvailable()) return;
  try {
    const chars = CATALOG.characters || [];
    const unlockedChars = chars.filter(c => Profile.isUnlocked(c.slug)).length;
    if (unlockedChars >= 2) unlock('ACH_NEW_HIRE');
    if (chars.length > 0 && unlockedChars >= chars.length) unlock('ACH_FULL_ROSTER');
    // Signature = any character-unique weapon/armor actually earned (grind unlock).
    const owned = (Profile.get() || {}).unlocked || {};
    const sig = [...(CATALOG.weapons || []), ...(CATALOG.armor || [])]
      .some(it => it.characterUnique && owned[it.slug]);
    if (sig) unlock('ACH_SIGNATURE');
  } catch (e) {}
}

// ── Board naming (arena × difficulty matrix) ────────────────────────────────
const _ARENA_CODE = { pepperoni_pines: 'PINES', sundried_slopes: 'SLOPES', frostbite_glacier: 'GLACIER' };
const _DIFF_CODE  = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD', extreme: 'EXTREME' };
const _ac = (a) => _ARENA_CODE[a] || 'PINES';
const _dc = (d) => _DIFF_CODE[d] || 'NORMAL';
export const endlessBoard = (a, d) => `LB_ENDLESS_${_ac(a)}_${_dc(d)}`;
export const fastWinBoard = (a, d) => `LB_FASTWIN_${_ac(a)}_${_dc(d)}`;
export const levelBoard   = (a, d) => `LB_LEVEL_${_ac(a)}_${_dc(d)}`;

// The weekly board rotates by week — Steam can't reset a board, so each week is
// its own leaderboard named for that week's Sunday (00:00 America/New_York). The
// game always reads/writes the CURRENT week's board, so a fresh board each Sunday
// reads as a "reset". Computed in ET so DST (EST/EDT) is handled automatically.
export function currentWeekKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const p = {}; for (const x of parts) p[x.type] = x.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] || 0;
  // Treat the ET Y/M/D as UTC so we can do plain day arithmetic, then step back to
  // the week's Sunday.
  const sunday = new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - wd * 86400000);
  const y = sunday.getUTCFullYear();
  const m = String(sunday.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(sunday.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}
export const weeklyKillsBoard = () => `LB_WEEKLY_KILLS_${currentWeekKey()}`;

// Catalog for the Leaderboards screen. 'matrix' categories expand over unlocked
// arena × difficulty; 'single' categories are one board. fmt: 'time' → mm:ss.
export const LB_CATEGORIES = [
  { id: 'endless', label: 'ENDLESS',       kind: 'matrix', fmt: 'time', board: endlessBoard },
  { id: 'fastwin', label: 'FASTEST WIN',   kind: 'matrix', fmt: 'time', board: fastWinBoard },
  { id: 'level',   label: 'HIGHEST LEVEL', kind: 'matrix', fmt: 'num',  board: levelBoard },
  { id: 'weekly',  label: 'WEEKLY KILLS',  kind: 'single', fmt: 'num',  board: weeklyKillsBoard,
    note: 'Cumulative kills · resets Sunday 00:00 Eastern' },
];

const _DIFF_WIN_ACH = { normal: 'ACH_WIN_NORMAL', hard: 'ACH_WIN_HARD', extreme: 'ACH_WIN_EXTREME' };
// Speed Demon: the final boss always spawns at 600s (CFG.GAME_TIME) of stage 3, so
// ctx.time on victory is ~600 + how long you took to kill it. Under 660 = melted the
// Warlord within ~60s of it appearing (a real DPS flex). Tune after a real win.
const _SPEED_WIN_TIME = 660;

// Called once from triggerGameOver(). ctx = {victory, mode, difficulty, arena, level, kills, time, noHit}.
// Resolves to { endlessRank } | null — endlessRank drives the end-screen rank line.
export async function runEnded(ctx) {
  if (!steamAvailable() || !ctx) return null;
  const a = ctx.arena, d = ctx.difficulty;
  // Lifetime kills — the long-tail grind badge (endless kills count too).
  _L.kills += (ctx.kills || 0); _saveLedger();
  if (_L.kills >= 100000) unlock('ACH_KILLS_100000');

  // Weekly cumulative kills (all runs) — additive, so ForceUpdate the new total.
  const weeklyTotal = Profile.addWeeklyKills(ctx.kills || 0, currentWeekKey());
  submitScore(weeklyKillsBoard(), weeklyTotal, true);

  // Highest level, per arena × difficulty (all runs).
  submitScore(levelBoard(a, d), ctx.level);

  let endlessRank = null;
  if (ctx.mode === 'endless') {
    // Endless survival, per arena × difficulty — capture the rank for the end screen.
    const res = await submitScore(endlessBoard(a, d), ctx.time);
    endlessRank = res && typeof res.rank === 'number' ? res.rank : null;
  } else if (ctx.victory) {
    unlock('ACH_WARLORD');
    const wa = _DIFF_WIN_ACH[ctx.difficulty];
    if (wa) unlock(wa);
    if (_runBosses.has('mini1') && _runBosses.has('mini2')) unlock('ACH_TRIPLE_THREAT');
    if (ctx.noHit) unlock('ACH_UNTOUCHABLE');                  // won without taking a hit
    if (ctx.time && ctx.time < _SPEED_WIN_TIME) unlock('ACH_SPEED_DEMON');
    submitScore(fastWinBoard(a, d), ctx.time); // fastest Warlord kill, per arena × difficulty
  }

  cloudSave();
  return { endlessRank };
}
