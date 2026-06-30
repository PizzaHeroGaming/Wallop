// Headless capture of a staged late-game swarm money-shot for the store.
// Uses the ?cap=1 hook (window.__cap) to jump the clock, grant a full loadout,
// and spawn ~70 enemies ringing the hero, then captures him firing into them.
// Needs a static server up:  py -3 -m http.server 8123
//   node scripts/capture-swarm.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';

fs.mkdirSync('steam/raw', { recursive: true });
const URL = 'http://localhost:8123/index.html?cap=1';
const W = 1920, H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 200)));

await page.evaluateOnNewDocument((p) => { try { localStorage.setItem('wallop_profile_v1', p); } catch (e) {} },
  JSON.stringify({ version: 2, tutorialDone: true, slices: 0, unlocked: {}, boostLevels: {}, stats: {},
    completedChallenges: {}, equippedCharacter: 'pizza_hero', equippedArena: 'pepperoni_pines',
    unlockedArenas: { pepperoni_pines: true }, arenaProgress: {} }));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(10000);
await page.mouse.click(W / 2, H / 2); // splash
await sleep(2500);

// Start a run.
await page.evaluate(() => document.getElementById('start-btn')?.click());
await sleep(1500);
await page.evaluate(() => document.getElementById('run-config-play-btn')?.click());
await sleep(5000);

console.log('cap hook present:', await page.evaluate(() => !!window.__cap));

// Dismiss any level-up overlay (kills give XP → it pauses + blocks the view).
const dismissLevelUp = () => page.evaluate(() => {
  const lv = document.getElementById('levelup-screen');
  if (!lv || lv.classList.contains('hidden')) return false;
  const skip = [...lv.querySelectorAll('button')].find(b => /skip/i.test(b.textContent));
  if (skip) { skip.click(); return true; }
  lv.querySelector('.choice')?.click();
  return true;
});

// Stage the scene: invincible hero, late clock, full gear, steeper camera.
await page.evaluate(() => { window.__cap.heal(); window.__cap.setTime(510); window.__cap.gear(); window.__cap.tilt(1.05); });
await sleep(1500); // let weapons start firing
await dismissLevelUp();

// Tanky swarm persists, so no kills → no XP → no level-up spam. Spawn once big,
// top up a little each frame to replace any that wander, capture several angles.
const count = await page.evaluate(() => window.__cap.swarm(85));
console.log('enemies after swarm:', count);

for (let i = 1; i <= 5; i++) {
  await page.evaluate(() => { window.__cap.heal(); window.__cap.swarm(18); });
  await sleep(1200);
  await dismissLevelUp();
  await page.screenshot({ path: `steam/raw/swarm-${i}.png` });
  const st = await page.evaluate(() => ({ enemies: window.__cap ? undefined : 0, kills: document.getElementById('kills-val')?.textContent, playing: document.body.classList.contains('playing') }));
  console.log(`wrote swarm-${i}.png`, JSON.stringify(st));
}

// Clean ultrawide frame for the Library Hero (3840x1240) — NO HUD, NO logo
// (Steam layers the logo separately). Match the hero aspect (~3.1:1) so there's
// almost no vertical cropping, and hide the HUD with F9.
await page.setViewport({ width: 3072, height: 992, deviceScaleFactor: 1 });
await sleep(900);
await page.evaluate(() => { window.__cap.heal(); window.__cap.tilt(1.0); window.__cap.swarm(60); });
await sleep(1500);
await dismissLevelUp();
await page.keyboard.press('F9'); // hide HUD
await sleep(600);
await page.screenshot({ path: 'steam/raw/swarm-hero.png' });
console.log('wrote steam/raw/swarm-hero.png (clean ultrawide, no HUD)');

await browser.close();
console.log('done');
