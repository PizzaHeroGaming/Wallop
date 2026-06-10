import { CFG, IS_MOBILE_EARLY, STAGE_MULTS, DIFFICULTIES } from './config.js?v=1aa72c6';
import { scene, camera, isMobile, tryEnterFullscreen, renderer, acquirePtLight, releasePtLight } from './renderer.js?v=1aa72c6';
import { groundHeight, addSolid, resolveSolids, solidProps } from './terrain.js?v=1aa72c6';
import { killMesh, clamp, rand, tmp, tmp2, flatPhong, smoothPhong } from './utils.js?v=1aa72c6';
import { gameState } from './state.js?v=1aa72c6';
import { Profile } from './profile.js?v=1aa72c6';
import { Audio } from './audio.js?v=1aa72c6';

// ============================================================
// PLAYER
// ============================================================
export const player = {
  group: new THREE.Group(),
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  facing: 0, // yaw radians
  hp: 100, maxHp: 100,
  xp: 0, level: 1, xpToNext: 5,
  baseSpeed: CFG.PLAYER_SPEED,
  damageMult: 1.0,
  cooldownMult: 1.0,
  pickupRange: CFG.PICKUP_RANGE,
  hpRegen: 0,
  xpGain: 1.0,
  critChance: 0.05,
  critMult: 2.0,
  projectileMult: 1.0,
  extraProjectiles: 0,
  armor: 0,
  knockback: 1.0,
  grounded: true,
  jumpsLeft: 1,
  maxJumps: 1,
  dashTimer: 0,
  dashCd: 0,
  invuln: 0,
  hurtFlash: 0,
  weapons: [],
  bodyTilt: 0,
  walkBob: 0,
  gold: 0,
  hasRevive: false,
};

// ============================================================
// PLAYER MESH — KayKit character loaded via GLTFLoader
// CHARACTER_MODELS maps catalog slugs → GLB paths.
// ============================================================
export const CHARACTER_MODELS = {
  pizza_hero:     'assets/characters/knight.glb',
  oven_knight:    'assets/characters/barbarian.glb',
  frost_baker:    'assets/characters/mage.glb',
  crust_runner:   'assets/characters/rogue.glb',
  anchovy_archer: 'assets/characters/ranger.glb',
  stealth_slice:  'assets/characters/rogue_hooded.glb',
};

export let playerMixer = null;
export let playerIdleAction = null;
export let playerWalkAction = null;
export let playerRunAction  = null;
export let _playerMoving    = false;
export let _loadedCharSlug  = null;
export let _animClips       = null;

player.group = new THREE.Group();
scene.add(player.group);

const _gltfLoader = new THREE.GLTFLoader();
function _loadGLB(url) {
  return new Promise((res, rej) => _gltfLoader.load(url, res, null, rej));
}

// Weapon / item asset cache — slug → gltf object, loaded lazily then cloned per use
const _weaponAssets = {};
function _loadWeaponGLTF(slug, url) {
  if (_weaponAssets[slug]) return Promise.resolve(_weaponAssets[slug]);
  return _loadGLB(url).then(gltf => { _weaponAssets[slug] = gltf; return gltf; });
}
export function _cloneWeaponMesh(slug) {
  const gltf = _weaponAssets[slug];
  if (!gltf) return null;
  return THREE.SkeletonUtils.clone(gltf.scene);
}
// Preload all weapon models in the background so they're ready on first use
['axe_1handed','axe_2handed','wand','arrow_crossbow','smokebomb','shield_round','dagger'].forEach(slug =>
  _loadWeaponGLTF(slug, `assets/weapons/${slug}.gltf`).catch(() => {})
);

// Enemy / boss skeleton model cache
const _enemyAssets = {};
function _loadEnemyGLB(slug, url) {
  if (_enemyAssets[slug]) return Promise.resolve(_enemyAssets[slug]);
  return _loadGLB(url).then(gltf => { _enemyAssets[slug] = gltf; return gltf; });
}
export function _cloneEnemyMesh(slug) {
  const gltf = _enemyAssets[slug];
  if (!gltf) return null;
  const clone = THREE.SkeletonUtils.clone(gltf.scene);
  clone._isSkeletonGLB = true;
  return clone;
}
// Preload all KayKit Skeleton GLBs in the background
const _SKEL_BASE = 'assets/KayKit_Skeletons_1.1_FREE/KayKit_Skeletons_1.1_FREE/';
const _SKEL_CHAR = _SKEL_BASE + 'characters/gltf/';
[
  ['skeleton_minion',  'Skeleton_Minion.glb'],
  ['skeleton_warrior', 'Skeleton_Warrior.glb'],
  ['skeleton_mage',    'Skeleton_Mage.glb'],
  ['skeleton_rogue',   'Skeleton_Rogue.glb'],
].forEach(([slug, file]) => _loadEnemyGLB(slug, _SKEL_CHAR + file).catch(() => {}));

// Skeleton pack has its own animation GLBs
let _skelAnimClips = null;
Promise.all([
  _loadGLB(_SKEL_BASE + 'Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb'),
  _loadGLB(_SKEL_BASE + 'Animations/gltf/Rig_Medium/Rig_Medium_General.glb'),
]).then(([moveGltf, genGltf]) => {
  _skelAnimClips = [...moveGltf.animations, ...genGltf.animations];
  console.log('[WALLOP] Skeleton anim clips loaded:', _skelAnimClips.map(c => c.name));
  const _warmSlugs = ['skeleton_minion', 'skeleton_warrior', 'skeleton_rogue'];
  const _warmMeshes = [];
  for (const slug of _warmSlugs) {
    if (!_enemyAssets[slug]) continue;
    const m = _cloneEnemyMesh(slug);
    if (!m) continue;
    m.position.set(0, -9999, 0);
    scene.add(m);
    _warmMeshes.push(m);
  }
  if (_warmMeshes.length) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      _warmMeshes.forEach(m => killMesh(m));
    }));
  }
}).catch(err => console.error('[WALLOP] Skeleton animation load failed:', err));

// ============================================================
// QUATERNIUS ULTIMATE MONSTERS PACK (CC0)
// Each .gltf embeds its own animations (Idle, Walk, Run, Attack, Death, Jump)
// and references the shared Atlas_Monsters.png texture in its parent folder.
// Used for per-arena enemy skins + the 9-boss roster.
// Folder convention:
//   Big/    = chunky boss-scale builds
//   Blob/   = squat chibi mook-scale builds
//   Flying/ = airborne variants
// Mook-vs-boss visual gap: bosses use Big/X.gltf where the matching Blob/X.gltf
// is the mook — players read "oh, this is the giant form of that little guy."
// ============================================================
const _QUAT_BASE = 'assets/quaternius_monsters/';

export const QUATERNIUS_MODELS = {
  // ── Pepperoni Pines (forest) — enemies ──
  q_orc_enemy:      { file: 'Blob/Orc.gltf',                scale: 0.9 },
  q_armabee:        { file: 'Flying/Armabee.gltf',          scale: 0.7 },
  q_goleling:       { file: 'Flying/Goleling.gltf',         scale: 0.95 },
  q_bunny:          { file: 'Big/Bunny.gltf',               scale: 0.9 },
  q_glub:           { file: 'Flying/Glub.gltf',             scale: 0.9 },
  q_monkroose:      { file: 'Big/Monkroose.gltf',           scale: 1.0 },
  // ── Sundried Slopes (autumn) — enemies ──
  q_mushnub:        { file: 'Blob/Mushnub.gltf',            scale: 0.95 },
  q_birb:           { file: 'Blob/Birb.gltf',               scale: 0.7 },
  q_blue_demon:     { file: 'Big/BlueDemon.gltf',           scale: 1.1 },
  q_tribal:         { file: 'Big/Tribal.gltf',              scale: 0.95 },
  q_squidle:        { file: 'Flying/Squidle.gltf',          scale: 0.9 },
  q_mushnub_evo:    { file: 'Blob/Mushnub_Evolved.gltf',    scale: 1.15 },
  // ── Frostbite Glacier (snow) — enemies ──
  q_green_blob:     { file: 'Blob/GreenBlob.gltf',          scale: 0.9 },
  q_ghost_skull:    { file: 'Flying/Ghost_Skull.gltf',      scale: 0.85 },
  q_alpaking_evo:   { file: 'Flying/Alpaking_Evolved.gltf', scale: 1.2 },
  q_hywirl:         { file: 'Flying/Hywirl.gltf',           scale: 0.9 },
  q_pink_blob:      { file: 'Blob/PinkBlob.gltf',           scale: 0.9 },
  q_armabee_evo:    { file: 'Flying/Armabee_Evolved.gltf',  scale: 0.85 },
  // ── Bosses (9) — Big/ for boss-scale silhouette where available ──
  q_wizard:         { file: 'Blob/Wizard.gltf',             scale: 1.4 },  // forest mini1 (Wizard only ships in Blob)
  q_orc:            { file: 'Big/Orc.gltf',                 scale: 1.15 }, // forest mini2 — visibly bigger than q_orc_enemy mooks
  q_demon:          { file: 'Big/Demon.gltf',               scale: 1.25 }, // forest final
  q_cactoro:        { file: 'Big/Cactoro.gltf',             scale: 1.05 }, // sundried mini1
  q_goleling_evo:   { file: 'Flying/Goleling_Evolved.gltf', scale: 1.2 },  // sundried mini2 (only ships in Flying)
  q_mushroom_king:  { file: 'Big/MushroomKing.gltf',        scale: 1.3 },  // sundried final
  q_ghost:          { file: 'Flying/Ghost.gltf',            scale: 1.05 }, // frostbite mini1
  q_yeti:           { file: 'Big/Yeti.gltf',                scale: 1.15 }, // frostbite mini2
  q_dragon_evo:     { file: 'Flying/Dragon_Evolved.gltf',   scale: 1.35 }, // frostbite final
};

const _quaterniusAssets = {};
function _loadQuaterniusGLB(slug) {
  const entry = QUATERNIUS_MODELS[slug];
  if (!entry) return Promise.reject(new Error(`Unknown Quaternius slug: ${slug}`));
  if (_quaterniusAssets[slug]) return Promise.resolve(_quaterniusAssets[slug]);
  // Path segments are clean ASCII — no encoding needed (and encodeURIComponent
  // would break the '/' separators between subfolder and filename).
  return _loadGLB(_QUAT_BASE + entry.file).then(gltf => {
    _quaterniusAssets[slug] = gltf;
    return gltf;
  });
}
export function hasQuaterniusAsset(slug) { return !!_quaterniusAssets[slug]; }
export function getQuaterniusClips(slug) {
  const gltf = _quaterniusAssets[slug];
  return gltf ? gltf.animations : null;
}
export function _cloneQuaterniusMesh(slug) {
  const gltf = _quaterniusAssets[slug];
  if (!gltf) return null;
  const clone = THREE.SkeletonUtils.clone(gltf.scene);
  clone._isQuaterniusGLB = true;
  clone._quaterniusSlug = slug;
  return clone;
}

// Preload all 27 Quaternius models in background — but DELAYED so the
// critical-path models (player character, skeleton mooks, anim clips) win
// the browser's per-host connection slots on a cold cache. Without the
// delay these 27 fetches enqueued BEFORE knight.glb and the player ran
// around invisible for the first stretch of slow first loads.
setTimeout(() => {
  Object.keys(QUATERNIUS_MODELS).forEach(slug =>
    _loadQuaterniusGLB(slug).catch(err =>
      console.warn(`[WALLOP] Quaternius preload failed for ${slug}:`, err)
    )
  );
}, 2500);

// Per-arena enemy roster — maps gameState.arena + def.body → Quaternius slug.
// If absent OR asset not yet loaded, falls back to the existing KayKit skeleton path.
export const ENEMY_VARIANTS = {
  pepperoni_pines: {
    goblin:  'q_orc_enemy',
    bat:     'q_armabee',
    brute:   'q_goleling',
    skelly:  'q_bunny',
    imp:     'q_glub',
    warlord: 'q_monkroose',
  },
  sundried_slopes: {
    goblin:  'q_mushnub',
    bat:     'q_birb',
    brute:   'q_blue_demon',
    skelly:  'q_tribal',
    imp:     'q_squidle',
    warlord: 'q_mushnub_evo',
  },
  frostbite_glacier: {
    goblin:  'q_green_blob',
    bat:     'q_ghost_skull',
    brute:   'q_alpaking_evo',
    skelly:  'q_hywirl',
    imp:     'q_pink_blob',
    warlord: 'q_armabee_evo',
  },
};

// ============================================================
// PICKUP / PROP MODEL UPGRADES (all CC0)
// Replaces the procedural primitives for the things players stare at most:
//   - XP gem        → Kenney Platformer Kit jewel.glb
//   - Gold coin     → KayKit Dungeon Remastered coin.gltf
//   - Chests        → KayKit Dungeon Remastered chest / chest_gold (hinged lid node)
//   - Pizza Toss    → Quaternius Food Pack Pizza.glb
//   - Orbit slices  → Quaternius Food Pack Pizza Slice.glb
//   - Ice Cone shot → Quaternius Food Pack Ice Cream.glb
// Every consumer keeps its procedural fallback so nothing breaks while
// assets stream in (or if a file 404s).
// ============================================================
const _DNG_BASE = 'assets/KayKit_DungeonRemastered_1.1_FREE/KayKit_DungeonRemastered_1.1_FREE/Assets/gltf/';
// Scales tuned by measuring each model's Box3 against the procedural mesh
// it replaces (old gem ≈0.6 across, coin ≈0.5 diameter, chest ≈1.2 wide,
// pizza ≈0.86 diameter, ice shard ≈0.9 tall).
const _PROP_MODELS = {
  gem:        { file: 'assets/kenney_platformer-kit/Models/GLB format/jewel.glb', scale: 1.7  },
  coin:       { file: _DNG_BASE + 'coin.gltf',                                    scale: 1.4  },
  chest:      { file: _DNG_BASE + 'chest.gltf',                                   scale: 0.85 },
  chest_gold: { file: _DNG_BASE + 'chest_gold.gltf',                              scale: 0.85 },
  pizza:      { file: 'assets/quaternius_food/Pizza.glb',                         scale: 0.30 },
  pizza_slice:{ file: 'assets/quaternius_food/Pizza Slice.glb',                   scale: 0.6  },
  ice_cream:  { file: 'assets/quaternius_food/Ice Cream.glb',                     scale: 1.0  },
};
const _propAssets = {};
// Delayed for the same critical-path reason as the monster preload above —
// every prop consumer has a procedural fallback, so a late start is invisible
// to the player, but a clogged fetch queue on cold cache is not.
setTimeout(() => {
  Object.entries(_PROP_MODELS).forEach(([slug, entry]) => {
    _loadGLB(entry.file)
      .then(gltf => { _propAssets[slug] = gltf; })
      .catch(err => console.warn(`[WALLOP] prop model failed: ${slug}`, err && err.message));
  });
}, 2000);
/** Clone a prop model with its tuned base scale, or null if not yet loaded. */
export function _cloneProp(slug, extraScale = 1) {
  const gltf = _propAssets[slug];
  if (!gltf) return null;
  const clone = THREE.SkeletonUtils.clone(gltf.scene);
  clone.scale.setScalar(_PROP_MODELS[slug].scale * extraScale);
  return clone;
}

function _bindAnimActions(mixer) {
  const get = name => _animClips && _animClips.find(c => c.name === name);
  playerIdleAction = get('Idle_A')    ? mixer.clipAction(get('Idle_A'))    : null;
  playerWalkAction = get('Walking_A') ? mixer.clipAction(get('Walking_A')) : null;
  playerRunAction  = get('Running_A') ? mixer.clipAction(get('Running_A')) : null;
  if (playerIdleAction) playerIdleAction.play();
}

export function _applyCharacterModel() {
  const slug = Profile.get().equippedCharacter || 'pizza_hero';
  // Skip-load fast path: already loaded AND the player.group actually has that model
  // attached.  We tag the root we added with userData._wallop_charSlug so we can
  // verify the current visible model matches the equipped slug — without this,
  // a previous load that left _loadedCharSlug=newSlug but rejected (or got
  // overwritten by a concurrent call) could permanently strand the wrong model.
  if (slug === _loadedCharSlug
      && player.group.children.length > 0
      && player.group.children[0].userData?._wallop_charSlug === slug) {
    return Promise.resolve();
  }
  const url = CHARACTER_MODELS[slug] || CHARACTER_MODELS.pizza_hero;
  return _loadGLB(url).then(charGltf => {
    // Clear whatever was there (previous character, or stale partial load)
    while (player.group.children.length) {
      const c = player.group.children[0];
      player.group.remove(c);
      // Dispose old mesh resources to avoid GPU leaks across char swaps
      c.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
    }
    const model = THREE.SkeletonUtils.clone(charGltf.scene);
    model.scale.setScalar(1.0);
    model.userData._wallop_charSlug = slug; // tag so we can verify next time
    model.traverse(c => { if (c.isMesh) c.castShadow = true; });
    player.group.add(model);
    if (playerMixer) playerMixer.stopAllAction();
    playerMixer = new THREE.AnimationMixer(model);
    _bindAnimActions(playerMixer);
    _loadedCharSlug = slug; // set AFTER successful apply, so a failed load doesn't strand
  }).catch(err => {
    console.error('[WALLOP] Character model load failed:', err);
    _loadedCharSlug = null; // allow retry on next call
  });
}

// Shared character GLB cache — used by both the in-game model and the start-screen preview.
// All callers get the same gltf object; each caller must SkeletonUtils.clone() before use.
const _charGltfCache = {};
export function loadCharAsset(slug) {
  const url = CHARACTER_MODELS[slug];
  if (!url) return Promise.reject(new Error(`Unknown character slug: ${slug}`));
  if (_charGltfCache[slug]) return Promise.resolve(_charGltfCache[slug]);
  return _loadGLB(url).then(gltf => { _charGltfCache[slug] = gltf; return gltf; });
}

// Load shared animation clips first, then the equipped character model
Promise.all([
  _loadGLB('assets/characters/movement.glb'),
  _loadGLB('assets/characters/general.glb'),
]).then(([moveGltf, genGltf]) => {
  _animClips = [...moveGltf.animations, ...genGltf.animations];
  return _applyCharacterModel();
}).catch(err => console.error('[WALLOP] Animation load failed:', err));

// ============================================================
// ENTITY POOLS
// ============================================================
export const enemies = [];
export const projectiles = [];
export const enemyProjectiles = [];
export const orbitals = [];
export const xpGems = [];
export const goldCoins = [];
export const particles = [];
export const auraInstances = [];
export const chests = [];
export const smokeClouds = [];

// Module-level cosmetic mesh refs (cleaned up in resetGame)
export let _thunderWandMesh = null;
export let _thunderWandAngle = 0;
export let _shieldOrbitMesh = null;
export let _shieldOrbitAngle = 0;
export let _staffMesh = null;
export let _staffAngle = 0;

// Setters for cosmetic mesh refs (needed by weapons.js/game.js)
export function set_thunderWandMesh(v) { _thunderWandMesh = v; }
export function set_thunderWandAngle(v) { _thunderWandAngle = v; }
export function set_shieldOrbitMesh(v) { _shieldOrbitMesh = v; }
export function set_shieldOrbitAngle(v) { _shieldOrbitAngle = v; }
export function set_staffMesh(v) { _staffMesh = v; }
export function set_staffAngle(v) { _staffAngle = v; }

// ============================================================
// ENEMIES
// ============================================================
export const ENEMY_DEFS = {
  goblin: {
    color: 0x4f8c3d, name: 'goblin',
    hp: 12, dmg: 8, speed: 3.2, xp: 1, scale: 0.9,
    body: 'goblin', spawnTime: 0,
  },
  bat: {
    color: 0x2a1a35, name: 'bat',
    hp: 8, dmg: 6, speed: 5.5, xp: 1, scale: 0.7,
    body: 'bat', spawnTime: 60,
  },
  brute: {
    color: 0xa84e2a, name: 'brute',
    hp: 60, dmg: 18, speed: 2.4, xp: 4, scale: 1.5,
    body: 'brute', spawnTime: 90,
  },
  skelly: {
    color: 0xeae6d8, name: 'skelly',
    hp: 22, dmg: 12, speed: 3.6, xp: 2, scale: 1.0,
    body: 'skelly', spawnTime: 150,
  },
  imp: {
    color: 0xc52a2a, name: 'imp',
    hp: 35, dmg: 14, speed: 4.4, xp: 3, scale: 0.95,
    body: 'imp', spawnTime: 240,
  },
  warlord: {
    color: 0x6a1438, name: 'warlord',
    hp: 220, dmg: 28, speed: 2.6, xp: 12, scale: 2.0,
    body: 'warlord', spawnTime: 360,
  },
  archer: {
    color: 0x884422, name: 'archer',
    hp: 28, dmg: 16, speed: 2.2, xp: 3, scale: 0.95,
    body: 'archer', spawnTime: 270,
  },
};

// ============================================================
// Per-enemy mesh builders
// ============================================================

function makeGoblinMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const skin     = smoothPhong(def.color, 10);
  const skinDark = smoothPhong(0x33632a, 6);
  const cloth    = flatPhong(0x6b3a18);
  const wood     = flatPhong(0x4a2a14, 12);
  const fang     = smoothPhong(0xf5e8d2, 30);
  const eyeMat   = new THREE.MeshPhongMaterial({ color: 0xfbe54f, emissive: 0x554400 });

  g.legL = new THREE.Group(); g.legR = new THREE.Group();
  g.legL.position.set(-0.13 * s, 0.55 * s, 0);
  g.legR.position.set( 0.13 * s, 0.55 * s, 0);
  g.add(g.legL, g.legR);
  for (const leg of [g.legL, g.legR]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.08 * s, 0.30 * s, 8), skin);
    upper.position.y = -0.15 * s; upper.castShadow = true; leg.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.07 * s, 0.28 * s, 8), skin);
    lower.position.y = -0.42 * s; leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.10 * s, 0.26 * s), wood);
    foot.position.set(0, -0.58 * s, 0.04 * s); foot.castShadow = true; leg.add(foot);
  }

  const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.30 * s, 0.30 * s, 8), cloth);
  loin.position.y = 0.55 * s;
  g.add(loin);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.30 * s, 12, 10), skin);
  torso.scale.set(1.0, 1.0, 0.85);
  torso.position.set(0, 0.92 * s, -0.04 * s);
  torso.rotation.x = 0.22;
  torso.castShadow = true;
  g.add(torso);
  g.bodyRef = torso;

  const armR = new THREE.Group();
  armR.position.set(0.30 * s, 1.05 * s, -0.02 * s);
  armR.rotation.z = -0.5;
  armR.rotation.x = -0.7;
  g.add(armR);
  const armRu = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.06 * s, 0.32 * s, 8), skin);
  armRu.position.y = -0.16 * s; armRu.castShadow = true; armR.add(armRu);
  const armRf = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.30 * s, 8), skin);
  armRf.position.y = -0.45 * s; armR.add(armRf);
  const club = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.40 * s, 8), wood);
  club.position.y = -0.82 * s; club.castShadow = true;
  armR.add(club);
  const clubHead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 * s, 0), wood);
  clubHead.position.y = -1.05 * s;
  clubHead.castShadow = true;
  armR.add(clubHead);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.10 * s, 4), flatPhong(0x999999));
    spike.position.set(Math.cos(a) * 0.13 * s, -1.05 * s, Math.sin(a) * 0.13 * s);
    spike.rotation.z = -a + Math.PI;
    armR.add(spike);
  }

  const armL = new THREE.Group();
  armL.position.set(-0.30 * s, 1.05 * s, -0.02 * s);
  armL.rotation.z = 0.15;
  g.add(armL);
  const armLu = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.06 * s, 0.32 * s, 8), skin);
  armLu.position.y = -0.16 * s; armLu.castShadow = true; armL.add(armLu);
  const armLf = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.30 * s, 8), skin);
  armLf.position.y = -0.45 * s; armL.add(armLf);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 8, 6), skin);
  handL.position.y = -0.62 * s; armL.add(handL);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27 * s, 14, 12), skin);
  head.scale.set(1.0, 0.95, 1.10);
  head.position.set(0, 1.40 * s, 0.04 * s);
  head.castShadow = true;
  g.add(head);
  for (const dx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.22 * s, 4), skin);
    ear.position.set(0.24 * s * dx, 1.5 * s, 0.02 * s);
    ear.rotation.z = -dx * 1.0;
    g.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), skinDark);
  nose.scale.set(0.8, 1.2, 1.4);
  nose.position.set(0, 1.38 * s, 0.30 * s);
  g.add(nose);
  for (const dx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 8, 6), eyeMat);
    eye.position.set(0.09 * s * dx, 1.48 * s, 0.24 * s);
    g.add(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.05 * s, 0.05 * s), skinDark);
  brow.position.set(0, 1.55 * s, 0.22 * s);
  g.add(brow);
  for (const dx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.020 * s, 0.07 * s, 4), fang);
    f.position.set(0.045 * s * dx, 1.30 * s, 0.27 * s);
    f.rotation.x = Math.PI;
    g.add(f);
  }
  return g;
}

function makeBatMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const fur     = smoothPhong(def.color, 4);
  const furDark = smoothPhong(0x12091a, 4);
  const wing    = new THREE.MeshPhongMaterial({ color: 0x1a0d22, shininess: 10, side: THREE.DoubleSide });
  const eyeMat  = new THREE.MeshPhongMaterial({ color: 0xff3864, emissive: 0xaa0033 });
  const fangMat = smoothPhong(0xfffaf0, 30);

  const bodyY = 1.4;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 18, 14), fur);
  body.scale.set(0.8, 1.0, 1.2);
  body.position.y = bodyY;
  body.castShadow = true;
  g.add(body);
  g.bodyRef = body;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.30 * s, 16, 12), fur);
  head.scale.set(0.95, 0.9, 1.0);
  head.position.set(0, bodyY + 0.04, 0.42 * s);
  head.castShadow = true;
  g.add(head);
  for (const dx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.10 * s, 0.30 * s, 4), fur);
    ear.position.set(0.15 * s * dx, bodyY + 0.30 * s, 0.40 * s);
    ear.rotation.z = -dx * 0.15;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.18 * s, 4), furDark);
    inner.position.set(0.15 * s * dx, bodyY + 0.28 * s, 0.42 * s);
    inner.rotation.z = -dx * 0.15;
    g.add(inner);
  }
  for (const dx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), eyeMat);
    eye.position.set(0.10 * s * dx, bodyY + 0.05, 0.65 * s);
    g.add(eye);
  }
  for (const dx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.08 * s, 4), fangMat);
    f.position.set(0.05 * s * dx, bodyY - 0.10 * s, 0.62 * s);
    f.rotation.x = Math.PI;
    g.add(f);
  }
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), furDark);
  snout.scale.set(1, 0.7, 1.4);
  snout.position.set(0, bodyY - 0.05, 0.68 * s);
  g.add(snout);

  function makeBatWing() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1.2, 0.1);
    shape.lineTo(1.4, -0.3);
    shape.lineTo(0.9, -0.4);
    shape.lineTo(0.6, -0.55);
    shape.lineTo(0.3, -0.35);
    shape.lineTo(0, -0.15);
    shape.lineTo(0, 0);
    return new THREE.ShapeGeometry(shape);
  }
  const wingGeo = makeBatWing();
  const wL = new THREE.Group();
  wL.position.set(-0.30 * s, bodyY, 0);
  g.add(wL);
  const wLm = new THREE.Mesh(wingGeo, wing);
  wLm.scale.set(-s, s, s);
  wLm.castShadow = true;
  wL.add(wLm);
  for (let i = 0; i < 4; i++) {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.7 * s, 4), fur);
    bone.position.set(-0.4 * s, -0.18 * s + i * 0.04 * s, 0);
    bone.rotation.z = -1.2 - i * 0.12;
    wL.add(bone);
  }
  const wR = new THREE.Group();
  wR.position.set(0.30 * s, bodyY, 0);
  g.add(wR);
  const wRm = new THREE.Mesh(wingGeo, wing);
  wRm.scale.setScalar(s);
  wRm.castShadow = true;
  wR.add(wRm);
  for (let i = 0; i < 4; i++) {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.7 * s, 4), fur);
    bone.position.set(0.4 * s, -0.18 * s + i * 0.04 * s, 0);
    bone.rotation.z = 1.2 + i * 0.12;
    wR.add(bone);
  }
  g.wingL = wL; g.wingR = wR;
  return g;
}

function makeBruteMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const skin    = smoothPhong(def.color, 8);
  const skinDk  = smoothPhong(0x6e3318, 6);
  const fur     = flatPhong(0x4a2a14);
  const tusk    = smoothPhong(0xf5e8d2, 30);
  const eyeMat  = new THREE.MeshPhongMaterial({ color: 0xfff5b8, emissive: 0x553300 });
  const buckle  = flatPhong(0x1a0d04, 30);

  g.legL = new THREE.Group(); g.legR = new THREE.Group();
  g.legL.position.set(-0.22 * s, 0.70 * s, 0);
  g.legR.position.set( 0.22 * s, 0.70 * s, 0);
  g.add(g.legL, g.legR);
  for (const leg of [g.legL, g.legR]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.16 * s, 0.44 * s, 10), skin);
    upper.position.y = -0.22 * s; upper.castShadow = true; leg.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.14 * s, 0.40 * s, 10), skin);
    lower.position.y = -0.64 * s; lower.castShadow = true; leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.14 * s, 0.40 * s), skinDk);
    foot.position.set(0, -0.88 * s, 0.06 * s); foot.castShadow = true; leg.add(foot);
  }
  const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * s, 0.50 * s, 0.38 * s, 10), fur);
  loin.position.y = 0.70 * s;
  g.add(loin);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 14, 12), skin);
  torso.scale.set(1.0, 0.95, 0.90);
  torso.position.y = 1.20 * s;
  torso.castShadow = true;
  g.add(torso);
  g.bodyRef = torso;

  // Belly fat rolls
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 12, 10), skin);
  belly.scale.set(1.0, 0.55, 0.90);
  belly.position.set(0, 0.90 * s, 0.08 * s);
  g.add(belly);

  // Tusks
  for (const dx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.30 * s, 6), tusk);
    t.position.set(0.14 * s * dx, 1.45 * s, 0.40 * s);
    t.rotation.x = -0.6;
    t.rotation.z = dx * 0.2;
    g.add(t);
  }

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38 * s, 14, 12), skin);
  head.scale.set(1.0, 0.90, 1.0);
  head.position.set(0, 1.62 * s, 0.10 * s);
  head.castShadow = true;
  g.add(head);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.14 * s, 0.14 * s, 8), skinDk);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 1.55 * s, 0.44 * s);
  g.add(snout);
  for (const dx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 8, 6), eyeMat);
    eye.position.set(0.16 * s * dx, 1.70 * s, 0.34 * s);
    g.add(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.50 * s, 0.08 * s, 0.06 * s), skinDk);
  brow.position.set(0, 1.78 * s, 0.30 * s);
  g.add(brow);

  // Arms
  for (const dx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.55 * s * dx, 1.20 * s, 0);
    arm.rotation.z = -dx * 0.20;
    g.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.14 * s, 0.42 * s, 10), skin);
    upper.position.y = -0.21 * s; upper.castShadow = true; arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.15 * s, 0.40 * s, 10), skin);
    fore.position.y = -0.62 * s; fore.castShadow = true; arm.add(fore);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.30 * s, 0.32 * s), skinDk);
    fist.position.y = -0.92 * s; fist.castShadow = true; arm.add(fist);
    for (const kx of [-0.08, 0.08]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 6, 5), buckle);
      k.position.set(kx * s, -0.92 * s, 0.16 * s);
      arm.add(k);
    }
  }
  return g;
}

function makeSkellyMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const bone     = smoothPhong(0xd8d3c0, 18);
  const boneDk   = smoothPhong(0x9a9385, 8);
  const cloak    = new THREE.MeshPhongMaterial({ color: 0x2a1f3a, shininess: 6, side: THREE.DoubleSide });
  const eyeMat   = new THREE.MeshPhongMaterial({ color: 0x001833, emissive: 0x4ad6ff, emissiveIntensity: 1.0 });
  const sword    = flatPhong(0xb8c7d8, 80);
  const hilt     = flatPhong(0x2a1810);
  const guard    = flatPhong(0xd4af37, 60);

  g.legL = new THREE.Group(); g.legR = new THREE.Group();
  g.legL.position.set(-0.13 * s, 0.78 * s, 0);
  g.legR.position.set( 0.13 * s, 0.78 * s, 0);
  g.add(g.legL, g.legR);
  for (const leg of [g.legL, g.legR]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.40 * s, 8), bone);
    upper.position.y = -0.20 * s; upper.castShadow = true; leg.add(upper);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), bone);
    knee.position.y = -0.42 * s; leg.add(knee);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.045 * s, 0.40 * s, 8), bone);
    lower.position.y = -0.62 * s; leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.06 * s, 0.22 * s), bone);
    foot.position.set(0, -0.85 * s, 0.04 * s); leg.add(foot);
  }

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 10, 8), bone);
  pelvis.scale.set(1.2, 0.7, 1);
  pelvis.position.y = 0.78 * s;
  g.add(pelvis);

  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), bone);
    v.position.y = 0.95 * s + i * 0.10 * s;
    g.add(v);
  }

  for (let i = 0; i < 4; i++) {
    const y = 0.98 * s + i * 0.10 * s;
    const w = 0.20 * s + i * 0.02 * s;
    for (const dx of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(w, 0.025 * s, 4, 8, Math.PI), bone);
      rib.position.set(0, y, 0);
      rib.rotation.set(0, 0, dx * Math.PI / 2);
      g.add(rib);
    }
  }
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.10 * s, 0.42 * s, 0.06 * s), bone);
  sternum.position.set(0, 1.15 * s, 0.18 * s);
  g.add(sternum);
  g.bodyRef = sternum;

  const cloakMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * s, 1.2 * s, 4, 6), cloak);
  cloakMesh.position.set(0, 1.05 * s, -0.18 * s);
  cloakMesh.castShadow = true;
  g.add(cloakMesh);

  for (const dx of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), bone);
    sh.position.set(0.28 * s * dx, 1.40 * s, 0);
    g.add(sh);
    const arm = new THREE.Group();
    arm.position.set(0.28 * s * dx, 1.40 * s, 0);
    g.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.04 * s, 0.34 * s, 8), bone);
    upper.position.y = -0.17 * s; arm.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 6, 5), bone);
    elbow.position.y = -0.34 * s; arm.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.035 * s, 0.34 * s, 8), bone);
    fore.position.y = -0.52 * s; arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 5), bone);
    hand.position.y = -0.72 * s; arm.add(hand);
    if (dx === 1) {
      arm.rotation.x = -0.5;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.65 * s, 0.02 * s), sword);
      blade.position.set(0, -1.05 * s, 0); blade.castShadow = true; arm.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.10 * s, 4), sword);
      tip.position.set(0, -1.42 * s, 0); arm.add(tip);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.04 * s, 0.04 * s), guard);
      cross.position.set(0, -0.78 * s, 0); arm.add(cross);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.10 * s, 6), hilt);
      grip.position.set(0, -0.72 * s, 0); arm.add(grip);
    }
  }

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.20 * s, 14, 12), bone);
  skull.scale.set(1.0, 1.05, 1.05);
  skull.position.set(0, 1.62 * s, 0.04 * s);
  skull.castShadow = true;
  g.add(skull);
  for (const dx of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), boneDk);
    socket.position.set(0.075 * s * dx, 1.65 * s, 0.18 * s);
    g.add(socket);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 6, 5), eyeMat);
    glow.position.set(0.075 * s * dx, 1.65 * s, 0.21 * s);
    g.add(glow);
  }
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.06 * s, 0.16 * s), bone);
  jaw.position.set(0, 1.50 * s, 0.16 * s);
  g.add(jaw);
  for (let i = -2; i <= 2; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.05 * s, 0.02 * s), bone);
    t.position.set(i * 0.035 * s, 1.55 * s, 0.22 * s);
    g.add(t);
  }
  return g;
}

function makeImpMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const skin   = smoothPhong(def.color, 12);
  const skinDk = smoothPhong(0x6a1414, 8);
  const horn   = smoothPhong(0x1a0a0a, 20);
  const eyeMat = new THREE.MeshPhongMaterial({ color: 0xfff04a, emissive: 0xaa6600 });
  const fang   = smoothPhong(0xfffaf0, 30);
  const wing   = new THREE.MeshPhongMaterial({ color: 0x8a1f3a, shininess: 6, side: THREE.DoubleSide });

  const bodyY = 1.2;

  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s - i * 0.008 * s, 6, 5), skin);
    seg.position.set(0, bodyY - 0.15 - i * 0.05, -0.30 * s - i * 0.16 * s);
    g.add(seg);
  }
  for (const dx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.16 * s, 4), horn);
    tip.position.set(0.06 * s * dx, bodyY - 0.40, -1.10 * s);
    tip.rotation.x = 1.0;
    tip.rotation.z = dx * 0.4;
    g.add(tip);
  }

  for (const dx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.22 * s, 8), skin);
    leg.position.set(0.10 * s * dx, bodyY - 0.30, 0.04 * s);
    leg.rotation.x = 0.4;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 5), skinDk);
    foot.position.set(0.10 * s * dx, bodyY - 0.45, 0.18 * s);
    g.add(foot);
  }

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.30 * s, 12, 10), skin);
  torso.scale.set(0.85, 1.0, 0.9);
  torso.position.y = bodyY;
  torso.castShadow = true;
  g.add(torso);
  g.bodyRef = torso;

  for (const dx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.22 * s * dx, bodyY + 0.10, 0);
    arm.rotation.z = -dx * 0.4;
    g.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.26 * s, 8), skin);
    upper.position.y = -0.13 * s; arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.04 * s, 0.24 * s, 8), skin);
    fore.position.y = -0.36 * s; arm.add(fore);
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.018 * s, 0.10 * s, 4), horn);
      c.position.set(i * 0.04 * s, -0.55 * s, 0.04 * s);
      c.rotation.x = -0.3;
      arm.add(c);
    }
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 12, 10), skin);
  head.position.set(0, bodyY + 0.40, 0.04 * s);
  head.castShadow = true;
  g.add(head);
  for (const dx of [-1, 1]) {
    const horn1 = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.22 * s, 6), horn);
    horn1.position.set(0.13 * s * dx, bodyY + 0.62, -0.04 * s);
    horn1.rotation.z = -dx * 0.25;
    horn1.rotation.x = -0.3;
    g.add(horn1);
  }
  for (const dx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 8, 6), eyeMat);
    eye.position.set(0.09 * s * dx, bodyY + 0.42, 0.20 * s);
    eye.scale.set(1, 0.6, 1);
    g.add(eye);
  }
  for (const dx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.02 * s, 0.06 * s, 4), fang);
    f.position.set(0.04 * s * dx, bodyY + 0.28, 0.22 * s);
    f.rotation.x = Math.PI;
    g.add(f);
  }

  function makeImpWing() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.7, 0.2);
    shape.lineTo(0.95, -0.15);
    shape.lineTo(0.7, -0.35);
    shape.lineTo(0.4, -0.45);
    shape.lineTo(0.15, -0.25);
    shape.lineTo(0, 0);
    return new THREE.ShapeGeometry(shape);
  }
  const wingGeo = makeImpWing();
  const wL = new THREE.Group();
  wL.position.set(-0.18 * s, bodyY + 0.12, -0.10 * s);
  g.add(wL);
  const wLm = new THREE.Mesh(wingGeo, wing);
  wLm.scale.set(-s, s, s);
  wL.add(wLm);
  const wR = new THREE.Group();
  wR.position.set(0.18 * s, bodyY + 0.12, -0.10 * s);
  g.add(wR);
  const wRm = new THREE.Mesh(wingGeo, wing);
  wRm.scale.setScalar(s);
  wR.add(wRm);
  g.wingL = wL; g.wingR = wR;
  return g;
}

function makeWarlordMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const armor    = flatPhong(0x3a1024, 80);
  const armorDk  = flatPhong(0x1a0612, 100);
  const trim     = flatPhong(0xb8941e, 80);
  const cloth    = flatPhong(0x4a0a1c);
  const skin     = smoothPhong(0x9a5544, 10);
  const eyeMat   = new THREE.MeshPhongMaterial({ color: 0x330000, emissive: 0xff3030, emissiveIntensity: 1.0 });
  const axeBlade = flatPhong(0xb8c7d8, 90);
  const axeHaft  = flatPhong(0x2a1810);
  const cape     = new THREE.MeshPhongMaterial({ color: 0x4a0a1c, shininess: 8, side: THREE.DoubleSide });

  g.legL = new THREE.Group(); g.legR = new THREE.Group();
  g.legL.position.set(-0.20 * s, 0.85 * s, 0);
  g.legR.position.set( 0.20 * s, 0.85 * s, 0);
  g.add(g.legL, g.legR);
  for (const leg of [g.legL, g.legR]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.14 * s, 0.40 * s, 10), armor);
    upper.position.y = -0.20 * s; upper.castShadow = true; leg.add(upper);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), trim);
    knee.position.y = -0.42 * s; leg.add(knee);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.13 * s, 0.36 * s, 10), armor);
    lower.position.y = -0.62 * s; lower.castShadow = true; leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.14 * s, 0.40 * s), armorDk);
    foot.position.set(0, -0.85 * s, 0.08 * s); foot.castShadow = true; leg.add(foot);
  }

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.46 * s, 0.30 * s, 12), armor);
  skirt.position.y = 0.85 * s;
  skirt.castShadow = true;
  g.add(skirt);
  const skirtTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.47 * s, 0.47 * s, 0.05 * s, 12), trim);
  skirtTrim.position.y = 0.70 * s;
  g.add(skirtTrim);

  const capeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95 * s, 1.4 * s, 4, 6), cape);
  capeMesh.position.set(0, 1.30 * s, -0.32 * s);
  capeMesh.castShadow = true;
  g.add(capeMesh);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 14, 12), armor);
  chest.scale.set(1.1, 0.95, 0.85);
  chest.position.y = 1.30 * s;
  chest.castShadow = true;
  g.add(chest);
  g.bodyRef = chest;
  const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.10 * s, 0), trim);
  emblem.position.set(0, 1.30 * s, 0.42 * s);
  g.add(emblem);

  for (const dx of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), armor);
    pauldron.position.set(0.46 * s * dx, 1.62 * s, 0);
    pauldron.castShadow = true;
    g.add(pauldron);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.10 * s, 0.18 * s, 6), trim);
    spike.position.set(0.55 * s * dx, 1.78 * s, 0);
    spike.rotation.z = -dx * 0.3;
    g.add(spike);
  }

  for (const dx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.46 * s * dx, 1.55 * s, 0);
    arm.rotation.z = -dx * 0.18;
    g.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.12 * s, 0.42 * s, 10), armor);
    upper.position.y = -0.21 * s; upper.castShadow = true; arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.11 * s, 0.40 * s, 10), armor);
    fore.position.y = -0.62 * s; fore.castShadow = true; arm.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.20 * s, 0.18 * s), skin);
    hand.position.y = -0.86 * s; arm.add(hand);
    if (dx === 1) {
      arm.rotation.x = -0.4;
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 1.2 * s, 8), axeHaft);
      haft.position.y = -1.30 * s; haft.castShadow = true; arm.add(haft);
      const axeBack = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.40 * s, 0.06 * s), trim);
      axeBack.position.set(0, -1.85 * s, 0); arm.add(axeBack);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.50 * s, 0.32 * s, 0.04 * s), axeBlade);
      blade.position.set(0.20 * s, -1.85 * s, 0);
      blade.castShadow = true;
      arm.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.10 * s, 4), trim);
      tip.position.set(0, -1.95 * s, 0);
      arm.add(tip);
    }
  }

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 14, 12), armor);
  helmet.scale.set(1.0, 1.05, 1.0);
  helmet.position.y = 1.92 * s;
  helmet.castShadow = true;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.05 * s, 0.06 * s), armorDk);
  visor.position.set(0, 1.95 * s, 0.27 * s);
  g.add(visor);
  const visorV = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.16 * s, 0.06 * s), armorDk);
  visorV.position.set(0, 1.86 * s, 0.27 * s);
  g.add(visorV);
  const visorGlow = new THREE.Mesh(new THREE.BoxGeometry(0.20 * s, 0.03 * s, 0.02 * s), eyeMat);
  visorGlow.position.set(0, 1.95 * s, 0.30 * s);
  g.add(visorGlow);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.18 * s, 0.50 * s), trim);
  crest.position.y = 2.18 * s;
  g.add(crest);
  for (const dx of [-1, 1]) {
    const hornM = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.30 * s, 6), trim);
    hornM.position.set(0.24 * s * dx, 2.10 * s, -0.04 * s);
    hornM.rotation.z = -dx * 0.5;
    g.add(hornM);
  }
  return g;
}

function makeBossMesh(def) {
  const s = def.scale;
  const g = new THREE.Group();
  const armor    = flatPhong(0x2a0010, 90);
  const armorDk  = flatPhong(0x10000a, 100);
  const gold     = flatPhong(0xffc12a, 90);
  const flesh    = smoothPhong(0x6a1232, 10);
  const eyeMat   = new THREE.MeshPhongMaterial({ color: 0x330010, emissive: 0xff3864, emissiveIntensity: 1.0 });
  const coreMat  = new THREE.MeshPhongMaterial({ color: 0x332200, emissive: 0xffd23f, emissiveIntensity: 1.0 });
  const axeBlade = flatPhong(0xc8d1de, 95);
  const axeHaft  = flatPhong(0x16080a);
  const cape     = new THREE.MeshPhongMaterial({ color: 0x18030a, shininess: 12, side: THREE.DoubleSide });

  g.legL = new THREE.Group(); g.legR = new THREE.Group();
  g.legL.position.set(-0.32 * s, 1.0 * s, 0);
  g.legR.position.set( 0.32 * s, 1.0 * s, 0);
  g.add(g.legL, g.legR);
  for (const leg of [g.legL, g.legR]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.20 * s, 0.50 * s, 12), armor);
    upper.position.y = -0.25 * s; upper.castShadow = true; leg.add(upper);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 12, 10), gold);
    knee.position.y = -0.52 * s; leg.add(knee);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.20 * s, 0.18 * s, 0.46 * s, 12), armor);
    lower.position.y = -0.78 * s; lower.castShadow = true; leg.add(lower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.18 * s, 0.50 * s), armorDk);
    foot.position.set(0, -1.04 * s, 0.10 * s); foot.castShadow = true; leg.add(foot);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.10 * s, 0.20 * s, 6), gold);
    spike.position.set(0, -0.52 * s, 0.22 * s);
    spike.rotation.x = -0.4;
    leg.add(spike);
  }

  const capeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6 * s, 2.2 * s, 6, 8), cape);
  capeMesh.position.set(0, 1.50 * s, -0.50 * s);
  capeMesh.castShadow = true;
  g.add(capeMesh);

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * s, 0.66 * s, 0.40 * s, 14), armor);
  skirt.position.y = 1.0 * s;
  skirt.castShadow = true;
  g.add(skirt);
  const skirtTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.67 * s, 0.67 * s, 0.06 * s, 14), gold);
  skirtTrim.position.y = 0.81 * s;
  g.add(skirtTrim);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.62 * s, 16, 14), armor);
  chest.scale.set(1.1, 0.95, 0.85);
  chest.position.y = 1.50 * s;
  chest.castShadow = true;
  g.add(chest);
  g.bodyRef = chest;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 12, 10), coreMat);
  core.position.set(0, 1.50 * s, 0.55 * s);
  g.add(core);
  g.pulseRef = core;
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.22 * s, 0.04 * s, 6, 16), gold);
  coreRing.position.set(0, 1.50 * s, 0.55 * s);
  g.add(coreRing);

  for (const dx of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.34 * s, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), armor);
    pauldron.position.set(0.62 * s * dx, 1.90 * s, 0);
    pauldron.castShadow = true;
    g.add(pauldron);
    for (let i = 0; i < 2; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.10 * s, 0.30 * s, 6), gold);
      spike.position.set(0.74 * s * dx + i * 0.05 * dx, 2.10 * s + i * 0.04 * s, 0);
      spike.rotation.z = -dx * (0.4 + i * 0.2);
      g.add(spike);
    }
  }

  for (const dx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0.62 * s * dx, 1.80 * s, 0);
    arm.rotation.z = -dx * 0.25;
    arm.rotation.x = -0.3;
    g.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.16 * s, 0.50 * s, 12), armor);
    upper.position.y = -0.25 * s; upper.castShadow = true; arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.15 * s, 0.46 * s, 12), armor);
    fore.position.y = -0.72 * s; fore.castShadow = true; arm.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.24 * s, 0.22 * s), flesh);
    hand.position.y = -1.00 * s; arm.add(hand);
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.0 * s, 8), axeHaft);
    haft.position.y = -1.45 * s; arm.add(haft);
    for (const sx of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.40 * s, 0.05 * s), axeBlade);
      blade.position.set(sx * 0.25 * s, -1.95 * s, 0);
      blade.castShadow = true;
      arm.add(blade);
    }
    const axeMid = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.40 * s, 6), gold);
    axeMid.position.set(0, -1.95 * s, 0);
    axeMid.rotation.x = Math.PI / 2;
    arm.add(axeMid);
  }

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 16, 14), armor);
  helmet.scale.set(1.0, 1.05, 1.0);
  helmet.position.y = 2.30 * s;
  helmet.castShadow = true;
  g.add(helmet);
  const facePlate = new THREE.Mesh(new THREE.BoxGeometry(0.45 * s, 0.28 * s, 0.05 * s), armorDk);
  facePlate.position.set(0, 2.30 * s, 0.36 * s);
  g.add(facePlate);
  for (const dx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.10 * s, 0.08 * s, 0.04 * s), eyeMat);
    eye.position.set(0.10 * s * dx, 2.34 * s, 0.39 * s);
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.04 * s, 0.04 * s), eyeMat);
  mouth.position.set(0, 2.18 * s, 0.39 * s);
  g.add(mouth);

  const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.10 * s, 14), gold);
  crownBand.position.y = 2.62 * s;
  g.add(crownBand);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.30 * s, 6), gold);
    spike.position.set(Math.cos(a) * 0.34 * s, 2.78 * s, Math.sin(a) * 0.34 * s);
    g.add(spike);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04 * s, 0), eyeMat);
    gem.position.set(Math.cos(a) * 0.34 * s, 2.78 * s, Math.sin(a) * 0.34 * s);
    g.add(gem);
  }
  return g;
}

export function makeEnemyMesh(def) {
  // Arena-themed Quaternius variant — try first, fall back to KayKit skeleton if not yet loaded
  const _arenaMap = ENEMY_VARIANTS[gameState.arena];
  const _qSlug = _arenaMap && _arenaMap[def.body];
  if (_qSlug && _quaterniusAssets[_qSlug]) {
    const qm = _cloneQuaterniusMesh(_qSlug);
    if (qm) {
      const baseScale = QUATERNIUS_MODELS[_qSlug].scale * def.scale;
      qm.scale.setScalar(baseScale);
      return qm;
    }
  }
  switch (def.body) {
    case 'goblin': {
      const c = _cloneEnemyMesh('skeleton_minion');
      if (c) { c.scale.setScalar(0.62); return c; }
      return makeGoblinMesh(def);
    }
    case 'skelly': {
      const c = _cloneEnemyMesh('skeleton_minion');
      if (c) { c.scale.setScalar(0.9); return c; }
      return makeSkellyMesh(def);
    }
    case 'brute': {
      const c = _cloneEnemyMesh('skeleton_warrior');
      if (c) { c.scale.setScalar(1.25); return c; }
      return makeBruteMesh(def);
    }
    case 'warlord': {
      const c = _cloneEnemyMesh('skeleton_warrior');
      if (c) { c.scale.setScalar(1.6); return c; }
      return makeWarlordMesh(def);
    }
    case 'archer': {
      const c = _cloneEnemyMesh('skeleton_rogue');
      if (c) { c.scale.setScalar(0.85); return c; }
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.4), flatPhong(0x884422));
      body.position.y = 0.9; body.castShadow = true; g.add(body);
      g.bodyRef = body;
      return g;
    }
    case 'bat': return makeBatMesh(def);
    case 'imp': return makeImpMesh(def);
    case 'boss': return makeBossMesh(def);
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), flatPhong(def.color));
  body.position.y = 0.5; body.castShadow = true;
  g.add(body); g.bodyRef = body;
  return g;
}

export function spawnEnemy(typeKey, opts = {}) {
  const def = ENEMY_DEFS[typeKey];
  if (!def) return;
  const t = gameState.gameTime;
  let hpScale = 1 + t / 180 + Math.pow(t / 320, 1.6);
  let dmgScale = 1 + t / 240;
  // Stages 2 and 3 reset gameTime to 0 but the player arrives powered up.
  // Enforce a minimum hpScale so early-stage enemies don't feel like a
  // cooldown lap — Stage 2 floor ≈ the 5-min mark, Stage 3 ≈ the 8-min mark.
  const stageHpFloor = 1 + (gameState.stage - 1) * 2.5;
  if (hpScale < stageHpFloor) hpScale = stageHpFloor;
  const stageDmgFloor = 1 + (gameState.stage - 1) * 1.0;
  if (dmgScale < stageDmgFloor) dmgScale = stageDmgFloor;
  const curseMult = 1 + (player.curse || 0) * 0.18;
  hpScale *= curseMult;
  dmgScale *= 1 + (player.curse || 0) * 0.12;
  if (gameState.finalSwarm) { hpScale *= 1.35; dmgScale *= 1.15; }
  // Apply stage + difficulty multipliers
  const _stageMult = (STAGE_MULTS[gameState.stage] || STAGE_MULTS[1]).enemy;
  const _diffMult  = (DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal).enemy;
  hpScale  *= _stageMult * _diffMult;
  dmgScale *= _stageMult * _diffMult;
  const isElite = !!opts.elite;
  if (isElite) { hpScale *= 3; dmgScale *= 1.4; }

  const isFlying = def.body === 'bat' || def.body === 'imp';
  const enemy = {
    type: typeKey,
    def,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    hp: def.hp * hpScale,
    maxHp: def.hp * hpScale,
    dmg: def.dmg * dmgScale,
    speed: def.speed * (0.9 + Math.random() * 0.2) * (isElite ? 0.85 : 1),
    radius: 0.55 * def.scale * (isElite ? 1.15 : 1),
    height: (isFlying ? 1.4 : 1.0) * def.scale,
    flying: isFlying,
    isElite,
    hurtFlash: 0,
    knockback: new THREE.Vector3(),
    contactCd: 0,
    walkPhase: Math.random() * Math.PI * 2,
    mesh: makeEnemyMesh(def),
  };
  if (!isElite) {
    enemy.mesh.traverse(child => {
      if (child.isMesh) child.castShadow = false;
    });
  }
  if (isElite) {
    enemy.mesh.scale.setScalar(1.18);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.06;
    enemy.mesh.add(halo);
    enemy.eliteHalo = halo;
  }
  if (enemy.mesh._isQuaterniusGLB) {
    const _qClips = getQuaterniusClips(enemy.mesh._quaterniusSlug);
    if (_qClips && _qClips.length) {
      enemy.mixer = new THREE.AnimationMixer(enemy.mesh);
      // Quaternius clip naming varies by category:
      //   Big/Blob:  Idle / Walk / Run
      //   Flying:    Flying_Idle / Fast_Flying  (no Walk/Run)
      //   Some:      Bite_Front / Headbutt / Punch as alt actions
      const _qGet = re => _qClips.find(c => re.test(c.name));
      const _idleClip = _qGet(/idle/i) || _qClips[0];
      const _walkClip = _qGet(/^walk/i)
                     || _qGet(/^run/i)
                     || _qGet(/fast.?fly/i)        // Fast_Flying for bees/ghosts/dragons
                     || _qGet(/^fly(?!ing_idle)/i) // any "Fly*" that isn't the idle
                     || _idleClip;
      enemy.idleAction = _idleClip ? enemy.mixer.clipAction(_idleClip) : null;
      enemy.walkAction = _walkClip ? enemy.mixer.clipAction(_walkClip) : null;
      if (enemy.idleAction) enemy.idleAction.play();
      enemy._animState = 'idle';
    }
  } else if (enemy.mesh._isSkeletonGLB && _skelAnimClips) {
    enemy.mixer = new THREE.AnimationMixer(enemy.mesh);
    const _getClip = name => _skelAnimClips.find(c => c.name === name);
    enemy.idleAction = _getClip('Idle_A') ? enemy.mixer.clipAction(_getClip('Idle_A')) : null;
    enemy.walkAction = _getClip('Walking_A') ? enemy.mixer.clipAction(_getClip('Walking_A')) : null;
    if (enemy.idleAction) enemy.idleAction.play();
    enemy._animState = 'idle';
  } else if (!enemy.mesh._isSkeletonGLB) {
    const _glbSlugMap = { goblin:'skeleton_minion', skelly:'skeleton_minion',
                          brute:'skeleton_warrior', warlord:'skeleton_warrior',
                          archer:'skeleton_rogue' };
    const _glbScaleMap = { goblin:0.62, skelly:0.9, brute:1.25, warlord:1.6, archer:0.85 };
    if (_glbSlugMap[def.body]) {
      enemy._pendingGLBSlug  = _glbSlugMap[def.body];
      enemy._pendingGLBScale = _glbScaleMap[def.body];
      // Keep the procedural mesh VISIBLE while the GLB streams in. It used
      // to be hidden, which meant invisible enemies dealing contact damage
      // whenever GLBs were slow or failed (cold cache, mid-deploy 404s).
    }
  }

  const a = Math.random() * Math.PI * 2;
  const dist = 28 + Math.random() * 8;
  enemy.pos.set(player.pos.x + Math.cos(a) * dist, 0, player.pos.z + Math.sin(a) * dist);
  enemy.pos.x = clamp(enemy.pos.x, -CFG.ARENA + 2, CFG.ARENA - 2);
  enemy.pos.z = clamp(enemy.pos.z, -CFG.ARENA + 2, CFG.ARENA - 2);
  enemy.mesh.position.copy(enemy.pos);
  scene.add(enemy.mesh);
  enemies.push(enemy);
}

// ============================================================
// PROJECTILES
// ============================================================
export function spawnProjectile(opts) {
  const proj = Object.assign({
    radius: 0.3,
    pierce: 0,
    lifetime: 2.0,
    homing: 0,
    target: null,
    spinAxis: null,
    knockback: 1.0,
    crit: false,
    aoe: 0,
    isExplosion: false,
  }, opts, {
    pos: opts.pos.clone(),
    vel: opts.vel.clone(),
    hitIds: new Set(),
    age: 0,
  });
  proj.mesh.position.copy(proj.pos);
  scene.add(proj.mesh);
  projectiles.push(proj);

  // ── Tome of Echoes: every Nth projectile fires a free duplicate ──
  // Guard with opts.isEcho so the duplicate doesn't itself echo (no infinite loop).
  // Skip explosions and aura ticks (anything without a real velocity).
  if (!opts.isEcho && player.echoInterval > 0 && proj.vel.lengthSq() > 0.01) {
    player._echoCounter = (player._echoCounter || 0) + 1;
    if (player._echoCounter >= player.echoInterval) {
      player._echoCounter = 0;
      // Re-fire with a fresh mesh clone, tiny offset so it visually reads as a duplicate
      const echoMesh = opts.mesh && opts.mesh.clone ? opts.mesh.clone() : null;
      if (echoMesh) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.4, 0,
          (Math.random() - 0.5) * 0.4
        );
        spawnProjectile({
          ...opts,
          mesh: echoMesh,
          pos: opts.pos.clone().add(offset),
          vel: opts.vel.clone(),
          isEcho: true,
        });
      }
    }
  }
  return proj;
}

export function makePizzaMesh(scale = 1) {
  // Quaternius Food Pack whole pizza when loaded; procedural pie fallback.
  // Verified in-preview (side-by-side flip test): model is authored
  // toppings-up (+Y) — do NOT flip. The "looks upside down" impression at
  // gameplay angle is the dark crust rim reading as the top when viewed
  // near edge-on from the chase camera.
  const glb = _cloneProp('pizza', scale);
  if (glb) return glb;
  const g = new THREE.Group();
  const crustMat = new THREE.MeshPhongMaterial({ color: 0xd4a04a, flatShading: true, shininess: 6 });
  const crustOuter = new THREE.Mesh(
    new THREE.TorusGeometry(0.36 * scale, 0.07 * scale, 6, 16),
    crustMat
  );
  crustOuter.rotation.x = Math.PI / 2;
  g.add(crustOuter);
  const pizzaMat = new THREE.MeshPhongMaterial({ color: 0xc8102e, flatShading: true, shininess: 8 });
  const pizza = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36 * scale, 0.36 * scale, 0.06 * scale, 16),
    pizzaMat
  );
  g.add(pizza);
  const cheeseMat = new THREE.MeshPhongMaterial({ color: 0xf4d27a, shininess: 12 });
  const cheeseSpots = [
    [0.10, 0.05], [-0.18, 0.10], [0.05, -0.20], [-0.10, -0.12], [0.20, -0.05]
  ];
  for (const [cx, cz] of cheeseSpots) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.04 * scale, 6, 5), cheeseMat);
    c.scale.set(1.2, 0.3, 1.2);
    c.position.set(cx * scale, 0.04 * scale, cz * scale);
    g.add(c);
  }
  const pepMat = new THREE.MeshPhongMaterial({ color: 0xa01818, shininess: 12 });
  const pepSpots = [
    [0.15, 0.15], [-0.12, -0.05], [0.0, 0.0], [-0.20, 0.18], [0.18, -0.18]
  ];
  for (const [px, pz] of pepSpots) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055 * scale, 0.055 * scale, 0.018 * scale, 8),
      pepMat
    );
    p.position.set(px * scale, 0.05 * scale, pz * scale);
    g.add(p);
  }
  return g;
}

export function makeBoneMesh(scale = 1) { return makePizzaMesh(scale); }

// Orbit slices — Quaternius Pizza Slice when loaded, whole-pizza fallback.
// Same verification as makePizzaMesh: authored toppings-up, no flip.
export function makePizzaSliceMesh(scale = 1) {
  const glb = _cloneProp('pizza_slice', scale);
  if (glb) return glb;
  return makePizzaMesh(scale);
}

export function makeSparkMesh(color = 0xffd23f, size = 0.3) {
  return new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0),
    new THREE.MeshBasicMaterial({ color })
  );
}

export function makeFireballMesh(scale = 1) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.35 * scale, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff5e1a })
  );
  g.add(core);
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(0.55 * scale, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  g.add(aura);
  return g;
}

export function makeBoomerangMesh(scale = 1) {
  const clone = _cloneWeaponMesh('axe_1handed');
  if (clone) {
    clone.scale.setScalar(0.9 * scale);
    clone.rotation.z = Math.PI / 2;
    clone.traverse(c => { if (c.isMesh) c.castShadow = false; });
    return clone;
  }
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: 0xa01818, shininess: 18 });
  const trim = new THREE.MeshPhongMaterial({ color: 0x441010, shininess: 14 });
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.04 * scale, 0.16 * scale), mat);
  arm1.rotation.y = -Math.PI / 6;
  g.add(arm1);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.04 * scale, 0.16 * scale), mat);
  arm2.rotation.y = Math.PI / 6;
  g.add(arm2);
  const trim1 = new THREE.Mesh(new THREE.BoxGeometry(0.51 * scale, 0.05 * scale, 0.04 * scale), trim);
  trim1.rotation.y = -Math.PI / 6;
  trim1.position.z = 0.06 * scale;
  g.add(trim1);
  const trim2 = trim1.clone();
  trim2.rotation.y = Math.PI / 6;
  g.add(trim2);
  return g;
}

export function makeCalzoneMesh(scale = 1) {
  const g = new THREE.Group();
  const dough = new THREE.MeshPhongMaterial({ color: 0xd4a04a, shininess: 4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.30 * scale, 12, 10), dough);
  body.scale.set(1.0, 0.6, 1.3);
  g.add(body);
  const seam = new THREE.MeshPhongMaterial({ color: 0xb88030, shininess: 6 });
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.30 * scale, 0.04 * scale, 6, 14, Math.PI), seam);
  ridge.rotation.x = -Math.PI / 2;
  ridge.position.y = 0.04 * scale;
  ridge.scale.set(1.0, 1.0, 1.3);
  g.add(ridge);
  const sauceSpot = new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xc8102e }));
  sauceSpot.position.set(0.05 * scale, 0.10 * scale, 0);
  g.add(sauceSpot);
  return g;
}

export function makeIceShardMesh(scale = 1) {
  // Ice Cone weapon finally throws an actual ice cream cone. Shard fallback.
  const glb = _cloneProp('ice_cream', scale);
  if (glb) return glb;
  const g = new THREE.Group();
  const ice = new THREE.MeshPhongMaterial({ color: 0xa8e8ff, shininess: 100, flatShading: true, transparent: true, opacity: 0.85 });
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.32 * scale, 0), ice);
  shard.scale.set(0.6, 1.4, 0.6);
  g.add(shard);
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 * scale, 0),
    new THREE.MeshBasicMaterial({ color: 0xddf4ff, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.scale.set(0.6, 1.4, 0.6);
  g.add(inner);
  return g;
}

// ============================================================
// XP GEMS / GOLD
// ============================================================
export function spawnGem(pos, value) {
  const colorByValue = value >= 5 ? 0xff64c8 : (value >= 3 ? 0xffd23f : 0x42c9f5);
  // Kenney jewel model when loaded — retinted per value tier so the
  // blue/yellow/pink value language carries over. Octahedron fallback.
  let m = _cloneProp('gem');
  if (m) {
    const mat = new THREE.MeshPhongMaterial({ color: colorByValue, flatShading: true, shininess: 80 });
    m.traverse(c => { if (c.isMesh) c.material = mat; });
  } else {
    m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshBasicMaterial({ color: colorByValue })
    );
  }
  m.position.copy(pos);
  m.position.y = groundHeight(pos.x, pos.z) + 0.5;
  scene.add(m);
  const gem = { pos: m.position, mesh: m, value, attracted: false, life: 60, bobOffset: Math.random() * Math.PI * 2 };
  xpGems.push(gem);
  return gem;
}

export function spawnGoldCoin(pos) {
  // KayKit coin model when loaded; flat gold cylinder fallback.
  let m = _cloneProp('coin');
  if (m) {
    m.userData._glbCoin = true; // updateGold spins .y for the upright model
  } else {
    m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.06, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23f })
    );
    m.rotation.x = Math.PI / 2;
  }
  m.position.copy(pos);
  m.position.y = groundHeight(pos.x, pos.z) + 0.5;
  scene.add(m);
  const coin = { pos: m.position, mesh: m, life: 30, bobOffset: Math.random() * Math.PI * 2 };
  goldCoins.push(coin);
  return coin;
}

export function spawnGold(pos) {
  if (Math.random() > 0.15) return null;
  return spawnGoldCoin(pos);
}

// ============================================================
// CHESTS
// ============================================================
// Glow beam + ground ring shared by both chest variants (GLB + procedural)
function _addChestGlow(g, tier) {
  const beamColor = tier === 'rare' ? 0xffd23f : 0x9ed8ff;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.4, 4.5, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.y = 2.5;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.85, 24),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  return { beam, ring };
}

function makeChestMesh(tier) {
  // KayKit Dungeon chest when loaded — chest_gold for rare. The GLTF ships
  // a separate hinged lid node (chest_lid / chest_gold_lid) that rotates at
  // its own origin, so it slots straight into the lidPivot open animation.
  const glb = _cloneProp(tier === 'rare' ? 'chest_gold' : 'chest');
  if (glb) {
    const g = new THREE.Group();
    glb.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    g.add(glb);
    let lidPivot = null;
    glb.traverse(c => { if (!lidPivot && /lid/i.test(c.name)) lidPivot = c; });
    const { beam, ring } = _addChestGlow(g, tier);
    // Fall back to a dummy pivot if the lid node is ever missing so the
    // open animation can't crash — chest just won't visibly open.
    return { mesh: g, lidPivot: lidPivot || new THREE.Group(), beam, ring };
  }

  const g = new THREE.Group();
  const woodColor = tier === 'rare' ? 0x6a3a1c : 0x4a2a14;
  const trimColor = tier === 'rare' ? 0xffd23f : 0xa07a3a;
  const woodMat = new THREE.MeshPhongMaterial({ color: woodColor, flatShading: true, shininess: 4 });
  const trimMat = new THREE.MeshPhongMaterial({ color: trimColor, flatShading: true, shininess: 60 });
  const lockMat = new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 90 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.85), woodMat);
  base.position.y = 0.35;
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);
  for (const dz of [-0.43, 0.43]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.04), trimMat);
    band.position.set(0, 0.35, dz);
    g.add(band);
  }
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.7, -0.42);
  g.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.85), woodMat);
  lid.position.set(0, 0.16, 0.42);
  lid.castShadow = true;
  lidPivot.add(lid);
  for (const dz of [0.0, 0.84]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.06, 0.04), trimMat);
    band.position.set(0, 0.16, dz);
    lidPivot.add(band);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.06), lockMat);
  lock.position.set(0, 0.10, 0.43);
  lidPivot.add(lock);

  const beamColor = tier === 'rare' ? 0xffd23f : 0x9ed8ff;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.4, 4.5, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.y = 2.5;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.85, 24),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);

  return { mesh: g, lidPivot, beam, ring };
}

export function spawnChest(x, z, tier = 'common') {
  const built = makeChestMesh(tier);
  const baseY = groundHeight(x, z);
  built.mesh.position.set(x, baseY, z);
  built.mesh.rotation.y = Math.random() * Math.PI * 2;
  scene.add(built.mesh);
  chests.push({
    pos: built.mesh.position,
    baseY,
    rotY: built.mesh.rotation.y,
    mesh: built.mesh,
    lidPivot: built.lidPivot,
    beam: built.beam,
    ring: built.ring,
    tier,
    opened: false,
    openProgress: 0,
    bobPhase: Math.random() * Math.PI * 2,
  });
}

export function pickChestPosition() {
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * (CFG.ARENA - 16);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 8) continue;
    let ok = true;
    for (const c of chests) {
      if (Math.hypot(c.pos.x - x, c.pos.z - z) < 8) { ok = false; break; }
    }
    if (!ok) continue;
    return { x, z };
  }
  return { x: rand(-30, 30), z: rand(-30, 30) };
}

export function tryInteract() {
  for (const c of chests) {
    if (c.opened) continue;
    const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (d < 2.4) { openChest(c); return; }
  }
}

export function generateChestOffers(tier = 'common') {
  const lvlScale = 1 + player.level * 0.08;
  const isRare = tier === 'rare';

  const pool = [
    {
      kind: 'chest-loot',
      icon: '💰',
      name: 'Bag of Gold',
      desc: `+${Math.round((isRare ? 80 : 40) * lvlScale)} gold`,
      lvlTag: 'TREASURE',
      rarity: isRare ? 'rare' : 'uncommon',
      apply: () => {
        const goldAmount = Math.round((isRare ? 80 : 40) * lvlScale);
        player.gold += goldAmount;
        const c = window.__chestCtx;
        if (c) {
          for (let i = 0; i < Math.min(8, Math.ceil(goldAmount / 10)); i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 0.6 + Math.random() * 1.4;
            spawnGoldCoin(new THREE.Vector3(c.pos.x + Math.cos(ang) * dist, 0.5, c.pos.z + Math.sin(ang) * dist));
          }
        }
      },
    },
    {
      kind: 'chest-loot',
      icon: '❤️',
      name: 'Hot Slice',
      desc: `Restore ${isRare ? 60 : 40}% HP and +${isRare ? 15 : 8} max HP`,
      lvlTag: 'HEAL',
      rarity: isRare ? 'rare' : 'common',
      apply: () => {
        const baseHeal = Math.round(player.maxHp * (isRare ? 0.60 : 0.40));
        const overheal = isRare ? 15 : 8;
        player.maxHp += overheal;
        player.hp = Math.min(player.maxHp, player.hp + baseHeal + overheal);
      },
    },
    {
      kind: 'chest-loot',
      icon: '💎',
      name: 'Gem Cache',
      desc: `Burst of ${isRare ? 18 : 10} XP gems`,
      lvlTag: 'XP',
      rarity: isRare ? 'epic' : 'uncommon',
      apply: () => {
        const c = window.__chestCtx;
        if (!c) return;
        const gemCount = isRare ? 18 : 10;
        const gemValue = isRare ? 4 : 2;
        for (let i = 0; i < gemCount; i++) {
          const ang = (i / gemCount) * Math.PI * 2 + Math.random() * 0.4;
          const dist = 0.8 + Math.random() * 1.6;
          const tx = c.pos.x + Math.cos(ang) * dist;
          const tz = c.pos.z + Math.sin(ang) * dist;
          spawnGem(new THREE.Vector3(tx, 0.6, tz), gemValue);
        }
      },
    },
    {
      kind: 'chest-loot',
      icon: '🛡️',
      name: 'Aegis Buff',
      desc: `+${isRare ? 30 : 18} max shield, fully charged`,
      lvlTag: 'DEFENSE',
      rarity: isRare ? 'rare' : 'uncommon',
      apply: () => {
        const amt = isRare ? 30 : 18;
        player.shieldMax += amt;
        player.shield = player.shieldMax;
      },
    },
    {
      kind: 'chest-loot',
      icon: '⚡',
      name: 'Adrenaline Rush',
      desc: `+${isRare ? 18 : 10}% damage for the rest of the run`,
      lvlTag: 'BUFF',
      rarity: isRare ? 'epic' : 'rare',
      special: true,
      apply: () => {
        player.damageMult *= isRare ? 1.18 : 1.10;
      },
    },
    {
      kind: 'chest-loot',
      icon: '🍀',
      name: 'Lucky Streak',
      desc: '+1 Luck — better drops & rarer offers',
      lvlTag: 'BUFF',
      rarity: isRare ? 'rare' : 'uncommon',
      apply: () => {
        player.luck += 1;
      },
    },
    {
      kind: 'chest-loot',
      icon: '✨',
      name: 'Cooldown Boost',
      desc: `-${isRare ? 12 : 7}% weapon cooldowns`,
      lvlTag: 'BUFF',
      rarity: isRare ? 'epic' : 'rare',
      special: true,
      apply: () => {
        player.cooldownMult *= isRare ? 0.88 : 0.93;
      },
    },
  ];

  const picks = [];
  const indices = pool.map((_, i) => i);
  for (let i = 0; i < 3 && indices.length > 0; i++) {
    const j = Math.floor(Math.random() * indices.length);
    picks.push(pool[indices[j]]);
    indices.splice(j, 1);
  }
  return picks;
}

// Injected by ui.js to break the circular dep
// (openChest needs presentChoiceScreen, but ui.js imports entities.js)
let _presentChoiceScreen = null;
let _mouseLocked = () => false;
let _getRenderer = () => renderer;

export function setOpenChestDeps(deps) {
  if (deps.presentChoiceScreen) _presentChoiceScreen = deps.presentChoiceScreen;
  if (deps.mouseLocked !== undefined) _mouseLocked = deps.mouseLocked;
}

export function openChest(c) {
  if (c.opened) return;
  c.opened = true;
  Audio.play('chest_open');
  c.beam.visible = false;
  c.ring.visible = false;

  const tinyHeal = Math.round(player.maxHp * 0.10);
  player.hp = Math.min(player.maxHp, player.hp + tinyHeal);

  spawnParticle(c.pos.clone().setY(1.2), c.tier === 'rare' ? 0xffd23f : 0x9ed8ff, 18, 9);
  spawnParticle(c.pos.clone().setY(0.6), 0xffd23f, 10, 6);

  gameState.state = 'levelup';
  if (_mouseLocked()) document.exitPointerLock();

  window.__chestCtx = c;

  if (_presentChoiceScreen) {
    _presentChoiceScreen({
      offers: generateChestOffers(c.tier),
      title: c.tier === 'rare' ? 'GOLDEN CHEST' : 'CHEST OPENED',
      canSkip: true,
      allowReroll: true,
      rerollSource: 'chest',
      onPick: (o) => {
        if (typeof o.apply === 'function') o.apply();
        window.__chestCtx = null;
        onChestPickDone();
      },
      onSkip: () => {
        window.__chestCtx = null;
        onChestPickDone();
      },
    });
  }
}

function onChestPickDone() {
  document.getElementById('levelup-screen').classList.add('hidden');
  gameState.state = 'playing';
  if (isMobile()) tryEnterFullscreen();
  // Re-engage pointer lock after a short delay so the card-click event fully
  // unwinds before we capture the mouse. Without the delay the lock can be
  // acquired while the overlay is still in the event stack, causing the cursor
  // to appear trapped on some browsers.
  if (!isMobile()) setTimeout(() => {
    if (gameState.state === 'playing') renderer.domElement.requestPointerLock();
  }, 80);
}

export function updateChests(dt) {
  let nearestOpen = null, nearestDist = Infinity;
  const now = performance.now() * 0.001;
  for (const c of chests) {
    if (!c.opened) {
      const bob = Math.sin(now * 1.4 + c.bobPhase) * 0.06;
      c.mesh.position.y = c.baseY + bob;
      const pulse = 0.35 + Math.sin(now * 2.2 + c.bobPhase) * 0.15;
      c.beam.material.opacity = pulse;
      c.ring.material.opacity = pulse + 0.1;
      c.ring.scale.setScalar(1 + Math.sin(now * 2.0 + c.bobPhase) * 0.08);
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      if (d < 2.4 && d < nearestDist) { nearestOpen = c; nearestDist = d; }
    } else {
      if (c.openProgress < 1) {
        c.openProgress = Math.min(1, c.openProgress + dt * 3);
        c.lidPivot.rotation.x = -c.openProgress * 1.1;
      }
    }
  }
  const prompt = document.getElementById('interact-prompt');
  const mobileBtn = document.getElementById('interact-btn');
  if (nearestOpen && gameState.state === 'playing') {
    if (isMobile()) {
      mobileBtn.classList.remove('hidden');
      prompt.classList.add('hidden');
    } else {
      prompt.classList.remove('hidden');
      mobileBtn.classList.add('hidden');
    }
  } else {
    prompt.classList.add('hidden');
    mobileBtn.classList.add('hidden');
  }
}

// ============================================================
// PARTICLES
// ============================================================
export function spawnParticle(pos, color, count = 6, speed = 6) {
  if (IS_MOBILE_EARLY) count = Math.max(2, Math.floor(count * 0.5));
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.14),
      new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    const s = (0.5 + Math.random()) * speed;
    const vy = 3 + Math.random() * 4;
    scene.add(m);
    particles.push({
      mesh: m,
      vel: new THREE.Vector3(Math.cos(a) * s, vy, Math.sin(a) * s),
      life: 0.6 + Math.random() * 0.3,
    });
  }
}

// ============================================================
// UPDATE FUNCTIONS
// ============================================================
export function updateGems(dt) {
  for (let i = xpGems.length - 1; i >= 0; i--) {
    const g = xpGems[i];
    g.life -= dt;
    if (g.life <= 0) {
      killMesh(g.mesh);
      xpGems.splice(i, 1);
      continue;
    }
    const dx = player.pos.x - g.pos.x, dz = player.pos.z - g.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < player.pickupRange * 4) g.attracted = true;
    if (g.attracted) {
      const pullSpeed = 12 + 28 * Math.max(0, 1 - dist / (player.pickupRange * 4));
      tmp2.set(dx, (player.pos.y + 0.8) - g.pos.y, dz).normalize();
      g.pos.addScaledVector(tmp2, pullSpeed * dt);
    } else {
      g.pos.y = groundHeight(g.pos.x, g.pos.z) + 0.5 + Math.sin(performance.now() * 0.004 + g.bobOffset) * 0.15;
    }
    g.mesh.rotation.y += dt * 3;
    if (dist < 0.8) {
      player.xp += g.value * player.xpGain;
      Audio.play('pickup_xp');
      killMesh(g.mesh);
      xpGems.splice(i, 1);
      if (gameState.state === 'playing' && player.xp >= player.xpToNext) {
        // processPendingLevelUp is in game.js — call via injected callback
        if (_onLevelUpReady) _onLevelUpReady();
      }
    }
  }
}

export function updateGold(dt) {
  for (let i = goldCoins.length - 1; i >= 0; i--) {
    const c = goldCoins[i];
    c.life -= dt;
    if (c.life <= 0) {
      killMesh(c.mesh);
      goldCoins.splice(i, 1);
      continue;
    }
    const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < player.pickupRange) {
      tmp2.set(dx, (player.pos.y + 0.5) - c.pos.y, dz).normalize();
      c.pos.addScaledVector(tmp2, 12 * dt);
    } else {
      c.pos.y = groundHeight(c.pos.x, c.pos.z) + 0.5 + Math.sin(performance.now() * 0.005 + c.bobOffset) * 0.1;
    }
    if (c.mesh.userData._glbCoin) c.mesh.rotation.y += dt * 4;
    else                          c.mesh.rotation.z += dt * 4;
    if (dist < 0.8) {
      player.gold += 1;
      Audio.play('pickup_gold');
      killMesh(c.mesh);
      goldCoins.splice(i, 1);
    }
  }
}

// Callback injected by game.js to handle level-up readiness check
let _onLevelUpReady = null;
export function setOnLevelUpReady(fn) { _onLevelUpReady = fn; }

export function spawnSmokeCloud(pos, dmgPerTick, radius, life, slow, weaponId = null) {
  // Translucent cloud — opacity dropped 0.4 → 0.22 and swapped from additive
  // to normal blending so overlapping clouds don't compound into a screen-blot.
  // Player can still see enemies + projectiles through it even at max stacks.
  const mat = new THREE.MeshBasicMaterial({
    color: 0x889aaa, transparent: true, opacity: 0.22,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), mat);
  mesh.position.copy(pos);
  mesh.position.y = 1.0;
  scene.add(mesh);
  spawnParticle(pos.clone().setY(pos.y + 0.5), 0x889aaa, 14, 6);
  smokeClouds.push({ mesh, pos: pos.clone(), radius, life, maxLife: life, dmgPerTick, tickCd: 0.1, slow, weaponId });
}

export function updateSmokeClouds(dt) {
  for (let i = smokeClouds.length - 1; i >= 0; i--) {
    const c = smokeClouds[i];
    c.life -= dt;
    if (c.life <= 0) {
      killMesh(c.mesh);
      smokeClouds.splice(i, 1);
      continue;
    }
    const t = c.life / c.maxLife;
    const growT = Math.min(1, (1 - t) / 0.2);
    const r = c.radius * (0.3 + 0.7 * growT);
    c.mesh.scale.setScalar(r);
    c.mesh.material.opacity = 0.22 * t; // matches the new translucent baseline
    c.tickCd -= dt;
    if (c.tickCd <= 0) {
      c.tickCd = 0.5;
      for (const e of enemies) {
        if (e.pos.distanceTo(c.pos) < r + 0.5) {
          // damageEnemy is in game.js — use injected callback
          if (_damageEnemy) _damageEnemy(e, c.dmgPerTick, false, c.weaponId);
          if (c.slow) {
            e.slowTimer = Math.max(e.slowTimer || 0, 1.8);
          }
        }
      }
    }
  }
}

// Callback injected by game.js so smoke clouds can damage enemies
let _damageEnemy = null;
export function setDamageEnemyCb(fn) { _damageEnemy = fn; }

export function updateShieldOrbital(dt) {
  const hasShield = player.armor_items && player.armor_items.some(a => a.id === 'shield');
  if (hasShield && player.shieldMax > 0) {
    if (!_shieldOrbitMesh && _weaponAssets.shield_round) {
      _shieldOrbitMesh = _cloneWeaponMesh('shield_round');
      if (_shieldOrbitMesh) {
        _shieldOrbitMesh.traverse(c => {
          if (c.isMesh) {
            c.material = c.material.clone();
            c.material.transparent = true;
            c.castShadow = false;
          }
        });
        scene.add(_shieldOrbitMesh);
      }
    }
    if (_shieldOrbitMesh) {
      _shieldOrbitAngle += dt * 1.1;
      const r = 1.3;
      const ox = Math.cos(_shieldOrbitAngle), oz = Math.sin(_shieldOrbitAngle);
      _shieldOrbitMesh.position.set(
        player.pos.x + ox * r,
        player.pos.y + 0.9,
        player.pos.z + oz * r
      );
      _shieldOrbitMesh.lookAt(
        player.pos.x + ox * 100,
        player.pos.y + 0.9,
        player.pos.z + oz * 100
      );
      _shieldOrbitMesh.rotateX(-Math.PI / 4);
      const opacity = player.shieldMax > 0 ? Math.max(0.12, player.shield / player.shieldMax) : 0.12;
      _shieldOrbitMesh.traverse(c => { if (c.isMesh && c.material) c.material.opacity = opacity; });
    }
  } else if (_shieldOrbitMesh) {
    killMesh(_shieldOrbitMesh);
    _shieldOrbitMesh = null;
  }
}

export function updateAuras(dt) {
  for (let i = auraInstances.length - 1; i >= 0; i--) {
    const a = auraInstances[i];
    a.life -= dt;
    // ── Cheese Whip: container-based arc that scales up while fading out ──
    // Container has no .material so the regular `a.mesh.material.opacity` path
    // would throw. Drive scale + opacity off the dedicated tracked material.
    if (a.cheeseWhip) {
      const progress = 1 - (a.life / a.maxLife);            // 0 → 1
      // Snappy ease-out so the whip "flicks" rather than slow-expands
      const eased = 1 - Math.pow(1 - progress, 2.2);
      const scale = 0.15 + (1.0 - 0.15) * eased;
      a.mesh.scale.setScalar(scale);
      if (a.cheeseMaterial) a.cheeseMaterial.opacity = (1 - progress) * 0.85;
      if (a.life <= 0) {
        killMesh(a.mesh);
        auraInstances.splice(i, 1);
      }
      continue;
    }
    const t = a.life / a.maxLife;
    if (a.expandTo) {
      const r = a.expandTo * (1 - t);
      a.mesh.geometry.dispose();
      a.mesh.geometry = new THREE.RingGeometry(r * 0.9, r, 24);
    }
    a.mesh.material.opacity = t * 0.7;
    if (a.life <= 0) {
      releasePtLight(a.ptLight);
      killMesh(a.mesh);
      auraInstances.splice(i, 1);
    }
  }
}

/** Accessor for game.js updateEnemies — checks if a GLB asset has loaded */
export function hasEnemyAsset(slug) { return !!_enemyAssets[slug]; }
/** Accessor for game.js updateEnemies — returns current skeleton animation clips */
export function getSkelAnimClips() { return _skelAnimClips; }

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      killMesh(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.vel.y -= 18 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.y += dt * 6;
    if (p.mesh.position.y < 0) p.mesh.position.y = 0;
  }
}
