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

import { scene, camera, renderer, clock, composer, isMobile, tryEnterFullscreen, rearmFullscreenOnNextTap } from './renderer.js?v=2f7c517';
import { gameState } from './state.js?v=2f7c517';
import { initGame, update, updateTitleScene } from './game.js?v=2f7c517';
import './world.js?v=2f7c517'; // side-effect only: builds terrain scenery at load time

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
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

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
function animate() {
  requestAnimationFrame(animate);
  if (renderer.getContext().isContextLost && renderer.getContext().isContextLost()) return;
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  // Live title-screen backdrop: orbit the hero while sitting on the start menu.
  if (gameState.state === 'start') updateTitleScene(dt);
  document.body.classList.toggle('playing', gameState.state === 'playing');
  if (composer) composer.render(); else renderer.render(scene, camera);
}
animate();
