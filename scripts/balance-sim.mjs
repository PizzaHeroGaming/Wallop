// balance-sim.mjs — analytical DPS audit. Models the real damage formulas,
// the boss damage cap, max stat-stacking, character bonuses, and synergies,
// then reports single-target boss DPS + AOE trash DPS for every weapon at max
// investment. Run: node scripts/balance-sim.mjs

// ── Player stat ceilings (max stacks from upgrades.js) ──
const STAT = {
  damageMult:   1 + 6 * 0.18,        // Bonk Power x6  => 2.08
  cooldownMult: Math.pow(0.88, 6),   // Reflexes x6    => 0.4644
  critChance:   0.05 + 6 * 0.07,     // Sharp x6       => 0.47
  critMult:     2.0 + 4 * 0.4,       // Brutal x4      => 3.6
  projMult:     Math.pow(1.12, 4),   // Embiggen x4    => 1.574
  aoeMult:      Math.pow(1.15, 4),   // Wide Bonk x4   => 1.749
  extraProj:    2,                   // Multi x2
  pierce:       3,                   // Pierce x3
  durationMult: Math.pow(1.25, 4),   // Long Reach x4  => 2.44
};

// Character offensive bonuses (best-case stacked onto STAT)
const CHARS = {
  generic:        { dC: 0,    cM: 0,   dm: 1.0 },
  anchovy_archer: { dC: 0.15, cM: 0.3, dm: 1.0 },   // +crit chance/mult
  stealth_slice:  { dC: 0,    cM: 0,   dm: 1.20 },  // +20% damage
};

// Boss damage cap (game.js:119) — applied to EACH final hit
const cap = d => (d > 80 ? 80 + (d - 80) * 0.55 : d);

// Expected per-hit damage vs boss, factoring crit + cap.
// base = pre-crit, pre-damageMult per-hit number
function bossHitEV(base, ch) {
  const cc = Math.min(0.95, STAT.critChance + ch.dC);
  const cm = STAT.critMult + ch.cM;
  const dm = STAT.damageMult * ch.dm;
  const normal = cap(base * dm);
  const crit   = cap(base * dm * cm);
  return (1 - cc) * normal + cc * crit;
}
// Trash (no cap) expected per-hit
function trashHitEV(base, ch) {
  const cc = Math.min(0.95, STAT.critChance + ch.dC);
  const cm = STAT.critMult + ch.cM;
  const dm = STAT.damageMult * ch.dm;
  return base * dm * ((1 - cc) + cc * cm);
}

// ── Weapon models at MAX level. {base, cd, cdMod, bossHits, aoeHits, alwaysCrit, note} ──
//  base     : per-hit damage number (with maxed weapon dmgMult folded in)
//  cd       : base cooldown seconds
//  cdMod    : weapon's own max cd modifier
//  bossHits : how many hits land on a LONE boss per cast (targeting realism)
//  aoeHits  : effective hits per cast in a dense swarm (capped at ~plausible)
//  tickRate : for DoT/aura weapons, overrides cd-based fire rate (hits/sec on boss)
const WEAPONS = {
  pizza:        { base: 16*2.0,  cd: 0.7,  cdMod: 0.7,  bossHits: 3,  aoeHits: 7 },
  aura:         { base: 27,      bossTick: 1/1.4, aoeHits: 20, note: 'boss auraCd 1.4s hard-caps boss hits' },
  orbit:        { base: 26,      bossTick: 5/0.4, aoeHits: 5,  note: 'must hug boss; sawblades => 5/0.2s' },
  orbit_saw:    { base: 26,      bossTick: 5/0.3, aoeHits: 5,  note: 'Saw Blades synergy (0.30s)' },
  thunder:      { base: 80,      cd: 1.6,  cdMod: 0.8,  bossHits: 1,  aoeHits: 5,  note: 'bolts spread; 1 on lone boss' },
  thunder_mega: { base: 80,      cd: 1.6,  cdMod: 0.8,  bossHits: 1,  aoeHits: 5,  megaEvery: 4, note: 'every 4th bolt x3' },
  shock:        { base: 60,      cd: 3.0,  cdMod: 0.75, bossHits: 1,  aoeHits: 30 },
  fire:         { base: 70,      cd: 2.0,  cdMod: 0.8,  bossHits: 1,  aoeHits: 8 },
  boomerang:    { base: 36,      cd: 1.8,  cdMod: 0.85, bossHits: 2,  aoeHits: 10, note: 'out+back = 2 hits' },
  crossbow:     { base: 63,      cd: 1.4,  cdMod: 0.75, bossHits: 1,  aoeHits: 5 },
  smoke:        { base: 22,      bossTick: 2.0, aoeHits: 12, note: 'DoT 22/0.5s while boss in cloud' },
  staff:        { base: 64,      cd: 2.0,  cdMod: 0.8,  bossHits: 1,  aoeHits: 5 },
  calzone:      { base: 66,      cd: 2.6,  cdMod: 0.8,  bossHits: 1,  aoeHits: 8 },
  ice:          { base: 36,      cd: 1.5,  cdMod: 0.85, bossHits: 1,  aoeHits: 12 },
  deep_dish:    { base: 60*2.5,  cd: 3.8,  cdMod: 0.82, bossHits: 1,  aoeHits: 6 },
  blizzard:     { base: 10*2.4375, bossTick: 1/0.45, aoeHits: 15, note: 'fixed 0.45s tick, ignores cdMult' },
  forge_hammer: { base: 70*2.3,  cd: 2.4,  cdMod: 1,    bossHits: 1,  aoeHits: 10, note: 'no cdMod scaling' },
  star_shower:  { base: 22*2.0,  cd: 1.4,  cdMod: 1,    bossHits: 1,  aoeHits: 18, note: 'no cdMod scaling' },
  tomahawk:     { base: 32*1.7,  cd: 1.8,  cdMod: 0.85, bossHits: 1,  aoeHits: 5,  note: 'pierce 10' },
  shadow_slice: { base: 35*2.2,  cd: 2.6,  cdMod: 1,    bossHits: 2,  aoeHits: 10, alwaysCrit: true, note: 'ALWAYS crit, 10 daggers' },
  meatball:     { base: 10*1.8,  burst: 12, burstGap: 0.09, cd: 1.6, cdMod: 1, bossHits: 1, aoeHits: 12, note: 'high rate bypasses boss cap' },
  cheese_whip:  { base: 45*2.1,  cd: 1.7,  cdMod: 1,    bossHits: 1,  aoeHits: 30, note: '240deg cone hits all' },
  olive_railgun:{ base: 120*2.4, cd: 3.5,  cdMod: 0.72, bossHits: 1,  aoeHits: 30, note: 'pierces entire line' },
};

function shotsPerSec(w) {
  if (w.bossTick) return null; // handled separately
  if (w.burst) {
    // a full burst per cooldown; burst shots are fast enough to treat as one volley
    return 1 / (w.cd * STAT.cooldownMult * (w.cdMod ?? 1));
  }
  return 1 / (w.cd * STAT.cooldownMult * (w.cdMod ?? 1));
}

function bossDPS(name, w, ch) {
  let perHit;
  if (w.alwaysCrit) {
    const dm = STAT.damageMult * ch.dm;
    perHit = cap(w.base * dm * (STAT.critMult + ch.cM));
  } else {
    perHit = bossHitEV(w.base, ch);
  }
  if (w.bossTick) {
    return perHit * w.bossTick;
  }
  const sps = shotsPerSec(w);
  let hits = (w.burst ? w.burst : 1) * w.bossHits;
  let dps = perHit * hits * sps;
  if (w.megaEvery) dps *= (1 + 2 / w.megaEvery); // every Nth hit x3 => +2/N avg
  return dps;
}

function trashDPS(name, w, ch) {
  let perHit;
  if (w.alwaysCrit) {
    const dm = STAT.damageMult * ch.dm;
    perHit = w.base * dm * (STAT.critMult + ch.cM);
  } else {
    perHit = trashHitEV(w.base, ch);
  }
  if (w.bossTick) {
    const tickRate = w.bossTick > 2 ? w.bossTick : (1 / 0.5); // DoT clouds tick ~2/s
    return perHit * w.aoeHits * (w.blizzard ? 1/0.45 : 2);
  }
  const sps = shotsPerSec(w);
  let hits = (w.burst ? w.burst : 1) * w.aoeHits;
  let dps = perHit * hits * sps;
  if (w.megaEvery) dps *= (1 + 2 / w.megaEvery);
  return dps;
}

// ── Final boss HP at realistic player levels ──
function finalBossHP(level, stageMult = 1, diffMult = 1) {
  return Math.round((2400 + level * 140) * stageMult * diffMult);
}

// ── Run the audit ──
function pickChar(name) {
  if (name === 'shadow_slice') return CHARS.stealth_slice;
  if (name === 'tomahawk') return CHARS.anchovy_archer;
  return CHARS.generic;
}

const rows = [];
for (const [name, w] of Object.entries(WEAPONS)) {
  const ch = pickChar(name);
  rows.push({
    name,
    bossDPS: Math.round(bossDPS(name, w, ch)),
    trashDPS: Math.round(trashDPS(name, w, ch)),
    note: w.note || '',
  });
}
rows.sort((a, b) => b.bossDPS - a.bossDPS);

const hp_lvl30 = finalBossHP(30);
const hp_lvl60 = finalBossHP(60);
console.log('=== FINAL BOSS HP (stage 1 Normal) ===');
console.log(`  level 30: ${hp_lvl30}    level 60: ${hp_lvl60}\n`);

console.log('=== SINGLE-WEAPON DPS @ MAX BUILD (sorted by boss DPS) ===');
console.log('weapon            bossDPS   TTK@L30   TTK@L60   trashDPS   note');
for (const r of rows) {
  const ttk30 = (hp_lvl30 / r.bossDPS).toFixed(1).padStart(6);
  const ttk60 = (hp_lvl60 / r.bossDPS).toFixed(1).padStart(6);
  console.log(
    `${r.name.padEnd(16)} ${String(r.bossDPS).padStart(7)} ${ttk30}s  ${ttk60}s  ${String(r.trashDPS).padStart(8)}   ${r.note}`
  );
}

// Best 3-weapon build = top 3 boss-DPS that aren't redundant
const top3 = rows.slice(0, 3);
const buildBossDPS = top3.reduce((s, r) => s + r.bossDPS, 0);
console.log(`\n=== TOP-3 BOSS BUILD: ${top3.map(r => r.name).join(' + ')} ===`);
console.log(`  combined boss DPS: ${buildBossDPS}`);
console.log(`  final boss TTK @ L30: ${(hp_lvl30 / buildBossDPS).toFixed(1)}s   @ L60: ${(hp_lvl60 / buildBossDPS).toFixed(1)}s`);

const top3trash = rows.slice().sort((a,b)=>b.trashDPS-a.trashDPS).slice(0,3);
console.log(`\n=== TOP-3 TRASH BUILD: ${top3trash.map(r=>r.name).join(' + ')} ===`);
console.log(`  combined trash DPS: ${top3trash.reduce((s,r)=>s+r.trashDPS,0)}`);
