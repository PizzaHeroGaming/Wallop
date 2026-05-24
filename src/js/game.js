// game.js — core game logic: damageEnemy, update loop, player movement, spawning
// Imports (acyclic — game.js is the top of the dep graph among game modules):
import { scene, camera, renderer, composer, sun, clock, isMobile, tryEnterFullscreen, releasePtLight, setRendererArena } from './renderer.js?v=7ce2e7d';
import {
  player,
  playerMixer, playerIdleAction, playerWalkAction, playerRunAction,
  _applyCharacterModel,
  _cloneWeaponMesh, _cloneEnemyMesh,
  hasEnemyAsset, getSkelAnimClips,
  enemies, projectiles, enemyProjectiles, orbitals, xpGems, goldCoins,
  auraInstances, chests, particles, smokeClouds,
  _thunderWandMesh, _shieldOrbitMesh, _staffMesh,
  set_thunderWandMesh, set_shieldOrbitMesh, set_staffMesh,
  _thunderWandAngle, _staffAngle, _shieldOrbitAngle,
  set_thunderWandAngle, set_staffAngle, set_shieldOrbitAngle,
  spawnEnemy, spawnParticle, spawnGem, spawnGoldCoin, spawnChest, pickChestPosition,
  updateGems, updateGold, updateChests, updateAuras, updateSmokeClouds,
  updateShieldOrbital, updateParticles,
  setDamageEnemyCb, setOnLevelUpReady,
  spawnGold, spawnSmokeCloud, makeEnemyMesh, ENEMY_DEFS,
} from './entities.js?v=7ce2e7d';
import { WEAPONS, ARMOR, TOMES, setDamageEnemyForWeapons, rebuildOrbits } from './weapons.js?v=7ce2e7d';
import {
  gameState, cam,
} from './state.js?v=7ce2e7d';
import { CFG, STAGE_MULTS, DIFFICULTIES } from './config.js?v=7ce2e7d';
import { Profile, ARENAS } from './profile.js?v=7ce2e7d';
import { groundHeight, resolveSolids, setTerrainArena } from './terrain.js?v=7ce2e7d';
import { setWorldArena } from './world.js?v=7ce2e7d';
import { killMesh, clamp, rand, tmp, tmp2, flatPhong } from './utils.js?v=7ce2e7d';
import {
  showDamage, showAlert, updateBossArrow, updateLoadoutDisplay,
  syncSliceDisplays, triggerGameOver,
  showLevelUp, processPendingLevelUp, onLevelUpDone,
  damagePlayer,
  openPauseMenu, closePauseMenu,
  keys, joystickInput, camJoystickInput,
  applyCameraJoystick, tickHUD,
  setDamageEnemyForUI, setResetGameCb, setJumpDashCbs, setCallBossCb,
  initUI,
  addCameraShake,
} from './ui.js?v=7ce2e7d';

// Player animation state (module-level so it persists across frames)
let _animState = 'idle';

// ============================================================
// DAMAGE / KILL
// ============================================================
export function damageEnemy(e, dmg, crit = false, srcWeaponId = null) {
  let final = dmg;
  if (e.isBoss && final > 80) final = 80 + (final - 80) * 0.55;
  e.hp -= final;
  e.hurtFlash = 0.12;
  showDamage(e.pos, Math.round(final), crit);
  if (e.isBoss && e.hp > 0) {
    const pct = e.hp / e.maxHp;
    if (e.bossPhase < 1 && pct <= 0.5) {
      e.bossPhase = 1;
      triggerBossPhase(e, 'ENRAGED');
    } else if (e.bossPhase < 2 && pct <= 0.25) {
      e.bossPhase = 2;
      triggerBossPhase(e, 'DESPERATE');
    }
  }
  if (player.lifesteal > 0) {
    player.hp = Math.min(player.maxHp, player.hp + final * player.lifesteal);
  }
  if (crit) addCameraShake(0.15);
  if (e.hp <= 0) killEnemy(e, srcWeaponId);
}

export function killEnemy(e, srcWeaponId = null) {
  if (e.isBoss) {
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      spawnGem(e.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)), 5);
    }
    const totalGold = Math.round((e.goldDrop || 50) * (player.goldMult || 1));
    player.gold += totalGold;
    const coinCount = Math.min(20, Math.ceil(totalGold / 4));
    for (let i = 0; i < coinCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 1.0 + Math.random() * 2.5;
      spawnGoldCoin(e.pos.clone().add(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist)));
    }
    spawnParticle(e.pos.clone().setY(2), 0xffd23f, 30, 12);
    spawnParticle(e.pos.clone().setY(0.5), 0xff3864, 20, 10);
    if (e.sliceDrop && e.sliceDrop > 0) {
      // Apply stage + difficulty bonus to slice reward
      const sm = STAGE_MULTS[gameState.stage]  || STAGE_MULTS[1];
      const dm = DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal;
      const rawMult = Math.min(sm.sliceBonus * dm.sliceBonus, 4.0); // cap at 4× to keep economy sane
      const totalSlices = Math.round(e.sliceDrop * rawMult);
      Profile.addSlices(totalSlices);
      gameState.slicesEarned = (gameState.slicesEarned || 0) + totalSlices;
      const bonusNote = totalSlices !== e.sliceDrop ? ` (×${rawMult.toFixed(1)})` : '';
      showAlert(`+${totalSlices} 🍕 SLICES${bonusNote}`, '#ffd23f');
      syncSliceDisplays();
    }
    if (e.bossTier === 'final') {
      // Track per-arena per-stage progress (legacy clearStage kept in sync inside).
      Profile.recordStageClear(gameState.arena, gameState.stage);
      Profile.clearStage(gameState.stage);
      if (gameState.stage === 3) {
        // Full arena clear — record best difficulty + unlock next arena if Normal+.
        const newlyUnlocked = Profile.recordArenaClear(gameState.arena, gameState.difficulty);
        if (newlyUnlocked) {
          const nextDef = ARENAS[newlyUnlocked];
          setTimeout(() => showAlert(`🔓 ${(nextDef?.name || newlyUnlocked).toUpperCase()} UNLOCKED!`, '#ffd23f'), 4400);
        }
      }
      if (gameState.stage < 3) {
        // Not the last stage — advance to next stage instead of showing victory.
        // IMPORTANT: clean up boss entity here before returning so subsequent
        // weapon-hit frames cannot re-enter killEnemy with this same entity.
        gameState.bossSpawned = false; // prevent win condition from triggering
        const completedStage = gameState.stage;
        const nextStage = gameState.stage + 1;
        gameState.stage = nextStage;
        setTimeout(() => showAlert(`STAGE ${completedStage} COMPLETE! 🏆`, '#ffd23f'), 800);
        setTimeout(() => showAlert(`ADVANCING TO STAGE ${nextStage}…`, '#42f5a1'), 1900);
        setTimeout(() => advanceStage(), 3200);
        // Clean up boss mesh + array entry NOW (before return)
        if (e.mixer) { e.mixer.stopAllAction(); e.mixer = null; }
        killMesh(e.mesh);
        const bossIdx = enemies.indexOf(e);
        if (bossIdx >= 0) enemies.splice(bossIdx, 1);
        gameState.kills++;
        if (KILL_MILESTONES.has(gameState.kills)) showAlert(`${gameState.kills} KILLS!`, '#42f5a1');
        if (srcWeaponId) Profile.addItemKill(srcWeaponId);
        for (const a of player.armor_items) Profile.addItemKill(a.id);
        return; // skip the normal BOSS DOWN banner
      }
      // Stage 3 final kill — win condition in update() will fire triggerGameOver(true)
    }
    const bannerText = e.bossTier === 'final' ? 'BOSS DOWN — YOU WIN!' : `${e.def.name} DEFEATED`;
    setTimeout(() => showAlert(bannerText, '#42f5a1'), e.sliceDrop ? 800 : 0);
  } else if (e.isElite) {
    spawnGem(e.pos.clone().setY(0), 5);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      spawnGem(e.pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7)), 3);
    }
    for (let i = 0; i < 2; i++) {
      spawnGoldCoin(e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2)));
    }
    spawnParticle(e.pos.clone().setY(0.5), 0xffd23f, 14, 7);
  } else {
    spawnGem(e.pos.clone().setY(0), e.def.xp);
    spawnGold(e.pos.clone());
  }
  if (player.curse > 0 && !e.isBoss && !e.isElite && Math.random() < player.curse * 0.15) {
    spawnGem(e.pos.clone().setY(0), 1);
  }
  spawnParticle(e.pos.clone().setY(e.pos.y + 0.5), e.def.color, 5, 6);
  if (e.mixer) { e.mixer.stopAllAction(); e.mixer = null; }
  killMesh(e.mesh);
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);
  gameState.kills++;
  if (KILL_MILESTONES.has(gameState.kills)) {
    showAlert(`${gameState.kills} KILLS!`, '#42f5a1');
  }
  // Track kills per item for unlock progression.
  // Only the weapon that dealt the killing blow gets credit (weapon-specific grind).
  // Armor tracks kills-while-equipped (credit all worn pieces).
  if (srcWeaponId) Profile.addItemKill(srcWeaponId);
  for (const a of player.armor_items) Profile.addItemKill(a.id);
}

// spawnGold is imported at top of file from entities.js

function triggerBossPhase(boss, label) {
  spawnParticle(boss.pos.clone().setY(2.5), 0xff3864, 30, 14);
  spawnParticle(boss.pos.clone().setY(0.5), 0xffd23f, 20, 10);
  addCameraShake(3.0);
  boss.hurtFlash = 0.9;
  showAlert(`${boss.def.name}: ${label}`, '#ff3864');
}

// ============================================================
// JUMP / DASH (exported for ui.js injection)
// ============================================================
export function callBossNow() {
  if (player.gold < 50) return;
  player.gold -= 50;
  // Remove any living mini-bosses without rewarding them
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].isBoss) { killMesh(enemies[i].mesh); enemies.splice(i, 1); }
  }
  gameState.miniboss1Spawned = true;
  gameState.miniboss2Spawned = true;
  gameState.bossSpawned = true;
  spawnBoss('final');
  showAlert('THE BOSS APPROACHES!', '#ff3864');
}

export function tryJump() {
  if (player.jumpsLeft > 0) {
    player.vel.y = CFG.JUMP_VEL;
    player.jumpsLeft--;
    player.grounded = false;
  }
}

export function tryDash() {
  if (player.dashCd > 0) return;
  player.dashCd = 1.5 * (player.dashCdMult || 1);
  player.dashTimer = 0.18;
  player.invuln = Math.max(player.invuln, 0.18);
}

// ============================================================
// BOSS TIERS & SPAWNING
// ============================================================
export const BOSS_TIERS = {
  mini1: {
    name: 'THE SAUCE SLINGER',
    color: 0xff5e1a,
    baseHp: 480, hpPerLvl: 60,
    baseDmg: 18, dmgPerLvl: 1.0,
    speed: 4.6,
    scale: 1.25,
    radius: 1.1, height: 3.6,
    bodyMesh: 'boss',
    minionCd: 9, minionCount: 2, minionTypes: ['goblin', 'imp'],
    rangedCd: 2.4,
    rangedKind: 'sauce',
    xp: 18, gold: 25, slices: 5,
  },
  mini2: {
    name: 'THE HAMMER CHEF',
    color: 0x8a1f3a,
    baseHp: 1200, hpPerLvl: 90,
    baseDmg: 28, dmgPerLvl: 1.2,
    speed: 3.4,
    scale: 1.45,
    radius: 1.35, height: 4.4,
    bodyMesh: 'boss',
    minionCd: 7, minionCount: 3, minionTypes: ['skelly', 'brute'],
    rangedCd: 3.6,
    rangedKind: 'cleaver_fan',
    xp: 32, gold: 50, slices: 10,
  },
  final: {
    name: 'THE WARLORD',
    color: 0x4a0d2a,
    baseHp: 2400, hpPerLvl: 140,
    baseDmg: 38, dmgPerLvl: 1.5,
    speed: 3.4,
    scale: 1.7,
    radius: 1.6, height: 5.0,
    bodyMesh: 'boss',
    minionCd: 6, minionCount: 5, minionTypes: ['skelly', 'imp', 'brute'],
    rangedCd: 2.8,
    rangedKind: 'shockwave',
    xp: 50, gold: 100, slices: 15,
  },
};

function spawnBoss(tier = 'final') {
  const cfg = BOSS_TIERS[tier];
  const lvl = player.level;
  const sm  = STAGE_MULTS[gameState.stage]  || STAGE_MULTS[1];
  const dm  = DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal;
  const hp  = Math.round((cfg.baseHp  + lvl * cfg.hpPerLvl)  * sm.bossHp  * dm.enemy);
  const dmg = Math.round((cfg.baseDmg + lvl * cfg.dmgPerLvl) * sm.bossDmg * dm.enemy);
  const stageSuffix = { 1: '', 2: ' ELITE', 3: ' SUPREME' };
  const bossName = cfg.name + (stageSuffix[gameState.stage] || '');
  const def = {
    color: cfg.color, name: bossName,
    hp, dmg, speed: cfg.speed, xp: cfg.xp, scale: cfg.scale,
    body: cfg.bodyMesh, spawnTime: 0,
  };
  const enemy = {
    type: 'BOSS', def,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    hp, maxHp: hp,
    dmg, speed: cfg.speed,
    radius: cfg.radius, height: cfg.height,
    flying: false, hurtFlash: 0,
    knockback: new THREE.Vector3(),
    contactCd: 0,
    walkPhase: 0,
    isBoss: true,
    bossTier: tier,
    bossPhase: 0,
    minionCd: cfg.minionCd,
    minionCount: cfg.minionCount,
    minionTypes: cfg.minionTypes,
    rangedCd: cfg.rangedCd * 0.6,
    rangedKind: cfg.rangedKind,
    rangedBaseCd: cfg.rangedCd,
    goldDrop: cfg.gold,
    sliceDrop: cfg.slices || 0,
    mesh: makeEnemyMesh(def),
  };
  const _bossSkeletonSlug = tier === 'mini1' ? 'skeleton_mage'
                          : tier === 'final'  ? 'skeleton_warrior'
                          : null;
  if (_bossSkeletonSlug) {
    const _bsc = _cloneEnemyMesh(_bossSkeletonSlug);
    if (_bsc) {
      killMesh(enemy.mesh);
      _bsc.scale.setScalar(cfg.scale * (tier === 'final' ? 1.35 : 1.15));
      _bsc.traverse(c => { if (c.isMesh) c.castShadow = true; });
      enemy.mesh = _bsc;
    }
  }
  const _skelAnimClips = getSkelAnimClips();
  if (enemy.mesh._isSkeletonGLB && _skelAnimClips) {
    enemy.mixer = new THREE.AnimationMixer(enemy.mesh);
    const _bgc = name => _skelAnimClips.find(c => c.name === name);
    enemy.idleAction = _bgc('Idle_A')    ? enemy.mixer.clipAction(_bgc('Idle_A'))    : null;
    enemy.walkAction = _bgc('Walking_A') ? enemy.mixer.clipAction(_bgc('Walking_A')) : null;
    if (enemy.idleAction) enemy.idleAction.play();
    enemy._animState = 'idle';
  }
  const a = Math.random() * Math.PI * 2;
  enemy.pos.set(Math.cos(a) * 25, 0, Math.sin(a) * 25);
  enemy.mesh.position.copy(enemy.pos);
  scene.add(enemy.mesh);
  enemies.push(enemy);
  spawnParticle(enemy.pos.clone().setY(2), cfg.color, 24, 11);
  spawnParticle(enemy.pos.clone().setY(0.5), 0xffd23f, 16, 8);
}

// ============================================================
// SPAWNING
// ============================================================
const MAX_ENEMIES = 70;
const MAX_ENEMIES_FINAL_SWARM = 95;
const KILL_MILESTONES = new Set([25, 50, 100, 200, 500]);

let _eligibleCache = null;
let _eligibleCount = 0;

function getEligibleEnemies(t) {
  const keys = Object.keys(ENEMY_DEFS);
  const count = keys.filter(k => ENEMY_DEFS[k].spawnTime <= t).length;
  if (count !== _eligibleCount) {
    _eligibleCount = count;
    _eligibleCache = keys.filter(k => ENEMY_DEFS[k].spawnTime <= t);
  }
  return _eligibleCache;
}

function updateSpawning(dt) {
  gameState.spawnTimer -= dt;
  const t   = gameState.gameTime;
  const cap = gameState.finalSwarm ? MAX_ENEMIES_FINAL_SWARM : MAX_ENEMIES;
  const room = Math.max(0, cap - enemies.length);

  if (!gameState.finalSwarm && t >= CFG.GAME_TIME - 90) {
    gameState.finalSwarm = true;
    showAlert('FINAL SWARM', '#ff3864');
    const eligible = getEligibleEnemies(t);
    for (let i = 0; i < Math.min(20, room); i++) {
      spawnEnemy(eligible[Math.floor(Math.random() * eligible.length)]);
    }
  }

  let interval = Math.max(0.40, 1.6 - t / 280);
  interval *= (1 - Math.min(0.3, (player.curse || 0) * 0.06));
  if (gameState.finalSwarm) interval *= 0.65;
  gameState.spawnInterval = interval;

  if (gameState.spawnTimer <= 0 && room > 0) {
    gameState.spawnTimer = gameState.spawnInterval;
    const eligible = getEligibleEnemies(t);
    let groupSize = Math.min(5, 1 + Math.floor(t / 90));
    groupSize += Math.floor((player.curse || 0) * 0.35);
    if (gameState.finalSwarm) groupSize += 2;
    groupSize = Math.min(groupSize, room);
    for (let i = 0; i < groupSize; i++) {
      const typeKey = eligible[Math.floor(Math.random() * eligible.length)];
      const eliteChance = Math.min(0.12, 0.015 + (player.luck || 0) * 0.010 + t / 1500);
      const elite = Math.random() < eliteChance;
      spawnEnemy(typeKey, { elite });
    }
  }

  if (!gameState._lastWave) gameState._lastWave = 0;
  if (t - gameState._lastWave >= 90) {
    gameState._lastWave = t;
    const count = Math.min(room, 12 + Math.floor((player.curse || 0) * 3));
    const eligible = getEligibleEnemies(t);
    for (let i = 0; i < count; i++) {
      spawnEnemy(eligible[Math.floor(Math.random() * eligible.length)]);
    }
    if (enemies.length < cap) {
      spawnEnemy(eligible[Math.floor(Math.random() * eligible.length)], { elite: true });
    }
  }

  if (t >= 180 && !gameState.miniboss1Spawned) {
    gameState.miniboss1Spawned = true;
    spawnBoss('mini1');
    showAlert('THE SAUCE SLINGER', '#ff5e1a');
  }
  if (t >= 360 && !gameState.miniboss2Spawned) {
    gameState.miniboss2Spawned = true;
    spawnBoss('mini2');
    showAlert('THE HAMMER CHEF', '#ff3864');
  }
  if (t >= CFG.GAME_TIME && !gameState.bossSpawned) {
    gameState.bossSpawned = true;
    spawnBoss('final');
    showAlert('THE WARLORD APPROACHES', '#ffd23f');
  }
}

// ============================================================
// STRIP HALF THE PLAYER'S LOADOUT — called on stage advance.
// Resets stat contributions from armor/tomes and re-applies only
// the kept items, so the player genuinely loses power.
// ============================================================
function _stripHalfItems() {
  // Pick ~half of each category to keep (minimum 1 weapon always kept)
  function keepHalf(arr) {
    if (arr.length <= 1) return [...arr];
    const keep = Math.ceil(arr.length / 2);
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, keep);
  }

  const _charStarters = {
    pizza_hero: 'pizza', frost_baker: 'ice', oven_knight: 'aura', crust_runner: 'boomerang',
    anchovy_archer: 'crossbow', stealth_slice: 'smoke',
  };
  const _charSlug = Profile.get().equippedCharacter || 'pizza_hero';
  const starterWepId = _charStarters[_charSlug] || 'pizza';

  let keptWeapons = keepHalf(player.weapons);
  // Always keep the character's starter weapon
  if (!keptWeapons.find(w => w.id === starterWepId)) {
    const starter = player.weapons.find(w => w.id === starterWepId);
    if (starter) keptWeapons.push(starter);
  }
  const keptArmor = keepHalf(player.armor_items);
  const keptTomes  = keepHalf(player.tomes);

  // --- Reset all stats that armor/tomes contribute to ---
  // (keep base player.maxHp and player.hp — warding tome re-adds during replay)
  const baseMaxHp = 120
    + 10 * Profile.getBoostLevel('boost_health')
    + (_charSlug === 'oven_knight' ? 25 : 0);
  player.maxHp         = baseMaxHp;
  player.hp            = Math.min(player.hp, player.maxHp);
  player.hpRegen       = 0;
  player.armor         = 0;
  player.dodgeChance   = 0;
  player.shieldMax     = 0;
  player.shield        = 0;
  player.lifesteal     = 0;
  player.baseSpeed     = CFG.PLAYER_SPEED;
  player.maxJumps      = 1;
  player.jumpsLeft     = Math.min(player.jumpsLeft, 1);
  player.dashCdMult    = 1.0;
  player.thorns        = 0;
  player.damageMult    = 1.0;
  player.cooldownMult  = 1.0;
  player.luck          = 0;
  player.xpGain        = 1.0;
  player.critChance    = 0.05;
  player.critMult      = 2.0;
  player.projectileMult  = 1.0;
  player.projectilePierce = 0;
  player.aoeMult       = 1.0;
  player.durationMult  = 1.0;
  player.knockResist   = 0;
  player.curse         = 0;
  player.frostThorns   = 0;
  player.goldMult      = 1.0;
  player.phoenixRevive = false;
  player.hasRevive     = false;
  player.hasPhantomDash = false;
  // Tome of Echoes / Tome of Time defaults
  player.echoInterval  = 0;
  player._echoCounter  = 0;
  player.timeSlowDur   = 0;
  player.timeSlowMult  = 0.5;
  player.turboDash     = 0;

  // Re-apply persistent boosts (same as resetGame)
  const _bl = slug => Profile.getBoostLevel(slug);
  if (_bl('boost_damage') > 0) player.damageMult += 0.05 * _bl('boost_damage');
  if (_bl('boost_armor')  > 0) player.armor      += 1    * _bl('boost_armor');
  if (_bl('boost_speed')  > 0) player.baseSpeed  *= 1 + 0.05 * _bl('boost_speed');
  if (_bl('boost_xp')     > 0) player.xpGain     += 0.10 * _bl('boost_xp');
  if (_bl('boost_gold')   > 0) player.goldMult   += 0.10 * _bl('boost_gold');
  if (_bl('boost_revive') > 0) player.hasRevive   = true;

  // Re-apply character stat bonuses
  if (_charSlug === 'oven_knight') {
    player.armor    += 4;
    player.baseSpeed *= 0.8;
  } else if (_charSlug === 'frost_baker') {
    player.durationMult *= 1.5;
  } else if (_charSlug === 'crust_runner') {
    player.baseSpeed   *= 1.35;
    player.maxJumps     = 2;
    player.cooldownMult *= 0.85;
  } else if (_charSlug === 'anchovy_archer') {
    player.critChance      += 0.15;
    player.critMult        += 0.30;
    player.projectilePierce += 1;
  } else if (_charSlug === 'stealth_slice') {
    player.dodgeChance += 0.15;
    player.damageMult  += 0.20;
    player.baseSpeed   *= 1.10;
  }

  // Replay upgrade() for each kept armor item to re-apply its effects
  for (const a of keptArmor) {
    const savedLevel = a.level || 1;
    a.level = 0;
    const def = ARMOR[a.id];
    if (def && def.upgrade) {
      for (let i = 0; i < savedLevel; i++) def.upgrade(a);
    } else {
      a.level = savedLevel;
    }
  }

  // Replay upgrade() for each kept tome item to re-apply its effects
  for (const t of keptTomes) {
    const savedLevel = t.level || 1;
    t.level = 0;
    const def = TOMES[t.id];
    if (def && def.upgrade) {
      for (let i = 0; i < savedLevel; i++) def.upgrade(t);
    } else {
      t.level = savedLevel;
    }
  }

  // Commit stripped arrays
  player.weapons     = keptWeapons;
  player.armor_items = keptArmor;
  player.tomes       = keptTomes;

  showAlert(`HALF YOUR LOADOUT STRIPPED! ⚠️`, '#ff3864');
}

// ============================================================
// ADVANCE STAGE — carry player over to the next stage
// ============================================================
function advanceStage() {
  // Clear world entities but keep player intact
  for (const e of enemies) killMesh(e.mesh);
  enemies.length = 0;
  for (const p of projectiles) killMesh(p.mesh);
  projectiles.length = 0;
  for (const p of enemyProjectiles) killMesh(p.mesh);
  enemyProjectiles.length = 0;
  for (const g of xpGems) killMesh(g.mesh);
  xpGems.length = 0;
  for (const c of goldCoins) killMesh(c.mesh);
  goldCoins.length = 0;
  for (const o of orbitals) killMesh(o.mesh);
  orbitals.length = 0;
  for (const a of auraInstances) killMesh(a.mesh);
  auraInstances.length = 0;
  for (const p of particles) killMesh(p.mesh);
  particles.length = 0;
  for (const c of chests) killMesh(c.mesh);
  chests.length = 0;
  for (const c of smokeClouds) killMesh(c.mesh);
  smokeClouds.length = 0;

  // Clear cosmetic weapon meshes — weapon ticks recreate them next frame
  if (_thunderWandMesh) { killMesh(_thunderWandMesh); set_thunderWandMesh(null); }
  if (_shieldOrbitMesh) { killMesh(_shieldOrbitMesh); set_shieldOrbitMesh(null); }
  if (_staffMesh)       { killMesh(_staffMesh);       set_staffMesh(null); }
  set_thunderWandAngle(0); set_shieldOrbitAngle(0); set_staffAngle(0);

  // Strip ~half the player's loadout and rebuild stats from remaining items
  _stripHalfItems();

  // Heal player 50% max HP as a stage-clear bonus (after strip, so cap is correct)
  player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.5));
  player.invuln = 0;
  player.dashCd = 0;
  player.jumpsLeft = player.maxJumps;
  player.pos.set(0, 0, 0);
  player.vel.set(0, 0, 0);

  // Reset world timers / spawn state for the new stage
  gameState.state             = 'playing';
  gameState.gameTime          = 0;
  gameState.spawnTimer        = 0;
  gameState.spawnInterval     = 1.4;
  gameState.bossSpawned       = false;
  gameState.miniboss1Spawned  = false;
  gameState.miniboss2Spawned  = false;
  gameState.finalSwarm        = false;
  gameState._lastWave         = 0;
  gameState.chestTimer        = 90;

  // Spawn a few starter chests for the new stage
  for (let i = 0; i < 3; i++) {
    const p = pickChestPosition();
    spawnChest(p.x, p.z, Math.random() < 0.35 ? 'rare' : 'common');
  }

  // Re-seed orbital weapon projectiles (they were cleared above)
  for (const w of player.weapons) {
    if (w.id === 'orbit') rebuildOrbits(w);
  }

  updateLoadoutDisplay();
  showAlert(`STAGE ${gameState.stage} — BEGIN!`, '#ffd23f');
}

// ============================================================
// RESET GAME
// ============================================================
export function resetGame() {
  // Apply the player's chosen arena theme (sky, fog, lights, ground texture,
  // scenery tints).  Must happen before any new scenery is placed.
  const arenaSlug = gameState.arena || Profile.getEquippedArena() || 'pepperoni_pines';
  gameState.arena = arenaSlug;
  setRendererArena(arenaSlug);
  setTerrainArena(arenaSlug);
  setWorldArena(arenaSlug);

  for (const e of enemies) killMesh(e.mesh);
  enemies.length = 0;
  for (const p of projectiles) killMesh(p.mesh);
  projectiles.length = 0;
  for (const p of enemyProjectiles) killMesh(p.mesh);
  enemyProjectiles.length = 0;
  for (const g of xpGems) killMesh(g.mesh);
  xpGems.length = 0;
  for (const c of goldCoins) killMesh(c.mesh);
  goldCoins.length = 0;
  for (const o of orbitals) killMesh(o.mesh);
  orbitals.length = 0;
  for (const a of auraInstances) killMesh(a.mesh);
  auraInstances.length = 0;
  for (const p of particles) killMesh(p.mesh);
  particles.length = 0;
  for (const c of chests) killMesh(c.mesh);
  chests.length = 0;
  for (const c of smokeClouds) killMesh(c.mesh);
  smokeClouds.length = 0;

  if (_thunderWandMesh) { killMesh(_thunderWandMesh); set_thunderWandMesh(null); }
  if (_shieldOrbitMesh) { killMesh(_shieldOrbitMesh); set_shieldOrbitMesh(null); }
  if (_staffMesh)       { killMesh(_staffMesh);       set_staffMesh(null); }
  set_thunderWandAngle(0); set_shieldOrbitAngle(0); set_staffAngle(0);

  player.pos.set(0, 0, 0);
  player.vel.set(0, 0, 0);
  _applyCharacterModel().then(() => {
    if (playerMixer) { playerMixer.stopAllAction(); if (playerIdleAction) playerIdleAction.play(); }
  });
  player.hp = 120; player.maxHp = 120;
  player.xp = 0; player.level = 1; player.xpToNext = 5;
  player.baseSpeed = CFG.PLAYER_SPEED;
  player.damageMult = 1.0;
  player.cooldownMult = 1.0;
  player.pickupRange = CFG.PICKUP_RANGE;
  player.hpRegen = 0;
  player.xpGain = 1.0;
  player.critChance = 0.05;
  player.critMult = 2.0;
  player.projectileMult = 1.0;
  player.extraProjectiles = 0;
  player.armor = 0;
  player.knockback = 1.0;
  player.maxJumps = 1;
  player.jumpsLeft = 1;
  player.dashCd = 0;
  player.dashTimer = 0;
  player.invuln = 0;
  player.weapons = [];
  player.maxWeaponSlots = 3;
  player.armor_items = [];
  player.maxArmorSlots = 3;
  player.tomes = [];
  player.maxTomeSlots = 3;
  player.gold = 0;
  player.statLevels = {};
  player.luck = 0;
  player.curse = 0;
  player.shieldMax = 0;
  player.shield = 0;
  player.shieldRegenDelay = 0;
  player.lifesteal = 0;
  // Tome of Echoes / Tome of Time defaults
  player.echoInterval = 0;
  player._echoCounter = 0;
  player.timeSlowDur  = 0;
  player.timeSlowMult = 0.5;
  player.projectilePierce = 0;
  player.aoeMult = 1.0;
  player.durationMult = 1.0;
  player.goldMult = 1.0;
  player.dodgeChance = 0;
  player.thorns = 0;
  player.dashCdMult = 1.0;
  player.synergies = {};
  player.hasRevive = false;
  player.knockResist = 0;
  player.frostThorns = 0;
  player.hasBerserker = false;
  player.hasPhantomDash = false;
  player.turboDash = 0;
  player.phoenixRevive = false;

  // Apply persistent boosts from Armory
  const _bl = slug => Profile.getBoostLevel(slug);
  if (_bl('boost_damage') > 0)  player.damageMult  += 0.05 * _bl('boost_damage');
  if (_bl('boost_health') > 0)  { player.maxHp += 10 * _bl('boost_health'); player.hp = player.maxHp; }
  if (_bl('boost_armor')  > 0)  player.armor   += 1  * _bl('boost_armor');
  if (_bl('boost_speed')  > 0)  player.baseSpeed *= 1 + 0.05 * _bl('boost_speed');
  if (_bl('boost_xp')     > 0)  player.xpGain  += 0.10 * _bl('boost_xp');
  if (_bl('boost_gold')   > 0)  player.goldMult += 0.10 * _bl('boost_gold');
  if (_bl('boost_revive') > 0)  player.hasRevive = true;

  // Starter weapon based on equipped character
  const _charStarters = {
    pizza_hero:     'pizza',
    frost_baker:    'ice',
    oven_knight:    'aura',
    crust_runner:   'boomerang',
    anchovy_archer: 'crossbow',
    stealth_slice:  'smoke',
  };
  const _charSlug  = Profile.get().equippedCharacter || 'pizza_hero';
  const _starterId = _charStarters[_charSlug] || 'pizza';
  const starter = { ...WEAPONS[_starterId].init(), id: _starterId, level: 1 };
  player.weapons.push(starter);

  // Character-specific bonuses
  if (_charSlug === 'oven_knight') {
    player.armor    += 4;
    player.maxHp    += 25; player.hp = player.maxHp;
    player.baseSpeed *= 0.8;
  } else if (_charSlug === 'frost_baker') {
    player.durationMult *= 1.5;
  } else if (_charSlug === 'crust_runner') {
    player.baseSpeed    *= 1.35;
    player.maxJumps      = 2; player.jumpsLeft = 2;
    player.cooldownMult *= 0.85;
  } else if (_charSlug === 'anchovy_archer') {
    player.critChance      += 0.15;
    player.critMult        += 0.30;
    player.projectilePierce += 1;
    player.maxHp           -= 10; player.hp = player.maxHp;
  } else if (_charSlug === 'stealth_slice') {
    player.dodgeChance += 0.15;
    player.damageMult  += 0.20;
    player.baseSpeed   *= 1.10;
    player.maxHp       -= 15; player.hp = player.maxHp;
  }

  gameState.state         = 'playing';
  gameState.gameTime      = 0;
  gameState.stage         = 1;
  gameState.spawnTimer    = 0;
  gameState.spawnInterval = 1.4;
  gameState.kills         = 0;
  gameState.damageDealt   = 0;
  gameState.slicesEarned  = 0;
  gameState.bossSpawned       = false;
  gameState.miniboss1Spawned  = false;
  gameState.miniboss2Spawned  = false;
  gameState.finalSwarm        = false;
  gameState._lastWave         = 0;
  gameState.chestTimer        = 90;

  for (let i = 0; i < 5; i++) {
    const p = pickChestPosition();
    spawnChest(p.x, p.z, Math.random() < 0.25 ? 'rare' : 'common');
  }

  updateLoadoutDisplay();
}

// ============================================================
// PLAYER UPDATE
// ============================================================
function updatePlayer(dt) {
  applyCameraJoystick(dt);
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp)    mz -= 1;
  if (keys.KeyS || keys.ArrowDown)  mz += 1;
  if (keys.KeyA || keys.ArrowLeft)  mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  mx += joystickInput.x;
  mz += joystickInput.y;
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }

  camera.getWorldDirection(tmp);
  tmp.y = 0;
  if (tmp.lengthSq() < 1e-6) tmp.set(0, 0, 1);
  tmp.normalize();
  const wx = -tmp.z * mx + tmp.x * (-mz);
  const wz =  tmp.x * mx + tmp.z * (-mz);

  let speed = player.baseSpeed;
  if (player.dashTimer > 0) speed *= 3.5;
  // Phantom Hood: speed boost when under 40% HP
  if (player.hasPhantomDash && player.hp < player.maxHp * 0.4) speed *= 1.25;
  player.vel.x = wx * speed;
  player.vel.z = wz * speed;
  player.vel.y -= CFG.GRAVITY * dt;

  const newX = player.pos.x + player.vel.x * dt;
  const newZ = player.pos.z + player.vel.z * dt;
  let   newY = player.pos.y + player.vel.y * dt;

  const gh = groundHeight(newX, newZ);
  if (newY <= gh) {
    newY = gh;
    player.vel.y = 0;
    if (!player.grounded) {
      player.grounded  = true;
      player.jumpsLeft = player.maxJumps;
    }
  } else {
    player.grounded = false;
  }

  const resolved = resolveSolids(newX, newZ, 0.55);
  player.pos.x = clamp(resolved.x, -CFG.ARENA + 1, CFG.ARENA - 1);
  player.pos.z = clamp(resolved.z, -CFG.ARENA + 1, CFG.ARENA - 1);
  player.pos.y = newY;
  player.group.position.copy(player.pos);

  if (mag > 0.05) player.facing = Math.atan2(wx, wz);
  let dy = player.facing - player.group.rotation.y;
  while (dy >  Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  player.group.rotation.y += dy * Math.min(1, dt * 12);

  // Animation crossfade — use local state so we only trigger on actual changes
  const moving  = mag > 0.05;
  const dashing = player.dashTimer > 0;
  if (playerMixer) {
    const want = moving ? (dashing && playerRunAction ? 'run' : 'walk') : 'idle';
    if (want !== _animState) {
      _animState = want;
      if (want === 'run' && playerRunAction) {
        if (playerIdleAction) playerIdleAction.fadeOut(0.15);
        if (playerWalkAction) playerWalkAction.fadeOut(0.15);
        playerRunAction.reset().fadeIn(0.15).play();
      } else if (want === 'walk' && playerWalkAction) {
        if (playerIdleAction) playerIdleAction.fadeOut(0.2);
        if (playerRunAction)  playerRunAction.fadeOut(0.15);
        playerWalkAction.reset().fadeIn(0.2).play();
      } else if (playerIdleAction) {
        if (playerWalkAction) playerWalkAction.fadeOut(0.2);
        if (playerRunAction)  playerRunAction.fadeOut(0.2);
        playerIdleAction.reset().fadeIn(0.2).play();
      }
    }
  }

  // Regen / timers / shield
  if (player.hpRegen > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.hpRegen * dt);
  }
  if (player.invuln > 0)       player.invuln    -= dt;
  if (player.dashTimer > 0)    player.dashTimer  -= dt;
  if (player.dashCd > 0)       player.dashCd     -= dt;
  if (player.hurtFlash > 0)    player.hurtFlash  -= dt;
  if (player.shieldRegenDelay > 0) {
    player.shieldRegenDelay -= dt;
  } else if (player.shieldMax > 0 && player.shield < player.shieldMax) {
    player.shield = Math.min(player.shieldMax, player.shield + (player.shieldMax / 3) * dt);
  }

  // Camera follow with yaw/pitch from cam (state.js)
  const camDist = CFG.CAM_DIST;
  const camY    = CFG.CAM_HEIGHT * cam.pitch;
  const camOffsetX = Math.sin(cam.yaw) * camDist * Math.cos(cam.pitch);
  const camOffsetZ = Math.cos(cam.yaw) * camDist * Math.cos(cam.pitch);
  const targetCam = new THREE.Vector3(
    player.pos.x - camOffsetX,
    player.pos.y + camY,
    player.pos.z - camOffsetZ
  );
  camera.position.lerp(targetCam, 0.15);
  // Camera shake from cam.shake (added by damagePlayer/triggerBossPhase)
  if (cam.shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * cam.shake * 0.4;
    camera.position.y += (Math.random() - 0.5) * cam.shake * 0.3;
    cam.shake *= Math.exp(-dt * 8);
  } else {
    cam.shake = 0;
  }
  camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);

  sun.position.set(player.pos.x + 40, player.pos.y + 65, player.pos.z + 25);
  sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  sun.target.updateMatrixWorld();
}

// ============================================================
// ENEMY UPDATE
// ============================================================
function updateEnemies(dt) {
  let _swapsThisFrame = 0;
  let _mixerSetupsThisFrame = 0;
  const _skelAnimClips = getSkelAnimClips();

  for (const e of enemies) {
    // Hot-swap procedural mesh for GLB once loaded
    if (_swapsThisFrame < 1 && e._pendingGLBSlug && hasEnemyAsset(e._pendingGLBSlug)) {
      const newMesh = _cloneEnemyMesh(e._pendingGLBSlug);
      if (newMesh) {
        const sc = e._pendingGLBScale * (e.isElite ? 1.18 : 1);
        newMesh.scale.setScalar(sc);
        newMesh.position.copy(e.mesh.position);
        if (!e.isElite) newMesh.traverse(c => { if (c.isMesh) c.castShadow = false; });
        if (e.eliteHalo) { e.mesh.remove(e.eliteHalo); newMesh.add(e.eliteHalo); }
        scene.add(newMesh);
        killMesh(e.mesh);
        e.mesh = newMesh;
        delete e._pendingGLBSlug;
        delete e._pendingGLBScale;
        _swapsThisFrame++;
        if (_skelAnimClips) {
          e.mixer = new THREE.AnimationMixer(e.mesh);
          const gc = n => _skelAnimClips.find(c => c.name === n);
          e.idleAction = gc('Idle_A')    ? e.mixer.clipAction(gc('Idle_A'))    : null;
          e.walkAction = gc('Walking_A') ? e.mixer.clipAction(gc('Walking_A')) : null;
          if (e.idleAction) e.idleAction.play();
          e._animState = 'idle';
          _mixerSetupsThisFrame++;
        }
      }
    }

    // Bind mixer once _skelAnimClips loads for late GLB enemies
    if (_mixerSetupsThisFrame < 1 && e.mesh._isSkeletonGLB && !e.mixer && _skelAnimClips) {
      e.mixer = new THREE.AnimationMixer(e.mesh);
      const gc = n => _skelAnimClips.find(c => c.name === n);
      e.idleAction = gc('Idle_A')    ? e.mixer.clipAction(gc('Idle_A'))    : null;
      e.walkAction = gc('Walking_A') ? e.mixer.clipAction(gc('Walking_A')) : null;
      if (e.idleAction) e.idleAction.play();
      e._animState = 'idle';
      _mixerSetupsThisFrame++;
    }

    // Movement toward player
    tmp.subVectors(player.pos, e.pos);
    if (e.flying) {
      tmp.y = (player.pos.y + 1.5) - e.pos.y;
    } else {
      tmp.y = 0;
    }
    const dist = tmp.length();
    if (dist > 0.01) tmp.normalize();

    let speedMult = 1.0;
    if (e.slowTimer && e.slowTimer > 0) {
      e.slowTimer -= dt;
      // Respect a per-enemy slowMult (set by Frost Shell, Tome of Time, etc.)
      // Fall back to the legacy default of 0.45 if not set.
      speedMult = e.slowMult || 0.45;
    }

    if (e.type === 'archer') {
      if (dist < 7) {
        e.vel.x = -tmp.x * e.speed * speedMult;
        e.vel.z = -tmp.z * e.speed * speedMult;
      } else if (dist > 15) {
        e.vel.x = tmp.x * e.speed * 0.6 * speedMult;
        e.vel.z = tmp.z * e.speed * 0.6 * speedMult;
      } else {
        e.vel.x = -tmp.z * e.speed * 0.45 * speedMult;
        e.vel.z =  tmp.x * e.speed * 0.45 * speedMult;
      }
    } else {
      e.vel.x = tmp.x * e.speed * speedMult;
      e.vel.z = tmp.z * e.speed * speedMult;
      if (e.flying) e.vel.y = tmp.y * e.speed * speedMult;
    }

    e.pos.x += (e.vel.x + e.knockback.x) * dt;
    e.pos.z += (e.vel.z + e.knockback.z) * dt;
    if (e.flying) e.pos.y += (e.vel.y + e.knockback.y) * dt;
    e.knockback.multiplyScalar(0.86);

    if (!e.flying) {
      const gh = groundHeight(e.pos.x, e.pos.z);
      e.pos.y = gh;
    }
    if (!e.flying && !e.isBoss) {
      const r = resolveSolids(e.pos.x, e.pos.z, e.radius * 0.85);
      e.pos.x = r.x; e.pos.z = r.z;
    }

    e.pos.x = clamp(e.pos.x, -CFG.ARENA + 1, CFG.ARENA - 1);
    e.pos.z = clamp(e.pos.z, -CFG.ARENA + 1, CFG.ARENA - 1);
    e.mesh.position.copy(e.pos);

    const dxc   = e.pos.x - player.pos.x, dzc = e.pos.z - player.pos.z;
    const distSq = dxc * dxc + dzc * dzc;
    const isNear    = distSq < 28 * 28;
    const isVisible = distSq < 50 * 50;

    if (isNear || e.isBoss || e.isElite) {
      // lookAt at the mesh's OWN Y, never the player's height — when the enemy
      // is touching the player the horizontal distance approaches zero and any
      // vertical offset in the target makes the lookAt vector nearly vertical,
      // which tilts the mesh forward and makes the enemy appear to lay down.
      e.mesh.lookAt(player.pos.x, e.mesh.position.y, player.pos.z);
    } else if (isVisible) {
      e.mesh.rotation.y = Math.atan2(dxc, dzc) + Math.PI;
    }

    if (isNear && e.flying && e.mesh.wingL && e.mesh.wingR) {
      const f = Math.sin(performance.now() * 0.025) * 0.7;
      e.mesh.wingL.rotation.z =  f;
      e.mesh.wingR.rotation.z = -f;
    }

    if (isNear && !e.flying && !e.mixer && e.mesh.legL && e.mesh.legR) {
      const moving = Math.hypot(e.vel.x, e.vel.z) > 0.2;
      if (moving) {
        e.walkPhase += dt * (e.speed * 1.4);
        const a = Math.sin(e.walkPhase);
        e.mesh.legL.rotation.x =  a * 0.55;
        e.mesh.legR.rotation.x = -a * 0.55;
      } else {
        e.mesh.legL.rotation.x *= 0.85;
        e.mesh.legR.rotation.x *= 0.85;
      }
    }

    if (e.mixer) {
      e.mixer.update(dt);
      if (isNear || e.isBoss || e.isElite) {
        const moving = Math.hypot(e.vel.x, e.vel.z) > 0.25;
        if (moving && e._animState !== 'walk' && e.walkAction) {
          e.walkAction.reset().fadeIn(0.18).play();
          if (e.idleAction) e.idleAction.fadeOut(0.18);
          e._animState = 'walk';
        } else if (!moving && e._animState !== 'idle' && e.idleAction) {
          e.idleAction.reset().fadeIn(0.18).play();
          if (e.walkAction) e.walkAction.fadeOut(0.18);
          e._animState = 'idle';
        }
      }
    }

    // Archer ranged attack
    if (e.type === 'archer' && dist < 22) {
      e.archRangeCd = (e.archRangeCd || 0) - dt;
      if (e.archRangeCd <= 0) {
        e.archRangeCd = 2.8;
        const adir = new THREE.Vector3(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z).normalize();
        const arrowMesh = (() => {
          const ac = _cloneWeaponMesh('arrow_crossbow');
          if (ac) { ac.scale.setScalar(1.0); ac.rotation.y = Math.atan2(adir.x, adir.z); return ac; }
          const gr = new THREE.Group();
          gr.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), flatPhong(0x886644)));
          return gr;
        })();
        const astart = e.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        arrowMesh.position.copy(astart);
        scene.add(arrowMesh);
        enemyProjectiles.push({ pos: astart.clone(), vel: adir.clone().multiplyScalar(13),
          damage: e.dmg, radius: 0.22, age: 0, lifetime: 2.5, mesh: arrowMesh });
      }
    }

    // Boss pulse visual (procedural meshes only)
    if (e.isBoss && e.mesh.pulseRef) {
      const pulse = 0.85 + Math.sin(performance.now() * 0.005) * 0.25;
      e.mesh.pulseRef.scale.setScalar(pulse);
    }
    // Boss game logic: minion spawns + ranged attacks (always, regardless of mesh type)
    if (e.isBoss) {
      e.minionCd -= dt;
      if (e.minionCd <= 0) {
        e.minionCd = e.bossTier === 'mini1' ? 9 : e.bossTier === 'mini2' ? 7 : 8;
        const types = e.minionTypes || ['skelly', 'imp', 'brute'];
        const count = e.minionCount || 5;
        for (let i = 0; i < count; i++) {
          spawnEnemy(types[Math.floor(Math.random() * types.length)]);
        }
        spawnParticle(e.pos.clone().setY(2), e.def.color || 0xff3864, 16, 6);
      }
      if (e.rangedKind && e.rangedCd != null) {
        e.rangedCd -= dt;
        const d = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        if (e.rangedCd <= 0 && d < 30 && d > 3) {
          e.rangedCd = e.rangedBaseCd * (0.85 + Math.random() * 0.3);
          bossRangedAttack(e);
        }
      }
    }
    if (e.eliteHalo) {
      e.eliteHalo.rotation.z = performance.now() * 0.002;
    }

    // Hurt flash
    if (e.hurtFlash > 0) {
      e.hurtFlash -= dt;
      if (e.mesh.bodyRef) {
        e.mesh.bodyRef.material.emissive = new THREE.Color(0xff3864);
        e.mesh.bodyRef.material.emissiveIntensity = 0.6;
      }
    } else if (e.mesh.bodyRef && e.mesh.bodyRef.material.emissiveIntensity > 0) {
      e.mesh.bodyRef.material.emissiveIntensity = 0;
    }

    // Contact damage
    e.contactCd -= dt;
    if (e.auraCd && e.auraCd > 0) e.auraCd -= dt;
    const horizDist = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    const vertOk = e.flying ? Math.abs(e.pos.y - player.pos.y) < 2 : Math.abs(e.pos.y - player.pos.y) < 1.5;
    if (horizDist < e.radius + 0.5 && vertOk && e.contactCd <= 0) {
      e.contactCd = 0.5;
      damagePlayer(e.dmg, e);
      const dir = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z).normalize();
      e.knockback.add(dir.multiplyScalar(2));
    }
  }
}

// ============================================================
// PROJECTILE UPDATE
// ============================================================
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.age += dt;
    if (p.age > p.lifetime) {
      if (p.explodeOnExpire && p.aoe > 0) {
        for (const e of enemies) {
          if (e.pos.distanceTo(p.pos) < p.aoe) {
            damageEnemy(e, p.damage, p.crit, p.weaponId);
            const d2 = new THREE.Vector3().subVectors(e.pos, p.pos).setY(0).normalize();
            e.knockback.add(d2.multiplyScalar(p.knockback * 0.5 * player.knockback));
          }
        }
        spawnParticle(p.pos.clone(), 0xffd23f, 14, 8);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.3, p.aoe, 24),
          new THREE.MeshBasicMaterial({ color: 0xffae3a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(p.pos);
        ring.position.y = 0.2;
        scene.add(ring);
        auraInstances.push({ mesh: ring, life: 0.35, maxLife: 0.35 });
      }
      if (p.smokeOnExpire) {
        spawnSmokeCloud(p.pos.clone(), p.smokeDmg, p.smokeRadius, p.smokeLife, p.smokeSlow, p.weaponId);
      }
      releasePtLight(p.ptLight);
      killMesh(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    if (p.gravity) p.vel.y -= p.gravity * dt;

    if (p.homing && enemies.length > 0) {
      let nearest = null, nearestD = Infinity;
      for (const e of enemies) {
        const d = e.pos.distanceTo(p.pos);
        if (d < nearestD) { nearestD = d; nearest = e; }
      }
      if (nearest && nearestD < 24) {
        const toTarget = new THREE.Vector3().subVectors(nearest.pos, p.pos).normalize();
        p.vel.lerp(toTarget.multiplyScalar(p.vel.length()), 0.06);
      }
    }

    // Boomerang arc
    if (p.boomerang) {
      p.boomerangAge += dt;
      const t  = Math.min(p.boomerangAge / p.lifetime, 1);
      const tN = Math.min((p.boomerangAge + dt) / p.lifetime, 1);
      const P0 = p.boomStart;
      const P2 = new THREE.Vector3(player.pos.x, player.pos.y + 1.0, player.pos.z);
      const perp = new THREE.Vector3(-p.boomDir.z, 0, p.boomDir.x);
      const P1 = P0.clone().addScaledVector(p.boomDir, 13).addScaledVector(perp, 6);
      P1.y = (P0.y + P2.y) * 0.5 + 0.8;
      const bezPos = (u, A, B, C) => {
        const iv = 1 - u;
        return new THREE.Vector3(
          iv*iv*A.x + 2*iv*u*B.x + u*u*C.x,
          iv*iv*A.y + 2*iv*u*B.y + u*u*C.y,
          iv*iv*A.z + 2*iv*u*B.z + u*u*C.z
        );
      };
      const posNow  = bezPos(t,  P0, P1, P2);
      const posNext = bezPos(tN, P0, P1, P2);
      p.pos.copy(posNow);
      p.vel.copy(posNext).sub(posNow).divideScalar(Math.max(dt, 0.001));
      if (t > 0.5 && !p._returnHitsCleared) {
        p._returnHitsCleared = true;
        p.hitIds.clear();
      }
      if (t > 0.7) {
        const catchDist = Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
        if (catchDist < 1.8) {
          releasePtLight(p.ptLight);
          killMesh(p.mesh);
          projectiles.splice(i, 1);
          continue;
        }
      }
    }

    if (p.homing > 0 && p.target && enemies.includes(p.target)) {
      const aimY = p.target.pos.y + (p.target.height || 1) * 0.5;
      const desired = new THREE.Vector3(
        p.target.pos.x - p.pos.x,
        aimY - p.pos.y,
        p.target.pos.z - p.pos.z
      ).normalize().multiplyScalar(p.vel.length());
      p.vel.lerp(desired, p.homing * dt);
    }
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    if (p.ptLight) p.ptLight.light.position.copy(p.pos);
    if (p.spinAxis) p.mesh.rotation.y += dt * 22;

    if (p.hitCooldown && p.hitCooldown.size) {
      for (const [enemy, cd] of p.hitCooldown) {
        const next = cd - dt;
        if (next <= 0) p.hitCooldown.delete(enemy);
        else p.hitCooldown.set(enemy, next);
      }
    }

    let hitSomething = false;
    for (const e of enemies) {
      if (p.boomerang) {
        if (p.hitCooldown && p.hitCooldown.has(e)) continue;
      } else if (p.hitIds.has(e)) {
        continue;
      }
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const dy = e.pos.y + e.height * 0.5 - p.pos.y;
      const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const hitRadius = p.radius + e.radius + (e.flying ? 0.2 : 0);
      if (d < hitRadius) {
        damageEnemy(e, p.damage, p.crit, p.weaponId);
        if (p.slowOnHit) e.slowTimer = Math.max(e.slowTimer || 0, 1.5);
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        e.knockback.add(dir.multiplyScalar(p.knockback * player.knockback));
        if (p.boomerang) {
          p.hitCooldown.set(e, 0.4);
        } else {
          p.hitIds.add(e);
        }
        hitSomething = true;
        if (p.aoe > 0 && !p.explodeOnExpire) {
          for (const e2 of enemies) {
            if (e2 === e) continue;
            if (e2.pos.distanceTo(e.pos) < p.aoe) {
              damageEnemy(e2, p.damage * 0.7, p.crit, p.weaponId);
              const d2 = new THREE.Vector3().subVectors(e2.pos, e.pos).setY(0).normalize();
              e2.knockback.add(d2.multiplyScalar(p.knockback * 0.6 * player.knockback));
            }
          }
          spawnParticle(e.pos.clone().setY(e.pos.y + 0.5), 0xff5e1a, 14, 8);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.3, p.aoe, 24),
            new THREE.MeshBasicMaterial({ color: 0xff5e1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(e.pos);
          ring.position.y = 0.2;
          scene.add(ring);
          auraInstances.push({ mesh: ring, life: 0.3, maxLife: 0.3 });
          releasePtLight(p.ptLight);
          killMesh(p.mesh);
          projectiles.splice(i, 1);
          hitSomething = 'consumed';
        }
        if (p.pierce > 0) {
          p.pierce--;
        } else if (!p.boomerang) {
          break;
        }
      }
    }
    if (hitSomething === 'consumed') continue;
    if (hitSomething && p.pierce === 0 && !p.aoe && !p.boomerang) {
      releasePtLight(p.ptLight);
      killMesh(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

// ============================================================
// ENEMY PROJECTILE MESHES
// ============================================================
function makeSauceMesh() {
  const g    = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshPhongMaterial({ color: 0xc8102e, shininess: 30, emissive: 0x441010, emissiveIntensity: 0.4 })
  );
  core.scale.set(1, 0.6, 1);
  g.add(core);
  const goo = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5e1a, transparent: true, opacity: 0.4 })
  );
  goo.scale.set(1, 0.35, 1);
  g.add(goo);
  return g;
}

function makeCleaverMesh() {
  const clone = _cloneWeaponMesh('axe_2handed');
  if (clone) {
    clone.scale.setScalar(1.2);
    clone.traverse(c => { if (c.isMesh) c.castShadow = false; });
    return clone;
  }
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.32), new THREE.MeshPhongMaterial({ color: 0xc0c4cc, shininess: 90 }));
  g.add(blade);
  const edge  = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), new THREE.MeshPhongMaterial({ color: 0xeef2ff, shininess: 120 }));
  edge.position.z = -0.18;
  g.add(edge);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.20), new THREE.MeshPhongMaterial({ color: 0x6a3818, shininess: 8 }));
  handle.position.z = 0.22;
  g.add(handle);
  return g;
}

function makeShockwaveMesh() {
  const g    = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3864 }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3864, transparent: true, opacity: 0.4 }));
  g.add(halo);
  return g;
}

function spawnEnemyProjectile({ pos, vel, damage, mesh, lifetime = 4.0, radius = 0.5, telegraphSec = 0.0, gravity = 0 }) {
  const proj = { pos: pos.clone(), vel: vel.clone(), damage, mesh, lifetime, age: 0, radius, gravity, telegraph: telegraphSec };
  mesh.position.copy(proj.pos);
  scene.add(mesh);
  enemyProjectiles.push(proj);
  return proj;
}

function spawnGroundTelegraph(pos, radius, color, durationSec) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.85, radius, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(pos);
  ring.position.y = 0.15;
  scene.add(ring);
  auraInstances.push({ mesh: ring, life: durationSec, maxLife: durationSec });
}

function bossRangedAttack(boss) {
  const kind  = boss.rangedKind;
  const px    = player.pos.x, py = player.pos.y + 0.9, pz = player.pos.z;
  const start = new THREE.Vector3(boss.pos.x, boss.pos.y + boss.height * 0.5, boss.pos.z);

  if (kind === 'sauce') {
    const dx = px - start.x, dz = pz - start.z;
    const horizDist = Math.hypot(dx, dz);
    const arcTime   = 1.1;
    const horizSpeed = horizDist / arcTime;
    const gravity    = 22;
    const vy = (0.4 - start.y + 0.5 * gravity * arcTime * arcTime) / arcTime;
    const vx = (dx / horizDist) * horizSpeed;
    const vz = (dz / horizDist) * horizSpeed;
    spawnGroundTelegraph(new THREE.Vector3(px, 0, pz), 1.6, 0xff5e1a, 1.1);
    spawnEnemyProjectile({ pos: start, vel: new THREE.Vector3(vx, vy, vz), damage: boss.dmg * 0.45, lifetime: arcTime + 0.05, mesh: makeSauceMesh(), radius: 0.7, gravity });
  }
  else if (kind === 'cleaver_fan') {
    const dir     = new THREE.Vector3(px - start.x, 0, pz - start.z).normalize();
    const baseAng  = Math.atan2(dir.x, dir.z);
    const fanCount = 5, fanSpread = Math.PI / 4;
    for (let i = 0; i < fanCount; i++) {
      const t = (i / (fanCount - 1)) - 0.5;
      const a = baseAng + t * fanSpread;
      spawnEnemyProjectile({ pos: start, vel: new THREE.Vector3(Math.sin(a) * 14, 0, Math.cos(a) * 14), damage: boss.dmg * 0.35, lifetime: 2.2, mesh: makeCleaverMesh(), radius: 0.55 });
    }
  }
  else if (kind === 'shockwave') {
    const dir   = new THREE.Vector3(px - start.x, 0, pz - start.z).normalize();
    const speed = 16;
    spawnGroundTelegraph(new THREE.Vector3(px, 0, pz), 2.4, 0xff3864, 0.9);
    spawnEnemyProjectile({ pos: start, vel: dir.clone().multiplyScalar(speed), damage: boss.dmg * 0.6, lifetime: 2.5, mesh: makeShockwaveMesh(), radius: 0.85 });
    setTimeout(() => {
      if (!enemies.includes(boss)) return;
      const dir2 = new THREE.Vector3(player.pos.x - boss.pos.x, 0, player.pos.z - boss.pos.z).normalize();
      spawnEnemyProjectile({ pos: new THREE.Vector3(boss.pos.x, boss.pos.y + boss.height * 0.5, boss.pos.z), vel: dir2.multiplyScalar(speed * 0.85), damage: boss.dmg * 0.4, lifetime: 2.5, mesh: makeShockwaveMesh(), radius: 0.85 });
    }, 350);
  }
}

// ============================================================
// ENEMY PROJECTILE UPDATE
// ============================================================
function updateEnemyProjectiles(dt) {
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const p = enemyProjectiles[i];
    p.age += dt;
    if (p.age > p.lifetime) {
      killMesh(p.mesh);
      enemyProjectiles.splice(i, 1);
      continue;
    }
    if (p.gravity) p.vel.y -= p.gravity * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y += dt * 12;
    p.mesh.rotation.x += dt * 6;
    const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
    const dy = (player.pos.y + 1.0) - p.pos.y;
    // Use 2D horizontal distance + Y-range tolerance so projectiles fired from
    // boss mid-height (1.8–2.5u above ground) still register hits at player level.
    const horizDist2d = Math.sqrt(dx*dx + dz*dz);
    if (horizDist2d < p.radius + 0.55 && Math.abs(dy) < 2.5) {
      damagePlayer(p.damage);
      spawnParticle(p.pos.clone(), 0xff5e1a, 8, 5);
      killMesh(p.mesh);
      enemyProjectiles.splice(i, 1);
      continue;
    }
    if (p.gravity && p.pos.y < 0.2) {
      if (Math.hypot(dx, dz) < 1.6) damagePlayer(p.damage * 0.6);
      spawnParticle(p.pos.clone().setY(0.3), 0xff5e1a, 10, 6);
      const splashRing = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 1.6, 24),
        new THREE.MeshBasicMaterial({ color: 0xff5e1a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      splashRing.rotation.x = -Math.PI / 2;
      splashRing.position.copy(p.pos);
      splashRing.position.y = 0.18;
      scene.add(splashRing);
      auraInstances.push({ mesh: splashRing, life: 0.5, maxLife: 0.5 });
      killMesh(p.mesh);
      enemyProjectiles.splice(i, 1);
    }
  }
}

// ============================================================
// ORBITAL UPDATE
// ============================================================
function updateOrbitals(dt) {
  const orbitW = player.weapons.find(w => w.id === 'orbit');
  if (!orbitW) return;
  const r   = orbitW.radius * player.projectileMult;
  const sp  = orbitW.speed;
  const dmg = orbitW.dmg * player.damageMult;
  for (let i = 0; i < orbitals.length; i++) {
    const o = orbitals[i];
    o.angle += sp * dt;
    const x = player.pos.x + Math.cos(o.angle) * r;
    const z = player.pos.z + Math.sin(o.angle) * r;
    o.mesh.position.set(x, player.pos.y + 1.0, z);
    o.mesh.rotation.y = performance.now() * 0.012;
    for (const e of enemies) {
      const cd = o.hitCd.get(e) || 0;
      if (cd > 0) { o.hitCd.set(e, cd - dt); continue; }
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < e.radius + 0.45 * player.projectileMult) {
        const isCrit   = Math.random() < player.critChance;
        const finalDmg = isCrit ? dmg * player.critMult : dmg;
        damageEnemy(e, finalDmg, isCrit, 'orbit');
        o.hitCd.set(e, 0.4);
        const dir = new THREE.Vector3().subVectors(e.pos, player.pos).setY(0).normalize();
        e.knockback.add(dir.multiplyScalar(2 * player.knockback));
      }
    }
  }
}

// ============================================================
// WEAPONS UPDATE
// ============================================================
function updateWeapons(dt) {
  for (const w of player.weapons) {
    WEAPONS[w.id].tick(w, dt);
  }
}

// ============================================================
// MAIN UPDATE LOOP
// ============================================================
export function update(dt) {
  if (gameState.state !== 'playing') return;

  gameState.gameTime += dt;
  updateSpawning(dt);
  updatePlayer(dt);
  if (playerMixer) playerMixer.update(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateEnemyProjectiles(dt);
  updateOrbitals(dt);
  updateGems(dt);
  updateGold(dt);
  updateAuras(dt);
  updateSmokeClouds(dt);
  updateShieldOrbital(dt);
  updateParticles(dt);
  updateWeapons(dt);
  updateChests(dt);

  gameState.chestTimer -= dt;
  if (gameState.chestTimer <= 0) {
    gameState.chestTimer = 120;
    const p = pickChestPosition();
    spawnChest(p.x, p.z, Math.random() < 0.4 ? 'rare' : 'common');
  }

  updateBossArrow();
  tickHUD(dt);

  // Win condition
  if (gameState.bossSpawned) {
    const finalBossAlive = enemies.some(e => e.isBoss && e.bossTier === 'final');
    if (!finalBossAlive) triggerGameOver(true);
  }
}

// ============================================================
// INIT — wire all injection callbacks and kick off initUI
// ============================================================
export function initGame() {
  // Inject damageEnemy into all consumers
  setDamageEnemyCb(damageEnemy);
  setDamageEnemyForWeapons(damageEnemy);
  setDamageEnemyForUI(damageEnemy);

  // Inject resetGame so ui.js buttons can call it
  setResetGameCb(resetGame);

  // Inject tryJump / tryDash so keyboard/mobile can call them
  setJumpDashCbs(tryJump, tryDash);

  // Inject callBossNow so pause menu can trigger it
  setCallBossCb(callBossNow);

  // processPendingLevelUp is called by updateGems in entities.js
  setOnLevelUpReady(processPendingLevelUp);

  // Initialise UI (wires remaining injections, DOM listeners, etc.)
  initUI();
}
