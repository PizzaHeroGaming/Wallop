// src/js/steam.js — game-side Steam features bridge.
//
// Thin, defensive wrapper over window.WallopSteam (exposed by the Electron
// preload on the desktop/Steam build). EVERY export no-ops unless we're on the
// Steam build AND the bridge is present, so this file is completely inert on the
// web and mobile builds — no gameplay changes, just taps.
//
// Responsibilities:
//   • unlock achievements (deduped so we never spam IPC)
//   • submit leaderboard scores (bridge currently stubs these — see steam.js main)
//   • push the save to Steam Cloud at run-end
//   • keep a tiny lifetime ledger (kills / chests / slices earned) for the
//     counter-based achievements the Profile schema doesn't already track.
//
// Achievement + leaderboard API names must match the Steamworks dashboard
// exactly — see docs/STEAMWORKS_FEATURES_SPEC.md.

import { isSteamBuild } from './renderer.js?v=7df0341';
import { Profile, CATALOG } from './profile.js?v=7df0341';

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
export function submitScore(board, value) {
  if (!steamAvailable() || !isFinite(value)) return;
  try { _bridge().submitScore(board, Math.round(value)); } catch (e) {}
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
export function firstKill() { unlock('ACH_FIRST_DELIVERY'); }

export function bossKilled(tier) {
  if (!steamAvailable()) return;
  if (tier === 'mini1') { unlock('ACH_SAUCE_SLINGER'); _runBosses.add('mini1'); }
  else if (tier === 'mini2') { unlock('ACH_HAMMER_CHEF'); _runBosses.add('mini2'); }
  // 'final' is credited on victory (see runEnded) — the final boss also appears
  // at the end of earlier stages, so we must not fire the win achievement here.
}

export function checkGold(gold) { if (gold >= 1000) unlock('ACH_GOLD_1000'); }

export function checkLevel(level) {
  if (level >= 10) unlock('ACH_LEVEL_10');
  if (level >= 25) unlock('ACH_LEVEL_25');
  if (level >= 50) unlock('ACH_LEVEL_50');
}

export function checkLoadout(weapons, armor, tomes) {
  if (weapons >= 3 && armor >= 3 && tomes >= 3) unlock('ACH_FULL_LOADOUT');
}
export function weaponMaxed() { unlock('ACH_MAX_WEAPON'); }

export function chestOpened() {
  if (!steamAvailable()) return;
  _L.chests++; _saveLedger();
  if (_L.chests >= 50) unlock('ACH_CHESTS_50');
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

const _ARENA_BOARD = {
  pepperoni_pines: 'LB_SURVIVAL_PINES',
  sundried_slopes: 'LB_SURVIVAL_SLOPES',
  frostbite_glacier: 'LB_SURVIVAL_GLACIER',
};
const _DIFF_WIN_ACH = { normal: 'ACH_WIN_NORMAL', hard: 'ACH_WIN_HARD', extreme: 'ACH_WIN_EXTREME' };

// Called once from triggerGameOver(). ctx = {victory, difficulty, arena, level, kills, time}.
export function runEnded(ctx) {
  if (!steamAvailable() || !ctx) return;
  // Lifetime kills.
  _L.kills += (ctx.kills || 0); _saveLedger();
  if (_L.kills >= 1000)  unlock('ACH_KILLS_1000');
  if (_L.kills >= 10000) unlock('ACH_KILLS_10000');

  if (ctx.victory) {
    unlock('ACH_WARLORD');
    const wa = _DIFF_WIN_ACH[ctx.difficulty];
    if (wa) unlock(wa);
    if (_runBosses.has('mini1') && _runBosses.has('mini2')) unlock('ACH_TRIPLE_THREAT');
    submitScore('LB_FAST_WIN', ctx.time);
  }

  // Leaderboards (bridge stubs these until steamworks.js gains leaderboard support).
  const board = _ARENA_BOARD[ctx.arena];
  if (board) submitScore(board, ctx.time);
  submitScore('LB_HIGH_LEVEL', ctx.level);
  submitScore('LB_MOST_KILLS', ctx.kills);

  cloudSave();
}
