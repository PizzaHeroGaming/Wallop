// state.js — shared mutable game state to break circular dependencies.
// Both ui.js and game.js (and renderer.js context-loss handler) import from here
// instead of from each other.

export const gameState = {
  state: 'start', // start, playing, levelup, paused, gameover, victory
  gameTime: 0,
  spawnTimer: 0,
  spawnInterval: 1.4,
  kills: 0,
  damageDealt: 0,
  slicesEarned: 0,
  bossSpawned: false,
  miniboss1Spawned: false,
  miniboss2Spawned: false,
  finalSwarm: false,
  _lastWave: 0,
  chestTimer: 90,
};

// Camera orientation — shared between input handling (game.js) and
// weapon tick functions (weapons.js) that need to know which way the player faces.
export const cam = {
  yaw: 0,
  pitch: 0,
  shake: 0,
};
