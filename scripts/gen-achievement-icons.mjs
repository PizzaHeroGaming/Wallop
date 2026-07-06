// Generates Steam achievement icons (256x256 PNG) — an "achieved" (colored) and a
// "locked" (greyed) version for each achievement. On-brand navy pixel tiles with a
// category-coloured glow + a relevant motif. Output: steam/achievements/.
//   node scripts/gen-achievement-icons.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'steam', 'achievements');
fs.mkdirSync(OUT, { recursive: true });
const FONT_B64 = fs.readFileSync(path.join(ROOT, 'store', '.fonts', 'PressStart2P.ttf')).toString('base64');

const RED = '#ff3864', YEL = '#ffd23f', ORG = '#ff9f43', GRN = '#42f5a1', CYN = '#66c0f4', PUR = '#b57edc';
// Motif: `emoji` OR `num`(+label) OR `grid` OR `pizza`(0/1/2 char levels) OR `chest`. Optional `badge`.
const ICONS = [
  { id: 'ACH_FIRST_DELIVERY', emoji: '🛵', accent: YEL },
  { id: 'ACH_SAUCE_SLINGER',  emoji: '🍅', accent: RED },
  { id: 'ACH_HAMMER_CHEF',    emoji: '🔨', accent: RED },
  { id: 'ACH_WARLORD',        emoji: '👑', accent: RED },
  { id: 'ACH_TRIPLE_THREAT',  emoji: '💀', badge: '×3', accent: RED },
  { id: 'ACH_WIN_NORMAL',     pizza: 0, accent: YEL },   // Well Done — golden
  { id: 'ACH_WIN_HARD',       pizza: 1, accent: ORG },   // Extra Crispy — toasted
  { id: 'ACH_WIN_EXTREME',    pizza: 2, accent: RED },   // Burnt to a Crisp — charred
  { id: 'ACH_LEVEL_50',       num: '50',  label: 'LV', accent: YEL },
  { id: 'ACH_LEVEL_150',      num: '150', label: 'LV', accent: YEL },
  { id: 'ACH_LEVEL_300',      num: '300', label: 'LV', accent: YEL },
  { id: 'ACH_FULL_LOADOUT',   grid: true, accent: YEL },
  { id: 'ACH_MAX_WEAPON',     emoji: '⭐', badge: 'MAX', accent: YEL },
  { id: 'ACH_GOLD_2500',      emoji: '💰', badge: '2.5K', accent: YEL },
  { id: 'ACH_RUSH_HOUR',      emoji: '💀', badge: '5K', accent: RED },
  { id: 'ACH_KILLS_100000',   emoji: '🍖', badge: '100K', accent: RED },
  { id: 'ACH_CHESTS_250',     chest: true, badge: '×250', accent: YEL },
  { id: 'ACH_CLEAR_PINES',    emoji: '🌲', accent: GRN },
  { id: 'ACH_CLEAR_SLOPES',   emoji: '🍂', accent: ORG },
  { id: 'ACH_CLEAR_GLACIER',  emoji: '❄️', accent: CYN },
  { id: 'ACH_NEW_HIRE',       emoji: '👤', badge: '+1', accent: YEL },
  { id: 'ACH_FULL_ROSTER',    emoji: '👥', badge: '6/6', accent: YEL },
  { id: 'ACH_SIGNATURE',      emoji: '✍️', accent: PUR },
  { id: 'ACH_SLICE_BARON',    emoji: '🍕', badge: '500', accent: YEL },
  { id: 'ACH_OVERACHIEVER',   emoji: '🏆', accent: YEL },
  { id: 'ACH_UNTOUCHABLE',    emoji: '🛡️', accent: CYN },
  { id: 'ACH_SPEED_DEMON',    emoji: '⚡', accent: YEL },
];

function pizzaSVG(charLvl) {
  const P = [
    { crust: '#e2a948', cheese: '#ffcf78', pep: '#d84a45', spots: 0 }, // well done (golden)
    { crust: '#9c6427', cheese: '#c7913f', pep: '#9c3a2c', spots: 3 }, // extra crispy (toasted)
    { crust: '#332417', cheese: '#4a3822', pep: '#2c2016', spots: 8 }, // burnt (charred)
  ][charLvl];
  const peps = [[108, 74], [76, 102], [140, 102], [90, 142], [126, 142], [108, 110]];
  const pepC = peps.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${P.pep}" stroke="#000" stroke-width="3"/>`).join('');
  const spotPos = [[74, 84], [150, 90], [88, 150], [148, 148], [112, 66], [66, 120], [156, 122], [104, 152]];
  let spotC = '';
  for (let i = 0; i < P.spots; i++) { const [x, y] = spotPos[i % spotPos.length]; spotC += `<ellipse cx="${x}" cy="${y}" rx="11" ry="8" fill="#160f08" opacity="0.8"/>`; }
  const embers = charLvl === 2 ? `<circle cx="150" cy="72" r="5" fill="#ff7a2f"/><circle cx="72" cy="146" r="4" fill="#ff9f43"/>` : '';
  return `<svg viewBox="0 0 216 216" width="152" height="152" style="filter:drop-shadow(3px 5px 0 rgba(0,0,0,.5))">
    <circle cx="108" cy="108" r="80" fill="${P.crust}" stroke="#000" stroke-width="8"/>
    <circle cx="108" cy="108" r="62" fill="${P.cheese}" stroke="#000" stroke-width="4"/>
    ${pepC}${spotC}${embers}</svg>`;
}

function chestSVG() {
  return `<svg viewBox="0 0 216 216" width="160" height="160" style="filter:drop-shadow(3px 5px 0 rgba(0,0,0,.5))">
    <rect x="40" y="106" width="136" height="72" rx="8" fill="#8a5a2b" stroke="#000" stroke-width="8"/>
    <path d="M36 108 Q36 58 108 58 Q180 58 180 108 Z" fill="#a06a30" stroke="#000" stroke-width="8"/>
    <rect x="58" y="60" width="13" height="118" fill="#6f4620" stroke="#000" stroke-width="3"/>
    <rect x="145" y="60" width="13" height="118" fill="#6f4620" stroke="#000" stroke-width="3"/>
    <rect x="34" y="98" width="148" height="16" fill="#ffd23f" stroke="#000" stroke-width="4"/>
    <rect x="94" y="112" width="28" height="30" rx="4" fill="#ffd23f" stroke="#000" stroke-width="4"/>
    <circle cx="108" cy="124" r="4.5" fill="#000"/><rect x="106" y="124" width="4" height="10" fill="#000"/></svg>`;
}

function centerHTML(c) {
  if (c.pizza !== undefined) return pizzaSVG(c.pizza);
  if (c.chest) return chestSVG();
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
    .num .big{font-size:${c.num && c.num.length >= 3 ? 56 : 84}px;line-height:1;}
    .grid{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:13px;width:132px;height:132px;}
    .grid .cell{background:var(--a);border:3px solid #000;border-radius:6px;box-shadow:2px 2px 0 rgba(0,0,0,.5);}
    .badge{position:absolute;bottom:9px;right:9px;background:#0d1126;color:var(--a);font-family:'PS';font-size:${c.badge && c.badge.length >= 4 ? 15 : 19}px;padding:6px 8px;border:3px solid var(--a);border-radius:9px;line-height:1;text-shadow:1px 1px 0 #000;}
  </style>
  <div class="icon"><div class="tile" style="--a:${c.accent}"><div class="glow"></div>${centerHTML(c)}${c.badge ? `<div class="badge">${c.badge}</div>` : ''}</div></div>`;
}

// clean slate: drop any previously-generated PNGs so renamed achievements don't leave orphans
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });
let n = 0;
for (const c of ICONS) {
  for (const locked of [false, true]) {
    await page.setContent(pageHTML(c, locked), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, c.id + (locked ? '_locked' : '') + '.png') });
    n++;
  }
}
await browser.close();
console.log(`Generated ${n} icons (${ICONS.length} achieved + ${ICONS.length} locked) → steam/achievements/`);
