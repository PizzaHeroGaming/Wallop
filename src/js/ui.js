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

import { camera, renderer, isMobile, tryEnterFullscreen } from './renderer.js?v=e3d3331';
import {
  player, enemies,
  tryInteract, setOpenChestDeps,
  generateChestOffers,
  spawnParticle,
  CHARACTER_MODELS, _animClips, loadCharAsset,
  _applyCharacterModel,
} from './entities.js?v=e3d3331';
import { WEAPONS, ARMOR, TOMES, rebuildOrbits } from './weapons.js?v=e3d3331';
import { STAT_UPGRADES, SYNERGY_UPGRADES } from './upgrades.js?v=e3d3331';
import { gameState, cam } from './state.js?v=e3d3331';
import { Audio } from './audio.js?v=e3d3331';
import { CFG, RARITY, STAGE_MULTS, DIFFICULTIES } from './config.js?v=e3d3331';
// VERSION lives on CFG.VERSION too — reading via property access doesn't
// blow up if a cached older config.js is loaded without the named export
const VERSION = CFG.VERSION || '0.0.0';
// Slices granted per on-demand "watch ad for slices" view (daily-capped in Profile).
const AD_SLICE_REWARD = 3;
import { Profile, CATALOG, ARENAS, CHALLENGES } from './profile.js?v=e3d3331';
import { tmp, tmp2 } from './utils.js?v=e3d3331';

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

let _suspendTimersFn = null;
let _resumeTimersFn  = null;
/** Called by game.js: setPauseTimerCbs(suspendPausableTimers, resumePausableTimers) */
export function setPauseTimerCbs(sFn, rFn) { _suspendTimersFn = sFn; _resumeTimersFn = rFn; }

let _beginIntroFn = null;
/** Called by game.js: setBeginIntroCb(beginIntroSweep) */
export function setBeginIntroCb(fn) { _beginIntroFn = fn; }
/** Called by game.js at the END of the intro sweep — reveal HUD + lock pointer
 *  exactly as the run begins (not during the cinematic). */
export function onIntroComplete() {
  document.getElementById('hud').style.display = 'block';
  if (!isMobile()) renderer.domElement.requestPointerLock();
}

// ============================================================
// FIRST-RUN TUTORIAL OVERLAY (move + camera)
// ============================================================
// game.js owns the tutorial state machine; ui.js just renders the prompt card
// and reports the SKIP click back through an injected callback.
let _tutSkipFn = null;
/** Called by game.js: setTutorialSkipCb(skipTutorial) */
export function setTutorialSkipCb(fn) { _tutSkipFn = fn; }

/** Render/refresh the tutorial prompt card. step = { glyph, title, body, idx, total, complete }. */
export function showTutorialStep(step) {
  const ov = document.getElementById('tutorial-overlay');
  if (!ov) return;
  ov.classList.remove('hidden');
  const g = document.getElementById('tut-glyph');
  const t = document.getElementById('tut-title');
  const b = document.getElementById('tut-body');
  const p = document.getElementById('tut-progress');
  if (g) g.textContent = step.glyph || '';
  if (t) t.textContent = step.title || '';
  if (b) b.innerHTML = step.body || '';
  if (p) {
    p.innerHTML = '';
    const total = step.total || 1;
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'tut-dot' + (i < step.idx ? ' done' : (i === step.idx ? ' active' : ''));
      p.appendChild(dot);
    }
  }
  ov.classList.toggle('tut-complete', !!step.complete);
}

export function hideTutorial() {
  const ov = document.getElementById('tutorial-overlay');
  if (ov) ov.classList.add('hidden');
}

// ============================================================
// REUSABLE CONFIRMATION MODAL
// ============================================================
// Used to guard destructive in-run actions (RESTART / MAIN MENU) so a stray
// tap can't throw away an active run. Handlers are added/removed per call so
// they never stack.
export function showConfirm({ title = 'ARE YOU SURE?', message = '', confirmLabel = 'CONFIRM', cancelLabel = 'CANCEL', onConfirm, onCancel } = {}) {
  const ov = document.getElementById('confirm-overlay');
  if (!ov) { if (onConfirm) onConfirm(); return; } // fail-safe: act if the modal is missing
  const tEl = document.getElementById('confirm-title');
  const mEl = document.getElementById('confirm-message');
  const okBtn = document.getElementById('confirm-ok-btn');
  const noBtn = document.getElementById('confirm-cancel-btn');
  if (tEl) tEl.textContent = title;
  if (mEl) mEl.textContent = message;
  if (okBtn) okBtn.textContent = confirmLabel;
  if (noBtn) noBtn.textContent = cancelLabel;
  function close() {
    ov.classList.add('hidden');
    okBtn.removeEventListener('click', onOk);
    noBtn.removeEventListener('click', onNo);
  }
  function onOk() { close(); if (onConfirm) onConfirm(); }
  function onNo() { close(); if (onCancel) onCancel(); }
  okBtn.addEventListener('click', onOk);
  noBtn.addEventListener('click', onNo);
  ov.classList.remove('hidden');
}

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
  // bossName/bossFill/bossText IDs are gone — we render one .boss-row per
  // alive boss inside #boss-wrap (see _bossRows below).
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
  Audio.play('player_hurt');
  // Thorn reflection
  if (attacker && player.thorns > 0 && !attacker.isBoss && _damageEnemyFn) {
    _damageEnemyFn(attacker, player.thorns, false);
  }
  // Frost shell: slow attacker on hit
  if (player.frostThorns > 0 && attacker && !attacker.isBoss) {
    attacker.slowTimer = Math.max(attacker.slowTimer || 0, 1.5 * (player.frostThorns * 0.5));
    attacker.slowMult = Math.min(attacker.slowMult || 1, 0.45);
  }
  // Tome of Time: slow ALL enemies briefly when you take damage
  if (player.timeSlowDur > 0) {
    const dur  = player.timeSlowDur;
    const mult = player.timeSlowMult || 0.5;
    for (const e of enemies) {
      e.slowTimer = Math.max(e.slowTimer || 0, dur);
      e.slowMult  = Math.min(e.slowMult || 1, mult);
    }
  }
  // Untouchable challenge: any post-dodge damage flips the fail flag.
  if (gameState.activeChallenge && gameState.challengeData) {
    gameState.challengeData.tookDamage = true;
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
    if (player.phoenixRevive) {
      player.phoenixRevive = false;
      player.hp = Math.ceil(player.maxHp * 0.3);
      player.invuln = 3.5;
      showAlert('PHOENIX REVIVAL! 🔥', '#ff6600');
      // Shockwave: damage all nearby enemies
      if (_damageEnemyFn) {
        for (const e of enemies) {
          const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
          if (dx*dx + dz*dz < 49) _damageEnemyFn(e, Math.round(80 * player.damageMult), false);
        }
      }
      return;
    }
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

  _reconcileBossBars();

  // Low-HP red edge pulse — below 20% adds .active, below 10% adds .critical
  // for a faster, deeper pulse. CSS is gated on body.playing so it never bleeds
  // onto menus / pause / death screens.
  const _lowHpEl = document.getElementById('low-hp-pulse');
  if (_lowHpEl) {
    const _hpRatio = player.maxHp > 0 ? (player.hp / player.maxHp) : 1;
    if (_hpRatio < 0.10) {
      _lowHpEl.classList.add('active');
      _lowHpEl.classList.add('critical');
    } else if (_hpRatio < 0.20) {
      _lowHpEl.classList.add('active');
      _lowHpEl.classList.remove('critical');
    } else {
      _lowHpEl.classList.remove('active');
      _lowHpEl.classList.remove('critical');
    }
  }
}

// ── Multi-boss HP bars ──────────────────────────────────────────────────────
// Stacks one row per alive boss so callBossNow + an existing mini-boss
// (or any other simultaneous-boss state) both get their own visible bar.
// Map keys are boss entity references — DOM elements are stable per boss so
// the CSS width transition stays smooth between frames.
const _bossRows = new Map(); // boss -> { row, name, fill, text }

function _createBossRow(boss) {
  // Compact single-line layout: one thin bar per boss with the name overlaid on
  // the left and the HP numbers on the right, so multiple bosses don't take over
  // the screen on phones.
  const row  = document.createElement('div');
  row.className = 'boss-row';
  const bar  = document.createElement('div');
  bar.className = 'boss-bar';
  const fill = document.createElement('div');
  fill.className = 'boss-fill';
  const name = document.createElement('div');
  name.className = 'boss-name';
  const text = document.createElement('div');
  text.className = 'boss-text';
  bar.appendChild(fill);
  bar.appendChild(name);
  bar.appendChild(text);
  row.appendChild(bar);
  hudEls.bossWrap.appendChild(row);
  return { row, name, fill, text };
}

function _reconcileBossBars() {
  const alive = enemies.filter(e => e.isBoss);
  // Remove rows whose boss is no longer alive
  for (const [boss, els] of _bossRows) {
    if (!alive.includes(boss)) {
      els.row.remove();
      _bossRows.delete(boss);
    }
  }
  if (alive.length === 0) {
    hudEls.bossWrap.classList.add('hidden');
    return;
  }
  hudEls.bossWrap.classList.remove('hidden');
  // Ensure each alive boss has a row + update its bar
  for (const boss of alive) {
    let els = _bossRows.get(boss);
    if (!els) {
      els = _createBossRow(boss);
      _bossRows.set(boss, els);
    }
    // Drop a leading "THE " so long names fit on the compact overlaid bar.
    els.name.textContent = boss.def.name.replace(/^THE\s+/i, '');
    const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
    els.fill.style.width = pct + '%';
    els.text.textContent = `${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;
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

  // Helper: check if a weapon/armor/tome id is accessible to the current character.
  // Uses the same gating rules as the Armory:
  //   - defaultUnlocked entries are always offered
  //   - characterUnique entries are free for the equipped character, gated by
  //     unlock state for everyone else (kill threshold + slice purchase)
  //   - all other entries are slice-unlockable and only offered once purchased
  const _charSlug = Profile.get().equippedCharacter || 'pizza_hero';
  const _allWeaponEntries = CATALOG.weapons || [];
  const _allArmorEntries  = CATALOG.armor   || [];
  const _allTomeEntries   = CATALOG.tomes   || [];
  function _itemAccessible(gameRefId, entryList) {
    const entry = entryList.find(e => e.gameRef === gameRefId || e.slug === gameRefId);
    if (!entry) return true; // no catalog entry = always accessible (base items)
    if (entry.defaultUnlocked) return true;
    if (entry.characterUnique) {
      if (_charSlug === entry.characterUnique) return true;
      // Non-owning character: must reach kill threshold AND then purchase with slices
      return Profile.isUnlocked(entry.slug);
    }
    // Slice-unlockable
    return Profile.isUnlocked(entry.slug);
  }

  for (const wId of Object.keys(WEAPONS)) {
    if (!_itemAccessible(wId, _allWeaponEntries)) continue;
    const owned = player.weapons.find(w => w.id === wId);
    const def   = WEAPONS[wId];
    if (owned) {
      if (owned.level < def.maxLevel) candidates.push({ kind: 'weapon-up', weaponId: wId, weight: 9 });
    } else if (player.weapons.length < player.maxWeaponSlots) {
      candidates.push({ kind: 'weapon-new', weaponId: wId, weight: 4 });
    }
  }

  for (const aId of Object.keys(ARMOR)) {
    if (!_itemAccessible(aId, _allArmorEntries)) continue;
    const owned = player.armor_items.find(a => a.id === aId);
    const def   = ARMOR[aId];
    if (owned) {
      if (owned.level < def.maxLevel) candidates.push({ kind: 'armor-up', armorId: aId, weight: 8 });
    } else if (player.armor_items.length < player.maxArmorSlots) {
      candidates.push({ kind: 'armor-new', armorId: aId, weight: 5 });
    }
  }

  for (const tId of Object.keys(TOMES)) {
    // BUG FIX: tomes were previously skipping the unlock gate entirely, so
    // slice-locked tomes (tome_of_echoes / tome_of_time) appeared in the
    // offer pool for free. Apply the same accessibility check as weapons/armor.
    if (!_itemAccessible(tId, _allTomeEntries)) continue;
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
  // Generate offers BEFORE touching state / pointer lock. When everything is
  // maxed (no offers), we heal and bail without ever changing gameState or
  // releasing the mouse — otherwise the exitPointerLock fired here would
  // resolve AFTER onLevelUpDone flipped state back to 'playing', and the
  // pointerlockchange handler's auto-pause path would open the pause menu on
  // every single level-up. Same race class as the Esc-to-close pause trap.
  const offers = generateOffers();
  if (offers.length === 0) {
    player.hp = Math.min(player.maxHp, player.hp + 30);
    // Stay in 'playing', keep pointer lock — just consume any further pending
    // level-ups and carry on. No screen, no state churn, no spurious pause.
    if (player.xp >= player.xpToNext) {
      setTimeout(processPendingLevelUp, 0);
    }
    return;
  }
  gameState.state = 'levelup';
  if (_mouseLocked) document.exitPointerLock();
  Audio.play('ui_levelup');
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
    return;
  }
  // All pending level-ups exhausted. If a stage-clear was deferred while
  // the level-up sequence was running, fire it now BEFORE handing control
  // back to the gameplay loop — player gets the rest break they earned.
  if (_pendingStageClearStage != null) {
    const stage = _pendingStageClearStage;
    _pendingStageClearStage = null;
    _doShowStageClearScreen(stage); // bypass the gate (state is still 'levelup')
    return;
  }
  gameState.state = 'playing';
  if (isMobile()) tryEnterFullscreen();
  // Re-engage pointer lock after a short delay so the card-click event fully
  // unwinds before we capture the mouse. Without the delay the lock can be
  // acquired while the overlay is still in the event stack, which previously
  // caused the "cursor trapped / disappears" symptom on some browsers.
  if (!isMobile()) setTimeout(() => {
    if (gameState.state === 'playing') renderer.domElement.requestPointerLock();
  }, 80);
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
// Deferred game-over interstitial: armed when a run ends, fired when the player
// LEAVES the game-over screen — and skipped if they watched the Double Slices
// rewarded ad, so we never stack two full-screen ads on one run.
let _pendingGameOverInterstitial = false;
let _rewardedWatchedThisRun = false;

/** Fire the armed game-over interstitial unless a rewarded ad was already
 *  watched this run. Called from the game-over exit buttons. */
function _flushGameOverInterstitial() {
  if (_pendingGameOverInterstitial && !_rewardedWatchedThisRun) {
    window.GameAds.showInterstitial();
  }
  _pendingGameOverInterstitial = false;
}

export function triggerGameOver(victory) {
  _bossArrowEl.style.display = 'none';
  gameState.state = victory ? 'victory' : 'gameover';
  Audio.play(victory ? 'victory' : 'player_death');
  Audio.stopMusic();
  const ov    = document.getElementById('gameover-screen');
  const title = document.getElementById('gameover-title');
  const diffLabel  = (DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal).label;
  const arenaName  = (ARENAS[gameState.arena] || ARENAS.pepperoni_pines).name;
  const stageLine  = `${arenaName.toUpperCase()} · STAGE ${gameState.stage} · ${diffLabel}`;
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
  // Mobile-only: offer one ad to double the slices EARNED FROM KILLS this run.
  // Challenge bounties are excluded (doublableSlices), so a fixed challenge
  // reward can never be doubled.
  const canDouble = isMobile() && gameState.doublableSlices > 0 && !gameState._slicesDoubled;
  const doubleBtn = canDouble
    ? `<button class="btn hot" id="double-slices-btn">📺 DOUBLE SLICES (+${gameState.doublableSlices})</button>`
    : '';
  btns.innerHTML = `
    <div class="end-actions">
      ${doubleBtn}
      <button class="btn" id="restart-btn">RUN IT BACK</button>
      <button class="btn dim" id="stats-btn">SEE STATS</button>
      <button class="btn dim" id="mainmenu-btn">MAIN MENU</button>
    </div>`;

  ov.classList.remove('hidden');
  if (_mouseLocked) document.exitPointerLock();

  // Persist itemKills accumulated this run
  Profile.save();

  __runsPlayed++;
  // Arm the interstitial (every other run) but DON'T show it yet — wait until the
  // player leaves this screen, and skip it entirely if they tap Double Slices.
  _rewardedWatchedThisRun = false;
  _pendingGameOverInterstitial = (__runsPlayed >= 2 && __runsPlayed % 2 === 0);
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

// Cost to upgrade a boost from its current level to the next.
// Formula: baseCost × (currentLevel + 1), so each level costs progressively more.
// e.g. base=100: lvl0→1=100, lvl1→2=200, lvl2→3=300, lvl3→4=400, lvl4→5=500
function boostCostAtLevel(entry, currentLevel) {
  return (entry.sliceCost || 100) * (currentLevel + 1);
}

export function syncSliceDisplays() {
  const n = Profile.get().slices;
  const a = document.getElementById('slice-count');
  const b = document.getElementById('armory-slice-count');
  if (a) a.textContent = n;
  if (b) b.textContent = n;
}

// On-demand "watch ad for slices" button in the Armory header. Mobile-only
// (Steam never shows ads); reflects the remaining daily allowance.
function refreshArmoryWatchBtn() {
  const btn = document.getElementById('armory-watch-slices');
  if (!btn) return;
  if (!isMobile()) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  const left = Profile.adSlicesRemainingToday();
  if (left <= 0) {
    btn.disabled = true;
    btn.innerHTML = '📺 BACK TOMORROW';
  } else {
    btn.disabled = false;
    btn.innerHTML = `📺 +${AD_SLICE_REWARD} 🍕 <span class="watch-left">${left} left</span>`;
  }
}

// Render the list of challenges as cards. Completed ones get a 'done' visual.
function renderChallenges() {
  const list = document.getElementById('challenges-list');
  if (!list) return;
  list.innerHTML = '';
  const charBySlug = slug => (CATALOG.characters || []).find(ch => ch.slug === slug);
  for (const c of CHALLENGES) {
    const done = Profile.isChallengeCompleted(c.id);
    const reqChar = c.requiresChar ? charBySlug(c.requiresChar) : null;
    const charLocked = reqChar ? !Profile.isUnlocked(c.requiresChar) : false;
    const card = document.createElement('div');
    card.className = 'challenge-card' + (done ? ' completed' : '') + (charLocked ? ' char-locked' : '');
    const tag = reqChar ? `<span class="challenge-char">${reqChar.icon} ${reqChar.name}</span>` : '';
    const btn = charLocked
      ? `<button class="btn" disabled>🔒 LOCKED</button>`
      : `<button class="btn ${done ? '' : 'hot'}" data-challenge="${c.id}">${done ? 'REPLAY' : '▶ PLAY'}</button>`;
    const note = charLocked ? ` <span class="challenge-locknote">— unlock ${reqChar.name} in the Armory</span>` : '';
    card.innerHTML = `
      <div class="challenge-icon">${c.icon}</div>
      <div class="challenge-body">
        <div class="challenge-name">${c.name}${tag}</div>
        <div class="challenge-desc">${c.desc}${note}</div>
        <div class="challenge-reward">🍕 ${c.reward} SLICES</div>
      </div>
      ${btn}
    `;
    list.appendChild(card);
  }
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
      const max = entry.maxLevel || 1;
      if (lvl >= max) {
        footerHtml = `<div class="boost-level">LEVEL ${lvl} / ${max} — MAXED</div>`;
      } else {
        const nextCost = boostCostAtLevel(entry, lvl);
        const can = Profile.get().slices >= nextCost;
        footerHtml = `<div class="boost-level">LEVEL ${lvl} / ${max}</div><div class="cost ${can ? '' : 'unaffordable'}">🍕 ${nextCost} SLICES</div>`;
      }
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
      const cost = boostCostAtLevel(entry, lvl);
      const can  = slices >= cost;
      actionsHtml = `<button class="upgrade-btn" data-action="boost" ${can ? '' : 'disabled'}>UPGRADE LV${lvl + 1} — 🍕 ${cost}</button>`;
    }
  } else if (!unlocked) {
    if (entry.characterUnique) {
      const equippedChar = Profile.get().equippedCharacter || 'pizza_hero';
      const kills     = Profile.getItemKills(entry.gameRef || entry.slug);
      const threshold = entry.killThreshold || 7500;
      const pct       = Math.min(100, Math.round(kills / threshold * 100));
      if (equippedChar === entry.characterUnique) {
        // Owning character — always in pool, no purchase needed
        actionsHtml = `<div style="font-family:'VT323',monospace;color:var(--accent);font-size:18px;text-align:center;padding:8px 0;">⭐ Your character's exclusive<br>Available in your upgrade pool!</div>`;
      } else if (kills >= threshold) {
        // Kill threshold met — can now purchase with slices to unlock for all characters
        const cost = entry.sliceCost || 250;
        const can  = slices >= cost;
        actionsHtml = `
          <div style="font-family:'VT323',monospace;color:var(--accent);font-size:16px;text-align:center;margin-bottom:8px;">🏆 ${kills}/${threshold} kills — READY TO UNLOCK!</div>
          <button class="unlock-btn" data-action="unlock" ${can ? '' : 'disabled'}>UNLOCK — 🍕 ${cost}</button>
          <div style="font-family:'VT323',monospace;color:var(--ink-dim);font-size:14px;text-align:center;margin-top:6px;">Unlocks for all characters permanently</div>`;
      } else {
        // Still grinding toward kill threshold
        actionsHtml = `
          <div style="font-family:'VT323',monospace;color:var(--ink-dim);font-size:15px;text-align:center;margin-bottom:8px;">Earn ${threshold} kills while this item is equipped</div>
          <div style="background:#0d1126;height:14px;border-radius:3px;border:2px solid #000;overflow:hidden;">
            <div style="background:linear-gradient(90deg,#ffd23f,#ff8c00);height:100%;width:${pct}%;transition:width 0.3s;"></div>
          </div>
          <div style="font-family:'VT323',monospace;color:var(--ink-dim);font-size:15px;text-align:center;margin-top:6px;">${kills} / ${threshold} kills &nbsp;·&nbsp; ${pct}%</div>`;
      }
    } else if (entry.placeholder && !entry.sliceCost) {
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
        _applyCharacterModel().catch(() => {}); // preload model for next run
        renderArmoryGrid();
        openArmoryDetail(entry, cat);
      } else if (action === 'boost') {
        const lvl  = Profile.getBoostLevel(entry.slug);
        const cost = boostCostAtLevel(entry, lvl);
        if (lvl < (entry.maxLevel || 1) && Profile.spendSlices(cost)) {
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
  _syncAllAudioControlUIs(); // pull latest mute/volume into the pause UI
  // Freeze gameplay-critical timers (boss follow-up shots, stage transitions,
  // victory transition). They re-fire from where they left off on close.
  if (_suspendTimersFn) _suspendTimersFn();
  document.getElementById('pause-screen').classList.remove('hidden');
  document.getElementById('interact-prompt').classList.add('hidden');
}

// Window (ms) after closePauseMenu during which pointer-lock loss must NOT
// trigger the auto-pause-on-unlock path. Esc is the same key that closes the
// pause menu AND tells the browser to release pointer lock, and Chrome has a
// ~1.25s cooldown before re-acquire is allowed — without this grace window
// the next pointerlockchange (lock=false) re-opens the pause menu immediately,
// trapping the player.
let _pauseAutoSuppressUntil = 0;

// ── Stage-clear intermission ──
// Replaces the old auto-advance setTimeout. Shows a stats panel + Continue
// button so the player can rest, look at the run, and confirm the half-loadout-
// strip warning before pressing on to the next stage.
let _advanceStageFn = null;
/** Called by game.js: setAdvanceStageCb(advanceStage) */
export function setAdvanceStageCb(fn) { _advanceStageFn = fn; }

// Holds a deferred stage number when boss death overlaps with pending XP /
// active level-up. onLevelUpDone's terminal branch fires the deferred
// showStageClearScreen once all level-ups have been chosen.
let _pendingStageClearStage = null;

/** Called by game.js → resetGame so a deferred stage-clear from a previous
 * run can't fire during the new run's first level-up. */
export function clearPendingStageClear() { _pendingStageClearStage = null; }

export function showStageClearScreen(completedStage) {
  // If a level-up is showing right now OR pending (XP overflowed but the
  // gem→callback chain hasn't fired yet), defer the intermission so the
  // player gets to pick their upgrade FIRST — otherwise the stage-clear
  // overlay would steal focus from / hide behind the level-up cards.
  if (gameState.state === 'levelup' || player.xp >= player.xpToNext) {
    _pendingStageClearStage = completedStage;
    return;
  }
  _doShowStageClearScreen(completedStage);
}

function _doShowStageClearScreen(completedStage) {
  // Use 'paused' as the gameplay-frozen state so the existing update loop
  // gate works without changes. The visual overlay distinguishes it.
  gameState.state = 'paused';
  _bossArrowEl.style.display = 'none';
  if (_mouseLocked) document.exitPointerLock();
  if (_suspendTimersFn) _suspendTimersFn(); // freeze any pending boss follow-up etc.

  const overlay = document.getElementById('stage-clear-screen');
  if (!overlay) return;

  // Stage labels in title + continue button
  document.getElementById('stage-clear-num').textContent      = completedStage;
  document.getElementById('stage-continue-num').textContent   = completedStage + 1;
  const arenaName = (ARENAS[gameState.arena] || ARENAS.pepperoni_pines).name;
  const diffLabel = (DIFFICULTIES[gameState.difficulty] || DIFFICULTIES.normal).label;
  document.getElementById('stage-clear-subtitle').textContent = `${arenaName.toUpperCase()} · ${diffLabel}`;

  // Render the same stats panels as the pause menu uses, but framed as
  // "what you achieved this stage" rather than mid-run snapshot.
  const m  = Math.floor(gameState.gameTime / 60).toString().padStart(2, '0');
  const s  = Math.floor(gameState.gameTime % 60).toString().padStart(2, '0');
  document.getElementById('stage-clear-stats').innerHTML = `
    <div class="pause-row"><span>Stage time</span><span class="v">${m}:${s}</span></div>
    <div class="pause-row"><span>Kills</span><span class="v">${gameState.kills}</span></div>
    <div class="pause-row"><span>Gold</span><span class="v">${player.gold}</span></div>
    <div class="pause-row"><span>Level</span><span class="v">${player.level}</span></div>
    <div class="pause-row"><span>Slices earned</span><span class="v">${gameState.slicesEarned || 0} 🍕</span></div>
  `;
  const dmgPct = Math.round((player.damageMult - 1) * 100);
  const cdPct  = Math.round((1 - player.cooldownMult) * 100);
  const spdPct = Math.round((player.baseSpeed / CFG.PLAYER_SPEED - 1) * 100);
  document.getElementById('stage-clear-character').innerHTML = `
    <div class="pause-row"><span>HP</span><span class="v">${Math.ceil(player.hp)}/${player.maxHp}</span></div>
    <div class="pause-row"><span>Damage</span><span class="v">${dmgPct >= 0 ? '+' : ''}${dmgPct}%</span></div>
    <div class="pause-row"><span>Cooldown</span><span class="v">-${cdPct}%</span></div>
    <div class="pause-row"><span>Speed</span><span class="v">${spdPct >= 0 ? '+' : ''}${spdPct}%</span></div>
    <div class="pause-row"><span>Crit</span><span class="v">${Math.round(player.critChance * 100)}% / x${player.critMult.toFixed(1)}</span></div>
    <div class="pause-row"><span>Armor</span><span class="v">${player.armor}</span></div>
  `;
  overlay.classList.remove('hidden');
}

export function closePauseMenu() {
  if (gameState.state !== 'paused') return;
  document.getElementById('pause-screen').classList.add('hidden');
  gameState.state = 'playing';
  if (isMobile()) tryEnterFullscreen();
  if (!isMobile()) renderer.domElement.requestPointerLock();
  // Suppress the auto-pause for 1.4s — covers Chrome's pointer-lock cooldown
  // window. After that, a real focus loss can still trigger the auto-pause.
  _pauseAutoSuppressUntil = Date.now() + 1400;
  // Re-fire any timers that were frozen by openPauseMenu, with the
  // remaining time they had at pause moment.
  if (_resumeTimersFn) _resumeTimersFn();
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
      const confirmOv = document.getElementById('confirm-overlay');
      if (confirmOv && !confirmOv.classList.contains('hidden')) {
        // A confirmation is open — ESC cancels it instead of toggling pause.
        document.getElementById('confirm-cancel-btn')?.click();
      } else if (gameState.state === 'playing') openPauseMenu();
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
    // Auto-pause on pointer-lock loss is for Alt-Tab style focus exits.
    // Suppress it for ~1.4s after closePauseMenu so the Esc-to-close path
    // doesn't immediately re-pause due to Chrome's lock-acquire cooldown.
    if (!_mouseLocked && gameState.state === 'playing' && !isMobile()
        && Date.now() > _pauseAutoSuppressUntil) {
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
// ARENA SELECTOR (start screen — desktop cards + mobile compact)
// ============================================================
let _selectedArena = null; // hydrated from Profile in initArenaSelect()
const _arenaOrder = Object.keys(ARENAS).sort((a, b) => ARENAS[a].order - ARENAS[b].order);

function _arenaUnlockHint(slug) {
  const def = ARENAS[slug];
  if (!def || !def.unlocksFrom) return '';
  const prev = ARENAS[def.unlocksFrom];
  return `🔒 Beat ${prev?.name || def.unlocksFrom} on Normal+`;
}

function renderArenaSelect() {
  const wrap = document.getElementById('arena-btns');
  if (!wrap) return;
  wrap.innerHTML = _arenaOrder.map(slug => {
    const def      = ARENAS[slug];
    const unlocked = Profile.isArenaUnlocked(slug);
    const active   = slug === _selectedArena;
    const hint     = unlocked ? def.desc : _arenaUnlockHint(slug);
    return `<button class="arena-btn${active ? ' active' : ''}${unlocked ? '' : ' locked'}" data-arena="${slug}" title="${hint.replace(/"/g,'&quot;')}">
      <div class="arena-btn-icon">${def.icon}</div>
      <div class="arena-btn-name">${def.name}</div>
      <div class="arena-btn-hint">${hint}</div>
    </button>`;
  }).join('');
}

function _refreshMobileArenaUI() {
  const def      = ARENAS[_selectedArena];
  const badge    = document.getElementById('mob-arena-badge');
  const name     = document.getElementById('mob-arena-name');
  const dotsEl   = document.getElementById('mob-arena-dots');
  if (badge) badge.textContent = def?.icon || '';
  if (name)  name.textContent  = def?.name || '';
  if (dotsEl) {
    dotsEl.innerHTML = _arenaOrder.map(slug => {
      const isLocked = !Profile.isArenaUnlocked(slug);
      const isActive = slug === _selectedArena;
      return `<span class="char-dot${isActive ? ' active' : ''}${isLocked ? ' locked' : ''}"></span>`;
    }).join('');
  }
}

function _setSelectedArena(slug) {
  if (!Profile.isArenaUnlocked(slug)) return;
  _selectedArena = slug;
  Profile.setEquippedArena(slug);
  gameState.arena = slug;
  renderArenaSelect();
  _refreshMobileArenaUI();
}

function initArenaSelect() {
  // Hydrate selection from Profile, fall back to first unlocked arena
  _selectedArena = Profile.getEquippedArena();
  if (!Profile.isArenaUnlocked(_selectedArena)) _selectedArena = 'pepperoni_pines';
  gameState.arena = _selectedArena;

  renderArenaSelect();
  _refreshMobileArenaUI();

  // Desktop card clicks
  const wrap = document.getElementById('arena-btns');
  if (wrap) {
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-arena]');
      if (!btn) return;
      _setSelectedArena(btn.dataset.arena);
    });
  }
  // Mobile arrow navigation — cycles only through UNLOCKED arenas
  const _cycle = (dir) => {
    const unlocked = _arenaOrder.filter(s => Profile.isArenaUnlocked(s));
    if (unlocked.length === 0) return;
    const idx = unlocked.indexOf(_selectedArena);
    const next = unlocked[(idx + dir + unlocked.length) % unlocked.length];
    _setSelectedArena(next);
  };
  const prev = document.getElementById('mob-arena-prev');
  const next = document.getElementById('mob-arena-next');
  if (prev) prev.addEventListener('click', () => _cycle(-1));
  if (next) next.addEventListener('click', () => _cycle(+1));
}

// ============================================================
// BUTTON EVENT LISTENERS (start, gameover, armory, pause, exit)
// ============================================================
export function initButtons() {
  try { initDiffSelect(); }  catch(e) { console.error('[wallop] initDiffSelect failed:', e); }
  try { initArenaSelect(); } catch(e) { console.error('[wallop] initArenaSelect failed:', e); }

  // START RUN now opens the run-config screen instead of starting immediately
  document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    // Refresh selectors so newly-unlocked arenas / current selections show correctly
    renderDiffSelect();
    renderArenaSelect();
    _refreshMobileArenaUI();
    document.getElementById('run-config-screen').classList.remove('hidden');
  });

  // PLAY button on run-config screen actually starts the run
  const _playBtn = document.getElementById('run-config-play-btn');
  if (_playBtn) _playBtn.addEventListener('click', () => {
    document.getElementById('run-config-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'none'; // stay hidden through the cinematic
    gameState.difficulty = _selectedDiff;
    gameState.activeChallenge = null; // normal run — clear any leftover challenge
    tryEnterFullscreen();
    // Cinematic sweep: camera orbits behind the hero, then the run begins
    // (HUD + pointer lock are revealed by onIntroComplete at the sweep's end).
    if (_beginIntroFn) _beginIntroFn();
    else if (_resetGameFn) _resetGameFn(); // fallback if intro wiring missing
  });

  // BACK button returns to the start screen
  const _backBtn = document.getElementById('run-config-back-btn');
  if (_backBtn) _backBtn.addEventListener('click', () => {
    document.getElementById('run-config-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
  });

  document.getElementById('gameover-screen').addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'restart-btn') {
      _flushGameOverInterstitial(); // deferred interstitial fires on exit (skipped if they watched Double Slices)
      document.getElementById('gameover-screen').classList.add('hidden');
      renderDiffSelect(); // refresh difficulty buttons
      renderArenaSelect();    // refresh arena cards in case a new one unlocked
      _refreshMobileArenaUI();
      document.getElementById('start-screen').classList.remove('hidden');
    } else if (id === 'stats-btn') {
      const stats  = document.getElementById('gameover-stats');
      const hidden = stats.style.display === 'none';
      stats.style.display = hidden ? '' : 'none';
      e.target.textContent = hidden ? 'HIDE STATS' : 'SEE STATS';
    } else if (id === 'mainmenu-btn') {
      _flushGameOverInterstitial(); // deferred interstitial fires on exit (skipped if they watched Double Slices)
      document.getElementById('gameover-screen').classList.add('hidden');
      document.getElementById('hud').style.display = 'none';
      document.getElementById('start-screen').classList.remove('hidden');
      gameState.state = 'start';
      if (document.pointerLockElement) document.exitPointerLock();
      // Clean up entity arrays via injected resetGame (partial) or directly
      // The full cleanup happens when the next run starts via resetGame()
      syncSliceDisplays();
    } else if (id === 'double-slices-btn') {
      if (gameState._slicesDoubled || gameState.doublableSlices <= 0) return;
      const btn = e.target;
      const bonus = gameState.doublableSlices;
      btn.disabled = true;
      window.GameAds.showRewarded((success) => {
        if (!success) { btn.disabled = false; return; }
        gameState._slicesDoubled = true;
        _rewardedWatchedThisRun = true; // suppress the deferred interstitial this run
        Profile.addSlices(bonus);
        Profile.save();
        syncSliceDisplays();
        btn.textContent = `✓ DOUBLED (+${bonus})`;
        btn.classList.remove('hot');
        btn.classList.add('dim');
      });
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
    refreshArmoryWatchBtn();
    renderArmoryGrid();
  });

  // Watch-ad-for-slices button (Armory header)
  const _watchSlices = document.getElementById('armory-watch-slices');
  if (_watchSlices) _watchSlices.addEventListener('click', () => {
    if (Profile.adSlicesRemainingToday() <= 0) return;
    _watchSlices.disabled = true;
    window.GameAds.showRewarded((success) => {
      if (success) {
        Profile.addSlices(AD_SLICE_REWARD);
        Profile.recordAdSliceWatch();
        syncSliceDisplays();
      }
      refreshArmoryWatchBtn();
    });
  });

  document.getElementById('armory-close').addEventListener('click', () => {
    document.getElementById('armory-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('armory-detail').classList.add('hidden');
    // Sync char selector + the big title hero to any change made in the Armory
    const equipped = Profile.get().equippedCharacter || 'pizza_hero';
    const idx = _charOrder.indexOf(equipped);
    if (idx >= 0) { _charSelIdx = idx; _applyCharacterModel(equipped).catch(() => {}); }
    _refreshCharSelectUI();
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

  // ── Challenges ──
  const chBtn = document.getElementById('challenges-btn');
  if (chBtn) chBtn.addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('challenges-screen').classList.remove('hidden');
    renderChallenges();
  });
  const chClose = document.getElementById('challenges-close');
  if (chClose) chClose.addEventListener('click', () => {
    document.getElementById('challenges-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
  });
  // Click delegation for the PLAY buttons inside challenge cards
  const chList = document.getElementById('challenges-list');
  if (chList) chList.addEventListener('click', e => {
    const btn = e.target.closest('[data-challenge]');
    if (!btn) return;
    const id = btn.dataset.challenge;
    const ch = CHALLENGES.find(c => c.id === id);
    // Character-specific challenges: must own the character; force-equip it for
    // the run so the challenge is always attempted with the intended kit.
    if (ch && ch.requiresChar) {
      if (!Profile.isUnlocked(ch.requiresChar)) return; // safety — button is disabled anyway
      Profile.setEquippedCharacter(ch.requiresChar);
    }
    document.getElementById('challenges-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'block';
    gameState.activeChallenge = id;
    gameState.difficulty = _selectedDiff;
    tryEnterFullscreen();
    if (_resetGameFn) _resetGameFn();
    if (!isMobile()) renderer.domElement.requestPointerLock();
  });

  // Pause
  document.getElementById('resume-btn').addEventListener('click', closePauseMenu);

  document.getElementById('restart-pause-btn').addEventListener('click', () => {
    showConfirm({
      title: 'RESTART RUN?',
      message: 'Your current run will be lost and a fresh one started.',
      confirmLabel: 'RESTART',
      onConfirm: () => {
        document.getElementById('pause-screen').classList.add('hidden');
        if (_resetGameFn) _resetGameFn();
        if (isMobile()) tryEnterFullscreen();
        if (!isMobile()) renderer.domElement.requestPointerLock();
      },
    });
  });

  document.getElementById('menu-pause-btn').addEventListener('click', () => {
    showConfirm({
      title: 'QUIT TO MENU?',
      message: 'Your current run will be lost. Slices earned from boss kills are already saved.',
      confirmLabel: 'MAIN MENU',
      onConfirm: () => {
        document.getElementById('pause-screen').classList.add('hidden');
        document.getElementById('hud').style.display = 'none';
        document.getElementById('start-screen').classList.remove('hidden');
        gameState.state = 'start';
        if (document.pointerLockElement) document.exitPointerLock();
        syncSliceDisplays();
      },
    });
  });

  // Stage-clear intermission: continue advances, quit goes to main menu.
  document.getElementById('stage-continue-btn').addEventListener('click', () => {
    document.getElementById('stage-clear-screen').classList.add('hidden');
    gameState.state = 'playing';
    if (_resumeTimersFn) _resumeTimersFn(); // re-arm any boss timers we paused
    if (isMobile()) tryEnterFullscreen();
    if (!isMobile()) renderer.domElement.requestPointerLock();
    if (_advanceStageFn) _advanceStageFn();
  });
  document.getElementById('stage-quit-btn').addEventListener('click', () => {
    document.getElementById('stage-clear-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('start-screen').classList.remove('hidden');
    gameState.state = 'start';
    if (document.pointerLockElement) document.exitPointerLock();
    syncSliceDisplays();
  });

  // About
  document.getElementById('about-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('about-screen').classList.remove('hidden');
  });
  const _closeAbout = () => {
    document.getElementById('about-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
  };
  document.getElementById('about-close').addEventListener('click', _closeAbout);
  const _aboutBackTop = document.getElementById('about-back-top');
  if (_aboutBackTop) _aboutBackTop.addEventListener('click', _closeAbout);

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

  // Populate the version chip in the About screen header
  const verEl = document.getElementById('about-version');
  if (verEl) verEl.textContent = 'v' + VERSION;

  syncSliceDisplays();
  initInput();
  initMobile();
  initButtons();
  initCharSelect();
  initAudioControls();

  // Tutorial SKIP button — reports back to game.js's tutorial state machine
  const _tutSkip = document.getElementById('tut-skip-btn');
  if (_tutSkip) _tutSkip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_tutSkipFn) _tutSkipFn();
  });

  // Expose renderStageSelect globally so wallop.html's splash onComplete
  // can call it after the start screen becomes visible (belt-and-suspenders).
  window._wallopRenderStageSelect = renderDiffSelect;
}

// ── Audio settings: wire toggle + slider to Audio module ──
// Used by the About panel AND the pause menu. Both UIs read/write the same
// Audio module state so changes in one are reflected in the other on next open.
function initAudioControls() {
  _bindAudioControlSet({ muteId: 'audio-muted-toggle', sliderId: 'audio-volume-slider', readoutId: 'audio-volume-readout' });
  _bindAudioControlSet({ muteId: 'pause-audio-muted', sliderId: 'pause-audio-volume',  readoutId: 'pause-audio-readout' });
}

function _bindAudioControlSet({ muteId, sliderId, readoutId }) {
  const muteBox = document.getElementById(muteId);
  const slider  = document.getElementById(sliderId);
  const readout = document.getElementById(readoutId);
  if (!muteBox || !slider || !readout) return;
  // Initial UI state from current Audio module values
  muteBox.checked = Audio.isMuted();
  slider.value    = Math.round(Audio.getVolume() * 100);
  readout.textContent = slider.value + '%';
  muteBox.addEventListener('change', () => {
    Audio.setMuted(muteBox.checked);
    _syncAllAudioControlUIs(); // mirror change to the other set
    if (!muteBox.checked) Audio.play('ui_click');
  });
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10) / 100;
    Audio.setVolume(v);
    readout.textContent = slider.value + '%';
    _syncAllAudioControlUIs();
  });
  slider.addEventListener('change', () => { if (!Audio.isMuted()) Audio.play('ui_click'); });
}

// Re-read state from Audio and push it into every audio-control UI on the page
// so the About panel + pause menu never drift apart.
function _syncAllAudioControlUIs() {
  const sets = [
    { muteId: 'audio-muted-toggle', sliderId: 'audio-volume-slider', readoutId: 'audio-volume-readout' },
    { muteId: 'pause-audio-muted', sliderId: 'pause-audio-volume',  readoutId: 'pause-audio-readout' },
  ];
  for (const s of sets) {
    const muteBox = document.getElementById(s.muteId);
    const slider  = document.getElementById(s.sliderId);
    const readout = document.getElementById(s.readoutId);
    if (muteBox) muteBox.checked = Audio.isMuted();
    if (slider)  slider.value    = Math.round(Audio.getVolume() * 100);
    if (readout) readout.textContent = (slider ? slider.value : Math.round(Audio.getVolume() * 100)) + '%';
  }
}

// ============================================================
// START-SCREEN CHARACTER SELECTOR
// ============================================================
// The chosen character previews live on the big title hero (player.group) —
// no separate 3D panel renderer (removed; it was a second WebGL context).
const _charOrder = ['pizza_hero', 'frost_baker', 'oven_knight', 'crust_runner', 'anchovy_archer', 'stealth_slice'];
let _charSelIdx = 0;

function initCharSelect() {
  // Seed index to the currently equipped character and show it on the big hero.
  const equipped = Profile.get().equippedCharacter || 'pizza_hero';
  _charSelIdx = Math.max(0, _charOrder.indexOf(equipped));
  _refreshCharSelectUI();
  _applyCharacterModel(equipped).catch(() => {});

  // Cycle: preview the new character live on the big title hero (player.group).
  // Not equipped until the player taps SELECT.
  const _cycle = (delta) => {
    _charSelIdx = (_charSelIdx + delta + _charOrder.length) % _charOrder.length;
    _applyCharacterModel(_charOrder[_charSelIdx]).catch(() => {});
    _refreshCharSelectUI();
  };
  const _wireArrow = (id, delta) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => _cycle(delta));
  };
  _wireArrow('char-prev-btn', -1);   // desktop panel
  _wireArrow('char-next-btn', +1);
  _wireArrow('mob-char-prev', -1);   // mobile compact selector
  _wireArrow('mob-char-next', +1);

  // SELECT: equip the cycled character (persists) and lock it onto the hero.
  function _pickCharacter() {
    const slug = _charOrder[_charSelIdx];
    if (!Profile.isUnlocked(slug)) return;
    Profile.setEquippedCharacter(slug);
    _refreshCharSelectUI();
    _applyCharacterModel(slug).catch(() => {});
  }
  const _selBtn = document.getElementById('char-select-btn');
  if (_selBtn) _selBtn.addEventListener('click', _pickCharacter);
  const _mobSelectBtn = document.getElementById('mob-char-btn');
  if (_mobSelectBtn) _mobSelectBtn.addEventListener('click', _pickCharacter);
}

function _refreshCharSelectUI() {
  const slug    = _charOrder[_charSelIdx];
  const entry   = CATALOG.characters.find(c => c.slug === slug);
  if (!entry) return;
  const unlocked = Profile.isUnlocked(slug);
  const equipped = Profile.get().equippedCharacter === slug;

  // Helper: apply select-button state to any button element
  function _applyBtnState(btn) {
    if (!btn) return;
    if (equipped) {
      btn.textContent = '✓ SELECTED';
      btn.disabled    = true;
      btn.classList.add('dim');
      btn.classList.remove('hot');
    } else if (unlocked) {
      btn.textContent = 'SELECT';
      btn.disabled    = false;
      btn.classList.remove('dim');
      btn.classList.add('hot');
    } else {
      btn.textContent = `🔒 ${entry.sliceCost || '?'} SLICES`;
      btn.disabled    = true;
      btn.classList.add('dim');
      btn.classList.remove('hot');
    }
  }

  // Helper: render dot indicators into a container element
  function _applyDots(dotsEl) {
    if (!dotsEl) return;
    dotsEl.innerHTML = _charOrder.map((s, i) => {
      const isLocked = !Profile.isUnlocked(s);
      const isActive = i === _charSelIdx;
      return `<span class="char-dot${isActive ? ' active' : ''}${isLocked ? ' locked' : ''}"></span>`;
    }).join('');
  }

  // ── Desktop 3D panel ──
  const badge = document.getElementById('char-select-badge');
  const name  = document.getElementById('char-select-name');
  const desc  = document.getElementById('char-select-subdesc');
  if (badge) badge.textContent = entry.icon || '';
  if (name)  name.textContent  = entry.name || '';
  if (desc) {
    const lines = (entry.desc || '').split('.').filter(Boolean);
    desc.textContent = lines.slice(1).join('. ').trim() || lines[0] || '';
  }
  _applyBtnState(document.getElementById('char-select-btn'));
  _applyDots(document.getElementById('char-select-dots'));

  // ── Mobile compact selector ──
  const mobBadge = document.getElementById('mob-char-badge');
  const mobName  = document.getElementById('mob-char-name');
  if (mobBadge) mobBadge.textContent = entry.icon || '';
  if (mobName)  mobName.textContent  = entry.name || '';
  _applyBtnState(document.getElementById('mob-char-btn'));
  _applyDots(document.getElementById('mob-char-dots'));
}
