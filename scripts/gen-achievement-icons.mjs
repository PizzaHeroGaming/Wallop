// Generates Steam achievement icons (256x256 PNG) — an "achieved" (colored) and a
// "locked" (greyed) version for each of the 25 achievements. On-brand navy pixel
// tiles with a category-coloured glow + a relevant motif. Output: steam/achievements/.
//   node scripts/gen-achievement-icons.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'steam', 'achievements');
fs.mkdirSync(OUT, { recursive: true });
const FONT_B64 = fs.readFileSync(path.join(ROOT, 'store', '.fonts', 'PressStart2P.ttf')).toString('base64');

// Per-achievement motif. `emoji` OR `num`(+label) OR `grid`. Optional `badge`. `accent` = glow/frame colour.
const RED = '#ff3864', YEL = '#ffd23f', ORG = '#ff9f43', GRN = '#42f5a1', CYN = '#66c0f4', PUR = '#b57edc';
const ICONS = [
  { id: 'ACH_FIRST_DELIVERY', emoji: '🛵', accent: YEL },
  { id: 'ACH_SAUCE_SLINGER',  emoji: '🍅', accent: RED },
  { id: 'ACH_HAMMER_CHEF',    emoji: '🔨', accent: RED },
  { id: 'ACH_WARLORD',        emoji: '👑', accent: RED },
  { id: 'ACH_TRIPLE_THREAT',  emoji: '💀', badge: '×3', accent: RED },
  { id: 'ACH_WIN_NORMAL',     emoji: '🍕', accent: YEL },
  { id: 'ACH_WIN_HARD',       emoji: '🔥', accent: ORG },
  { id: 'ACH_WIN_EXTREME',    emoji: '🌋', accent: RED },
  { id: 'ACH_LEVEL_10',       num: '10', label: 'LV', accent: YEL },
  { id: 'ACH_LEVEL_25',       num: '25', label: 'LV', accent: YEL },
  { id: 'ACH_LEVEL_50',       num: '50', label: 'LV', accent: YEL },
  { id: 'ACH_FULL_LOADOUT',   grid: true, accent: YEL },
  { id: 'ACH_MAX_WEAPON',     emoji: '⭐', badge: 'MAX', accent: YEL },
  { id: 'ACH_GOLD_1000',      emoji: '💰', badge: '1K', accent: YEL },
  { id: 'ACH_KILLS_1000',     emoji: '💀', badge: '1K', accent: RED },
  { id: 'ACH_KILLS_10000',    emoji: '🍖', badge: '10K', accent: RED },
  { id: 'ACH_CHESTS_50',      emoji: '💎', badge: '×50', accent: CYN },
  { id: 'ACH_CLEAR_PINES',    emoji: '🌲', accent: GRN },
  { id: 'ACH_CLEAR_SLOPES',   emoji: '🍂', accent: ORG },
  { id: 'ACH_CLEAR_GLACIER',  emoji: '❄️', accent: CYN },
  { id: 'ACH_NEW_HIRE',       emoji: '👤', badge: '+1', accent: YEL },
  { id: 'ACH_FULL_ROSTER',    emoji: '👥', badge: '6/6', accent: YEL },
  { id: 'ACH_SIGNATURE',      emoji: '✍️', accent: PUR },
  { id: 'ACH_SLICE_BARON',    emoji: '🍕', badge: '500', accent: YEL },
  { id: 'ACH_OVERACHIEVER',   emoji: '🏆', accent: YEL },
];

function centerHTML(c) {
  if (c.num)  return `<div class="num"><span class="lv">${c.label || 'LV'}</span><span class="big">${c.num}</span></div>`;
  if (c.grid) return `<div class="grid">${'<div class="cell"></div>'.repeat(9)}</div>`;
  return `<div class="emoji">${c.emoji}</div>`;
}

function pageHTML(c, locked) {
  return `<style>
    @font-face{font-family:'PS';src:url(data:font/ttf;base64,${FONT_B64}) format('truetype');}
    *{margin:0;box-sizing:border-box;} html,body{width:256px;height:256px;overflow:hidden;}
    .icon{width:256px;height:256px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%, #232a52 0%, #0d1126 82%);${locked ? 'filter:grayscale(100%) brightness(0.5) contrast(0.95);' : ''}}
    .tile{position:relative;width:214px;height:214px;border-radius:22px;background:linear-gradient(180deg,#20264a,#141833);border:6px solid #000;box-shadow:0 0 0 3px var(--a),0 0 32px -4px var(--a),6px 8px 0 rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;overflow:hidden;}
    .glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 46%, var(--a), transparent 60%);opacity:.30;}
    .emoji{font-size:116px;line-height:1;position:relative;filter:drop-shadow(3px 4px 0 rgba(0,0,0,.5));}
    .num{position:relative;display:flex;flex-direction:column;align-items:center;font-family:'PS';color:var(--a);text-shadow:4px 4px 0 #000;}
    .num .lv{font-size:24px;letter-spacing:2px;margin-bottom:10px;color:#fff;}
    .num .big{font-size:84px;line-height:1;}
    .grid{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:13px;width:132px;height:132px;}
    .grid .cell{background:var(--a);border:3px solid #000;border-radius:6px;box-shadow:2px 2px 0 rgba(0,0,0,.5);}
    .badge{position:absolute;bottom:9px;right:9px;background:#0d1126;color:var(--a);font-family:'PS';font-size:19px;padding:6px 8px;border:3px solid var(--a);border-radius:9px;line-height:1;text-shadow:1px 1px 0 #000;}
  </style>
  <div class="icon"><div class="tile" style="--a:${c.accent}"><div class="glow"></div>${centerHTML(c)}${c.badge ? `<div class="badge">${c.badge}</div>` : ''}</div></div>`;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });
let n = 0;
for (const c of ICONS) {
  for (const locked of [false, true]) {
    await page.setContent(pageHTML(c, locked), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(OUT, c.id + (locked ? '_locked' : '') + '.png');
    await page.screenshot({ path: file, omitBackground: false });
    n++;
  }
}
await browser.close();
console.log(`Generated ${n} icons (${ICONS.length} achieved + ${ICONS.length} locked) → steam/achievements/`);
