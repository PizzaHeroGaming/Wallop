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

import { scene, camera, renderer, clock, composer, isMobile, tryEnterFullscreen, rearmFullscreenOnNextTap } from './renderer.js?v=69679c2';
import { gameState } from './state.js?v=69679c2';
import { initGame, update, updateTitleScene, updateIntroSweep } from './game.js?v=69679c2';
import './world.js?v=69679c2'; // side-effect only: builds terrain scenery at load time
import { Settings } from './settings.js?v=69679c2';
import { pollGamepad } from './ui.js?v=69679c2';

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
    s = Math.max(0.45, Math.min(1.75, s));
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
