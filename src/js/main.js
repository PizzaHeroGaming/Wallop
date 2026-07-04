// main.js — entry point for the WALLOP ES-module build
// Orchestrates: renderer init, context-loss handling, world setup, game init, animate loop.
//
// Load order:
//   renderer.js    → scene, camera, renderer, clock, composer
//   world.js       → scenery placed in scene (imports renderer + terrain)
//   entities.js    → player mesh + entity pools
//   ui.js          → HUD DOM wiring, button listeners
//   game.js        → damageEnemy, update, initGame
//   main.js        → animate, splash, resize

import { scene, camera, renderer, clock, composer, isMobile, tryEnterFullscreen, rearmFullscreenOnNextTap } from './renderer.js?v=5165ee8';
import { gameState, cam } from './state.js?v=5165ee8';
import { initGame, update, updateTitleScene, updateIntroSweep, spawnBoss } from './game.js?v=5165ee8';
import './world.js?v=5165ee8'; // side-effect only: builds terrain scenery at load time
import { Settings } from './settings.js?v=5165ee8';
import { pollGamepad, applyOffer } from './ui.js?v=5165ee8';
import { spawnEnemy, enemies, player, ENEMY_DEFS } from './entities.js?v=5165ee8';
import { WEAPONS, ARMOR, TOMES } from './weapons.js?v=5165ee8';

// ── Marketing capture hook (only on the local capture server) ──
// Lets the headless capture scripts stage a late-game, full-loadout swarm for
// store screenshots — impossible to reach naturally under slow headless WebGL.
// Locked to ?cap=1 AND localhost:8123 (the capture server) so it can NEVER run
// in any shipped build (Pages, Capacitor localhost:80, Electron wallop://) —
// it grants god-mode + full gear, so this must stay un-shippable.
if (new URLSearchParams(location.search).has('cap') && location.port === '8123') {
  window.__cap = {
    setTime(t = 510) {                                   // jump the run clock (≈8:30)
      gameState.gameTime = t;
      // Suppress the two mini-bosses (clutter). Do NOT touch bossSpawned — that
      // flag drives the win-check and would instant-trigger the victory screen.
      gameState.miniboss1Spawned = gameState.miniboss2Spawned = true;
    },
    heal() { player.maxHp = Math.max(player.maxHp, 99999); player.hp = player.maxHp; },
    gear() {
      for (const id of Object.keys(WEAPONS)) if (!player.weapons.find(w => w.id === id)) applyOffer({ kind: 'weapon-new', weaponId: id, rarity: 'common' });
      for (const w of [...player.weapons]) for (let i = 0; i < 2; i++) { try { applyOffer({ kind: 'weapon-up', weaponId: w.id, rarity: 'common' }); } catch (e) {} }
      for (const id of Object.keys(ARMOR)) if (!player.armor_items.find(a => a.id === id)) applyOffer({ kind: 'armor-new', armorId: id, rarity: 'common' });
      for (const id of Object.keys(TOMES)) if (!player.tomes.find(t => t.id === id)) applyOffer({ kind: 'tome-new', tomeId: id, rarity: 'common' });
    },
    swarm(n = 70) {
      const types = Object.keys(ENEMY_DEFS).filter(k => ENEMY_DEFS[k].spawnTime < 9999);
      const start = enemies.length;
      for (let i = 0; i < n; i++) spawnEnemy(types[i % types.length]);
      for (let i = start; i < enemies.length; i++) {            // pull them into a tight ring around the hero
        const e = enemies[i], a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * 7.5;
        e.pos.x = player.pos.x + Math.cos(a) * d;
        e.pos.z = player.pos.z + Math.sin(a) * d;
        e.mesh.position.copy(e.pos);
        e.hp = e.maxHp = 1e7;          // tanky so the swarm persists through the volley (capture only)
        e.contactCd = 999;             // don't chip the (already invincible) hero
      }
      return enemies.length;
    },
    tilt(p) { cam.pitch = p; },        // steeper downward angle for the swarm composition
    boss(tier = 'final') {             // spawn a boss (mini1/mini2/final) near the hero for capture
      spawnBoss(tier);
      const e = [...enemies].reverse().find(x => x.isBoss);
      if (e) { e.pos.x = player.pos.x + 6; e.pos.z = player.pos.z - 5; e.mesh.position.copy(e.pos); e.hp = e.maxHp; }
      return e ? e.def.name : null;
    },
  };
}

// ============================================================
// WEBGL CONTEXT LOSS HANDLING
// ============================================================
(function setupContextLossHandling() {
  const canvas = renderer.domElement;
  let lostOverlay = null;

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('[wallop] WebGL context lost');
    gameState.state = 'paused';
    lostOverlay = document.createElement('div');
    lostOverlay.id = 'context-lost-overlay';
    lostOverlay.innerHTML = `
      <div class="ctx-lost-card">
        <div class="ctx-lost-spinner">&#x27f3;</div>
        <div class="ctx-lost-title">RELOADING GRAPHICS…</div>
        <div class="ctx-lost-msg">The GPU dropped the connection.<br>Tap below to restart the game.</div>
        <button class="ctx-lost-btn" onclick="location.reload()">RELOAD</button>
      </div>
    `;
    document.body.appendChild(lostOverlay);
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    console.warn('[wallop] WebGL context restored');
    setTimeout(() => location.reload(), 1500);
  }, false);
})();

// ============================================================
// RESIZE
// ============================================================
// Uniform menu scale (desktop only): scale the overlay UI to fit the window off
// a 1080p reference (min of width/height ratios), so every window size looks
// like the design proportionally scaled. Mobile keeps its own tuned @media
// layout (scale stays 1). Applied via `zoom: var(--ui-scale)` on .overlay.
function _applyUiScale() {
  let s = 1;
  if (!isMobile()) {
    s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    // Floor at 0.8 so menus stay legible on small screens — notably the Steam
    // Deck's native 1280x800 (a 7" panel), which would otherwise render the UI at
    // 0.667 and make dense menu text too small. Verified no overflow at 1280x800.
    s = Math.max(0.8, Math.min(1.75, s));
  }
  document.documentElement.style.setProperty('--ui-scale', s.toFixed(3));
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  _applyUiScale();
});
_applyUiScale();

// ============================================================
// CLEAN-CAPTURE MODE — hide HUD / controls / menu for marketing shots.
// Toggle with F9, or load with ?nohud=1. CSS lives in wallop.html (.hud-hidden).
// ============================================================
(function setupHudToggle() {
  const p = new URLSearchParams(location.search);
  if (p.has('nohud') && p.get('nohud') !== '0') document.body.classList.add('hud-hidden');
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F9') { e.preventDefault(); document.body.classList.toggle('hud-hidden'); }
  });
})();

// ============================================================
// FULLSCREEN / MOBILE SETUP
// ============================================================
window.addEventListener('load', () => {
  if (!isMobile()) return;
  setTimeout(() => window.scrollTo(0, 1), 100);
  rearmFullscreenOnNextTap();
});

document.addEventListener('fullscreenchange', () => {
  if (!(document.fullscreenElement || document.webkitFullscreenElement) && isMobile()) {
    rearmFullscreenOnNextTap();
  }
});
document.addEventListener('webkitfullscreenchange', () => {
  if (!(document.fullscreenElement || document.webkitFullscreenElement) && isMobile()) {
    rearmFullscreenOnNextTap();
  }
});

// NOTE: Splash screen is handled by the inline <script> in the HTML
// (PizzaHeroSplash.show → onComplete removes 'hidden' from #start-screen)

// ============================================================
// INIT GAME (wires all injection callbacks, DOM listeners)
// ============================================================
try {
  initGame();
} catch (e) {
  console.error('[wallop] initGame() failed:', e);
  // Show a visible error overlay so the issue surfaces in production
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;inset:0;background:#0d1126;color:#ff3864;font-family:monospace;font-size:14px;padding:40px;z-index:9999;white-space:pre-wrap;overflow:auto;';
  errDiv.textContent = 'WALLOP init error — please hard-refresh (Ctrl+Shift+R)\n\n' + (e && e.stack || e);
  document.body.appendChild(errDiv);
}

// ============================================================
// ANIMATE LOOP
// ============================================================
// Frame-rate cap. Modern phones run 90/120Hz panels, and rendering this 3D
// scene at the full refresh rate just cooks the device + drains battery for no
// real gameplay benefit. Cap mobile to 60fps by skipping the extra vsync ticks;
// desktop stays uncapped (lets a future high-refresh PC/Steam build run free).
// dt comes from the clock, so capping doesn't change game speed.
// Mobile is always capped to 60 (heat/battery). Desktop honors the player's
// FPS-cap setting (0 = unlimited) so the Steam build can run free or be limited.
function _frameMs() {
  if (isMobile()) return 1000 / 60;
  const cap = Settings.get('fpsCap') || 0;
  return cap ? 1000 / cap : 0;
}
let _lastFrameT = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const _FRAME_MS = _frameMs();
  if (_FRAME_MS && (now - _lastFrameT) < _FRAME_MS - 0.5) return; // skip extra ticks on high-refresh panels
  _lastFrameT = now;
  if (renderer.getContext().isContextLost && renderer.getContext().isContextLost()) return;
  const dt = Math.min(0.05, clock.getDelta());
  pollGamepad(dt); // controller input → same vectors the mobile sticks feed
  update(dt);
  // Live title-screen backdrop: orbit the hero while sitting on the start menu
  // (and the run-config screen, which keeps state === 'start').
  if (gameState.state === 'start') updateTitleScene(dt);
  // Cinematic camera sweep from menu -> gameplay after PLAY.
  else if (gameState.state === 'intro') updateIntroSweep(dt);
  document.body.classList.toggle('playing', gameState.state === 'playing');
  if (composer) composer.render(); else renderer.render(scene, camera);
}
requestAnimationFrame(animate);
