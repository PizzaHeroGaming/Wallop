// challenge-sim.mjs — difficulty audit for the 5 handcrafted CHALLENGES.
//
// Challenges all resolve in the first 3–5 minutes, so unlike balance-sim.mjs
// (which models MAX endgame builds) this models EARLY-game progression:
//   • the real enemy spawn budget over time (group + wave + boss minions)
//   • the XP→level curve from killing everything that spawns
//   • boss HP scaling at the level you actually reach by the boss spawn
//   • a realistic EARLY DPS band (you do NOT have a maxed build at 3:00)
//
// It prints, per challenge, the requirement vs. what a strong player can
// actually achieve, and a verdict: TOO EASY / GOOD / TOO HARD.
// Run: node scripts/challenge-sim.mjs

// ── Constants mirrored from the live game ──
const SPAWN_CAP = 70;
const interval  = t => Math.max(0.40, 1.6 - t / 280);          // game.js:568
const groupSize = t => Math.min(5, 1 + Math.floor(t / 90));    // game.js:577
const WAVE_EVERY = 90, WAVE_COUNT = 13;                        // 12 + 1 elite, game.js:590
// mini1 (Sauce Slinger): spawns at 180s, summons minionCount=2 every minionCd=9s
const BOSS1_SPAWN = 180, BOSS1_MINION_CD = 9, BOSS1_MINIONS = 2;
const BOSS1 = { baseHp: 480, hpPerLvl: 60 };                   // game.js:344

// Enemy XP by type, and the earliest time each is eligible (spawnTime).
const ENEMIES = {
  goblin: { xp: 1,  spawnTime: 0   },
  bat:    { xp: 1,  spawnTime: 60  },
  brute:  { xp: 4,  spawnTime: 90  },
  skelly: { xp: 2,  spawnTime: 150 },
  imp:    { xp: 3,  spawnTime: 240 },
  archer: { xp: 3,  spawnTime: 270 },
  warlord:{ xp: 12, spawnTime: 360 },
};
const eligible = t => Object.entries(ENEMIES).filter(([, e]) => e.spawnTime <= t).map(([k]) => k);
const avgXpAt  = t => { const e = eligible(t); return e.reduce((s, k) => s + ENEMIES[k].xp, 0) / e.length; };

// XP curve: xpToNext after reaching level L = floor(5 + L*2.2 + L^1.4); L1→2 = 5.
function xpToNext(level) { return level === 1 ? 5 : Math.floor(5 + level * 2.2 + Math.pow(level, 1.4)); }

// ── Simulate spawn budget + leveling assuming a STRONG clear (kills ≈ spawns,
//    so room stays open and spawns flow at full rate). This is the ceiling. ──
function simulate(maxT) {
  const dt = 0.05;
  let t = 0, spawnAcc = 0, lastWave = 0, lastMinion = BOSS1_SPAWN;
  let killsCum = 0, xpCum = 0, level = 1, xpInLevel = 0, need = xpToNext(1);
  const log = [];          // snapshots {t, kills, level}
  const marks = [60, 120, 180, 240, 300];
  let mi = 0;

  for (t = 0; t < maxT; t += dt) {
    // group spawns
    spawnAcc += dt;
    if (spawnAcc >= interval(t)) {
      spawnAcc = 0;
      addSpawn(groupSize(t));
    }
    // wave spawns every 90s
    if (t - lastWave >= WAVE_EVERY) { lastWave = t; addSpawn(WAVE_COUNT); }
    // boss-1 minions after 180s
    if (t >= BOSS1_SPAWN && t - lastMinion >= BOSS1_MINION_CD) { lastMinion = t; addSpawn(BOSS1_MINIONS); }

    while (mi < marks.length && t >= marks[mi]) { log.push({ t: marks[mi], kills: Math.floor(killsCum), level }); mi++; }
  }
  function addSpawn(n) {
    // strong-clear assumption: everything dies → counts as kills + xp
    killsCum += n;
    const gained = n * avgXpAt(t);
    xpInLevel += gained; xpCum += gained;
    while (xpInLevel >= need) { xpInLevel -= need; level++; need = xpToNext(level); }
  }
  return { log, killsTotal: Math.floor(killsCum), levelEnd: level };
}

function levelAt(T) { return simulate(T + 0.1).levelEnd; }
function killsBy(T) { return simulate(T + 0.1).killsTotal; }
function boss1HP(level) { return Math.round(BOSS1.baseHp + level * BOSS1.hpPerLvl); }

// ── Realistic EARLY single-target DPS band at ~3:00 ──
// At 3:00 a focused player typically has: starter pizza ~L4–5, one other weapon
// ~L2–3, a couple stat upgrades (NOT the x6 max stacks balance-sim assumes).
// balance-sim's MAX single-weapon boss DPS is ~150–400. Early game realistically
// lands a fraction of that. We bracket low/median/high players.
const EARLY_BOSS_DPS = { weak: 35, median: 70, strong: 130 };

console.log('================ WALLOP CHALLENGE DIFFICULTY AUDIT ================\n');

const prog = simulate(305);
console.log('Progression ceiling (strong clear — kills≈spawns):');
console.log('  time   maxKills   level');
for (const s of prog.log) {
  console.log(`  ${String(s.t).padStart(3)}s   ${String(s.kills).padStart(7)}   ${String(s.level).padStart(3)}`);
}
console.log('');

function verdict(line) { console.log(line); }
function tag(easy, hard, cond) { return cond === 'easy' ? '⚠️  TOO EASY' : cond === 'hard' ? '⛔ TOO HARD' : '✅ GOOD'; }

// 1) GLASS CANNON — half HP (+50% dmg), survive to 5:00 (300s)
console.log('── 1. GLASS CANNON ── start 48 HP (40% of 120), +50% dmg; survive to 6:00');
console.log('   Survival challenge (skill, not DPS). 6:00 timer now spans BOTH boss spawns:');
console.log('   Sauce Slinger (3:00) AND Hammer Chef (6:00), plus archers (4:30) + warlord trash (6:00).');
console.log('   40% HP = ~2–3 hits from a brute (18) / boss sauce (18+) ends the run.');
console.log('   VERDICT: longer timer + lower HP forces survival through a boss + ranged pressure.\n');

// 2) SPEED DEMON — kill Boss1 before 4:00 (boss spawns 3:00 → 60s window)
{
  const lvl = levelAt(180);
  const hp = boss1HP(lvl);
  const window = 210 - 180; // 30s (must die by 3:30)
  const reqDPS = hp / window;
  console.log('── 2. SPEED DEMON ── kill Sauce Slinger before 3:30 (30s window)');
  console.log(`   Boss spawns 3:00 at ~level ${lvl} → HP ≈ ${hp}. Window = ${window}s.`);
  console.log(`   Required boss DPS = ${reqDPS.toFixed(0)}.  Early DPS band weak/median/strong = `
    + `${EARLY_BOSS_DPS.weak}/${EARLY_BOSS_DPS.median}/${EARLY_BOSS_DPS.strong}`);
  console.log(`   TTK: weak ${(hp/EARLY_BOSS_DPS.weak).toFixed(0)}s | median ${(hp/EARLY_BOSS_DPS.median).toFixed(0)}s | strong ${(hp/EARLY_BOSS_DPS.strong).toFixed(0)}s (need ≤ ${window}s)\n`);
}

// 3) SLAUGHTERHOUSE — 150 kills within 4:00
{
  const cap = killsBy(240);
  const REQ = 200;
  console.log('── 3. SLAUGHTERHOUSE ── 200 kills within 4:00');
  console.log(`   Spawn budget ceiling by 4:00 ≈ ${cap} kills (perfect instant clear).`);
  console.log(`   So ${REQ} needs ${(REQ/cap*100).toFixed(0)}% of all spawns killed — `
    + (cap < REQ*1.1 ? 'near-impossible / requires flawless AOE.' : cap < REQ*1.6 ? 'tight, demands strong AOE.' : 'comfortable with any AOE weapon.') + '\n');
}

// 4) UNTOUCHABLE — no damage for 4:00
console.log('── 4. UNTOUCHABLE ── survive to 4:00 taking ZERO damage');
console.log(`   By 4:00 ≈ ${killsBy(240)} enemies have spawned incl. ranged archers (270s? no) + boss1 sauce lobs.`);
console.log('   One touch fails. Pure dodging for 4 full minutes through swarms + a boss.');
console.log('   VERDICT: genuinely hard; highest reward (250) fits.\n');

// 5) PIZZA PURIST — kill Boss1 with ONLY pizza, 5:00 ceiling (boss 3:00 → 120s window)
{
  const lvl = levelAt(180);
  const hp = boss1HP(lvl);
  const window = 300 - 180; // 120s
  // pizza-only: balance-sim pizza maxed bossDPS ~ (16*2 base) but early & single weapon.
  // Early pizza-only realistic boss DPS ~ 25–55 (no synergies, low stats, one weapon).
  const pizzaDPS = { weak: 18, median: 32, strong: 55 };
  console.log('── 5. PIZZA PURIST ── kill Sauce Slinger using ONLY Pizza Toss, by 5:00');
  console.log(`   Boss ~level ${lvl} → HP ≈ ${hp}. Window = ${window}s (pizza is your only damage).`);
  console.log(`   Pizza-only boss DPS band weak/median/strong = ${pizzaDPS.weak}/${pizzaDPS.median}/${pizzaDPS.strong}`);
  console.log(`   TTK: weak ${(hp/pizzaDPS.weak).toFixed(0)}s | median ${(hp/pizzaDPS.median).toFixed(0)}s | strong ${(hp/pizzaDPS.strong).toFixed(0)}s (need ≤ ${window}s)\n`);
}

console.log('==================================================================');
