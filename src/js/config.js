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

// Stage scaling: enemy stats, boss stats, slice reward multipliers per stage
export const STAGE_MULTS = {
  1: { enemy: 1.0,  bossHp: 1.0, bossDmg: 1.0, sliceBonus: 1.0 },
  2: { enemy: 1.35, bossHp: 1.5, bossDmg: 1.3, sliceBonus: 1.5 },
  3: { enemy: 1.75, bossHp: 2.2, bossDmg: 1.7, sliceBonus: 2.5 },
};

// Difficulty: scales enemies and adjusts slice rewards
export const DIFFICULTIES = {
  easy:    { enemy: 0.7,  sliceBonus: 0.6,  label: 'EASY' },
  normal:  { enemy: 1.0,  sliceBonus: 1.0,  label: 'NORMAL' },
  hard:    { enemy: 1.45, sliceBonus: 1.6,  label: 'HARD' },
  extreme: { enemy: 2.0,  sliceBonus: 2.5,  label: 'EXTREME' },
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
