import { CFG, IS_MOBILE_EARLY } from './config.js?v=01a2de7';
import { ARENAS } from './profile.js?v=01a2de7';

// ============================================================
// THREE.JS SETUP
// ============================================================
export const scene = new THREE.Scene();

// Sky gradient via canvas texture — accepts the arena's sky palette so
// each arena gets its own atmosphere.  Re-callable at runtime.
function makeSkyTexture(skyCfg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, skyCfg.top);
  grad.addColorStop(0.35, skyCfg.mid);
  grad.addColorStop(0.70, skyCfg.low);
  grad.addColorStop(1.00, skyCfg.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);
  // Cirrus cloud wisps in the upper sky
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const y = 18 + i * 22 + (i % 3) * 6;
    const x = 10 + (i * 53) % 200;
    const w = 60 + (i * 37) % 120;
    const h = 6 + (i % 3) * 4;
    const alpha = 0.10 + (i % 4) * 0.04;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = skyCfg.wisp || '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}
// Apply the default arena's sky/fog at module init; setRendererArena()
// swaps everything else in once gameState is ready.
const _defaultArena = ARENAS.pepperoni_pines;
scene.background = makeSkyTexture(_defaultArena.sky);
scene.fog = new THREE.FogExp2(_defaultArena.fog.color, _defaultArena.fog.density);

export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 12, 15);

export const renderer = new THREE.WebGLRenderer({
  antialias: !IS_MOBILE_EARLY,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(IS_MOBILE_EARLY
  ? Math.min(window.devicePixelRatio, 1.5)
  : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = !IS_MOBILE_EARLY;
renderer.shadowMap.type = IS_MOBILE_EARLY ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Post-processing bloom + color grade pipeline (desktop only)
const ColorGradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(lum), c.rgb, 1.15);
      vec2 uv = vUv - 0.5;
      c.rgb *= 1.0 - dot(uv,uv) * 0.7;
      gl_FragColor = c;
    }
  `,
};
export let composer = null;
if (!IS_MOBILE_EARLY) {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55, 0.4, 0.82
  ));
  composer.addPass(new THREE.ShaderPass(ColorGradeShader));
}

// Pooled point lights for projectile illumination (desktop only, 4 lights)
const _ptLightPool = [];
if (!IS_MOBILE_EARLY) {
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 8);
    pl.castShadow = false;
    scene.add(pl);
    _ptLightPool.push({ light: pl, free: true });
  }
}
export function acquirePtLight(color, intensity, distance) {
  const slot = _ptLightPool.find(s => s.free);
  if (!slot) return null;
  slot.free = false;
  slot.light.color.setHex(color);
  slot.light.intensity = intensity;
  slot.light.distance = distance;
  return slot;
}
export function releasePtLight(slot) {
  if (!slot) return;
  slot.light.intensity = 0;
  slot.free = true;
}

// =====================================================================
// WebGL context loss handling.
// =====================================================================
(function setupContextLossHandling() {
  const canvas = renderer.domElement;
  let lostOverlay = null;

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('[wallop] WebGL context lost');

    // gameState is in state.js — access via import at runtime is fine since
    // this handler fires long after module init.
    // We import gameState lazily to avoid circular deps.
    import('./state.js').then(({ gameState }) => {
      gameState.state = 'paused';
    }).catch(() => {});

    lostOverlay = document.createElement('div');
    lostOverlay.id = 'context-lost-overlay';
    lostOverlay.innerHTML = `
      <div class="ctx-lost-card">
        <div class="ctx-lost-spinner">⟳</div>
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

// Lights
scene.add(new THREE.AmbientLight(0xffffff, IS_MOBILE_EARLY ? 0.75 : 0.55));
export const sun = new THREE.DirectionalLight(0xfff4d4, 1.0);
sun.position.set(40, 60, 25);
sun.castShadow = !IS_MOBILE_EARLY;
sun.shadow.mapSize.set(IS_MOBILE_EARLY ? 512 : 2048, IS_MOBILE_EARLY ? 512 : 2048);
sun.shadow.radius = IS_MOBILE_EARLY ? 1 : 2;
sun.shadow.camera.left = -44;
sun.shadow.camera.right = 44;
sun.shadow.camera.top = 44;
sun.shadow.camera.bottom = -44;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 180;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

// Rim/fill light
export const rim = new THREE.DirectionalLight(0xffd6a8, 0.45);
rim.position.set(-30, 25, -40);
scene.add(rim);

// Hemi light
const hemi = new THREE.HemisphereLight(0xc7e3ff, 0x4a7c2a, 0.55);
scene.add(hemi);

// ============================================================
// ARENA THEMING — swap sky, fog, and light colors at runtime.
// Called from game.js resetGame() so each new run picks up the
// player's chosen arena visuals.  Cheap (no geometry rebuild).
// ============================================================
export function setRendererArena(arenaSlug) {
  const a = ARENAS[arenaSlug] || ARENAS.pepperoni_pines;
  // Replace sky background texture (dispose old to avoid GPU leak)
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = makeSkyTexture(a.sky);
  // Update fog
  scene.fog = new THREE.FogExp2(a.fog.color, a.fog.density);
  // Mutate existing light colors/intensities (no scene-graph churn)
  sun.color.setHex(a.lights.sun);
  sun.intensity = a.lights.sunIntensity;
  rim.color.setHex(a.lights.rim);
  hemi.color.setHex(a.lights.hemiSky);
  hemi.groundColor.setHex(a.lights.hemiGround);
}

// Clock
export const clock = new THREE.Clock();

// Mobile detection helper (runtime)
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 900);
}

// =====================================================================
// Fullscreen + orientation handling
// =====================================================================
function isInFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

export function tryEnterFullscreen() {
  if (!isMobile()) return;
  const el = document.documentElement;
  const fsRequest = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;

  if (fsRequest && !isInFullscreen()) {
    try {
      const p = fsRequest.call(el);
      if (p && p.then) {
        p.then(() => tryLockLandscape()).catch(() => {});
      } else {
        setTimeout(tryLockLandscape, 100);
      }
    } catch (e) {}
  } else {
    setTimeout(() => window.scrollTo(0, 1), 50);
    tryLockLandscape();
  }
}

function tryLockLandscape() {
  if (screen.orientation && typeof screen.orientation.lock === 'function') {
    try {
      const p = screen.orientation.lock('landscape');
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
}

// Backwards-compatible alias
export const enterFullscreenAndLockOrientation = tryEnterFullscreen;

export function rearmFullscreenOnNextTap() {
  if (!isMobile()) return;
  const handler = () => {
    // Import gameState lazily to avoid circular deps at module init
    import('./state.js').then(({ gameState }) => {
      if (gameState && (gameState.state === 'playing' || gameState.state === 'levelup' || gameState.state === 'paused')) {
        tryEnterFullscreen();
      }
    }).catch(() => {});
  };
  document.addEventListener('touchstart', handler, { once: true, passive: true });
  document.addEventListener('mousedown',  handler, { once: true, passive: true });
}

document.addEventListener('fullscreenchange', () => {
  if (!isInFullscreen() && isMobile()) rearmFullscreenOnNextTap();
});
document.addEventListener('webkitfullscreenchange', () => {
  if (!isInFullscreen() && isMobile()) rearmFullscreenOnNextTap();
});

document.addEventListener('visibilitychange', () => {
  import('./state.js').then(({ gameState }) => {
    if (!document.hidden && isMobile() && gameState && gameState.state === 'playing') {
      rearmFullscreenOnNextTap();
    }
  }).catch(() => {});
});

window.addEventListener('load', () => {
  if (!isMobile()) return;
  setTimeout(() => window.scrollTo(0, 1), 100);
  rearmFullscreenOnNextTap();
});

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});
