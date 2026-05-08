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

import { scene, camera, renderer, clock, composer, isMobile, tryEnterFullscreen, rearmFullscreenOnNextTap } from './renderer.js';
import { gameState } from './state.js';
import { initGame, update } from './game.js';

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

// ============================================================
// SPLASH + START SCREEN
// ============================================================
window.addEventListener('load', () => {
  // PizzaHeroSplash is a global defined in the inline <script> that runs before
  // this module. When the splash dismisses, show the start screen.
  if (typeof PizzaHeroSplash !== 'undefined') {
    PizzaHeroSplash.show({
      duration:    0,
      skipOnInput: true,
      tagline:     'GAMING',
      onComplete:  () => {
        document.getElementById('start-screen').classList.remove('hidden');
      },
    });
  } else {
    // Fallback if splash script not present
    document.getElementById('start-screen').classList.remove('hidden');
  }
});

// ============================================================
// INIT GAME (wires all injection callbacks, DOM listeners)
// ============================================================
initGame();

// ============================================================
// ANIMATE LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  if (renderer.getContext().isContextLost && renderer.getContext().isContextLost()) return;
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  document.body.classList.toggle('playing', gameState.state === 'playing');
  if (composer) composer.render(); else renderer.render(scene, camera);
}
animate();
