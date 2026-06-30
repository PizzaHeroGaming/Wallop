// Headless capture of clean (HUD-hidden via F9) gameplay frames for store art.
// Renders the game in headless Chromium (SwiftShader WebGL) at 1440p and writes
// PNGs to steam/raw/. Run with a static server up: py -3 -m http.server 8123
//   node scripts/capture-shots.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';

fs.mkdirSync('steam/raw', { recursive: true });
const URL = 'http://localhost:8123/index.html';
const W = 2560, H = 1440;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
    `--window-size=${W},${H}`,
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 160)));

// Pre-seed a profile with the tutorial already done, so runs spawn enemies
// immediately (the first-run tutorial otherwise freezes combat).
await page.evaluateOnNewDocument((profileJson) => {
  try { localStorage.setItem('wallop_profile_v1', profileJson); } catch (e) {}
}, JSON.stringify({
  version: 2, tutorialDone: true, slices: 0, unlocked: {}, boostLevels: {}, stats: {},
  completedChallenges: {}, equippedCharacter: 'pizza_hero', equippedArena: 'pepperoni_pines',
  unlockedArenas: { pepperoni_pines: true }, arenaProgress: {},
}));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(10000); // assets + WebGL warmup (SwiftShader is slow)

const diag = await page.evaluate(() => ({
  three: typeof THREE !== 'undefined' ? THREE.REVISION : 'NO THREE',
  canvas: !!document.querySelector('canvas'),
  start: document.getElementById('start-screen') && !document.getElementById('start-screen').classList.contains('hidden'),
}));
console.log('DIAG', JSON.stringify(diag));

// Dismiss the Pizza Hero splash (waits for a click).
await page.mouse.click(W / 2, H / 2);
await sleep(2500);

// HERO shot — hide the menu with F9, leaving the hero on the live arena.
await page.keyboard.press('F9');
await sleep(2500);
await page.screenshot({ path: 'steam/raw/hero.png' });
console.log('wrote steam/raw/hero.png');
await page.keyboard.press('F9'); // restore menu
await sleep(600);

// ── Start a run and build up the action ──
const clearLevelUp = () => page.evaluate(() => {
  const lv = document.getElementById('levelup-screen');
  if (lv && !lv.classList.contains('hidden')) {
    const card = lv.querySelector('.choice');
    if (card) { card.click(); return true; }
    [...document.querySelectorAll('#levelup-screen button')].find(b => /skip/i.test(b.textContent))?.click();
    return true;
  }
  return false;
});
const isPlaying = () => page.evaluate(() => document.body.classList.contains('playing'));

await page.evaluate(() => document.getElementById('start-btn')?.click());
await sleep(1500);
await page.evaluate(() => document.getElementById('run-config-play-btn')?.click());
await sleep(5000); // intro sweep + spawn-in

// Prefer persistent-AOE weapons (aura / orbiting wheel) so enemies CLUSTER around
// a glowing hero instead of being cleared; skip everything else so the swarm
// builds up. Stand still so enemies converge.
const pickAuraOrbitElseSkip = () => page.evaluate(() => {
  const lv = document.getElementById('levelup-screen');
  if (!lv || lv.classList.contains('hidden')) return 'none';
  const cards = [...lv.querySelectorAll('.choice')];
  const want = cards.find(c => /aura|wheel|orbit|wallop|thunder|shock|fire/i.test(c.textContent));
  if (want) { want.click(); return 'picked'; }
  [...lv.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))?.click();
  return 'skipped';
});

// Build phase: ~75s of game time, standing still, grabbing AOE upgrades.
for (let t = 0; t < 15; t++) {
  await pickAuraOrbitElseSkip();
  await sleep(5000);
  if (!(await isPlaying())) {
    // died? gameover — restart a run and keep going
    const over = await page.evaluate(() => { const g = document.getElementById('gameover-screen'); return g && !g.classList.contains('hidden'); });
    if (over) {
      await page.evaluate(() => document.getElementById('restart-btn')?.click());
      await sleep(6000);
    }
  }
}

// Capture a burst of HUD-free frames; pick the best swarm moment later.
for (let i = 1; i <= 5; i++) {
  await pickAuraOrbitElseSkip();
  await sleep(3000);
  if (await isPlaying()) {
    await page.keyboard.press('F9');
    await sleep(450);
    await page.screenshot({ path: `steam/raw/action${i}.png` });
    console.log(`wrote steam/raw/action${i}.png`);
    await page.keyboard.press('F9');
  } else {
    console.log(`action${i}: not playing`);
  }
  await sleep(2500);
}

await browser.close();
console.log('done');
