import { scene } from './renderer.js?v=6a59398';

// ============================================================
// HELPERS
// ============================================================
export const tmp = new THREE.Vector3();
export const tmp2 = new THREE.Vector3();
export function rand(a, b) { return a + Math.random() * (b - a); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Recursively free GPU resources for a removed mesh (or group).
export function disposeMesh(mesh) {
  if (!mesh) return;
  mesh.traverse(node => {
    if (node.isMesh) {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          for (const m of node.material) disposeMaterial(m);
        } else {
          disposeMaterial(node.material);
        }
      }
    }
  });
}
export function disposeMaterial(mat) {
  if (!mat || mat.__shared) return;
  for (const k of ['map', 'normalMap', 'specularMap', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'envMap']) {
    if (mat[k] && mat[k].dispose) mat[k].dispose();
  }
  mat.dispose();
}
// Convenience wrapper: remove from scene AND free GPU resources
export function killMesh(mesh) {
  if (!mesh) return;
  if (mesh.parent) mesh.parent.remove(mesh);
  disposeMesh(mesh);
}

// Material helpers
export function flatPhong(color, shininess = 4) {
  return new THREE.MeshPhongMaterial({ color, flatShading: true, shininess });
}
export function smoothPhong(color, shininess = 8) {
  return new THREE.MeshPhongMaterial({ color, shininess });
}
