// review.js — decides WHEN to ask for a Play Store rating.
//
// Talks to window.PlayReview (ReviewBridge.java). Android-only; every export
// no-ops elsewhere, so Steam and web builds carry no dead prompt.
//
// Why the gating lives here and not in Java: Play's API gives back NO signal —
// not whether the card appeared, not whether the player rated. Google throttles
// requests per-user per-period and silently swallows the rest. So the only way to
// avoid burning a scarce ask on a bad moment is to be picky before calling it.
//
// POLICY (Play In-App Review): the card must be offered unconditionally. We must
// NOT pre-prompt ("Enjoying Wallop?") and show it only to people who say yes —
// that's review filtering and it's a policy violation. So there is deliberately
// no custom dialog here; we just pick a good moment and call the API.
import { Profile } from './profile.js?v=4d39b32';

const MIN_RUNS      = 3;                    // don't ask a first-time player
const MAX_ASKS      = 3;                    // lifetime cap on our side
const COOLDOWN_MS   = 45 * 24 * 60 * 60e3;  // ~45 days between asks

function bridge() {
  return (typeof window !== 'undefined' && window.PlayReview) || null;
}

export function available() {
  const b = bridge();
  try { return !!(b && typeof b.isAvailable === 'function' && b.isAvailable()); }
  catch (e) { return false; }
}

// Stored on the profile (persisted + cloud-synced with everything else). Read
// lazily so existing saves — written before this key existed — still work without
// a schema bump, which would reset every player's unlocks.
function state() {
  const p = Profile.get();
  if (!p.review) p.review = { asks: 0, lastAsk: 0 };
  return p.review;
}

let _inFlight = false;
if (typeof window !== 'undefined') {
  // Java calls this when the flow finishes, however it finished. Stamping here
  // rather than at request time means a failed request doesn't cost an ask.
  window.__onReviewDone = function () {
    _inFlight = false;
    try {
      const s = state();
      s.asks += 1;
      s.lastAsk = Date.now();
      Profile.save();
    } catch (e) { /* nothing worth breaking a run over */ }
  };
}

/**
 * Ask for a rating if this is a good moment. Safe to call from anywhere — it
 * self-gates and never throws.
 *
 * @param {boolean} positive  Only true at genuinely good beats (a win, a new
 *                            personal best). Never after a death.
 */
export function maybeAsk(positive) {
  if (!positive || _inFlight || !available()) return;
  let s;
  try { s = state(); } catch (e) { return; }
  if (s.asks >= MAX_ASKS) return;
  if (s.lastAsk && Date.now() - s.lastAsk < COOLDOWN_MS) return;
  const stats = Profile.get().stats;
  if (((stats && stats.runsPlayed) || 0) < MIN_RUNS) return;
  _inFlight = true;
  try { bridge().requestReview(); }
  catch (e) { _inFlight = false; }
}
