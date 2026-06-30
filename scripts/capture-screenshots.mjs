// Headless capture of PC store SCREENSHOTS (HUD visible — screenshots should show
// real UI/gameplay, unlike the clean capsules). 1920x1080, written to steam/raw/.
// Needs a static server up:  py -3 -m http.server 8123
//   node scripts/capture-screenshots.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';

fs.mkdirSync('steam/raw', { recursive: true });
const URL = 'http://localhost:8123/index.html';
const W = 1920, H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (p) => page.screenshot({ path: `steam/raw/${p}` }).then(() => console.log('wrote', p));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 160)));

// Pre-seed a profile that looks lived-in: tutorial done, slices to spend, arenas
// + difficulties unlocked, a couple characters owned.
await page.evaluateOnNewDocument((p) => { try { localStorage.setItem('wallop_profile_v1', p); } catch (e) {} },
  JSON.stringify({
    version: 2, tutorialDone: true, slices: 640,
    unlocked: { frost_baker: true, oven_knight: true },
    boostLevels: {}, stats: { kills: 4820, runs: 23, bestTime: 612 }, completedChallenges: {},
    equippedCharacter: 'pizza_hero', equippedArena: 'pepperoni_pines',
    unlockedArenas: { pepperoni_pines: true, sundried_slopes: true, frostbite_glacier: true },
    arenaProgress: { pepperoni_pines: { bestDifficulty: 'extreme' }, sundried_slopes: { bestDifficulty: 'hard' } },
  }));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(10000);
await page.mouse.click(W / 2, H / 2); // dismiss splash
await sleep(2500);

// 1. Title / main menu
await shot('pc-5-title.png');

// 2. Armory (meta progression)
await page.evaluate(() => document.getElementById('armory-btn')?.click());
await sleep(2500);
await shot('pc-3-armory.png');
await page.evaluate(() => document.getElementById('armory-close')?.click());
await sleep(1500);

// 3. Run config (arena + difficulty select)
await page.evaluate(() => document.getElementById('start-btn')?.click());
await sleep(2000);
await shot('pc-4-runconfig.png');

// 4. Into the run — stack weapons for a full loadout + projectiles, then capture.
await page.evaluate(() => document.getElementById('run-config-play-btn')?.click());
await sleep(5000);

const clearLevelUp = () => page.evaluate(() => {
  const lv = document.getElementById('levelup-screen');
  if (lv && !lv.classList.contains('hidden')) { lv.querySelector('.choice')?.click(); return true; }
  return false;
});
const levelUpOpen = () => page.evaluate(() => {
  const lv = document.getElementById('levelup-screen');
  return !!(lv && !lv.classList.contains('hidden'));
});

// Stand still so enemies converge and die → XP → level-up (also = denser swarm).
const bossUp = () => page.evaluate(() => {
  const b = document.getElementById('boss-wrap');
  return !!(b && !b.classList.contains('hidden'));
});
const gameOver = () => page.evaluate(() => {
  const g = document.getElementById('gameover-screen');
  return !!(g && !g.classList.contains('hidden'));
});

const hud = () => page.evaluate(() => ({
  kills: document.getElementById('kills-val')?.textContent,
  lvl: document.getElementById('lvl-badge')?.textContent,
}));

// Run is in slow-motion under SwiftShader, so loop long. Stand still → enemies
// converge. Capture the FIRST level-up (before picking), then pick weapons to
// accelerate kills + thicken the projectile spray for the gameplay frames.
let gotLevelUp = false, gotBoss = false;
for (let t = 0; t < 120; t++) {
  if (await levelUpOpen()) {
    if (!gotLevelUp) { await shot('pc-2-levelup.png'); gotLevelUp = true; } // level-up choice screen
    await clearLevelUp();              // pick from here on → more weapons → more kills
    await sleep(400);
  }
  if (!gotBoss && await bossUp()) { await shot('pc-7-boss.png'); gotBoss = true; }
  if (t === 30) { await shot('pc-1-gameplay.png'); }
  if (t === 70) { await shot('pc-6-gameplay2.png'); }
  if (t % 15 === 0) { const h = await hud(); console.log(`t=${t} kills=${h.kills} ${h.lvl} levelup=${gotLevelUp} boss=${gotBoss}`); }
  if (await gameOver()) { console.log('player died at t=' + t); break; }
  await sleep(1500);
}
// final, densest gameplay frame
await clearLevelUp(); await sleep(800);
await shot('pc-8-gameplay3.png');

if (!gotLevelUp) console.log('NOTE: level-up screen was never captured');
if (gotBoss) console.log('captured a boss frame');
await browser.close();
console.log('done');
