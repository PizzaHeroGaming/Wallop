// ============================================================
// CONFIG
// ============================================================
export const CFG = {
  ARENA: 110,
  GAME_TIME: 600, // 10 min
  PLAYER_SPEED: 9,
  JUMP_VEL: 12,
  GRAVITY: 32,
  PICKUP_RANGE: 2.6,
  CAM_DIST: 14,   // pulled back to see over rolling terrain
  CAM_HEIGHT: 9,  // slightly higher for same reason
};

export const RARITY = {
  common:    { weight: 100, color: '#c7cad8', mult: 1.0 },
  uncommon:  { weight: 55,  color: '#42f5a1', mult: 1.4 },
  rare:      { weight: 25,  color: '#4287f5', mult: 1.9 },
  epic:      { weight: 8,   color: '#d142f5', mult: 2.6 },
  legendary: { weight: 2,   color: '#ffb03b', mult: 3.5 },
};

// Early mobile detection — used to gate performance settings before the rest of
// the codebase loads. The full isMobile() helper is defined later for game logic;
// this early check is just for choosing renderer defaults.
export const IS_MOBILE_EARLY = (() => {
  if (typeof navigator === 'undefined') return false;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true;
  return ('ontouchstart' in window) && Math.min(window.innerWidth, window.innerHeight) < 900;
})();
