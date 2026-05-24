import { CFG, IS_MOBILE_EARLY } from './config.js?v=3721c50';
import { scene } from './renderer.js?v=3721c50';
import { groundHeight, addSolid, obstacles, solidProps } from './terrain.js?v=3721c50';
import { ARENAS } from './profile.js?v=3721c50';
import { killMesh } from './utils.js?v=3721c50';

// ── Arena theming ──
// Currently-applied arena slug. Used by add* functions to color procedural
// elements (logs, mushrooms, grass, ferns, flowers) and to bias tree-type
// selection. setWorldArena() also walks already-placed scenery and retints
// their materials so a mid-session arena swap looks correct.
let _currentArena = ARENAS.pepperoni_pines;
// Tag scene objects we've added so retinting can find them later.
const _tintedRoots = []; // array of root meshes/groups that should receive sceneryTint
const _proceduralByKind = { grass: [], fern: [], log: [], logCap: [], mushroomStem: [], mushroomCap: [], flower: [], flowerCenter: [] };

function _weightedTreeKind(weights) {
  const r = Math.random();
  if (r < weights.leafy) return 'leafy';
  if (r < weights.leafy + weights.pine) return 'pine';
  return 'bare';
}
function _applyTintToMesh(mesh, tintHex) {
  if (!mesh) return;
  const tint = new THREE.Color(tintHex);
  mesh.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const apply = (mat) => {
      // First time tinting: clone (don't mutate shared GLB material) and, if it's
      // a textured MeshStandardMaterial from the KayKit GLB (where color×map isn't
      // multiplying in this Three.js build), swap the material to MeshPhongMaterial
      // which RELIABLY multiplies color × map. Lambert/Phong are simpler shaders
      // where `gl_FragColor.rgb = color.rgb * texture.rgb` is straightforward.
      if (!mat.userData._wallop_tintable) {
        const baseColor = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
        const isTextureBased = !!mat.map && baseColor.r > 0.9 && baseColor.g > 0.9 && baseColor.b > 0.9;
        let clone;
        if (isTextureBased && mat.type === 'MeshStandardMaterial') {
          clone = new THREE.MeshPhongMaterial({
            map: mat.map,
            color: 0xffffff,
            flatShading: false,
            shininess: 6,
            transparent: mat.transparent,
            opacity: mat.opacity,
            side: mat.side,
            alphaTest: mat.alphaTest,
          });
        } else {
          clone = mat.clone();
        }
        clone.userData._wallop_tintable = true;
        clone.userData._wallop_baseColor = baseColor;
        clone.userData._wallop_textureBased = isTextureBased;
        return clone;
      }
      return mat;
    };
    const recolor = (m) => {
      if (!m.userData._wallop_baseColor) return;
      if (m.userData._wallop_textureBased) {
        // Texture × tint: set color = tint directly so texture is multiplied by it.
        m.color.copy(tint);
      } else {
        // Procedural-color material: lerp baseColor toward tint.
        m.color.copy(m.userData._wallop_baseColor).lerp(tint, 0.7);
      }
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(apply);
      child.material.forEach(recolor);
    } else {
      child.material = apply(child.material);
      recolor(child.material);
    }
  });
}
function _restoreMeshTint(mesh) {
  if (!mesh) return;
  mesh.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const restore = (m) => {
      if (!m.userData._wallop_baseColor || !m.color) return;
      if (m.userData._wallop_textureBased) {
        // Texture-based: restore color to white so the texture renders untinted
        m.color.setHex(0xffffff);
      } else {
        m.color.copy(m.userData._wallop_baseColor);
      }
    };
    if (Array.isArray(child.material)) child.material.forEach(restore);
    else restore(child.material);
  });
}

// ── Arena obstacles (boulders / ice spires) ────────────────────────────────
// Per-arena, NOT placed at world build time.  Created/destroyed in setWorldArena.
const _arenaObstacleMeshes = [];
const _arenaObstacleSolids = [];

function _clearArenaObstacles() {
  for (const m of _arenaObstacleMeshes) killMesh(m);
  _arenaObstacleMeshes.length = 0;
  for (const s of _arenaObstacleSolids) {
    const i = solidProps.indexOf(s);
    if (i >= 0) solidProps.splice(i, 1);
  }
  _arenaObstacleSolids.length = 0;
}

function _addBoulder(x, z, scale, color) {
  // Chunky low-poly boulder — flattened sphere
  const geo = new THREE.SphereGeometry(scale, 8, 6);
  const mat = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 2 });
  const m = new THREE.Mesh(geo, mat);
  // Slightly squish + slight rotation for variety
  m.scale.set(1.0, 0.7 + Math.random() * 0.3, 1.0);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.position.set(x, scale * 0.25, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  _arenaObstacleMeshes.push(m);
  _arenaObstacleSolids.push(addSolid(x, z, scale * 0.9));
}

function _addIceSpire(x, z, scale, color, emissive) {
  // Tall narrow ice spire — group of stacked tapered cylinders for crystal look
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({
    color, emissive: emissive || 0x000000, emissiveIntensity: 0.15,
    flatShading: true, shininess: 60, transparent: true, opacity: 0.92,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.9, scale * 1.1, scale * 1.0, 6), mat);
  base.position.y = scale * 0.5;
  g.add(base);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.55, scale * 0.9, scale * 1.4, 6), mat);
  mid.position.y = scale * 1.7;
  g.add(mid);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, scale * 0.55, scale * 1.6, 6), mat);
  tip.position.y = scale * 3.2;
  g.add(tip);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.position.set(x, 0, z);
  g.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  scene.add(g);
  _arenaObstacleMeshes.push(g);
  _arenaObstacleSolids.push(addSolid(x, z, scale * 0.95));
}

// Place inner-arena obstacles for the given arena.  Skips if arena.terrain.obstacles is 0.
function _placeArenaObstacles(a) {
  const t = a.terrain;
  if (!t || !t.obstacles) return;
  const count = t.obstacles;
  const [scaleMin, scaleMax] = t.scaleRange || [1.5, 2.5];
  const minR = t.minR || 10;
  const maxR = t.maxR || 45;
  const placed = []; // for spacing check
  let attempts = 0;
  while (placed.length < count && attempts < count * 12) {
    attempts++;
    const a2 = Math.random() * Math.PI * 2;
    const r  = minR + Math.random() * (maxR - minR);
    const x  = Math.cos(a2) * r;
    const z  = Math.sin(a2) * r;
    const sc = scaleMin + Math.random() * (scaleMax - scaleMin);
    // Spacing: don't place too close to existing arena obstacles
    let ok = true;
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < (sc + p.s) * 1.5) { ok = false; break; }
    }
    if (!ok) continue;
    placed.push({ x, z, s: sc });
    if (t.kind === 'spire') _addIceSpire(x, z, sc, t.color, t.emissive);
    else                    _addBoulder(x, z, sc, t.color);
  }
}

// Public: swap arena visuals.  Retints all already-placed scenery,
// recolors procedural decoration, swaps in arena-specific obstacles,
// and updates internal state so any scenery placed AFTER this call
// also picks up the new theme.
export function setWorldArena(arenaSlug) {
  const a = ARENAS[arenaSlug] || ARENAS.pepperoni_pines;
  _currentArena = a;
  // Retint imported GLB scenery
  for (const root of _tintedRoots) {
    if (a.sceneryTint == null) _restoreMeshTint(root);
    else                       _applyTintToMesh(root, a.sceneryTint);
  }
  // Recolor procedural decoration
  const setMatColor = (mat, hex) => { if (mat && mat.color) mat.color.setHex(hex); };
  for (const m of _proceduralByKind.grass)        setMatColor(m.material, a.grass);
  for (const m of _proceduralByKind.fern)         setMatColor(m.material, a.fern);
  for (const m of _proceduralByKind.log)          setMatColor(m.material, a.log);
  for (const m of _proceduralByKind.logCap)       setMatColor(m.material, a.logCap);
  for (const m of _proceduralByKind.mushroomStem) setMatColor(m.material, 0xf5e8c8);
  for (const m of _proceduralByKind.mushroomCap)  setMatColor(m.material, a.mushroomCaps[Math.floor(Math.random() * a.mushroomCaps.length)]);
  for (const m of _proceduralByKind.flower) {
    setMatColor(m.material, parseInt(a.ground.flowers[Math.floor(Math.random() * a.ground.flowers.length)].replace('#',''), 16));
  }
  // Swap in arena-specific obstacles
  _clearArenaObstacles();
  _placeArenaObstacles(a);
}

// ============================================================
// WORLD / SCENERY
// ============================================================

// ── Scenery / world-prop asset cache ────────────────────────────────────────
const _SCENERY_BASE = 'assets/scenery/';
export const _sceneryAssets = {};
const _gltfLoader = new THREE.GLTFLoader();

function _loadGLBLocal(url) {
  return new Promise((res, rej) => _gltfLoader.load(url, res, null, rej));
}

export function _loadSceneryGLTF(slug) {
  if (_sceneryAssets[slug]) return Promise.resolve(_sceneryAssets[slug]);
  return _loadGLBLocal(_SCENERY_BASE + slug + '.gltf').then(gltf => {
    _sceneryAssets[slug] = gltf;
    return gltf;
  });
}
export function _cloneScenery(slug) {
  const a = _sceneryAssets[slug];
  if (!a) return null;
  return THREE.SkeletonUtils.clone(a.scene);
}

// Curated model sets
const _TREE_LEAFY = ['Tree_1_A_Color1','Tree_1_B_Color1','Tree_2_A_Color1','Tree_3_A_Color1','Tree_4_A_Color1'];
const _TREE_TALL  = ['Tree_1_C_Color1','Tree_2_C_Color1','Tree_2_D_Color1'];
const _TREE_BARE  = ['Tree_Bare_1_A_Color1','Tree_Bare_1_B_Color1','Tree_Bare_2_A_Color1'];
const _ROCK_SMALL = ['Rock_1_A_Color1'];
const _ROCK_MED   = ['Rock_1_G_Color1','Rock_3_J_Color1'];
const _ROCK_LARGE = ['Rock_2_E_Color1'];
const _BUSH_SET   = ['Bush_1_A_Color1','Bush_2_A_Color1','Bush_3_A_Color1','Bush_4_A_Color1'];
const _ALL_SCENERY_SLUGS = [
  ..._TREE_LEAFY, ..._TREE_TALL, ..._TREE_BARE,
  ..._ROCK_SMALL, ..._ROCK_MED, ..._ROCK_LARGE,
  ..._BUSH_SET,
];

// Tree placement is biased by the current arena's treeWeights so each
// arena's biome reads correctly (e.g. winter = mostly pines, autumn = mostly bare).
export function addTree(x, z) {
  const kind = _weightedTreeKind(_currentArena.treeWeights);
  if (kind === 'pine') return addPineTree(x, z);
  if (kind === 'bare') return addDeadTree(x, z);
  const slug = _TREE_LEAFY[Math.floor(Math.random() * _TREE_LEAFY.length)];
  const m = _cloneScenery(slug);
  if (!m) return;
  const sc = 0.90 + Math.random() * 0.25;
  m.scale.setScalar(sc);
  m.position.set(x, groundHeight(x, z), z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = false; } });
  scene.add(m);
  if (_currentArena.sceneryTint != null) _applyTintToMesh(m, _currentArena.sceneryTint);
  _tintedRoots.push(m);
  addSolid(x, z, 0.45);
}

export function addPineTree(x, z) {
  const slug = _TREE_TALL[Math.floor(Math.random() * _TREE_TALL.length)];
  const m = _cloneScenery(slug);
  if (!m) return;
  const sc = 0.55 + Math.random() * 0.15;
  m.scale.setScalar(sc);
  m.position.set(x, groundHeight(x, z), z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = false; } });
  scene.add(m);
  if (_currentArena.sceneryTint != null) _applyTintToMesh(m, _currentArena.sceneryTint);
  _tintedRoots.push(m);
  addSolid(x, z, 0.40);
}

export function addDeadTree(x, z) {
  const slug = _TREE_BARE[Math.floor(Math.random() * _TREE_BARE.length)];
  const m = _cloneScenery(slug);
  if (!m) return;
  const sc = 0.90 + Math.random() * 0.30;
  m.scale.setScalar(sc);
  m.position.set(x, groundHeight(x, z), z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = false; } });
  scene.add(m);
  if (_currentArena.sceneryTint != null) _applyTintToMesh(m, _currentArena.sceneryTint);
  _tintedRoots.push(m);
  addSolid(x, z, 0.38);
}

export function addRock(x, z, scale = 1) {
  let slug, meshScale;
  if (scale < 0.50) {
    slug = 'Rock_1_A_Color1';
    meshScale = scale * 2.0;
  } else if (scale < 1.10) {
    slug = _ROCK_MED[Math.floor(Math.random() * _ROCK_MED.length)];
    meshScale = scale * 0.50;
  } else {
    slug = Math.random() < 0.6 ? 'Rock_2_E_Color1' : 'Rock_1_G_Color1';
    meshScale = scale * 0.32;
  }
  const m = _cloneScenery(slug);
  if (!m) return;
  m.scale.setScalar(meshScale);
  m.position.set(x, groundHeight(x, z), z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  scene.add(m);
  if (_currentArena.sceneryTint != null) _applyTintToMesh(m, _currentArena.sceneryTint);
  _tintedRoots.push(m);
  if (scale > 0.5) addSolid(x, z, scale * 0.85);
}

export function addBush(x, z) {
  const slug = _BUSH_SET[Math.floor(Math.random() * _BUSH_SET.length)];
  const m = _cloneScenery(slug);
  if (!m) return;
  const sc = 3.0 + Math.random() * 1.5;
  m.scale.setScalar(sc);
  m.position.set(x, groundHeight(x, z), z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
  scene.add(m);
  if (_currentArena.sceneryTint != null) _applyTintToMesh(m, _currentArena.sceneryTint);
  _tintedRoots.push(m);
}

export function addLog(x, z) {
  const len = 1.4 + Math.random() * 0.8;
  const r = 0.22 + Math.random() * 0.08;
  const gh = groundHeight(x, z);
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 10),
    new THREE.MeshPhongMaterial({ color: _currentArena.log, flatShading: true, shininess: 0 })
  );
  log.position.set(x, gh + r, z);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = Math.random() * Math.PI * 2;
  log.castShadow = true;
  log.receiveShadow = true;
  scene.add(log);
  _proceduralByKind.log.push(log);
  const capMat = new THREE.MeshPhongMaterial({ color: _currentArena.logCap, flatShading: true, shininess: 0 });
  for (const dx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 12), capMat);
    cap.position.copy(log.position);
    const dir = new THREE.Vector3(Math.cos(log.rotation.y), 0, Math.sin(log.rotation.y));
    cap.position.x += dir.x * dx * len / 2;
    cap.position.z += dir.z * dx * len / 2;
    cap.rotation.y = Math.atan2(dir.x, dir.z) + (dx === 1 ? 0 : Math.PI);
    scene.add(cap);
    _proceduralByKind.logCap.push(cap);
  }
  const dir = new THREE.Vector3(Math.cos(log.rotation.y), 0, Math.sin(log.rotation.y));
  for (const t of [-1, 0, 1]) {
    addSolid(x + dir.x * (t * len / 2.5), z + dir.z * (t * len / 2.5), r + 0.10);
  }
}

export function addMushrooms(x, z) {
  const count = 2 + Math.floor(Math.random() * 4);
  const gh = groundHeight(x, z);
  const stemMat = new THREE.MeshPhongMaterial({ color: 0xf5e8c8, flatShading: true, shininess: 0 });
  const capColors = _currentArena.mushroomCaps;
  const capMat = new THREE.MeshPhongMaterial({ color: capColors[Math.floor(Math.random() * capColors.length)], flatShading: true, shininess: 0 });
  for (let i = 0; i < count; i++) {
    const ox = (Math.random() - 0.5) * 0.6;
    const oz = (Math.random() - 0.5) * 0.6;
    const h = 0.10 + Math.random() * 0.10;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 6), stemMat);
    stem.position.set(x + ox, gh + h / 2, z + oz);
    scene.add(stem);
    _proceduralByKind.mushroomStem.push(stem);
    const capR = 0.10 + Math.random() * 0.08;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(capR, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.set(x + ox, gh + h, z + oz);
    scene.add(cap);
    _proceduralByKind.mushroomCap.push(cap);
  }
}

export function addGrassTuft(x, z) {
  const gh = groundHeight(x, z);
  const grassMat = new THREE.MeshPhongMaterial({ color: _currentArena.grass, flatShading: true, shininess: 0, side: THREE.DoubleSide });
  const blades = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < blades; i++) {
    const h = 0.25 + Math.random() * 0.20;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.12, h), grassMat);
    blade.position.set(
      x + (Math.random() - 0.5) * 0.4,
      gh + h / 2,
      z + (Math.random() - 0.5) * 0.4
    );
    blade.rotation.y = Math.random() * Math.PI;
    blade.rotation.z = (Math.random() - 0.5) * 0.2;
    scene.add(blade);
    _proceduralByKind.grass.push(blade);
  }
}

export function addFlower(x, z) {
  const flowers = _currentArena.ground.flowers;
  const color = parseInt(flowers[Math.floor(Math.random() * flowers.length)].replace('#',''), 16);
  const gh = groundHeight(x, z);
  const stemMat = new THREE.MeshPhongMaterial({ color: 0x3a8a3a, flatShading: true, shininess: 0 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.30, 4), stemMat);
  stem.position.set(x, gh + 0.15, z);
  scene.add(stem);
  const petalMat = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), petalMat);
    petal.position.set(x, gh + 0.32, z);
    petal.rotation.y = i * Math.PI / 2;
    scene.add(petal);
    _proceduralByKind.flower.push(petal);
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 6, 5),
    new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 0 })
  );
  center.position.set(x, gh + 0.32, z);
  scene.add(center);
}

export function addFern(x, z) {
  const gh = groundHeight(x, z);
  const fronds = 4 + Math.floor(Math.random() * 4);
  const mat = new THREE.MeshPhongMaterial({ color: _currentArena.fern, flatShading: true, shininess: 0, side: THREE.DoubleSide });
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const h = 0.45 + Math.random() * 0.25;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.18, h), mat);
    frond.position.set(
      x + Math.cos(a) * 0.10,
      gh + h * 0.45,
      z + Math.sin(a) * 0.10
    );
    frond.rotation.set(-0.5, a, 0);
    scene.add(frond);
    _proceduralByKind.fern.push(frond);
  }
}

export function addCloud(x, y, z, scale = 1) {
  const group = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 4; i++) {
    const s = (0.8 + Math.random() * 0.6) * scale;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), m);
    sphere.position.set((Math.random() - 0.5) * 4 * scale, Math.random() * 0.6 * scale, (Math.random() - 0.5) * 2 * scale);
    group.add(sphere);
  }
  group.position.set(x, y, z);
  scene.add(group);
}

export function addDistantHill(x, z, radius, height, color) {
  const geo = new THREE.SphereGeometry(radius, 10, 8);
  // Unlit material so the sun doesn't push facing faces over the bloom threshold
  // and make distant hills glow.  Fog still affects MeshBasicMaterial normally.
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const m = new THREE.Mesh(geo, mat);
  m.scale.y = (height / radius) * 0.85;
  m.position.set(x, -radius * 0.15, z);
  scene.add(m);
}

// Phase 1: immediate world build (synchronous, procedural Three.js geometry only)
(function buildWorld() {
  for (let i = 0; i < 160; i++) {
    const x = (Math.random() - 0.5) * CFG.ARENA * 1.9;
    const z = (Math.random() - 0.5) * CFG.ARENA * 1.9;
    if (Math.hypot(x, z) < 4) continue;
    addGrassTuft(x, z);
  }
  for (let i = 0; i < 55; i++) {
    const x = (Math.random() - 0.5) * CFG.ARENA * 1.7;
    const z = (Math.random() - 0.5) * CFG.ARENA * 1.7;
    if (Math.hypot(x, z) < 5) continue;
    addFern(x, z);
  }
  for (let i = 0; i < 75; i++) {
    const x = (Math.random() - 0.5) * CFG.ARENA * 1.7;
    const z = (Math.random() - 0.5) * CFG.ARENA * 1.7;
    if (Math.hypot(x, z) < 5) continue;
    addFlower(x, z);
  }
  for (let i = 0; i < 9; i++) {
    const x = (Math.random() - 0.5) * (CFG.ARENA - 8) * 1.6;
    const z = (Math.random() - 0.5) * (CFG.ARENA - 8) * 1.6;
    if (Math.hypot(x, z) < 8) continue;
    addLog(x, z);
  }

  const farRing = CFG.ARENA + 50;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
    const r = farRing + (Math.random() - 0.5) * 30;
    const radius = 14 + Math.random() * 12;
    const height = 8 + Math.random() * 14;
    const hue = 0.30 + Math.random() * 0.05;
    const sat = 0.30 + Math.random() * 0.10;
    // Darker hills (lig 0.28-0.38) so fog blend never pushes them past bloom
    const lig = 0.28 + Math.random() * 0.10;
    addDistantHill(Math.cos(a) * r, Math.sin(a) * r, radius, height, new THREE.Color().setHSL(hue, sat, lig));
  }
  const farRing2 = CFG.ARENA + 100;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
    const r = farRing2 + (Math.random() - 0.5) * 50;
    const radius = 22 + Math.random() * 18;
    const height = 14 + Math.random() * 18;
    // Faraway hills slightly lighter so they read as more distant
    addDistantHill(Math.cos(a) * r, Math.sin(a) * r, radius, height, new THREE.Color().setHSL(0.55 + Math.random() * 0.06, 0.25, 0.38));
  }

  for (let i = 0; i < 16; i++) {
    addCloud((Math.random() - 0.5) * 380, 28 + Math.random() * 18, (Math.random() - 0.5) * 380, 1.5 + Math.random() * 1.4);
  }
})();

const _wpTmp = new THREE.Vector3();

// Phase 2: KayKit prop placement (called once GLTF assets are ready)
function _placeWorldProps() {
  for (let i = 0; i < 22; i++) {
    let x, z, ok = false, tries = 0;
    while (!ok && tries < 30) {
      tries++;
      x = (Math.random() - 0.5) * (CFG.ARENA - 8) * 1.4;
      z = (Math.random() - 0.5) * (CFG.ARENA - 8) * 1.4;
      if (Math.hypot(x, z) > 6) ok = true;
    }
    if (ok) addRock(x, z, 0.30 + Math.random() * 0.18);
  }

  const groveCenters = [];
  for (let i = 0; i < 10; i++) {
    let cx, cz, ok = false, tries = 0;
    while (!ok && tries < 40) {
      tries++;
      cx = (Math.random() - 0.5) * (CFG.ARENA - 12) * 1.3;
      cz = (Math.random() - 0.5) * (CFG.ARENA - 12) * 1.3;
      ok = Math.hypot(cx, cz) > 10;
      for (const g of groveCenters) if (Math.hypot(g.x - cx, g.z - cz) < 14) ok = false;
    }
    if (ok) groveCenters.push({ x: cx, z: cz });
  }
  const innerTreePositions = [];
  for (const g of groveCenters) {
    const treesInGrove = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < treesInGrove; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 5;
      const tx = g.x + Math.cos(a) * r, tz = g.z + Math.sin(a) * r;
      if (Math.hypot(tx, tz) < 6) continue;
      let skip = false;
      for (const o of obstacles) {
        if (o.type === 'box' && Math.abs(tx - o.x) < o.w / 2 + 0.5 && Math.abs(tz - o.z) < o.d / 2 + 0.5) skip = true;
        if (o.type === 'cone' && Math.hypot(tx - o.x, tz - o.z) < o.radius + 0.3) skip = true;
      }
      if (skip) continue;
      let tooClose = false;
      for (const p of innerTreePositions) if (Math.hypot(p.x - tx, p.z - tz) < 1.6) { tooClose = true; break; }
      if (tooClose) continue;
      innerTreePositions.push({ x: tx, z: tz });
      const r2 = Math.random();
      if (r2 < 0.65) addTree(tx, tz);
      else if (r2 < 0.90) addPineTree(tx, tz);
      else addDeadTree(tx, tz);
    }
    const bushCount = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < bushCount; b++) {
      const ba = Math.random() * Math.PI * 2;
      const br = 2.5 + Math.random() * 6;
      addBush(g.x + Math.cos(ba) * br, g.z + Math.sin(ba) * br);
    }
  }
  for (let i = 0; i < 14; i++) {
    const tx = (Math.random() - 0.5) * (CFG.ARENA - 6) * 1.6;
    const tz = (Math.random() - 0.5) * (CFG.ARENA - 6) * 1.6;
    if (Math.hypot(tx, tz) < 7) continue;
    let tooClose = false;
    for (const p of innerTreePositions) if (Math.hypot(p.x - tx, p.z - tz) < 3) { tooClose = true; break; }
    if (tooClose) continue;
    innerTreePositions.push({ x: tx, z: tz });
    if (Math.random() < 0.3) addPineTree(tx, tz); else addTree(tx, tz);
  }

  for (let i = 0; i < 12; i++) {
    if (innerTreePositions.length === 0) break;
    const t = innerTreePositions[Math.floor(Math.random() * innerTreePositions.length)];
    const a = Math.random() * Math.PI * 2;
    const r = 1.0 + Math.random() * 1.5;
    addMushrooms(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r);
  }

  for (let i = 0; i < 28; i++) {
    const x = (Math.random() - 0.5) * CFG.ARENA * 1.7;
    const z = (Math.random() - 0.5) * CFG.ARENA * 1.7;
    if (Math.hypot(x, z) < 6) continue;
    addRock(x, z, 0.4 + Math.random() * 0.7);
  }

  const ringInner = CFG.ARENA + 3;
  const ringOuter = CFG.ARENA + 22;
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = ringInner + Math.random() * (ringOuter - ringInner);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const which = Math.random();
    if (which < 0.50) addPineTree(x, z);
    else if (which < 0.75) addTree(x, z);
    else if (which < 0.88) addDeadTree(x, z);
    else if (which < 0.96) addBush(x, z);
    else addRock(x, z, 1.0 + Math.random() * 1.5);
  }
  for (let i = 0; i < 45; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = ringInner + Math.random() * (ringOuter - ringInner);
    if (Math.random() < 0.6) addRock(Math.cos(a) * r, Math.sin(a) * r, 0.4 + Math.random() * 0.7);
    else addBush(Math.cos(a) * r, Math.sin(a) * r);
  }

  const shadowRange = 44;
  scene.traverse(child => {
    if (!child.isMesh) return;
    const wx = child.getWorldPosition(_wpTmp).x;
    if (Math.abs(wx) > shadowRange || Math.abs(_wpTmp.z) > shadowRange) {
      child.castShadow = false;
    }
  });
}

// Load everything in the background at page-load time.
// Use allSettled so a single 404 doesn't block all prop placement.
Promise.allSettled(_ALL_SCENERY_SLUGS.map(slug =>
  _loadSceneryGLTF(slug).catch(err => {
    console.warn('[WALLOP] Scenery asset failed:', slug, err && err.message || err);
  })
)).then(results => {
  const ok  = results.filter(r => r.status === 'fulfilled').length;
  const bad = results.filter(r => r.status === 'rejected').length;
  console.log(`[WALLOP] Scenery loaded: ${ok}/${_ALL_SCENERY_SLUGS.length} OK${bad ? ', '+bad+' failed' : ''} — placing world props.`);
  _placeWorldProps();
});
