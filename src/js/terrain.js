import { CFG } from './config.js?v=afde0b8';
import { scene } from './renderer.js?v=afde0b8';
import { ARENAS } from './profile.js?v=afde0b8';

// ============================================================
// TERRAIN / GROUND
// ============================================================
// Helper: parse '#rrggbb' hex into [r,g,b] 0-255 ints
function _hex2rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function _rgbStr(r, g, b, a) {
  return `rgba(${r|0},${g|0},${b|0},${a})`;
}
// Build a ground texture in the arena's color palette.  Same procedural
// pattern as the original forest texture but tinted to whatever palette
// the arena defines.  Re-callable at runtime.
function makeGroundTexture(groundCfg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = groundCfg.base;
  ctx.fillRect(0, 0, 512, 512);
  // Darker accent splotches
  const accent1 = _hex2rgb(groundCfg.accent1);
  const accent2 = _hex2rgb(groundCfg.accent2);
  const accent3 = _hex2rgb(groundCfg.accent3);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 6 + Math.random() * 22;
    const pick = Math.floor(Math.random() * 3);
    const rgb = pick === 0 ? accent1 : pick === 1 ? accent2 : accent3;
    ctx.fillStyle = _rgbStr(rgb[0], rgb[1], rgb[2], 0.45);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // Tiny grass/needle blade flecks tinted toward accent1
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const jr = (Math.random() - 0.5) * 30;
    const jg = (Math.random() - 0.5) * 30;
    const jb = (Math.random() - 0.5) * 20;
    ctx.fillStyle = _rgbStr(accent1[0] + jr, accent1[1] + jg, accent1[2] + jb, 0.4 + Math.random() * 0.4);
    ctx.fillRect(x, y, 2, 4);
  }
  // Dark grit pixels
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = `rgba(60,40,20,${Math.random() * 0.18})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(38, 38);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

// Ground plane grid parameters
export const _MESH_SUBDIVS  = 100;
export const _MESH_SIZE     = CFG.ARENA * 8;
export const _MESH_HALF     = _MESH_SIZE / 2;
export const _MESH_SPACING  = _MESH_SIZE / _MESH_SUBDIVS;

const groundGeo = new THREE.PlaneGeometry(CFG.ARENA * 8, CFG.ARENA * 8, 100, 100);

// Terrain height zones
export const TERRAIN_INNER = CFG.ARENA - 8;
export const TERRAIN_BLEND = CFG.ARENA + 10;

export function terrainHeight(x, z) {
  const dist = Math.hypot(x, z);

  const SPAWN_FLAT = 14;
  let hills = 0;
  if (dist > SPAWN_FLAT) {
    const t  = Math.min(1, (dist - SPAWN_FLAT) / 18);
    const ib = t * t;
    hills = ib * (
      Math.sin(x * 0.090 + 0.70) * Math.cos(z * 0.080 - 0.50) * 2.2 +
      Math.sin(x * 0.150 - 1.40) * Math.cos(z * 0.130 + 0.80) * 1.0 +
      Math.sin(x * 0.270 + 0.20) * Math.cos(z * 0.240 - 1.20) * 0.4
    );
  }

  let edge = 0;
  if (dist > TERRAIN_INNER) {
    let blend = Math.min(1, (dist - TERRAIN_INNER) / (TERRAIN_BLEND - TERRAIN_INNER));
    blend *= blend;
    edge = blend * (2.2 + Math.sin(x * 0.06 + z * 0.05) * 0.9);
  }

  return hills + edge;
}

// Displace ground vertices
{
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = -pos.getY(i);
    pos.setZ(i, terrainHeight(x, z));
  }
  groundGeo.computeVertexNormals();
}

// Snapshot every displaced vertex height into a flat array
export const _GROUND_HEIGHTS = new Float32Array((_MESH_SUBDIVS + 1) * (_MESH_SUBDIVS + 1));
{
  const gpos = groundGeo.attributes.position;
  for (let i = 0; i < gpos.count; i++) _GROUND_HEIGHTS[i] = gpos.getZ(i);
}

const groundMat = new THREE.MeshPhongMaterial({ map: makeGroundTexture(ARENAS.pepperoni_pines.ground), shininess: 0, flatShading: true });
export const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Swap the ground texture for the given arena.  Disposes the old texture
// to avoid GPU leaks (this matters because we're called every resetGame).
export function setTerrainArena(arenaSlug) {
  const a = ARENAS[arenaSlug] || ARENAS.pepperoni_pines;
  if (groundMat.map && groundMat.map.dispose) groundMat.map.dispose();
  groundMat.map = makeGroundTexture(a.ground);
  groundMat.needsUpdate = true;
}

// Hills, ramps, platforms — verticality
export const obstacles = [];

// Solid props with horizontal collision
export const solidProps = [];

export function addSolid(x, z, radius) {
  const s = { x, z, radius };
  solidProps.push(s);
  return s;
}

export function resolveSolids(x, z, agentRadius = 0.5) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const s of solidProps) {
      const dx = x - s.x;
      const dz = z - s.z;
      const minD = s.radius + agentRadius;
      if (dx > minD || dx < -minD || dz > minD || dz < -minD) continue;
      const dist = Math.hypot(dx, dz);
      if (dist < minD) {
        if (dist < 1e-4) {
          x = s.x + minD;
        } else {
          const push = (minD - dist) / dist;
          x += dx * push;
          z += dz * push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}

export function addHill(x, z, radius, height, color = 0x5a9a4a) {
  const geo = new THREE.SphereGeometry(radius, 14, 10);
  const mat = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0 });
  const m = new THREE.Mesh(geo, mat);
  const variation = (Math.random() - 0.5) * 0.06;
  mat.color.offsetHSL(0, 0, variation);
  m.scale.y = (height / radius) * 0.85;
  m.position.set(x, -radius * 0.15, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  addSolid(x, z, radius * 0.85);
}

export function addPlatform(x, z, w, d, h, color = 0x6a5a3e) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  obstacles.push({ type: 'box', x, z, w, d, h, mesh: m });
}

export function addRamp(x, z, w, d, h, rotY = 0, color = 0x88673e) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 0 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.rotation.set(0.25, rotY, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
}

// Bilinear interpolation of ground height at world (wx, wz)
function _meshTerrainHeight(wx, wz) {
  const stride = _MESH_SUBDIVS + 1;
  const gx = (wx + _MESH_HALF) / _MESH_SPACING;
  const gz = (wz + _MESH_HALF) / _MESH_SPACING;
  const ix = Math.floor(gx), tx = gx - ix;
  const iz = Math.floor(gz), tz = gz - iz;
  const i0 = Math.max(0, Math.min(_MESH_SUBDIVS, ix));
  const i1 = Math.min(_MESH_SUBDIVS, i0 + 1);
  const j0 = Math.max(0, Math.min(_MESH_SUBDIVS, iz));
  const j1 = Math.min(_MESH_SUBDIVS, j0 + 1);
  const h00 = _GROUND_HEIGHTS[j0 * stride + i0];
  const h10 = _GROUND_HEIGHTS[j0 * stride + i1];
  const h01 = _GROUND_HEIGHTS[j1 * stride + i0];
  const h11 = _GROUND_HEIGHTS[j1 * stride + i1];
  return h00 * (1 - tx) * (1 - tz)
       + h10 *      tx  * (1 - tz)
       + h01 * (1 - tx) *      tz
       + h11 *      tx  *      tz;
}

// Get height of ground at (x, z) — collision-safe, matches the rendered mesh.
export function groundHeight(x, z) {
  let h = _meshTerrainHeight(x, z);
  for (const o of obstacles) {
    if (o.type === 'box') {
      if (Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) {
        if (o.h > h) h = o.h;
      }
    }
  }
  return h;
}
