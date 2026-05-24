import { scene, acquirePtLight, releasePtLight } from './renderer.js?v=a0a6eff';
import { player, enemies, projectiles, orbitals, auraInstances,
         spawnProjectile, spawnParticle, spawnSmokeCloud,
         makeSparkMesh, makeFireballMesh, makeBoomerangMesh,
         makeCalzoneMesh, makeIceShardMesh, makePizzaMesh, makeBoneMesh,
         _cloneWeaponMesh,
         _thunderWandMesh, _thunderWandAngle, set_thunderWandMesh, set_thunderWandAngle,
         _staffMesh, _staffAngle, set_staffMesh, set_staffAngle,
       } from './entities.js?v=a0a6eff';
import { clamp, rand } from './utils.js?v=a0a6eff';
import { cam } from './state.js?v=a0a6eff';

// damageEnemy is injected from game.js (circular dep breaker)
let _damageEnemy = null;
export function setDamageEnemyForWeapons(fn) { _damageEnemy = fn; }
function damageEnemy(e, dmg, crit, srcWeaponId = null) {
  if (_damageEnemy) _damageEnemy(e, dmg, crit, srcWeaponId);
}

// ============================================================
// TARGETING HELPERS
// ============================================================
export function nearestEnemies(pos, count = 3, maxDist = Infinity) {
  const max2 = maxDist * maxDist;
  const found = [];
  for (const e of enemies) {
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < max2) found.push({ e, d });
  }
  found.sort((a, b) => a.d - b.d);
  return found.slice(0, count).map(x => x.e);
}

export function pickTarget(pos, maxDist = Infinity, k = 4, excludeSet = null) {
  const pool = nearestEnemies(pos, k, maxDist);
  const filtered = excludeSet ? pool.filter(e => !excludeSet.has(e)) : pool;
  if (filtered.length === 0) return pool[0] || null;
  const weights = filtered.map((_, i) => filtered.length - i);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < filtered.length; i++) {
    r -= weights[i];
    if (r <= 0) return filtered[i];
  }
  return filtered[0];
}

// ============================================================
// WEAPONS
// ============================================================
export const WEAPONS = {};
function defWeapon(id, def) { WEAPONS[id] = { id, ...def }; }

// 1. PIZZA TOSS
defWeapon('pizza', {
  name: 'Pizza Toss', icon: '🍕',
  desc: 'Hurls a piping-hot pie at the nearest fool.',
  maxLevel: 8,
  init: () => ({ cd: 0, pending: [] }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.bonusProj = 1;
    if (w.level === 3) w.cdMod = 0.85;
    if (w.level === 4) w.dmgMult = 1.3;
    if (w.level === 5) w.bonusProj = 2;
    if (w.level === 6) w.cdMod = 0.7;
    if (w.level === 7) w.dmgMult = 1.6;
    if (w.level === 8) { w.bonusProj = 4; w.dmgMult = 2.0; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+1 pizza', 3:'faster', 4:'+30% dmg', 5:'+1 pizza', 6:'much faster', 7:'+30% dmg', 8:'+2 pizzas, +30% dmg' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    if (w.pending && w.pending.length) {
      for (let i = w.pending.length - 1; i >= 0; i--) {
        w.pending[i].t -= dt;
        if (w.pending[i].t <= 0) {
          firePizzaShot(w, w.pending[i].excludeSet);
          w.pending.splice(i, 1);
        }
      }
    }
    w.cd -= dt;
    if (w.cd > 0) return;
    const baseCd = 0.7 * (w.cdMod || 1) * player.cooldownMult;
    w.cd = baseCd;
    const projCount = 1 + (w.bonusProj || 0) + player.extraProjectiles;
    const excludeSet = new Set();
    for (let i = 0; i < projCount; i++) {
      w.pending.push({ t: i * 0.07, excludeSet });
    }
  },
});

function firePizzaShot(w, excludeSet) {
  const target = pickTarget(player.pos, 30, 5, excludeSet);
  if (!target) return;
  if (excludeSet) excludeSet.add(target);
  const baseDmg = 16 * (w.dmgMult || 1) * player.damageMult;
  const speed = 24;
  const aimY = target.pos.y + target.height * 0.5;
  const start = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
  const aimPoint = new THREE.Vector3(target.pos.x, aimY, target.pos.z);
  const flightTime = aimPoint.distanceTo(start) / speed;
  if (target.vel) {
    aimPoint.x += clamp(target.vel.x * flightTime * 0.8, -2.5, 2.5);
    aimPoint.z += clamp(target.vel.z * flightTime * 0.8, -2.5, 2.5);
  }
  const dir = new THREE.Vector3().subVectors(aimPoint, start).normalize();
  const jitter = (Math.random() - 0.5) * 0.12;
  const cs = Math.cos(jitter), sn = Math.sin(jitter);
  const jx = dir.x * cs - dir.z * sn;
  const jz = dir.x * sn + dir.z * cs;
  dir.set(jx, dir.y, jz).normalize();
  const vel = dir.clone().multiplyScalar(speed);
  const isCrit = Math.random() < player.critChance;
  const dmg = isCrit ? baseDmg * player.critMult : baseDmg;
  const mesh = makePizzaMesh(player.projectileMult);
  const piercesFromSyn = (player.synergies && player.synergies.pizzaPierce) || 0;
  spawnProjectile({
    pos: start, vel, damage: dmg, radius: 0.40 * player.projectileMult,
    pierce: (w.level >= 6 ? 1 : 0) + piercesFromSyn + (player.projectilePierce || 0),
    lifetime: 1.6 * (player.durationMult || 1), mesh, spinAxis: new THREE.Vector3(0, 1, 0),
    knockback: 4, crit: isCrit,
    homing: (player.synergies && player.synergies.pizzaSeek) ? 1.5 : 0,
    target: (player.synergies && player.synergies.pizzaSeek) ? target : null,
    weaponId: w.id,
  });
}

// 2. AURA
defWeapon('aura', {
  name: 'Wallop Aura', icon: '💥',
  desc: 'Slap nearby enemies. Constantly.',
  maxLevel: 7,
  init: () => ({ cd: 0, radius: 3.6, dmg: 9 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.radius += 0.6;
    if (w.level === 3) w.dmg += 4;
    if (w.level === 4) w.cdMod = 0.8;
    if (w.level === 5) w.radius += 0.8;
    if (w.level === 6) w.dmg += 6;
    if (w.level === 7) { w.radius += 1.2; w.dmg += 8; w.cdMod = 0.6; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+0.6 range', 3:'+4 dmg', 4:'faster pulse', 5:'+0.8 range', 6:'+6 dmg', 7:'big upgrade' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 0.6 * (w.cdMod || 1) * player.cooldownMult;
    const r = w.radius * player.projectileMult;
    const dmg = w.dmg * player.damageMult;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.9, r, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(player.pos);
    ring.position.y = 0.1;
    scene.add(ring);
    auraInstances.push({ mesh: ring, life: 0.35, maxLife: 0.35 });
    const rageMult = (player.synergies && player.synergies.auraRage && player.hp / player.maxHp < 0.5) ? 2.0 : 1.0;
    for (const e of enemies) {
      const d = e.pos.distanceTo(player.pos);
      if (d < r + e.radius) {
        if (e.auraCd && e.auraCd > 0) continue;
        const tickCd =
          e.isBoss   ? 1.4 :
          e.isElite  ? 1.0 :
          e.def.body === 'brute' || e.def.body === 'warlord' ? 0.85 :
          e.def.body === 'skelly' ? 0.55 :
          0.0;
        e.auraCd = tickCd;
        const isCrit = Math.random() < player.critChance;
        const finalDmg = (isCrit ? dmg * player.critMult : dmg) * rageMult;
        damageEnemy(e, finalDmg, isCrit, w.id);
        const sizeResist =
          e.isBoss   ? 0.10 :
          e.isElite  ? 0.30 :
          e.def.body === 'brute'   ? 0.40 :
          e.def.body === 'warlord' ? 0.35 :
          e.def.body === 'skelly'  ? 0.70 :
          1.0;
        const currentKb = e.knockback.length();
        const drFactor = Math.max(0.15, 1.0 - currentKb * 0.10);
        const kbMag = 2 * player.knockback * sizeResist * drFactor;
        const dir = new THREE.Vector3().subVectors(e.pos, player.pos).setY(0).normalize();
        e.knockback.add(dir.multiplyScalar(kbMag));
      }
    }
  },
});

// 3. ORBIT
defWeapon('orbit', {
  name: 'Pizza Wheel', icon: '☸️',
  desc: 'Spinning slices of justice orbit around you.',
  maxLevel: 6,
  init: () => ({ cd: 0, count: 2, radius: 2.4, speed: 2.4, dmg: 10 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.count += 1;
    if (w.level === 3) w.dmg += 4;
    if (w.level === 4) { w.count += 1; w.speed += 1; }
    if (w.level === 5) w.dmg += 8;
    if (w.level === 6) { w.count += 2; w.radius += 0.8; w.dmg += 4; }
    rebuildOrbits(w);
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+1 slice', 3:'+4 dmg', 4:'+1 slice, faster', 5:'+8 dmg', 6:'+2 slices, bigger' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    // orbits update in main loop
  },
});

export function rebuildOrbits(w) {
  for (const o of orbitals) {
    if (o.mesh.parent) o.mesh.parent.remove(o.mesh);
  }
  orbitals.length = 0;
  for (let i = 0; i < w.count; i++) {
    const angle = (i / w.count) * Math.PI * 2;
    const m = makeBoneMesh(player.projectileMult * 0.9);
    scene.add(m);
    orbitals.push({
      mesh: m,
      angle,
      hitCd: new Map(),
      weapon: w,
    });
  }
}

// 4. THUNDER STRIKE
defWeapon('thunder', {
  name: 'Thunder Strike', icon: '⚡',
  desc: 'Smites a random enemy. Loudly.',
  maxLevel: 7,
  init: () => ({ cd: 0, dmg: 35 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmg += 10;
    if (w.level === 3) w.cdMod = 0.8;
    if (w.level === 4) w.bolts = 2;
    if (w.level === 5) w.dmg += 15;
    if (w.level === 6) w.bolts = 3;
    if (w.level === 7) { w.bolts = 5; w.dmg += 20; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+10 dmg', 3:'faster', 4:'2 bolts', 5:'+15 dmg', 6:'3 bolts', 7:'5 bolts +20 dmg' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    // Floating wand cosmetic
    if (!_thunderWandMesh) {
      const wAssets = _getWeaponAssets();
      if (wAssets && wAssets.wand) {
        const mesh = _cloneWeaponMesh('wand');
        if (mesh) {
          mesh.scale.setScalar(1.8);
          mesh.traverse(c => { if (c.isMesh) c.castShadow = false; });
          scene.add(mesh);
          set_thunderWandMesh(mesh);
        }
      }
    }
    if (_thunderWandMesh) {
      set_thunderWandAngle(_thunderWandAngle + dt * 1.6);
      const bobY = Math.sin(_thunderWandAngle * 1.2) * 0.12;
      _thunderWandMesh.position.set(
        player.pos.x + Math.sin(_thunderWandAngle) * 1.5,
        player.pos.y + 1.1 + bobY,
        player.pos.z + Math.cos(_thunderWandAngle) * 1.5
      );
      _thunderWandMesh.rotation.y = _thunderWandAngle + Math.PI * 0.5;
      _thunderWandMesh.rotation.z = 0.25;
    }

    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.6 * (w.cdMod || 1) * player.cooldownMult;
    const bolts = w.bolts || 1;
    const seen = new Set();
    for (let b = 0; b < bolts; b++) {
      const list = enemies.filter(e => !seen.has(e) && e.pos.distanceTo(player.pos) < 22);
      if (list.length === 0) break;
      const target = list[Math.floor(Math.random() * list.length)];
      seen.add(target);
      const lineGeo = new THREE.CylinderGeometry(0.12, 0.12, 18, 6);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff04a, blending: THREE.AdditiveBlending, depthWrite: false });
      const bolt = new THREE.Mesh(lineGeo, lineMat);
      bolt.position.copy(target.pos);
      bolt.position.y = 9;
      scene.add(bolt);
      const boltLight = acquirePtLight(0xfff04a, 3.0, 12);
      if (boltLight) boltLight.light.position.set(target.pos.x, target.pos.y + 1, target.pos.z);
      auraInstances.push({ mesh: bolt, life: 0.18, maxLife: 0.18, ptLight: boltLight });
      const isCrit = Math.random() < player.critChance + 0.1;
      const dmg = (isCrit ? w.dmg * player.critMult : w.dmg) * player.damageMult;
      damageEnemy(target, dmg, isCrit, w.id);
      spawnParticle(target.pos.clone().setY(target.pos.y + 1), 0xfff04a, 12, 8);
    }
  },
});

// 5. GROUND POUND / SHOCKWAVE
defWeapon('shock', {
  name: 'Ground Pound', icon: '🌀',
  desc: 'Shockwaves erupt from your feet.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 30, radius: 5 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.radius += 1.0;
    if (w.level === 3) w.dmg += 10;
    if (w.level === 4) w.cdMod = 0.75;
    if (w.level === 5) w.radius += 1.5;
    if (w.level === 6) { w.dmg += 20; w.radius += 1.0; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+1 range', 3:'+10 dmg', 4:'faster', 5:'+1.5 range', 6:'big upgrade' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 3.0 * (w.cdMod || 1) * player.cooldownMult;
    const r = w.radius * player.projectileMult;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.6, 28),
      new THREE.MeshBasicMaterial({ color: 0x42c9f5, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(player.pos);
    ring.position.y = 0.1;
    scene.add(ring);
    auraInstances.push({ mesh: ring, life: 0.45, maxLife: 0.45, expandTo: r });
    const dmg = w.dmg * player.damageMult;
    for (const e of enemies) {
      const d = e.pos.distanceTo(player.pos);
      if (d < r + e.radius) {
        const isCrit = Math.random() < player.critChance;
        const finalDmg = isCrit ? dmg * player.critMult : dmg;
        damageEnemy(e, finalDmg, isCrit, w.id);
        const dir = new THREE.Vector3().subVectors(e.pos, player.pos).setY(0).normalize();
        e.knockback.add(dir.multiplyScalar(8 * player.knockback));
      }
    }
    spawnParticle(player.pos, 0x42c9f5, 14, 9);
  },
});

// 6. FIREBALL
defWeapon('fire', {
  name: 'Fireball', icon: '🔥',
  desc: 'Slow homing ball of pain. Explodes.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 32, aoe: 2.5, pending: [] }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmg += 10;
    if (w.level === 3) w.aoe += 0.6;
    if (w.level === 4) w.cdMod = 0.8;
    if (w.level === 5) w.dmg += 14;
    if (w.level === 6) { w.aoe += 1.0; w.dmg += 14; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+10 dmg', 3:'+0.6 aoe', 4:'faster', 5:'+14 dmg', 6:'big upgrade' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    if (w.pending && w.pending.length) {
      for (let i = w.pending.length - 1; i >= 0; i--) {
        w.pending[i].t -= dt;
        if (w.pending[i].t <= 0) {
          fireFireballShot(w, w.pending[i].excludeSet);
          w.pending.splice(i, 1);
        }
      }
    }
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 2.0 * (w.cdMod || 1) * player.cooldownMult;
    const projCount = 1 + (player.extraProjectiles || 0);
    const excludeSet = new Set();
    for (let i = 0; i < projCount; i++) {
      w.pending.push({ t: i * 0.15, excludeSet });
    }
  },
});

function fireFireballShot(w, excludeSet) {
  const target = pickTarget(player.pos, 32, 4, excludeSet);
  if (!target) return;
  if (excludeSet) excludeSet.add(target);
  const start = player.pos.clone().add(new THREE.Vector3(0, 1, 0));
  const aimY = target.pos.y + target.height * 0.5;
  const aim = new THREE.Vector3(target.pos.x, aimY, target.pos.z);
  const dir = new THREE.Vector3().subVectors(aim, start).normalize();
  const isCrit = Math.random() < player.critChance;
  const dmg = isCrit ? w.dmg * player.critMult : w.dmg;
  const mesh = makeFireballMesh(player.projectileMult);
  const proj = spawnProjectile({
    pos: start, vel: dir.multiplyScalar(11), damage: dmg * player.damageMult,
    radius: 0.45 * player.projectileMult,
    lifetime: 3.0 * (player.durationMult || 1), mesh,
    homing: 4.0, target, knockback: 6, crit: isCrit,
    aoe: w.aoe * player.projectileMult * (player.aoeMult || 1), isExplosion: false,
    weaponId: w.id,
  });
  const fireLight = acquirePtLight(0xff5e1a, 2.5, 10);
  if (fireLight) { fireLight.light.position.copy(proj.pos); proj.ptLight = fireLight; }
}

// 7. PEPPERONI BOOMERANG
defWeapon('boomerang', {
  name: 'Pepperoni Boomerang', icon: '🪃',
  desc: 'Pierces through enemies, then comes back.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 12 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.cdMod = 0.85;
    if (w.level === 3) w.dmg += 6;
    if (w.level === 4) w.bonusProj = 1;
    if (w.level === 5) w.dmg += 10;
    if (w.level === 6) { w.bonusProj = 2; w.dmg += 8; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'faster', 3:'+6 dmg', 4:'+1 boomerang', 5:'+10 dmg', 6:'+1 boomerang, +8 dmg' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.8 * (w.cdMod || 1) * player.cooldownMult;
    const projCount = 1 + (w.bonusProj || 0) + player.extraProjectiles;
    for (let i = 0; i < projCount; i++) {
      const target = pickTarget(player.pos, 22, 5);
      let dir;
      if (target) {
        const aimY = target.pos.y + target.height * 0.5;
        const start = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
        dir = new THREE.Vector3(target.pos.x - start.x, aimY - start.y, target.pos.z - start.z).normalize();
      } else {
        const a = (i / projCount) * Math.PI * 2 + Math.random() * 0.5;
        dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      }
      const spread = (i - (projCount - 1) / 2) * 0.25;
      const cs = Math.cos(spread), sn = Math.sin(spread);
      const dx = dir.x * cs - dir.z * sn;
      const dz = dir.x * sn + dir.z * cs;
      dir.set(dx, dir.y, dz).normalize();
      const start = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
      const isCrit = Math.random() < player.critChance;
      const baseDmg = w.dmg * player.damageMult;
      const dmg = isCrit ? baseDmg * player.critMult : baseDmg;
      const boomStart = start.clone();
      const boomDir = dir.clone().normalize();
      spawnProjectile({
        pos: start, vel: boomDir.clone().multiplyScalar(18), damage: dmg,
        radius: 0.45 * player.projectileMult,
        pierce: 999,
        lifetime: 2.2 * (player.durationMult || 1),
        mesh: makeBoomerangMesh(player.projectileMult),
        spinAxis: new THREE.Vector3(0, 1, 0),
        knockback: 3, crit: isCrit,
        boomerang: true, owner: 'player',
        boomerangAge: 0,
        boomStart, boomDir,
        hitCooldown: new Map(),
        weaponId: w.id,
      });
    }
  },
});

// 8b. CROSSBOW BOLT
defWeapon('crossbow', {
  name: 'Crossbow Bolt', icon: '🏹',
  desc: 'Fires a fast arrow at the nearest enemy. No homing — pure skill shot.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 28, pierce: 1, count: 1 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.pierce++;
    if (w.level === 3) w.dmg += 15;
    if (w.level === 4) w.count = 2;
    if (w.level === 5) w.cdMod = 0.75;
    if (w.level === 6) { w.count = 3; w.dmg += 20; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+1 pierce', 3:'+15 dmg', 4:'2 arrows', 5:'faster reload', 6:'3-arrow fan +20 dmg' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.4 * (w.cdMod || 1) * player.cooldownMult;
    const target = pickTarget(player.pos, 24, 5);
    const count = (w.count || 1) + player.extraProjectiles;
    const start = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    for (let i = 0; i < count; i++) {
      let dir;
      if (target) {
        dir = new THREE.Vector3(target.pos.x - start.x, 0, target.pos.z - start.z).normalize();
      } else {
        const a = (i / Math.max(count, 1)) * Math.PI * 2;
        dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      }
      if (count > 1) {
        const spread = (i - (count - 1) / 2) * 0.3;
        const cs = Math.cos(spread), sn = Math.sin(spread);
        const nx = dir.x * cs - dir.z * sn;
        const nz = dir.x * sn + dir.z * cs;
        dir.set(nx, dir.y, nz).normalize();
      }
      const arrowMesh = (() => {
        const clone = _cloneWeaponMesh('arrow_crossbow');
        if (clone) {
          clone.scale.setScalar(1.2);
          clone.rotation.x = Math.PI / 2;
          clone.rotation.y = Math.atan2(dir.x, dir.z);
          clone.traverse(c => { if (c.isMesh) c.castShadow = false; });
          return clone;
        }
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6),
          new THREE.MeshPhongMaterial({ color: 0x8b5c2a, shininess: 10 })
        );
        shaft.rotation.z = Math.PI / 2;
        g.add(shaft);
        return g;
      })();
      const isCrit = Math.random() < player.critChance;
      const dmg = (isCrit ? w.dmg * player.critMult : w.dmg) * player.damageMult;
      spawnProjectile({
        pos: start.clone(), vel: dir.clone().multiplyScalar(22),
        damage: dmg, radius: 0.22 * player.projectileMult,
        pierce: w.pierce + (player.projectilePierce || 0),
        lifetime: 1.4 * (player.durationMult || 1),
        mesh: arrowMesh, crit: isCrit, knockback: 4, owner: 'player',
        weaponId: w.id,
      });
    }
  },
});

// 8c. SMOKE BOMB
defWeapon('smoke', {
  name: 'Smoke Bomb', icon: '💨',
  desc: 'Lobs a bomb that bursts into a toxic cloud on landing.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 8, radius: 3.5, life: 3.0, count: 1 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.radius += 1.5;
    if (w.level === 3) w.dmg += 6;
    if (w.level === 4) w.count = 2;
    if (w.level === 5) w.life += 2.0;
    if (w.level === 6) { w.slow = true; w.dmg += 8; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'bigger cloud', 3:'+6 dmg/tick', 4:'2 bombs', 5:'longer cloud', 6:'cloud slows enemies +8 dmg' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 3.2 * (w.cdMod || 1) * player.cooldownMult;
    const count = (w.count || 1) + player.extraProjectiles;
    const nearby = nearestEnemies(player.pos, Math.max(count + 2, 4), 22);
    for (let i = 0; i < count; i++) {
      let targetPos;
      const tgt = nearby[i % Math.max(nearby.length, 1)];
      if (tgt) {
        targetPos = tgt.pos.clone();
        if (i > 0) {
          const ang = (i / count) * Math.PI * 2;
          targetPos.x += Math.cos(ang) * 2.0;
          targetPos.z += Math.sin(ang) * 2.0;
        }
      } else {
        const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
        targetPos = new THREE.Vector3(player.pos.x + fx * (8 + i * 2), 0, player.pos.z + fz * (8 + i * 2));
      }
      const start = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
      const dx = targetPos.x - start.x, dz = targetPos.z - start.z;
      let horizDist = Math.hypot(dx, dz);
      if (horizDist < 0.5) {
        const ang = Math.random() * Math.PI * 2;
        targetPos.x = start.x + Math.cos(ang) * 4;
        targetPos.z = start.z + Math.sin(ang) * 4;
        horizDist = 4;
      }
      const arcTime = 1.0, gravity = 22;
      const horizSpeed = horizDist / arcTime;
      const vy = (targetPos.y - start.y + 0.5 * gravity * arcTime * arcTime) / arcTime;
      const vx = ((targetPos.x - start.x) / horizDist) * horizSpeed;
      const vz = ((targetPos.z - start.z) / horizDist) * horizSpeed;
      const bombMesh = (() => {
        const clone = _cloneWeaponMesh('smokebomb');
        if (clone) {
          clone.scale.setScalar(0.8);
          clone.traverse(c => { if (c.isMesh) c.castShadow = false; });
          return clone;
        }
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
          new THREE.MeshPhongMaterial({ color: 0x333344, shininess: 20 })));
        return g;
      })();
      spawnProjectile({
        pos: start, vel: new THREE.Vector3(vx, vy, vz),
        damage: 0, radius: 0.3,
        pierce: 999,
        lifetime: arcTime + 0.05, mesh: bombMesh, gravity,
        smokeOnExpire: true,
        smokeDmg: w.dmg, smokeRadius: w.radius * (player.aoeMult || 1),
        smokeLife: w.life * (player.durationMult || 1),
        smokeSlow: w.slow || false,
        spinAxis: new THREE.Vector3(1, 0.5, 0),
        owner: 'player', knockback: 0,
        weaponId: w.id,
      });
    }
  },
});

// 8d. BONE STAFF
defWeapon('staff', {
  name: 'Bone Staff', icon: '🦴',
  desc: 'Channels bone magic. Fires slow homing bolts that track nearby enemies.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 22, count: 1 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmg += 12;
    if (w.level === 3) w.count = 2;
    if (w.level === 4) w.cdMod = 0.8;
    if (w.level === 5) w.dmg += 18;
    if (w.level === 6) { w.count = 3; w.dmg += 12; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+12 dmg', 3:'2 bolts', 4:'faster', 5:'+18 dmg', 6:'3 bolts +12 dmg' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    if (!_staffMesh) {
      const clone = _cloneWeaponMesh('wand');
      if (clone) {
        clone.scale.setScalar(0.9);
        clone.traverse(c => { if (c.isMesh) c.castShadow = false; });
        scene.add(clone);
        set_staffMesh(clone);
      }
    }
    if (_staffMesh) {
      set_staffAngle(_staffAngle + dt * 1.6);
      const bobY = Math.sin(_staffAngle * 1.3) * 0.09;
      _staffMesh.position.set(
        player.pos.x + Math.sin(_staffAngle) * 0.5,
        player.pos.y + 1.65 + bobY,
        player.pos.z + Math.cos(_staffAngle) * 0.5
      );
      _staffMesh.rotation.y = _staffAngle + Math.PI;
      _staffMesh.rotation.z = 0.4;
    }

    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 2.0 * (w.cdMod || 1) * player.cooldownMult;
    const count = (w.count || 1) + player.extraProjectiles;
    const start = player.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    for (let i = 0; i < count; i++) {
      const target = pickTarget(player.pos, 26, 5);
      let dir;
      if (target) {
        dir = new THREE.Vector3(target.pos.x - start.x, 0, target.pos.z - start.z).normalize();
      } else {
        const a = (i / Math.max(count, 1)) * Math.PI * 2 + (w.cd * 0.4);
        dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      }
      if (count > 1) {
        const spread = (i - (count - 1) / 2) * 0.5;
        const cs = Math.cos(spread), sn = Math.sin(spread);
        dir.set(dir.x * cs - dir.z * sn, dir.y, dir.x * sn + dir.z * cs).normalize();
      }
      const boltMesh = (() => {
        const g = new THREE.Group();
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xaa66ff, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(orb);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(core);
        return g;
      })();
      const isCrit = Math.random() < player.critChance;
      const dmg = (isCrit ? w.dmg * player.critMult : w.dmg) * player.damageMult;
      spawnProjectile({
        pos: start.clone(), vel: dir.clone().multiplyScalar(9),
        damage: dmg, radius: 0.3 * player.projectileMult,
        pierce: 0, lifetime: 3.0 * (player.durationMult || 1),
        mesh: boltMesh, crit: isCrit, knockback: 3, owner: 'player',
        homing: true, spinAxis: new THREE.Vector3(0, 1, 0),
        weaponId: w.id,
      });
    }
  },
});

// 8. CALZONE BOMB
defWeapon('calzone', {
  name: 'Calzone Bomb', icon: '🥟',
  desc: 'Lobs a calzone in an arc. Boom.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 38, aoe: 3.0 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmg += 12;
    if (w.level === 3) w.aoe += 0.8;
    if (w.level === 4) w.cdMod = 0.8;
    if (w.level === 5) w.dmg += 16;
    if (w.level === 6) { w.aoe += 1.2; w.bonusProj = 1; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+12 dmg', 3:'+0.8 aoe', 4:'faster', 5:'+16 dmg', 6:'+1 calzone, bigger' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 2.6 * (w.cdMod || 1) * player.cooldownMult;
    const projCount = 1 + (w.bonusProj || 0) + player.extraProjectiles;
    const nearby = nearestEnemies(player.pos, Math.max(projCount + 2, 6), 22);
    for (let i = 0; i < projCount; i++) {
      let target = nearby[i % nearby.length];
      let targetPos;
      if (target) {
        targetPos = target.pos.clone();
        if (i > 0) {
          const ang = (i / projCount) * Math.PI * 2;
          targetPos.x += Math.cos(ang) * 1.8;
          targetPos.z += Math.sin(ang) * 1.8;
        }
      } else {
        const fx = -Math.sin(cam.yaw);
        const fz = -Math.cos(cam.yaw);
        const range = 8 + i * 2;
        targetPos = new THREE.Vector3(
          player.pos.x + fx * range,
          0,
          player.pos.z + fz * range
        );
      }
      const start = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
      const dx = targetPos.x - start.x;
      const dz = targetPos.z - start.z;
      let horizDist = Math.hypot(dx, dz);
      if (horizDist < 0.5) {
        const ang = Math.random() * Math.PI * 2;
        targetPos.x = start.x + Math.cos(ang) * 4;
        targetPos.z = start.z + Math.sin(ang) * 4;
        horizDist = 4;
      }
      const arcTime = 0.9;
      const horizSpeed = horizDist / arcTime;
      const gravity = 22;
      const vy = (targetPos.y - start.y + 0.5 * gravity * arcTime * arcTime) / arcTime;
      const vx = ((targetPos.x - start.x) / horizDist) * horizSpeed;
      const vz = ((targetPos.z - start.z) / horizDist) * horizSpeed;
      const isCrit = Math.random() < player.critChance;
      const dmg = (isCrit ? w.dmg * player.critMult : w.dmg) * player.damageMult;
      spawnProjectile({
        pos: start, vel: new THREE.Vector3(vx, vy, vz),
        damage: dmg, radius: 0.4 * player.projectileMult,
        lifetime: arcTime + 0.05,
        mesh: makeCalzoneMesh(player.projectileMult),
        crit: isCrit, knockback: 8,
        gravity,
        explodeOnExpire: true,
        aoe: w.aoe * player.projectileMult * (player.aoeMult || 1),
        spinAxis: new THREE.Vector3(0, 1, 0),
        weaponId: w.id,
      });
    }
  },
});

// 9. ICE CONE
defWeapon('ice', {
  name: 'Ice Cone', icon: '🧊',
  desc: 'Frosty shards slow enemies on hit.',
  maxLevel: 6,
  init: () => ({ cd: 0, dmg: 14, count: 5 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmg += 6;
    if (w.level === 3) w.count += 2;
    if (w.level === 4) w.cdMod = 0.85;
    if (w.level === 5) w.dmg += 10;
    if (w.level === 6) { w.count += 3; w.dmg += 6; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    const map = { 1:'unlock', 2:'+6 dmg', 3:'+2 shards', 4:'faster', 5:'+10 dmg', 6:'+3 shards' };
    return map[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.5 * (w.cdMod || 1) * player.cooldownMult;
    const count = w.count + (player.extraProjectiles || 0);
    const target = pickTarget(player.pos, 30, 5);
    const facing = target
      ? new THREE.Vector3(target.pos.x - player.pos.x, 0, target.pos.z - player.pos.z).normalize()
      : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    const start = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    const baseDmg = w.dmg * player.damageMult;
    const coneSpread = Math.PI / 3;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
      const ang = t * coneSpread;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      const dx = facing.x * cs - facing.z * sn;
      const dz = facing.x * sn + facing.z * cs;
      const dir = new THREE.Vector3(dx, 0.05, dz).normalize();
      const isCrit = Math.random() < player.critChance;
      const dmg = isCrit ? baseDmg * player.critMult : baseDmg;
      spawnProjectile({
        pos: start.clone(), vel: dir.multiplyScalar(20),
        damage: dmg, radius: 0.32 * player.projectileMult,
        pierce: 1,
        lifetime: 0.55 * (player.durationMult || 1),
        mesh: makeIceShardMesh(player.projectileMult),
        crit: isCrit, knockback: 2,
        slowOnHit: true,
        weaponId: w.id,
      });
    }
  },
});

// ============================================================
// ARMOR
// ============================================================
export const ARMOR = {};
function defArmor(id, def) { ARMOR[id] = { id, ...def }; }

defArmor('plate', {
  name: 'Chest Plate', icon: '🛡️',
  desc: 'Reduces incoming damage by a flat amount.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: a => {
    a.level++;
    player.armor += a.level === 1 ? 4 : 3;
  },
  describeNext: a => {
    const lvl = (a?.level || 0) + 1;
    return lvl === 1 ? '+4 armor' : '+3 armor';
  },
});

defArmor('helmet', {
  name: 'Helmet', icon: '⛑️',
  desc: 'Chance to completely avoid a hit.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level++;
    player.dodgeChance = (player.dodgeChance || 0) + 0.06;
  },
  describeNext: a => '+6% dodge chance',
});

defArmor('shield', {
  name: 'Kinetic Shield', icon: '💠',
  desc: 'Energy shield absorbs hits before HP, then regenerates.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: a => {
    a.level++;
    player.shieldMax += a.level === 1 ? 25 : 18;
    player.shield = player.shieldMax;
  },
  describeNext: a => {
    const lvl = (a?.level || 0) + 1;
    return lvl === 1 ? '+25 shield' : '+18 shield';
  },
});

defArmor('vamp', {
  name: 'Vampire Amulet', icon: '🩸',
  desc: 'Recover HP based on damage dealt.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level++;
    player.lifesteal += 0.025;
  },
  describeNext: a => '+2.5% lifesteal',
});

defArmor('boots', {
  name: 'Running Shoes', icon: '👟',
  desc: 'Move faster. Higher levels grant double jump.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level++;
    player.baseSpeed *= 1.10;
    if (a.level === 3) player.maxJumps = 2;
    if (a.level === 4) player.dashCdMult = (player.dashCdMult || 1) * 0.7;
  },
  describeNext: a => {
    const lvl = (a?.level || 0) + 1;
    if (lvl === 3) return '+10% speed, double jump';
    if (lvl === 4) return '+10% speed, faster dash';
    return '+10% move speed';
  },
});

defArmor('thorns', {
  name: 'Thorn Gauntlets', icon: '🌵',
  desc: 'Attackers take damage when they hit you.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level++;
    player.thorns = (player.thorns || 0) + 6;
  },
  describeNext: a => '+6 thorn damage',
});

// ============================================================
// TOMES
// ============================================================
export const TOMES = {};
function defTome(id, def) { TOMES[id] = { id, ...def }; }

defTome('power', {
  name: 'Tome of Power', icon: '📕',
  desc: 'Massively boosts damage with each level.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => { t.level++; player.damageMult += 0.15; },
  describeNext: () => '+15% damage',
});

defTome('swift', {
  name: 'Tome of Swiftness', icon: '📒',
  desc: 'Weapons fire faster.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => { t.level++; player.cooldownMult *= 0.90; },
  describeNext: () => '-10% cooldowns',
});

defTome('fortune', {
  name: 'Tome of Fortune', icon: '📗',
  desc: 'Improves drop quality (Luck).',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => { t.level++; player.luck += 1; },
  describeNext: () => '+1 Luck',
});

defTome('wisdom', {
  name: 'Tome of Wisdom', icon: '📘',
  desc: 'Gain extra XP from gems.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => { t.level++; player.xpGain *= 1.20; },
  describeNext: () => '+20% XP gain',
});

defTome('spectral', {
  name: 'Tome of Reach', icon: '📙',
  desc: 'Larger projectiles, bigger AOE, more pierce.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: t => {
    t.level++;
    player.projectileMult *= 1.10;
    player.aoeMult *= 1.10;
    if (t.level === 3) player.projectilePierce += 1;
  },
  describeNext: t => {
    const lvl = (t?.level || 0) + 1;
    if (lvl === 3) return '+10% projectile size & AOE, +1 pierce';
    return '+10% projectile size & AOE';
  },
});

defTome('warding', {
  name: 'Tome of Warding', icon: '📓',
  desc: 'Increases max HP and HP regeneration.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => {
    t.level++;
    player.maxHp += 18;
    player.hp = Math.min(player.maxHp, player.hp + 18);
    player.hpRegen += 0.5;
  },
  describeNext: () => '+18 max HP, +0.5 HP/sec regen',
});

defTome('hunter', {
  name: "Hunter's Tome", icon: '📔',
  desc: 'Sharper aim — more crits, harder crits.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => { t.level++; player.critChance += 0.05; player.critMult += 0.15; },
  describeNext: () => '+5% crit chance, +0.15× crit dmg',
});

defTome('cursed', {
  name: 'Cursed Tome', icon: '💀',
  desc: 'Enemies hit harder, but drops improve dramatically.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: t => { t.level++; player.curse += 1; },
  describeNext: () => '+1 Curse',
});

// Tome of Echoes — every Nth projectile fires a free duplicate.
// Smaller N = more frequent echoes.  N: 10 → 8 → 6 → 4 → 3
defTome('tome_of_echoes', {
  name: 'Tome of Echoes', icon: '📜',
  desc: 'Every Nth projectile fires a free duplicate. More frequent at higher levels.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => {
    t.level++;
    const intervals = [10, 8, 6, 4, 3];
    player.echoInterval = intervals[Math.min(t.level - 1, intervals.length - 1)];
  },
  describeNext: t => {
    const lvl = (t?.level || 0) + 1;
    const intervals = [10, 8, 6, 4, 3];
    const n = intervals[Math.min(lvl - 1, intervals.length - 1)];
    return `Every ${n}th projectile echoes`;
  },
});

// Tome of Time — slows ALL enemies briefly when you take damage.
// Duration and slow strength both improve per level.
defTome('tome_of_time', {
  name: 'Tome of Time', icon: '⏳',
  desc: 'When you take damage, all enemies are slowed briefly.',
  maxLevel: 5,
  init: () => ({ }),
  upgrade: t => {
    t.level++;
    // Duration: 1.0 → 1.5 → 2.0 → 2.0 → 2.5 sec
    // Slow mult: 0.60 → 0.55 → 0.50 → 0.40 → 0.30 (lower = slower)
    const durs  = [1.0, 1.5, 2.0, 2.0, 2.5];
    const mults = [0.60, 0.55, 0.50, 0.40, 0.30];
    player.timeSlowDur  = durs[Math.min(t.level - 1, durs.length - 1)];
    player.timeSlowMult = mults[Math.min(t.level - 1, mults.length - 1)];
  },
  describeNext: t => {
    const lvl = (t?.level || 0) + 1;
    const durs  = [1.0, 1.5, 2.0, 2.0, 2.5];
    const mults = [0.60, 0.55, 0.50, 0.40, 0.30];
    const d = durs[Math.min(lvl - 1, durs.length - 1)];
    const m = mults[Math.min(lvl - 1, mults.length - 1)];
    return `${d.toFixed(1)}s slow at ${Math.round((1 - m) * 100)}%`;
  },
});

// ============================================================
// CHARACTER-UNIQUE WEAPONS
// ============================================================

// Pizza Hero unique: massive slow pizza, pierces all
defWeapon('deep_dish', {
  name: 'Deep Dish', icon: '🍕',
  desc: 'Pizza Hero exclusive. A massive slow pizza that pierces every enemy it touches.',
  maxLevel: 6,
  init: () => ({ cd: 0 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.4;
    if (w.level === 3) w.cdMod = 0.82;
    if (w.level === 4) w.dmgMult = 1.8;
    if (w.level === 5) { w.sizeMult = 1.6; }
    if (w.level === 6) w.dmgMult = 2.5;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+40% dmg', 3:'faster', 4:'+30% dmg', 5:'bigger pizza', 6:'+40% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 3.8 * (w.cdMod || 1) * player.cooldownMult;
    const t = pickTarget(player.pos, 30);
    if (!t) return;
    const dmg = Math.round(60 * (w.dmgMult || 1) * player.damageMult);
    const sz = (w.sizeMult || 1) * 1.9 * player.projectileMult;
    const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const mesh = makePizzaMesh(); mesh.scale.setScalar(sz);
    spawnProjectile({ pos: player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), vel: new THREE.Vector3(dx/d * 5.5, 0, dz/d * 5.5),
      damage: dmg, radius: sz * 0.4,
      pierce: 99, lifetime: 2.8, mesh, spinAxis: new THREE.Vector3(0, 1, 0), knockback: 5,
      weaponId: w.id });
  },
});

// Frost Baker unique: ice storm aura — slows + damages
defWeapon('blizzard', {
  name: 'Blizzard', icon: '🌨️',
  desc: 'Frost Baker exclusive. Ice storm swirls around you, slowing and damaging nearby enemies.',
  maxLevel: 6,
  init: () => ({ cd: 0, radius: 4.5 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = (w.dmgMult || 1) * 1.25;
    if (w.level === 3) w.radius += 1.2;
    if (w.level === 4) w.dmgMult = (w.dmgMult || 1) * 1.3;
    if (w.level === 5) w.radius += 1.2;
    if (w.level === 6) w.dmgMult = (w.dmgMult || 1) * 1.5;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+25% dmg', 3:'+1.2 radius', 4:'+30% dmg', 5:'+1.2 radius', 6:'+50% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 0.45;
    const radius = (w.radius || 4.5) * player.aoeMult;
    const dmg = Math.round(10 * (w.dmgMult || 1) * player.damageMult);
    const r2 = radius * radius;
    for (const e of enemies) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      if (dx*dx + dz*dz < r2) {
        damageEnemy(e, dmg, false, w.id);
        e.slowTimer = Math.max(e.slowTimer || 0, 2.0 * player.durationMult);
        e.slowMult = Math.min(e.slowMult || 1, 0.38);
        spawnParticle(e.pos.clone().setY(0.8), 0x88ccff, 2, 2.5);
      }
    }
  },
});

// Oven Knight unique: ground slam AOE
defWeapon('forge_hammer', {
  name: 'Forge Hammer', icon: '🔨',
  desc: 'Oven Knight exclusive. Slams the ground, blasting all nearby enemies with force.',
  maxLevel: 6,
  init: () => ({ cd: 0 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.35;
    if (w.level === 3) w.radiusMult = 1.3;
    if (w.level === 4) w.dmgMult = 1.7;
    if (w.level === 5) w.radiusMult = 1.6;
    if (w.level === 6) w.dmgMult = 2.3;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+35% dmg', 3:'+30% radius', 4:'+25% dmg', 5:'+25% radius', 6:'+35% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 2.4 * player.cooldownMult;
    const radius = 4.5 * (w.radiusMult || 1) * player.aoeMult;
    const dmg = Math.round(70 * (w.dmgMult || 1) * player.damageMult);
    const r2 = radius * radius;
    spawnParticle(player.pos.clone().setY(0.1), 0xff6600, 20, radius * 0.8);
    for (const e of enemies) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const d2 = dx*dx + dz*dz;
      if (d2 < r2) {
        damageEnemy(e, dmg, Math.random() < player.critChance, w.id);
        const kd = Math.sqrt(d2) || 1;
        e.knockback.add(new THREE.Vector3((dx/kd) * 6 * player.knockback, 0, (dz/kd) * 6 * player.knockback));
      }
    }
  },
});

// Crust Runner unique: fan of stars in all directions
defWeapon('star_shower', {
  name: 'Star Shower', icon: '⭐',
  desc: 'Crust Runner exclusive. Fires pepperoni stars in all directions that pierce enemies.',
  maxLevel: 6,
  init: () => ({ cd: 0, starCount: 8 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.3;
    if (w.level === 3) w.starCount += 4;
    if (w.level === 4) w.dmgMult = 1.6;
    if (w.level === 5) w.starCount += 4;
    if (w.level === 6) w.dmgMult = 2.0;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+30% dmg', 3:'+4 stars', 4:'+25% dmg', 5:'+4 stars', 6:'+25% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.4 * player.cooldownMult;
    const count = (w.starCount || 8) + (player.extraProjectiles || 0);
    const dmg = Math.round(22 * (w.dmgMult || 1) * player.damageMult);
    const pierce = 1 + (player.projectilePierce || 0);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 14;
      const mesh = makePizzaMesh(); mesh.scale.setScalar(0.35 * player.projectileMult);
      spawnProjectile({ pos: player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
        vel: new THREE.Vector3(Math.sin(angle)*speed, 0, Math.cos(angle)*speed),
        damage: dmg, radius: 0.2 * player.projectileMult,
        pierce, lifetime: 1.3, mesh, spinAxis: new THREE.Vector3(0, 1, 0), knockback: 2,
        weaponId: w.id });
    }
  },
});

// Anchovy Archer unique: spinning thrown axe that pierces deeply and returns
defWeapon('tomahawk_anchovy', {
  name: 'Tomahawk Anchovy', icon: '🪓',
  desc: 'Anchovy Archer exclusive. A spinning thrown axe with massive pierce. Crit-focused.',
  maxLevel: 6,
  init: () => ({ cd: 0, count: 1, pierce: 4, dmgMult: 1 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.3;
    if (w.level === 3) w.pierce += 2;
    if (w.level === 4) w.count = 2;
    if (w.level === 5) w.dmgMult = 1.7;
    if (w.level === 6) { w.count = 3; w.pierce += 3; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+30% dmg', 3:'+2 pierce', 4:'2 axes', 5:'+40% dmg', 6:'3 axes, +3 pierce' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.8 * (w.cdMod || 1) * player.cooldownMult;
    const target = pickTarget(player.pos, 28, 6);
    const count = (w.count || 1) + (player.extraProjectiles || 0);
    const start = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    for (let i = 0; i < count; i++) {
      let dir;
      if (target) {
        dir = new THREE.Vector3(target.pos.x - start.x, 0, target.pos.z - start.z).normalize();
      } else {
        const a = (i / Math.max(count, 1)) * Math.PI * 2;
        dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      }
      if (count > 1) {
        const spread = (i - (count - 1) / 2) * 0.28;
        const cs = Math.cos(spread), sn = Math.sin(spread);
        const nx = dir.x * cs - dir.z * sn;
        const nz = dir.x * sn + dir.z * cs;
        dir.set(nx, 0, nz).normalize();
      }
      // Use cached axe_1handed.glb if available, fall back to a simple group
      let mesh = _cloneWeaponMesh('axe_1handed');
      if (mesh) {
        mesh.scale.setScalar(0.9 * player.projectileMult);
      } else {
        mesh = new THREE.Group();
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.05, 0.5),
          new THREE.MeshPhongMaterial({ color: 0x8899aa, flatShading: true })
        );
        mesh.add(blade);
      }
      const isCrit = Math.random() < player.critChance;
      const dmg = (isCrit ? 32 * player.critMult : 32) * (w.dmgMult || 1) * player.damageMult;
      spawnProjectile({
        pos: start.clone(), vel: dir.clone().multiplyScalar(18),
        damage: dmg, radius: 0.32 * player.projectileMult,
        pierce: (w.pierce || 4) + (player.projectilePierce || 0),
        lifetime: 1.6 * (player.durationMult || 1),
        mesh, crit: isCrit, knockback: 3, owner: 'player',
        spinAxis: new THREE.Vector3(0, 1, 0),
        weaponId: w.id,
      });
    }
  },
});

// Stealth Slice unique: ring of shadow daggers that orbit briefly then fly outward
defWeapon('shadow_slice', {
  name: 'Shadow Slice', icon: '🌑',
  desc: 'Stealth Slice exclusive. Conjures shadow daggers that orbit you, then strike outward.',
  maxLevel: 6,
  init: () => ({ cd: 0, count: 4, dmgMult: 1 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.3;
    if (w.level === 3) w.count += 2;
    if (w.level === 4) w.dmgMult = 1.6;
    if (w.level === 5) w.count += 2;
    if (w.level === 6) w.dmgMult = 2.2;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+30% dmg', 3:'+2 daggers', 4:'+30% dmg', 5:'+2 daggers', 6:'+60% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 2.6 * player.cooldownMult;
    const count = (w.count || 4) + (player.extraProjectiles || 0);
    // Always-crit daggers (Stealth Slice's signature)
    const baseDmg = 35 * (w.dmgMult || 1) * player.damageMult;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 16;
      const mesh = new THREE.Group();
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.05, 0.55),
        new THREE.MeshPhongMaterial({ color: 0x222244, emissive: 0x6633aa, emissiveIntensity: 0.6, flatShading: true })
      );
      mesh.add(blade);
      mesh.scale.setScalar(player.projectileMult);
      const isCrit = true; // signature crit
      const dmg = baseDmg * player.critMult;
      spawnProjectile({
        pos: player.pos.clone().add(new THREE.Vector3(Math.sin(angle) * 1.2, 1.0, Math.cos(angle) * 1.2)),
        vel: new THREE.Vector3(Math.sin(angle) * speed, 0, Math.cos(angle) * speed),
        damage: dmg, radius: 0.18 * player.projectileMult,
        pierce: 2 + (player.projectilePierce || 0),
        lifetime: 1.2 * (player.durationMult || 1),
        mesh, crit: isCrit, knockback: 2, owner: 'player',
        weaponId: w.id,
      });
    }
    spawnParticle(player.pos.clone().setY(1.0), 0x6633aa, 12, 2.0);
  },
});

// ============================================================
// SLICE-UNLOCKABLE WEAPONS
// ============================================================

// Rapid-fire meatball spray
defWeapon('meatball_minigun', {
  name: 'Meatball Minigun', icon: '🍝',
  desc: 'Rapid-fire meatballs that pierce one enemy. Low damage, very high rate of fire.',
  maxLevel: 6,
  init: () => ({ cd: 0, burstLeft: 0, burstTimer: 0 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.2;
    if (w.level === 3) w.cdMod = 0.82;
    if (w.level === 4) w.burstBonus = 2;
    if (w.level === 5) w.dmgMult = 1.5;
    if (w.level === 6) { w.burstBonus = 4; w.dmgMult = 1.8; }
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+20% dmg', 3:'faster', 4:'+2 burst', 5:'+25% dmg', 6:'+2 burst, +20% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    // Burst logic: fire a burst of shots then cooldown
    if (w.burstLeft > 0) {
      w.burstTimer -= dt;
      if (w.burstTimer <= 0) {
        w.burstTimer = 0.09;
        w.burstLeft--;
        const t = pickTarget(player.pos, 28);
        if (t) {
          const dmg = Math.round(10 * (w.dmgMult || 1) * player.damageMult);
          const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const spread = (Math.random() - 0.5) * 0.25;
          const mesh = makeBoneMesh(); mesh.scale.setScalar(0.28);
          mesh.material = mesh.material.clone();
          mesh.material.color.setHex(0xcc4400);
          spawnProjectile({ pos: player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
            vel: new THREE.Vector3((dx/d + spread)*18, 0.1, (dz/d + spread)*18),
            damage: dmg, radius: 0.22,
            pierce: 1 + (player.projectilePierce || 0), lifetime: 1.0, mesh, knockback: 2,
            weaponId: w.id });
        }
      }
      return;
    }
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.6 * (w.cdMod || 1) * player.cooldownMult;
    w.burstLeft = 6 + (w.burstBonus || 0) + (player.extraProjectiles || 0);
    w.burstTimer = 0;
  },
});

// Wide arc cheese melee
defWeapon('cheese_whip', {
  name: 'Cheese Whip', icon: '🧀',
  desc: 'A stretchy cheese arc that hits ALL enemies in a wide cone in front of you.',
  maxLevel: 6,
  init: () => ({ cd: 0 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.3;
    if (w.level === 3) w.arcMult = 1.3;
    if (w.level === 4) w.dmgMult = 1.65;
    if (w.level === 5) w.arcMult = 1.6;
    if (w.level === 6) w.dmgMult = 2.1;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+30% dmg', 3:'+30% range', 4:'+25% dmg', 5:'+25% range', 6:'+25% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 1.7 * player.cooldownMult;
    const range = 5.5 * (w.arcMult || 1) * player.aoeMult;
    const dmg = Math.round(45 * (w.dmgMult || 1) * player.damageMult);
    // Get player facing direction from camera
    const fwd = new THREE.Vector3();
    // Use cam yaw from state since we have access to cam
    fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).normalize();
    const r2 = range * range;
    spawnParticle(player.pos.clone().add(fwd.clone().multiplyScalar(range * 0.5)).setY(1), 0xffee00, 12, range * 0.6);
    for (const e of enemies) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const d2 = dx*dx + dz*dz;
      if (d2 > r2) continue;
      const dist = Math.sqrt(d2) || 1;
      const ex = dx / dist, ez = dz / dist;
      const dot = ex * fwd.x + ez * fwd.z;
      if (dot > -0.5) { // ~240-degree arc (front + sides)
        damageEnemy(e, dmg, Math.random() < player.critChance, w.id);
      }
    }
  },
});

// Slow powerful piercing beam
defWeapon('olive_railgun', {
  name: 'Olive Railgun', icon: '🫒',
  desc: 'High-charge beam that fires through EVERY enemy in a line. Devastating.',
  maxLevel: 6,
  init: () => ({ cd: 0 }),
  upgrade: w => {
    w.level++;
    if (w.level === 2) w.dmgMult = 1.4;
    if (w.level === 3) w.cdMod = 0.85;
    if (w.level === 4) w.dmgMult = 1.8;
    if (w.level === 5) w.cdMod = 0.72;
    if (w.level === 6) w.dmgMult = 2.4;
  },
  describeNext: w => {
    const n = (w?.level || 0) + 1;
    return { 1:'unlock', 2:'+40% dmg', 3:'faster charge', 4:'+30% dmg', 5:'much faster', 6:'+35% dmg' }[n] || 'maxed';
  },
  tick: (w, dt) => {
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 3.5 * (w.cdMod || 1) * player.cooldownMult;
    const t = pickTarget(player.pos, 35);
    if (!t) return;
    const dmg = Math.round(120 * (w.dmgMult || 1) * player.damageMult);
    const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    // Instant raycast: hit all enemies along the line
    const nx = dx/d, nz = dz/d;
    for (const e of enemies) {
      const ex = e.pos.x - player.pos.x, ez = e.pos.z - player.pos.z;
      const proj = ex*nx + ez*nz;
      if (proj < 0) continue;
      const perp = Math.abs(ex*nz - ez*nx);
      if (perp < 1.2 * player.aoeMult) {
        damageEnemy(e, dmg, Math.random() < player.critChance * 2, w.id);
      }
    }
    // Visual: fire a fast thin spark projectile for effect
    const mesh = makeSparkMesh(); mesh.scale.set(0.2, 0.2, 3.0);
    mesh.material = mesh.material.clone(); mesh.material.color.setHex(0x44ff44);
    spawnProjectile({ pos: player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
      vel: new THREE.Vector3(nx*30, 0, nz*30), damage: 0,
      radius: 0.1, pierce: 99, lifetime: 0.8, mesh, knockback: 0 });
    spawnParticle(player.pos.clone().setY(1.2), 0x44ff44, 8, 2);
  },
});

// ============================================================
// CHARACTER-UNIQUE ARMORS
// ============================================================

// Pizza Hero unique: XP range + knockback resist
defArmor('delivery_bag', {
  name: 'Delivery Bag', icon: '🎒',
  desc: 'Pizza Hero exclusive. Boosts XP pickup range and reduces knockback taken.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.pickupRange += 1.8;
    if (a.level === 2) player.pickupRange += 0.7;
    if (a.level === 3) player.pickupRange += 0.7;
    if (a.level === 4) player.pickupRange += 1.0;
    player.knockResist = Math.min(0.7, (player.knockResist || 0) + 0.18);
  },
  describeNext: a => {
    const n = (a?.level || 0) + 1;
    return { 1:'+XP range, +18% knock resist', 2:'+XP range, +18%', 3:'+XP range, +18%', 4:'+XP range, +16%' }[n] || 'maxed';
  },
});

// Frost Baker unique: ice shield that absorbs damage and slows attackers on break
defArmor('frost_shell', {
  name: 'Frost Shell', icon: '❄️',
  desc: 'Frost Baker exclusive. Ice shield absorbs damage and slows attackers on break.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    const gain = 35;
    player.shieldMax += gain; player.shield = Math.min(player.shield + gain, player.shieldMax);
    player.frostThorns = (player.frostThorns || 0) + 1;
  },
  describeNext: a => {
    const n = (a?.level || 0) + 1;
    return n <= 4 ? '+35 ice shield, slows attackers' : 'maxed';
  },
});

// Oven Knight unique: heavy flat armor + berserker trigger
defArmor('iron_hide', {
  name: 'Iron Hide', icon: '🪨',
  desc: 'Oven Knight exclusive. Massive flat armor. Below 30% HP: +50% damage, knockback immune.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.armor += 3;
    player.hasBerserker = true;
  },
  describeNext: a => {
    const n = (a?.level || 0) + 1;
    return n <= 4 ? '+3 armor, berserker rage below 30% HP' : 'maxed';
  },
});

// Crust Runner unique: speed boost + dash deals damage
defArmor('turbo_soles', {
  name: 'Turbo Soles', icon: '🏃',
  desc: 'Crust Runner exclusive. Dashing deals damage to nearby enemies and restores HP.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.baseSpeed *= 1.08;
    player.dashCdMult *= 0.9;
    player.turboDash = (player.turboDash || 0) + 1;
  },
  describeNext: a => {
    const n = (a?.level || 0) + 1;
    return n <= 4 ? '+8% speed, -10% dash cd, dash deals 40 dmg' : 'maxed';
  },
});

// Anchovy Archer unique: pure offense — crit chance, crit damage, pierce
defArmor('snipers_cloak', {
  name: "Sniper's Cloak", icon: '🎯',
  desc: 'Anchovy Archer exclusive. Boosts crit chance, crit damage, and projectile pierce.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.critChance += 0.06;
    player.critMult   += 0.20;
    if (a.level === 2 || a.level === 4) player.projectilePierce = (player.projectilePierce || 0) + 1;
  },
  describeNext: a => {
    const n = (a?.level || 0) + 1;
    const pierceBit = (n === 2 || n === 4) ? ', +1 pierce' : '';
    return n <= 4 ? `+6% crit, +20% crit dmg${pierceBit}` : 'maxed';
  },
});

// Stealth Slice unique: evasive lifesteal — dodge chance + lifesteal + speed when low HP
defArmor('phantom_hood', {
  name: 'Phantom Hood', icon: '👤',
  desc: 'Stealth Slice exclusive. Dodge chance and lifesteal. Speed boost when below 40% HP.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.dodgeChance += 0.05;
    player.lifesteal   += 0.03;
    player.hasPhantomDash = true;
  },
  describeNext: a => {
    const n = (a?.level || 0) + 1;
    return n <= 4 ? '+5% dodge, +3% lifesteal, low-HP speed boost' : 'maxed';
  },
});

// ============================================================
// SLICE-UNLOCKABLE ARMORS
// ============================================================

// Reflects damage back to attacker
defArmor('mirror_vest', {
  name: 'Mirror Vest', icon: '🪞',
  desc: 'Reflects incoming damage back to the attacker.',
  maxLevel: 4,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.thorns = (player.thorns || 0) + 8; // 8 thorn damage per level
  },
  describeNext: a => '+8 thorn damage reflected',
});

// One-time revive with explosion
defArmor('phoenix_apron', {
  name: 'Phoenix Apron', icon: '🔥',
  desc: 'Once per run: survive a lethal hit at 30% HP with a fiery shockwave.',
  maxLevel: 1,
  init: () => ({ }),
  upgrade: a => {
    a.level = (a.level || 0) + 1;
    player.phoenixRevive = true;
  },
  describeNext: a => (a?.level || 0) >= 1 ? 'maxed' : 'phoenix revive on death',
});

// Placeholder: _getWeaponAssets helper (avoids importing private _weaponAssets from entities.js)
// Thunder and Staff weapon ticks check for wand asset readiness. We use _cloneWeaponMesh which
// returns null if not yet loaded, so no special access needed.
function _getWeaponAssets() { return null; } // unused — _cloneWeaponMesh handles null internally
