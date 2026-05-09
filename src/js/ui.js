// ui.js — HUD, choice screen, level-up, armory, pause menu, input handling, game-over
// Imports from modules that ui.js READS from (no circular imports):
//   renderer.js  — scene/camera/renderer references, isMobile, tryEnterFullscreen
//   entities.js  — player, enemies, tryInteract, setOpenChestDeps, generateChestOffers
//   weapons.js   — WEAPONS, ARMOR, TOMES, rebuildOrbits
//   upgrades.js  — STAT_UPGRADES, SYNERGY_UPGRADES
//   state.js     — gameState, cam
//   config.js    — CFG, RARITY
//   profile.js   — Profile, CATALOG
//   utils.js     — tmp, tmp2
//
// Circular dependency breaks:
//   damagePlayer → damageEnemy (game.js): use _damageEnemyFn, set via setDamageEnemyForUI()
//   start/restart buttons → resetGame (game.js): use _resetGameFn, set via setResetGameCb()
//   keyboard/mobile → tryJump, tryDash (game.js): use _jumpFn/_dashFn, set via setJumpDashCbs()
//   openChest → presentChoiceScreen (this file): setOpenChestDeps is called in initUI()

import { camera, renderer, isMobile, tryEnterFullscreen } from './renderer.js';
import {
  player, enemies,
  tryInteract, setOpenChestDeps,
  generateChestOffers,
  spawnParticle,
} from './entities.js';
import { WEAPONS, ARMOR, TOMES, rebuildOrbits } from './weapons.js';
import { STAT_UPGRADES, SYNERGY_UPGRADES } from './upgrades.js';
import { gameState, cam } from './state.js';
import { CFG, RARITY, STAGE_MULTS, DIFFICULTIES } from './config.js';
import { Profile, CATALOG } from './profile.js';
import { tmp, tmp2 } from './utils.js';

// ============================================================
// INJECTION CALLBACKS (break circular deps)
// ============================================================
let _damageEnemyFn = null;
/** Called by game.js: setDamageEnemyForUI(damageEnemy) */
export function setDamageEnemyForUI(fn) { _damageEnemyFn = fn; }

let _resetGameFn = null;
/** Called by game.js: setResetGameCb(resetGame) */
export function setResetGameCb(fn) { _resetGameFn = fn; }

let _jumpFn = null;
let _dashFn = null;
/** Called by game.js: setJumpDashCbs(tryJump, tryDash) */
export function setJumpDashCbs(jFn, dFn) { _jumpFn = jFn; _dashFn = dFn; }

let _callBossFn = null;
/** Called by game.js: setCallBossCb(callBossNow) */
export function setCallBossCb(fn) { _callBossFn = fn; }

// ============================================================
// INPUT STATE (exported so game.js can read them)
// ============================================================
export const keys = {};
export const joystickInput  = { x: 0, y: 0 };
export const camJoystickInput = { x: 0, y: 0 };

// Pointer lock state
let _mouseLocked = false;
/** Live accessor used by other parts of ui.js and injected into setOpenChestDeps */
export function mouseLocked() { return _mouseLocked; }

// ============================================================
// HUD ELEMENT CACHE
// ============================================================
const hudEls = {
  hpFill:     document.getElementById('hp-fill'),
  shieldFill: document.getElementById('shield-fill'),
  hpText:     document.getElementById('hp-text'),
  xpFill:     document.getElementById('xp-fill'),
  lvlBadge:   document.getElementById('lvl-badge'),
  timerVal:   document.querySelector('#timer-tile .value'),
  timerTile:  document.getElementById('timer-tile'),
  goldVal:    document.getElementById('gold-val'),
  killsVal:   document.getElementById('kills-val'),
  dashBtn:    document.getElementById('dash-btn'),
  bossWrap:   document.getElementById('boss-wrap'),
  bossName:   document.getElementById('boss-name'),
  bossFill:   document.getElementById('boss-fill'),
  bossText:   document.getElementById('boss-text'),
};
let _hudTimer = 0;

// ============================================================
// DAMAGE NUMBERS (recycled pool)
// ============================================================
const dmgOverlay = document.getElementById('dmg-overlay');
const _dmgPool = [];
(function () {
  for (let i = 0; i < 20; i++) {
    const el = document.createElement('div');
    el.style.display = 'none';
    dmgOverlay.appendChild(el);
    _dmgPool.push(el);
  }
})();

export function showDamage(worldPos, val, crit) {
  tmp.copy(worldPos);
  tmp.y += 1;
  tmp.project(camera);
  if (tmp.z > 1) return; // behind camera
  const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
  const el = _dmgPool.find(e => e.style.display === 'none') || _dmgPool[0];
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.textContent = val + (crit ? '!' : '');
  el.className = '';
  void el.offsetWidth;
  el.className = 'dmg-num' + (crit ? ' crit' : '');
  el.style.display = '';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 820);
}

// ============================================================
// CAMERA SHAKE (written here; game.js reads cam.shake)
// ============================================================
// cameraShake accumulator: game.js applies it to camera each frame via cam.shake
// We expose an addShake helper so damagePlayer / triggerBossPhase can add to it.
export function addCameraShake(amount) {
  cam.shake = (cam.shake || 0) + amount;
}

// ============================================================
// PLAYER DAMAGE
// ============================================================
export function damagePlayer(dmg, attacker) {
  if (player.invuln > 0) return;
  if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) {
    showDamage(player.pos, 'DODGE', false);
    player.invuln = 0.25;
    return;
  }
  // Thorn reflection
  if (attacker && player.thorns > 0 && !attacker.isBoss && _damageEnemyFn) {
    _damageEnemyFn(attacker, player.thorns, false);
  }
  let final = Math.max(1, dmg - player.armor);
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, final);
    player.shield -= absorbed;
    final -= absorbed;
  }
  player.shieldRegenDelay = 5;
  if (final > 0) player.hp -= final;
  player.hurtFlash = 0.3;
  player.invuln = 0.5;
  addCameraShake(Math.min(2.5, final * 0.04 + 0.4));
  document.getElementById('flash').classList.add('hit');
  setTimeout(() => document.getElementById('flash').classList.remove('hit'), 120);
  if (player.hp <= 0) {
    if (player.hasRevive) {
      player.hasRevive = false;
      player.hp = Math.ceil(player.maxHp * 0.3);
      player.invuln = 3.0;
      showAlert('LAST SLICE! 💝', '#ff3864');
      return;
    }
    player.hp = 0;
    triggerGameOver(false);
  }
}

// ============================================================
// HUD UPDATES
// ============================================================
export function updateHUD() {
  const hpPct = (player.hp / player.maxHp) * 100;
  hudEls.hpFill.style.width = hpPct + '%';
  const shieldPct = player.shieldMax > 0 ? Math.min(100, (player.shield / player.maxHp) * 100) : 0;
  hudEls.shieldFill.style.width = shieldPct + '%';
  const shieldTxt = player.shieldMax > 0 ? ` ❎${Math.ceil(player.shield)}` : '';
  hudEls.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}` + shieldTxt;

  if (hudEls.dashBtn) {
    const dashCdMax = 1.5 * (player.dashCdMult || 1);
    const dashRem   = Math.max(0, player.dashCd);
    const dashPct   = Math.min(100, (dashRem / dashCdMax) * 100);
    hudEls.dashBtn.style.setProperty('--dash-cd', dashPct + '%');
    if (dashRem > 0) hudEls.dashBtn.classList.add('cooling');
    else             hudEls.dashBtn.classList.remove('cooling');
  }

  hudEls.xpFill.style.width = (player.xp / player.xpToNext) * 100 + '%';
  hudEls.lvlBadge.textContent = `LV ${player.level}`;

  const timeLeft = Math.max(0, CFG.GAME_TIME - gameState.gameTime);
  const mm = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const ss = Math.floor(timeLeft % 60).toString().padStart(2, '0');
  hudEls.timerVal.textContent = `${mm}:${ss}`;
  if (timeLeft < 60) hudEls.timerVal.classList.add('danger');
  else               hudEls.timerVal.classList.remove('danger');

  hudEls.goldVal.textContent  = player.gold;
  hudEls.killsVal.textContent = gameState.kills;

  const boss = enemies.find(e => e.isBoss);
  if (boss) {
    hudEls.bossWrap.classList.remove('hidden');
    hudEls.bossName.textContent = boss.def.name;
    const bpct = Math.max(0, (boss.hp / boss.maxHp) * 100);
    hudEls.bossFill.style.width = bpct + '%';
    hudEls.bossText.textContent = `${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;
  } else {
    hudEls.bossWrap.classList.add('hidden');
  }
}

/** Call this from game.js update() every frame (throttled by _hudTimer). */
export function tickHUD(dt) {
  _hudTimer -= dt;
  if (_hudTimer <= 0) { _hudTimer = 0.1; updateHUD(); }
}

// ============================================================
// BOSS ARROW
// ============================================================
const _bossArrowEl     = document.getElementById('boss-arrow');
const _bossArrowColors = { mini1: '#ff5e1a', mini2: '#ff3864', final: '#ffd23f' };

export function updateBossArrow() {
  const boss = enemies.find(e => e.isBoss);
  if (!boss) { _bossArrowEl.style.display = 'none'; return; }

  tmp2.copy(boss.pos).setY(boss.pos.y + 2);
  tmp2.project(camera);

  if (tmp2.z < 1 && Math.abs(tmp2.x) < 0.88 && Math.abs(tmp2.y) < 0.88) {
    _bossArrowEl.style.display = 'none';
    return;
  }

  const W = window.innerWidth, H = window.innerHeight;
  const margin = 44;
  const hw = W / 2 - margin, hh = H / 2 - margin;
  const angle = Math.atan2(tmp2.x, tmp2.y);
  const sdx = tmp2.x, sdy = -tmp2.y;
  const len = Math.hypot(sdx, sdy) || 1;
  const ndx = sdx / len, ndy = sdy / len;
  const t = Math.min(
    Math.abs(ndx) > 1e-6 ? hw / Math.abs(ndx) : Infinity,
    Math.abs(ndy) > 1e-6 ? hh / Math.abs(ndy) : Infinity
  );
  const ex = W / 2 + ndx * t;
  const ey = H / 2 + ndy * t;

  _bossArrowEl.style.display    = 'block';
  _bossArrowEl.style.left       = (ex - 12) + 'px';
  _bossArrowEl.style.top        = (ey - 12) + 'px';
  _bossArrowEl.style.transform  = `rotate(${angle}rad)`;
  _bossArrowEl.style.background = _bossArrowColors[boss.bossTier] || '#ff3864';
}

// ============================================================
// LOADOUT DISPLAY
// ============================================================
export function updateLoadoutDisplay() {
  function renderRow(domId, cssClass, items, registry, maxSlots) {
    const el = document.getElementById(domId);
    if (!el) return;
    el.innerHTML = '';
    for (let i = 0; i < maxSlots; i++) {
      const item = items[i];
      const slot = document.createElement('div');
      if (item) {
        const def = registry[item.id];
        slot.className = `loadout-slot ${cssClass}`;
        slot.title = `${def.name} L${item.level}`;
        slot.innerHTML = `${def.icon}<span class="lvl">L${item.level}</span>`;
      } else {
        slot.className = `loadout-slot ${cssClass} empty`;
        slot.innerHTML = `·`;
      }
      el.appendChild(slot);
    }
  }
  renderRow('weapon-slots', 'weapon', player.weapons,      WEAPONS, player.maxWeaponSlots);
  renderRow('armor-slots',  'armor',  player.armor_items,  ARMOR,   player.maxArmorSlots);
  renderRow('tome-slots',   'tome',   player.tomes,        TOMES,   player.maxTomeSlots);
}
// Backwards-compat alias
export function updateWeaponList() { updateLoadoutDisplay(); }

// ============================================================
// BIG ALERT BANNER
// ============================================================
export function showAlert(text, color = '#ffd23f') {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position: fixed; top: 30%; left: 50%; transform: translate(-50%, -50%);
    font-family: 'Press Start 2P', monospace; font-size: 38px;
    color: ${color}; text-shadow: 4px 4px 0 #000;
    z-index: 12; pointer-events: none;
    letter-spacing: 3px;
    animation: alertSlam 2.5s ease-out forwards;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ============================================================
// RARITY PICKER
// ============================================================
export function pickRarity() {
  const L = (player.luck || 0) + (player.curse || 0) * 0.5;
  const weights = {
    common:    Math.max(5, RARITY.common.weight    - L * 9),
    uncommon:               RARITY.uncommon.weight  + L * 2,
    rare:                   RARITY.rare.weight      + L * 3,
    epic:                   RARITY.epic.weight      + L * 2.4,
    legendary:              RARITY.legendary.weight + L * 1.4,
  };
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return name;
  }
  return 'common';
}

// ============================================================
// OFFER GENERATION & APPLICATION
// ============================================================
export function generateOffers() {
  const candidates = [];

  for (const wId of Object.keys(WEAPONS)) {
    const owned = player.weapons.find(w => w.id === wId);
    const def   = WEAPONS[wId];
    if (owned) {
      if (owned.level < def.maxLevel) candidates.push({ kind: 'weapon-up', weaponId: wId, weight: 9 });
    } else if (player.weapons.length < player.maxWeaponSlots) {
      candidates.push({ kind: 'weapon-new', weaponId: wId, weight: 4 });
    }
  }

  for (const aId of Object.keys(ARMOR)) {
    const owned = player.armor_items.find(a => a.id === aId);
    const def   = ARMOR[aId];
    if (owned) {
      if (owned.level < def.maxLevel) candidates.push({ kind: 'armor-up', armorId: aId, weight: 8 });
    } else if (player.armor_items.length < player.maxArmorSlots) {
      candidates.push({ kind: 'armor-new', armorId: aId, weight: 5 });
    }
  }

  for (const tId of Object.keys(TOMES)) {
    const owned = player.tomes.find(t => t.id === tId);
    const def   = TOMES[tId];
    if (owned) {
      if (owned.level < def.maxLevel) candidates.push({ kind: 'tome-up', tomeId: tId, weight: 7 });
    } else if (player.tomes.length < player.maxTomeSlots) {
      candidates.push({ kind: 'tome-new', tomeId: tId, weight: 5 });
    }
  }

  const _weaponsDone = player.weapons.length    >= player.maxWeaponSlots &&
    player.weapons.every(w    => w.level >= (WEAPONS[w.id]?.maxLevel ?? 1));
  const _armorDone   = player.armor_items.length >= player.maxArmorSlots &&
    player.armor_items.every(a => a.level >= (ARMOR[a.id]?.maxLevel ?? 1));
  const _tomesDone   = player.tomes.length       >= player.maxTomeSlots &&
    player.tomes.every(t       => t.level >= (TOMES[t.id]?.maxLevel ?? 1));
  if (_weaponsDone && _armorDone && _tomesDone) return [];

  for (const su of STAT_UPGRADES) {
    const cur = player.statLevels?.[su.id] || 0;
    if (cur < su.max) {
      let w = 5;
      if (player.hp / player.maxHp < 0.4 &&
          ['maxhp','regen','armor','shield','lifesteal'].includes(su.id)) w = 9;
      candidates.push({ kind: 'stat', statId: su.id, weight: w });
    }
  }

  for (const sy of SYNERGY_UPGRADES) {
    if (player.statLevels?.[sy.id]) continue;
    const owned = player.weapons.find(w => w.id === sy.weaponId);
    if (!owned || owned.level < sy.minLevel) continue;
    candidates.push({ kind: 'synergy', synergyId: sy.id, weight: 9 });
  }

  const picks = [];
  for (let i = 0; i < 3 && candidates.length > 0; i++) {
    const totalW = candidates.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * totalW;
    let idx = 0;
    for (let j = 0; j < candidates.length; j++) {
      r -= candidates[j].weight;
      if (r <= 0) { idx = j; break; }
    }
    picks.push(candidates[idx]);
    candidates.splice(idx, 1);
  }
  for (const p of picks) {
    p.rarity = pickRarity();
    if (p.kind === 'weapon-new' || p.kind === 'armor-new' || p.kind === 'tome-new') p.rarity = 'rare';
    if (p.kind === 'synergy') {
      const order = ['common','uncommon','rare','epic','legendary'];
      if (order.indexOf(p.rarity) < 2) p.rarity = 'rare';
    }
  }
  return picks;
}

export function applyOffer(o) {
  if (o.kind === 'weapon-new') {
    const w = { ...WEAPONS[o.weaponId].init(), id: o.weaponId, level: 1 };
    if (o.weaponId === 'orbit') rebuildOrbits(w);
    player.weapons.push(w);
  } else if (o.kind === 'weapon-up') {
    const w = player.weapons.find(x => x.id === o.weaponId);
    WEAPONS[o.weaponId].upgrade(w);
  } else if (o.kind === 'armor-new') {
    const a = { ...ARMOR[o.armorId].init(), id: o.armorId, level: 0 };
    player.armor_items.push(a);
    ARMOR[o.armorId].upgrade(a);
  } else if (o.kind === 'armor-up') {
    const a = player.armor_items.find(x => x.id === o.armorId);
    ARMOR[o.armorId].upgrade(a);
  } else if (o.kind === 'tome-new') {
    const t = { ...TOMES[o.tomeId].init(), id: o.tomeId, level: 0 };
    player.tomes.push(t);
    TOMES[o.tomeId].upgrade(t);
  } else if (o.kind === 'tome-up') {
    const t = player.tomes.find(x => x.id === o.tomeId);
    TOMES[o.tomeId].upgrade(t);
  } else if (o.kind === 'stat') {
    const su = STAT_UPGRADES.find(s => s.id === o.statId);
    su.apply();
    player.statLevels = player.statLevels || {};
    player.statLevels[o.statId] = (player.statLevels[o.statId] || 0) + 1;
    const mult = RARITY[o.rarity].mult - 1;
    if (mult > 0) {
      const extra = Math.floor(mult);
      for (let i = 0; i < extra; i++) {
        if (player.statLevels[o.statId] < su.max) {
          su.apply();
          player.statLevels[o.statId]++;
        }
      }
    }
  } else if (o.kind === 'synergy') {
    const sy = SYNERGY_UPGRADES.find(s => s.id === o.synergyId);
    sy.apply();
    player.statLevels = player.statLevels || {};
    player.statLevels[o.synergyId] = 1;
  }
  updateLoadoutDisplay();
}

// ============================================================
// CHOICE / LEVEL-UP SCREEN
// ============================================================
export function buildChoiceCard(o, onPick) {
  const card = document.createElement('div');
  card.className = `choice ${o.rarity}`;
  let icon = '?', name = '?', desc = '?', lvlTag = '';
  if (o.kind === 'weapon-new') {
    const def = WEAPONS[o.weaponId];
    icon = def.icon; name = def.name; desc = def.desc;
    lvlTag = 'NEW WEAPON';
    card.classList.add('new');
  } else if (o.kind === 'weapon-up') {
    const def = WEAPONS[o.weaponId];
    const w   = player.weapons.find(x => x.id === o.weaponId);
    icon = def.icon; name = def.name;
    desc = def.describeNext(w);
    lvlTag = `LV ${w.level + 1}`;
  } else if (o.kind === 'armor-new') {
    const def = ARMOR[o.armorId];
    icon = def.icon; name = def.name; desc = def.desc;
    lvlTag = 'NEW ARMOR';
    card.classList.add('new');
  } else if (o.kind === 'armor-up') {
    const def = ARMOR[o.armorId];
    const a   = player.armor_items.find(x => x.id === o.armorId);
    icon = def.icon; name = def.name;
    desc = def.describeNext(a);
    lvlTag = `LV ${a.level + 1}`;
  } else if (o.kind === 'tome-new') {
    const def = TOMES[o.tomeId];
    icon = def.icon; name = def.name; desc = def.desc;
    lvlTag = 'NEW TOME';
    card.classList.add('new');
  } else if (o.kind === 'tome-up') {
    const def = TOMES[o.tomeId];
    const t   = player.tomes.find(x => x.id === o.tomeId);
    icon = def.icon; name = def.name;
    desc = def.describeNext(t);
    lvlTag = `LV ${t.level + 1}`;
  } else if (o.kind === 'stat') {
    const su  = STAT_UPGRADES.find(s => s.id === o.statId);
    icon = su.icon; name = su.name; desc = su.desc;
    const cur = player.statLevels?.[o.statId] || 0;
    lvlTag = `${cur + 1}/${su.max}`;
  } else if (o.kind === 'synergy') {
    const sy  = SYNERGY_UPGRADES.find(s => s.id === o.synergyId);
    icon = sy.icon; name = sy.name; desc = sy.desc;
    lvlTag = 'SYNERGY';
    card.classList.add('new');
  } else if (o.kind === 'chest-loot') {
    icon = o.icon; name = o.name; desc = o.desc;
    lvlTag = o.lvlTag || 'LOOT';
    if (o.special) card.classList.add('new');
  }
  card.innerHTML = `
    <div class="rarity-flag">${o.rarity.toUpperCase()}</div>
    <div class="icon-big">${icon}</div>
    <h3>${name}</h3>
    <div class="desc">${desc}</div>
    <div class="lvl-tag">${lvlTag}</div>
  `;
  card.addEventListener('click', () => onPick(o));
  return card;
}

export function presentChoiceScreen({ offers, title, canSkip, allowReroll, rerollSource, onPick, onSkip, onReroll }) {
  const screen  = document.getElementById('levelup-screen');
  const titleEl = document.getElementById('levelup-title');
  if (titleEl) titleEl.textContent = title || 'LEVEL UP';

  const c = document.getElementById('choices');
  c.innerHTML = '';
  for (const o of offers) {
    c.appendChild(buildChoiceCard(o, (chosen) => {
      hideChoiceActions();
      onPick(chosen);
    }));
  }

  const actions = document.getElementById('levelup-actions');
  actions.innerHTML = '';
  let rerollsUsed = 0;

  function regenerate() {
    const fresh = (rerollSource === 'chest')
      ? generateChestOffers((window.__chestCtx && window.__chestCtx.tier) || 'common')
      : generateOffers();
    c.innerHTML = '';
    for (const o of fresh) {
      c.appendChild(buildChoiceCard(o, (chosen) => {
        hideChoiceActions();
        onPick(chosen);
      }));
    }
  }

  function getGoldRerollCost() {
    const base = 20 + (player.level || 1) * 10;
    return Math.round(base * Math.pow(1.5, rerollsUsed));
  }

  if (allowReroll) {
    const gReroll = document.createElement('button');
    gReroll.className = 'choice-action gold-reroll';
    function refreshGoldRerollLabel() {
      const cost = getGoldRerollCost();
      gReroll.innerHTML = `<span class="gold-icon">💰</span> REROLL <span class="cost ${player.gold < cost ? 'unaffordable' : ''}">${cost}g</span>`;
      gReroll.disabled = player.gold < cost;
    }
    refreshGoldRerollLabel();
    gReroll.addEventListener('click', () => {
      const cost = getGoldRerollCost();
      if (player.gold < cost) return;
      player.gold -= cost;
      rerollsUsed++;
      const goldEl = document.getElementById('gold-val');
      if (goldEl) goldEl.textContent = player.gold;
      if (onReroll) onReroll(); else regenerate();
      refreshGoldRerollLabel();
    });
    actions.appendChild(gReroll);
  }

  if (allowReroll && isMobile()) {
    const reroll = document.createElement('button');
    reroll.className = 'choice-action reroll';
    reroll.innerHTML = '<span class="ad-icon">▶</span> WATCH AD: REROLL';
    reroll.addEventListener('click', () => {
      reroll.disabled = true;
      window.GameAds.showRewarded((success) => {
        reroll.disabled = false;
        if (!success) return;
        rerollsUsed++;
        if (onReroll) onReroll(); else regenerate();
      });
    });
    actions.appendChild(reroll);
  }

  if (canSkip) {
    const skip = document.createElement('button');
    skip.className = 'choice-action skip';
    skip.textContent = 'SKIP';
    skip.addEventListener('click', () => {
      hideChoiceActions();
      onSkip();
    });
    actions.appendChild(skip);
  }

  screen.classList.remove('hidden');
}

function hideChoiceActions() {
  const actions = document.getElementById('levelup-actions');
  if (actions) actions.innerHTML = '';
}

export function showLevelUp() {
  gameState.state = 'levelup';
  if (_mouseLocked) document.exitPointerLock();
  const offers = generateOffers();
  if (offers.length === 0) {
    player.hp = Math.min(player.maxHp, player.hp + 30);
    onLevelUpDone();
    return;
  }
  presentChoiceScreen({
    offers,
    title: 'LEVEL UP',
    canSkip: true,
    allowReroll: true,
    rerollSource: 'levelup',
    onPick:  (o) => { applyOffer(o); onLevelUpDone(); },
    onSkip:  () => onLevelUpDone(),
  });
}

export function onLevelUpDone() {
  document.getElementById('levelup-screen').classList.add('hidden');
  if (player.xp >= player.xpToNext) {
    setTimeout(processPendingLevelUp, 50);
  } else {
    gameState.state = 'playing';
    if (isMobile()) tryEnterFullscreen();
    if (!isMobile()) renderer.domElement.requestPointerLock();
  }
}

export function processPendingLevelUp() {
  if (player.xp >= player.xpToNext) {
    player.xp       -= player.xpToNext;
    player.level++;
    player.xpToNext  = Math.floor(5 + player.level * 2.2 + Math.pow(player.level, 1.4));
    showLevelUp();
  } else {
    gameState.state = 'playing';
  }
}

// ============================================================
// GAME OVER / VICTORY
// ============================================================
let __runsPlayed = 0;

export function triggerGameOver(victory) {
  _bossArrowEl.style.display = 'none';
  gameState.state = victory ? 'victory' : 'gameover';
  const ov    = document.getElementById('gameover-screen');
  const title = document.getElementById('gameover-title');
  const diffLabel = (DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal).label;
  const stageLine = `STAGE ${gameState.stage} — ${diffLabel}`;
  if (victory) {
    title.textContent = `YOU WALLOPED IT!`;
    title.classList.add('victory');
  } else {
    title.textContent = 'YOU DIED';
    title.classList.remove('victory');
  }
  // Subtitle showing stage/difficulty
  let sub = document.getElementById('gameover-subtitle');
  if (!sub) {
    sub = document.createElement('div');
    sub.id = 'gameover-subtitle';
    sub.style.cssText = 'font-family:"VT323",monospace;font-size:20px;color:var(--ink-dim);margin:4px 0 8px;';
    title.after(sub);
  }
  sub.textContent = stageLine;
  const stats  = document.getElementById('gameover-stats');
  const btns   = document.getElementById('gameover-btns');
  const m      = Math.floor(gameState.gameTime / 60).toString().padStart(2, '0');
  const s      = Math.floor(gameState.gameTime % 60).toString().padStart(2, '0');
  const sliceLine = (gameState.slicesEarned > 0)
    ? `<div class="lbl">🍕 SLICES</div><div class="val slices-val">+${gameState.slicesEarned}</div>`
    : '';
  stats.innerHTML = `
    <div class="lbl">TIME</div><div class="val">${m}:${s}</div>
    <div class="lbl">LEVEL</div><div class="val">${player.level}</div>
    <div class="lbl">KILLS</div><div class="val">${gameState.kills}</div>
    <div class="lbl">GOLD</div><div class="val">${player.gold}</div>
    <div class="lbl">WEAPONS</div><div class="val">${player.weapons.length}</div>
    ${sliceLine}
  `;
  stats.style.display = 'none';
  btns.innerHTML = `
    <div class="end-actions">
      <button class="btn" id="restart-btn">RUN IT BACK</button>
      <button class="btn dim" id="stats-btn">SEE STATS</button>
      <button class="btn dim" id="mainmenu-btn">MAIN MENU</button>
    </div>`;

  ov.classList.remove('hidden');
  if (_mouseLocked) document.exitPointerLock();

  __runsPlayed++;
  if (__runsPlayed >= 2 && __runsPlayed % 2 === 0) window.GameAds.showInterstitial();
  window.GameAds.preload();
}

// ============================================================
// AD BRIDGE
// ============================================================
const GameAds = (function () {
  function showInterstitial(cb) {
    if (window.AndroidAds && typeof window.AndroidAds.showInterstitial === 'function') {
      try { window.AndroidAds.showInterstitial(); } catch (e) {}
    }
    if (cb) setTimeout(cb, 0);
  }
  function showRewarded(cb) {
    if (window.AndroidAds && typeof window.AndroidAds.showRewarded === 'function') {
      try {
        window.AndroidAds.showRewarded();
        window.__onRewarded = (success) => {
          window.__onRewarded = null;
          if (cb) cb(!!success);
        };
        return;
      } catch (e) {}
    }
    showFakeRewardedAd(cb);
  }
  function preload() {
    if (window.AndroidAds && typeof window.AndroidAds.preloadInterstitial === 'function') {
      try { window.AndroidAds.preloadInterstitial(); } catch (e) {}
    }
  }
  return { showInterstitial, showRewarded, preload };
})();
window.GameAds = window.GameAds || GameAds;

function showFakeRewardedAd(cb) {
  const overlay = document.createElement('div');
  overlay.id = 'fake-ad-overlay';
  overlay.innerHTML = `
    <div class="fake-ad-card">
      <div class="fake-ad-tag">[ TEST ] REWARDED AD</div>
      <div class="fake-ad-banner">
        <div class="fake-ad-pulse">▶</div>
        <div class="fake-ad-msg">SIMULATING AD<br>This is where a real ad would play</div>
      </div>
      <div class="fake-ad-bar"><div class="fake-ad-fill"></div></div>
      <div class="fake-ad-actions">
        <button class="fake-ad-close">CLOSE (no reward)</button>
        <button class="fake-ad-claim" disabled>CLAIM REWARD (5s)</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const fill  = overlay.querySelector('.fake-ad-fill');
  const claim = overlay.querySelector('.fake-ad-claim');
  const close = overlay.querySelector('.fake-ad-close');
  const TOTAL = 5;
  let done    = false;
  const start = performance.now();
  function tick() {
    if (done) return;
    const elapsed = (performance.now() - start) / 1000;
    const pct = Math.min(1, elapsed / TOTAL);
    fill.style.width = (pct * 100) + '%';
    const remaining = Math.max(0, Math.ceil(TOTAL - elapsed));
    if (pct >= 1) {
      claim.disabled = false;
      claim.textContent = 'CLAIM REWARD';
    } else {
      claim.textContent = `CLAIM REWARD (${remaining}s)`;
    }
    if (!done) requestAnimationFrame(tick);
  }
  tick();
  function finish(success) {
    if (done) return;
    done = true;
    overlay.remove();
    if (cb) cb(success);
  }
  claim.addEventListener('click', () => { if (!claim.disabled) finish(true); });
  close.addEventListener('click', () => finish(false));
}

// ============================================================
// ARMORY UI
// ============================================================
function resolveCatalogEntry(entry, category) {
  const out = { ...entry };
  if (entry.gameRef) {
    let registry = null;
    if (category === 'weapons') registry = WEAPONS;
    else if (category === 'armor') registry = ARMOR;
    else if (category === 'tomes') registry = TOMES;
    if (registry && registry[entry.gameRef]) {
      const g = registry[entry.gameRef];
      out.name = out.name || g.name;
      out.icon = out.icon || g.icon;
      out.desc = out.desc || g.desc;
    }
  }
  return out;
}

export function syncSliceDisplays() {
  const n = Profile.get().slices;
  const a = document.getElementById('slice-count');
  const b = document.getElementById('armory-slice-count');
  if (a) a.textContent = n;
  if (b) b.textContent = n;
}

let __armoryCurrentTab = 'characters';

function renderArmoryGrid() {
  const grid = document.getElementById('armory-grid');
  grid.innerHTML = '';
  const cat      = __armoryCurrentTab;
  const entries  = CATALOG[cat] || [];
  const equipped = Profile.get().equippedCharacter;

  for (const raw of entries) {
    const entry    = resolveCatalogEntry(raw, cat);
    const unlocked = Profile.isUnlocked(entry.slug);
    const isEquipped = (cat === 'characters' && entry.slug === equipped);

    const card = document.createElement('div');
    card.className = 'armory-card';
    if (!unlocked)   card.classList.add('locked');
    if (isEquipped)  card.classList.add('equipped');

    let badgeHtml = '';
    if (isEquipped) {
      badgeHtml = `<div class="badge equipped-badge">EQUIPPED</div>`;
    } else if (entry.placeholder) {
      badgeHtml = `<div class="badge placeholder-badge">SOON</div>`;
    } else if (unlocked) {
      badgeHtml = `<div class="badge unlocked-badge">UNLOCKED</div>`;
    } else {
      badgeHtml = `<div class="badge locked-badge">🔒 LOCKED</div>`;
    }

    let footerHtml = '';
    if (cat === 'boosts') {
      const lvl = Profile.getBoostLevel(entry.slug);
      footerHtml = `<div class="boost-level">LEVEL ${lvl} / ${entry.maxLevel || 1}</div>`;
    } else if (!unlocked && entry.sliceCost) {
      const can = Profile.get().slices >= entry.sliceCost;
      footerHtml = `<div class="cost ${can ? '' : 'unaffordable'}">🍕 ${entry.sliceCost} SLICES</div>`;
    }

    card.innerHTML = `
      ${badgeHtml}
      <div class="icon-big">${entry.icon || '?'}</div>
      <div class="name">${entry.name || entry.slug}</div>
      <div class="desc">${entry.desc || ''}</div>
      ${footerHtml}
    `;
    card.addEventListener('click', () => openArmoryDetail(entry, cat));
    grid.appendChild(card);
  }
}

function openArmoryDetail(entry, cat) {
  const detail   = document.getElementById('armory-detail');
  const unlocked = Profile.isUnlocked(entry.slug);
  const equipped = (cat === 'characters' && entry.slug === Profile.get().equippedCharacter);
  const slices   = Profile.get().slices;

  let actionsHtml = '';
  if (cat === 'boosts') {
    const lvl = Profile.getBoostLevel(entry.slug);
    const max = entry.maxLevel || 1;
    if (lvl >= max) {
      actionsHtml = `<button class="upgrade-btn" disabled>MAXED</button>`;
    } else {
      const cost = entry.sliceCost;
      const can  = slices >= cost;
      actionsHtml = `<button class="upgrade-btn" data-action="boost" ${can ? '' : 'disabled'}>UPGRADE — 🍕 ${cost}</button>`;
    }
  } else if (!unlocked) {
    if (entry.placeholder && !entry.sliceCost) {
      actionsHtml = `<button class="unlock-btn" disabled>COMING SOON</button>`;
    } else if (entry.sliceCost) {
      const can = slices >= entry.sliceCost;
      actionsHtml = `<button class="unlock-btn" data-action="unlock" ${can ? '' : 'disabled'}>UNLOCK — 🍕 ${entry.sliceCost}</button>`;
    }
  } else if (cat === 'characters' && !equipped) {
    actionsHtml = `<button class="equip-btn" data-action="equip">EQUIP</button>`;
  } else if (cat === 'characters' && equipped) {
    actionsHtml = `<button class="equip-btn" disabled>EQUIPPED</button>`;
  } else {
    actionsHtml = `<div style="font-family:'VT323',monospace;color:var(--ink-dim);">Available in the run upgrade pool.</div>`;
  }

  let costStripe = '';
  if (cat === 'boosts') {
    const lvl = Profile.getBoostLevel(entry.slug);
    costStripe = `<div style="text-align:center;color:var(--ink-dim);font-family:'VT323',monospace;font-size:16px;">Current level: ${lvl} / ${entry.maxLevel || 1}</div>`;
  }

  detail.innerHTML = `
    <div class="armory-detail-card">
      <div class="icon-mega">${entry.icon || '?'}</div>
      <div class="title">${entry.name || entry.slug}</div>
      <div class="desc-full">${entry.desc || 'No description.'}</div>
      ${costStripe}
      <div class="actions">
        ${actionsHtml}
        <button class="close-btn" data-action="close">BACK</button>
      </div>
    </div>
  `;
  detail.classList.remove('hidden');

  detail.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'unlock') {
        if (Profile.spendSlices(entry.sliceCost)) {
          Profile.unlock(entry.slug);
          syncSliceDisplays();
          renderArmoryGrid();
          openArmoryDetail(entry, cat);
        }
      } else if (action === 'equip') {
        Profile.setEquippedCharacter(entry.slug);
        renderArmoryGrid();
        openArmoryDetail(entry, cat);
      } else if (action === 'boost') {
        const lvl = Profile.getBoostLevel(entry.slug);
        if (lvl < (entry.maxLevel || 1) && Profile.spendSlices(entry.sliceCost)) {
          Profile.setBoostLevel(entry.slug, lvl + 1);
          syncSliceDisplays();
          renderArmoryGrid();
          openArmoryDetail(entry, cat);
        }
      } else if (action === 'close') {
        detail.classList.add('hidden');
      }
    });
  });
}

// ============================================================
// PAUSE MENU
// ============================================================
export function openPauseMenu() {
  if (gameState.state !== 'playing') return;
  gameState.state = 'paused';
  _bossArrowEl.style.display = 'none';
  if (_mouseLocked) document.exitPointerLock();
  refreshPauseMenu();
  document.getElementById('pause-screen').classList.remove('hidden');
  document.getElementById('interact-prompt').classList.add('hidden');
}

export function closePauseMenu() {
  if (gameState.state !== 'paused') return;
  document.getElementById('pause-screen').classList.add('hidden');
  gameState.state = 'playing';
  if (isMobile()) tryEnterFullscreen();
  if (!isMobile()) renderer.domElement.requestPointerLock();
}

function refreshPauseMenu() {
  const m  = Math.floor(gameState.gameTime / 60).toString().padStart(2, '0');
  const s  = Math.floor(gameState.gameTime % 60).toString().padStart(2, '0');
  const remaining = Math.max(0, CFG.GAME_TIME - gameState.gameTime);
  const rm = Math.floor(remaining / 60).toString().padStart(2, '0');
  const rs = Math.floor(remaining % 60).toString().padStart(2, '0');
  const diffLabel = (DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal).label;
  document.getElementById('pause-stats').innerHTML = `
    <div class="pause-row"><span>Stage</span><span class="v">${gameState.stage} — ${diffLabel}</span></div>
    <div class="pause-row"><span>Time</span><span class="v">${m}:${s}</span></div>
    <div class="pause-row"><span>Remaining</span><span class="v">${rm}:${rs}</span></div>
    <div class="pause-row"><span>Kills</span><span class="v">${gameState.kills}</span></div>
    <div class="pause-row"><span>Gold</span><span class="v">${player.gold}</span></div>
    <div class="pause-row"><span>Level</span><span class="v">${player.level}</span></div>
  `;
  // Call the Boss button
  const callBtn = document.getElementById('call-boss-btn');
  if (callBtn) {
    const canCall = !gameState.bossSpawned && gameState.gameTime > 30;
    callBtn.style.display = canCall ? '' : 'none';
    callBtn.disabled = player.gold < 50;
    callBtn.style.opacity = player.gold < 50 ? '0.45' : '1';
    callBtn.onclick = () => { if (_callBossFn) _callBossFn(); closePauseMenu(); };
  }
  const dmgPct = Math.round((player.damageMult - 1) * 100);
  const cdPct  = Math.round((1 - player.cooldownMult) * 100);
  const spdPct = Math.round((player.baseSpeed / CFG.PLAYER_SPEED - 1) * 100);
  document.getElementById('pause-character').innerHTML = `
    <div class="pause-row"><span>HP</span><span class="v">${Math.ceil(player.hp)}/${player.maxHp}</span></div>
    <div class="pause-row"><span>Damage</span><span class="v">${dmgPct >= 0 ? '+' : ''}${dmgPct}%</span></div>
    <div class="pause-row"><span>Cooldown</span><span class="v">-${cdPct}%</span></div>
    <div class="pause-row"><span>Speed</span><span class="v">${spdPct >= 0 ? '+' : ''}${spdPct}%</span></div>
    <div class="pause-row"><span>Crit</span><span class="v">${Math.round(player.critChance * 100)}% / x${player.critMult.toFixed(1)}</span></div>
    <div class="pause-row"><span>Armor</span><span class="v">${player.armor}</span></div>
    <div class="pause-row"><span>Pickup</span><span class="v">${player.pickupRange.toFixed(1)}</span></div>
  `;
  function buildItemList(items, registry, label, max) {
    if (items.length === 0) return `<div class="pause-row" style="opacity:0.5"><span>${label}: none</span></div>`;
    const rows = items.map(it => {
      const def = registry[it.id];
      return `<div class="pause-weapon">
        <div class="ico">${def.icon}</div>
        <div class="nm">${def.name}</div>
        <div class="lv">L${it.level}</div>
      </div>`;
    }).join('');
    return `<div class="pause-row" style="margin:6px 0 4px"><span>${label}</span><span class="v">${items.length}/${max}</span></div>${rows}`;
  }
  document.getElementById('pause-weapons').innerHTML =
    buildItemList(player.weapons,     WEAPONS, 'Weapons', player.maxWeaponSlots) +
    buildItemList(player.armor_items, ARMOR,   'Armor',   player.maxArmorSlots) +
    buildItemList(player.tomes,       TOMES,   'Tomes',   player.maxTomeSlots);
  const slv = player.statLevels || {};
  const upgrades = STAT_UPGRADES.filter(su => slv[su.id]).map(su =>
    `<div class="pause-row"><span>${su.icon} ${su.name}</span><span class="v">${slv[su.id]}/${su.max}</span></div>`
  ).join('');
  document.getElementById('pause-upgrades').innerHTML =
    upgrades || `<div class="pause-row"><span>no upgrades yet</span></div>`;
}

// ============================================================
// CAMERA JOYSTICK APPLICATION
// ============================================================
export function applyCameraJoystick(dt) {
  if (!camJoystickInput.x && !camJoystickInput.y) return;
  cam.yaw   -= camJoystickInput.x * 1.6 * dt;
  cam.pitch  = Math.max(0.2, Math.min(1.1, cam.pitch + camJoystickInput.y * 1.2 * dt));
}

// ============================================================
// INPUT WIRING (keyboard, mouse, mobile)
// ============================================================
export function initInput() {
  document.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space'     && gameState.state === 'playing') { if (_jumpFn) _jumpFn(); }
    if (e.code === 'ShiftLeft' && gameState.state === 'playing') { if (_dashFn) _dashFn(); }
    if (e.code === 'KeyE'      && gameState.state === 'playing') tryInteract();
    if (e.code === 'Escape') {
      if      (gameState.state === 'playing') openPauseMenu();
      else if (gameState.state === 'paused')  closePauseMenu();
    }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  renderer.domElement.addEventListener('click', () => {
    if (gameState.state === 'playing' && !isMobile()) {
      renderer.domElement.requestPointerLock();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    _mouseLocked = document.pointerLockElement === renderer.domElement;
    document.getElementById('cursor').style.display = _mouseLocked ? 'block' : 'none';
    if (!_mouseLocked && gameState.state === 'playing' && !isMobile()) {
      openPauseMenu();
    }
  });
  document.addEventListener('mousemove', e => {
    if (!_mouseLocked) return;
    cam.yaw   -= e.movementX * 0.0028;
    cam.pitch  = Math.max(0.2, Math.min(1.1, cam.pitch + e.movementY * 0.0025));
  });
}

function _bindFloatingStick(zoneEl, stickEl, knobEl, output, maxRadius) {
  maxRadius = maxRadius || 60;
  let activeId = null, originX = 0, originY = 0;

  function showStickAt(x, y) {
    stickEl.style.left = `${x}px`;
    stickEl.style.top  = `${y}px`;
    knobEl.style.transform = '';
    stickEl.classList.remove('hidden');
  }
  function hideStick() {
    stickEl.classList.add('hidden');
    knobEl.style.transform = '';
  }
  function updateFromTouch(t) {
    const dx = t.clientX - originX, dy = t.clientY - originY;
    const dist = Math.hypot(dx, dy);
    const r = Math.min(dist, maxRadius);
    const a = Math.atan2(dy, dx);
    knobEl.style.transform = `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)`;
    const deadZone = 6;
    if (dist < deadZone) {
      output.x = 0; output.y = 0;
    } else {
      const useful = Math.min(dist - deadZone, maxRadius - deadZone);
      const norm   = useful / (maxRadius - deadZone);
      output.x = Math.cos(a) * norm;
      output.y = Math.sin(a) * norm;
    }
  }

  zoneEl.addEventListener('touchstart', (e) => {
    if (activeId !== null) return;
    for (const t of e.changedTouches) {
      const target = t.target;
      if (target && (target.id === 'jump-btn' || target.id === 'dash-btn' ||
                     target.id === 'interact-btn' || target.id === 'pause-btn' ||
                     (target.closest && target.closest('#jump-btn, #dash-btn, #interact-btn, #pause-btn')))) {
        continue;
      }
      activeId = t.identifier;
      originX  = t.clientX;
      originY  = t.clientY;
      showStickAt(originX, originY);
      updateFromTouch(t);
      break;
    }
    if (activeId !== null) e.preventDefault();
  }, { passive: false });

  zoneEl.addEventListener('touchmove', (e) => {
    if (activeId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) { updateFromTouch(t); e.preventDefault(); break; }
    }
  }, { passive: false });

  const release = (e) => {
    if (activeId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) {
        activeId = null; output.x = 0; output.y = 0; hideStick(); break;
      }
    }
  };
  zoneEl.addEventListener('touchend',    release, { passive: true });
  zoneEl.addEventListener('touchcancel', release, { passive: true });
}

export function initMobile() {
  if (!isMobile()) return;
  document.getElementById('mobile-controls').classList.add('active');

  _bindFloatingStick(
    document.getElementById('touch-zone-left'),
    document.getElementById('float-stick-move'),
    document.querySelector('#float-stick-move .float-knob'),
    joystickInput, 60
  );
  _bindFloatingStick(
    document.getElementById('touch-zone-right'),
    document.getElementById('float-stick-cam'),
    document.querySelector('#float-stick-cam .float-knob'),
    camJoystickInput, 60
  );

  document.getElementById('jump-btn').addEventListener('touchstart', e => {
    e.stopPropagation(); e.preventDefault();
    if (gameState.state === 'playing' && _jumpFn) _jumpFn();
  }, { passive: false });

  document.getElementById('dash-btn').addEventListener('touchstart', e => {
    e.stopPropagation(); e.preventDefault();
    if (gameState.state === 'playing' && _dashFn) _dashFn();
  }, { passive: false });

  document.getElementById('interact-btn').addEventListener('touchstart', e => {
    e.stopPropagation(); e.preventDefault();
    if (gameState.state === 'playing') tryInteract();
  }, { passive: false });
}

// ============================================================
// STAGE + DIFFICULTY SELECTOR (inline on start screen)
// ============================================================
let _selectedDiff = 'normal';

function renderDiffSelect() {
  const diffBtns = document.getElementById('diff-btns');
  if (!diffBtns) return;
  diffBtns.innerHTML = Object.entries(DIFFICULTIES).map(([key, d]) =>
    `<button class="diff-btn${key === _selectedDiff ? ' active' : ''}" data-diff="${key}">${d.label}</button>`
  ).join('');
}

function initDiffSelect() {
  renderDiffSelect();
  document.getElementById('diff-btns').addEventListener('click', e => {
    const btn = e.target.closest('[data-diff]');
    if (!btn) return;
    _selectedDiff = btn.dataset.diff;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
}

// ============================================================
// BUTTON EVENT LISTENERS (start, gameover, armory, pause, exit)
// ============================================================
export function initButtons() {
  try { initDiffSelect(); } catch(e) { console.error('[wallop] initDiffSelect failed:', e); }

  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'block';
    gameState.difficulty = _selectedDiff;
    tryEnterFullscreen();
    if (_resetGameFn) _resetGameFn();
    if (!isMobile()) renderer.domElement.requestPointerLock();
  });

  document.getElementById('gameover-screen').addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'restart-btn') {
      document.getElementById('gameover-screen').classList.add('hidden');
      renderDiffSelect(); // refresh difficulty buttons
      document.getElementById('start-screen').classList.remove('hidden');
    } else if (id === 'stats-btn') {
      const stats  = document.getElementById('gameover-stats');
      const hidden = stats.style.display === 'none';
      stats.style.display = hidden ? '' : 'none';
      e.target.textContent = hidden ? 'HIDE STATS' : 'SEE STATS';
    } else if (id === 'mainmenu-btn') {
      document.getElementById('gameover-screen').classList.add('hidden');
      document.getElementById('hud').style.display = 'none';
      document.getElementById('start-screen').classList.remove('hidden');
      gameState.state = 'start';
      if (document.pointerLockElement) document.exitPointerLock();
      // Clean up entity arrays via injected resetGame (partial) or directly
      // The full cleanup happens when the next run starts via resetGame()
      syncSliceDisplays();
    }
  });

  // Armory
  document.getElementById('armory-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('armory-screen').classList.remove('hidden');
    __armoryCurrentTab = 'characters';
    document.querySelectorAll('.armory-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.cat === 'characters');
    });
    document.getElementById('armory-detail').classList.add('hidden');
    syncSliceDisplays();
    renderArmoryGrid();
  });

  document.getElementById('armory-close').addEventListener('click', () => {
    document.getElementById('armory-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('armory-detail').classList.add('hidden');
  });

  document.querySelectorAll('.armory-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.armory-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      __armoryCurrentTab = tab.dataset.cat;
      document.getElementById('armory-detail').classList.add('hidden');
      renderArmoryGrid();
    });
  });

  // Pause
  document.getElementById('resume-btn').addEventListener('click', closePauseMenu);

  document.getElementById('restart-pause-btn').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    if (_resetGameFn) _resetGameFn();
    if (isMobile()) tryEnterFullscreen();
    if (!isMobile()) renderer.domElement.requestPointerLock();
  });

  document.getElementById('menu-pause-btn').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('start-screen').classList.remove('hidden');
    gameState.state = 'start';
    if (document.pointerLockElement) document.exitPointerLock();
    syncSliceDisplays();
  });

  // Exit
  document.getElementById('exit-btn').addEventListener('click', () => {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      try { window.Capacitor.Plugins.App.exitApp(); return; } catch (e) {}
    }
    try { window.close(); } catch (e) {}
    setTimeout(() => {
      const hint = document.createElement('div');
      hint.id = 'exit-hint';
      hint.innerHTML = `
        <div class="exit-hint-card">
          <div class="exit-hint-title">THANKS FOR PLAYING!</div>
          <div class="exit-hint-msg">Close this tab or window to exit.<br>See you next run!</div>
          <button class="exit-hint-btn" onclick="this.parentElement.parentElement.remove()">OK</button>
        </div>
      `;
      document.body.appendChild(hint);
    }, 200);
  });

  // Pause HUD button
  const pauseBtn = document.getElementById('pause-btn');
  pauseBtn.addEventListener('click', () => {
    if (gameState.state === 'playing') openPauseMenu();
  });
  pauseBtn.addEventListener('touchstart', (e) => {
    e.stopPropagation(); e.preventDefault();
    if (gameState.state === 'playing') openPauseMenu();
  }, { passive: false });

  // Touch hardening
  window.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend',    e => e.preventDefault(), { passive: false });
  let __lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - __lastTouchEnd <= 320) e.preventDefault();
    __lastTouchEnd = now;
  }, { passive: false });

  // Auto-pause on background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState.state === 'playing') openPauseMenu();
  });
}

// ============================================================
// INITIALISE (call from main.js after all modules are loaded)
// ============================================================
export function initUI() {
  // Wire the openChest → presentChoiceScreen injection
  setOpenChestDeps({
    presentChoiceScreen,
    mouseLocked: () => _mouseLocked,
  });

  syncSliceDisplays();
  initInput();
  initMobile();
  initButtons();

  // Expose renderStageSelect globally so wallop.html's splash onComplete
  // can call it after the start screen becomes visible (belt-and-suspenders).
  window._wallopRenderStageSelect = renderDiffSelect;
}
