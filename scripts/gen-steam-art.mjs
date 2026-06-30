// Generates Steam store art (library capsule, hero, logo, page background) in
// WALLOP's brand style. The WALLOP wordmark is converted to vector PATHS via
// opentype.js (so no font-rendering dependency at raster time), filled with the
// yellow→red→purple gradient + black outline + offset shadow, then composited
// over gameplay screenshots with a dark scrim via sharp.
//
// Run: node scripts/gen-steam-art.mjs   (outputs into steam/)
//
// Requires the brand fonts (gitignored) at store/.fonts/ — fetch once:
//   mkdir -p store/.fonts
//   curl -sL -o store/.fonts/PressStart2P.ttf https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf
//   curl -sL -o store/.fonts/VT323.ttf        https://github.com/google/fonts/raw/main/ofl/vt323/VT323-Regular.ttf
// And needs: npm install opentype.js sharp
import fs from 'fs';
import sharp from 'sharp';
import opentype from 'opentype.js';

const PS = (() => {
  const b = fs.readFileSync('store/.fonts/PressStart2P.ttf');
  return opentype.parse(Uint8Array.from(b).buffer);
})();
const VT = (() => {
  const b = fs.readFileSync('store/.fonts/VT323.ttf');
  return opentype.parse(Uint8Array.from(b).buffer);
})();

// Build a path + its bbox for some text at a given font size.
function textPath(font, text, fontSize) {
  const p = font.getPath(text, 0, 0, fontSize);
  const bb = p.getBoundingBox();
  return { d: p.toPathData(2), w: bb.x2 - bb.x1, h: bb.y2 - bb.y1, x1: bb.x1, y1: bb.y1 };
}

// A wordmark <g>: gradient fill + black outline + offset shadow, scaled to
// targetW and centered at (cx, cy) inside a WxH canvas.
function wordmarkGroup({ text = 'WALLOP', cx, cy, targetW, gradId, shadow = 0.07, stroke = 0.05 }) {
  const tp = textPath(PS, text, 100);
  const scale = targetW / tp.w;
  const drawW = tp.w * scale, drawH = tp.h * scale;
  const ox = cx - drawW / 2 - tp.x1 * scale;     // align bbox left to centered position
  const oy = cy - drawH / 2 - tp.y1 * scale;     // align bbox top
  const sw = (100 * stroke);                       // stroke in path units
  const sh = drawH * shadow;                        // shadow offset
  return `
    <g transform="translate(${ox.toFixed(1)},${oy.toFixed(1)}) scale(${scale.toFixed(4)})">
      <path d="${tp.d}" fill="#000" transform="translate(${(sh/scale).toFixed(1)},${(sh/scale).toFixed(1)})"/>
      <path d="${tp.d}" fill="url(#${gradId})" stroke="#000" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round"/>
    </g>`;
}

function taglineGroup({ text, cx, cy, targetW }) {
  const tp = textPath(VT, text, 100);
  const scale = targetW / tp.w;
  const drawW = tp.w * scale, drawH = tp.h * scale;
  const ox = cx - drawW / 2 - tp.x1 * scale;
  const oy = cy - drawH / 2 - tp.y1 * scale;
  return `<g transform="translate(${ox.toFixed(1)},${oy.toFixed(1)}) scale(${scale.toFixed(4)})">
      <path d="${tp.d}" fill="#ffe9b0" stroke="#000" stroke-width="3" stroke-linejoin="round"/></g>`;
}

const GRAD = (id) => `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffd23f"/><stop offset="55%" stop-color="#ff3864"/><stop offset="100%" stop-color="#d142f5"/>
  </linearGradient>`;

function svg(w, h, inner) {
  return Buffer.from(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
}

async function composite(base, w, h, overlay, out, position = 'centre') {
  const baseBuf = await sharp(base).resize(w, h, { fit: 'cover', position }).toBuffer();
  await sharp(baseBuf).composite([{ input: overlay, top: 0, left: 0 }]).png().toFile(out);
  console.log('wrote', out);
}

// Clean, HUD-free 1440p captures from scripts/capture-shots.mjs.
const HERO = 'steam/raw/hero.png';        // hero front-and-center on the arena
const ACTION = 'steam/raw/action4.png';   // gameplay: pizzas flying on the arena
const HERO_SWARM = 'steam/raw/swarm-hero.png'; // clean ultrawide swarm (no HUD)

// Shared scrim defs (bottom-up + top-down darkening + radial vignette).
const scrims = () => `
  <linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="38%" stop-color="#080a18" stop-opacity="0"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.94"/></linearGradient>
  <linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080a18" stop-opacity="0.78"/><stop offset="100%" stop-color="#080a18" stop-opacity="0"/></linearGradient>
  <radialGradient id="sv" cx="50%" cy="44%" r="72%"><stop offset="52%" stop-color="#080a18" stop-opacity="0"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.5"/></radialGradient>`;

// 1. Library capsule 600×900 — portrait box art, hero key art, big logo lower
//    third. Steam rule: logo must fill ≥1/3 of the image AND no text but the logo
//    (so NO tagline here). Logo spans nearly full width to read as prominent.
await composite(HERO, 600, 900,
  svg(600, 900, `<defs>${GRAD('g1')}${scrims()}</defs>
    <rect width="600" height="900" fill="url(#sv)"/>
    <rect width="600" height="150" fill="url(#st)"/>
    <rect y="470" width="600" height="430" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 300, cy: 730, targetW: 560, gradId: 'g1' })}`),
  'steam/library-capsule-600x900.png', 'centre');

// 2. Library hero 3840×1240 — clean swarm key art. Steam rule: NO text or logos
//    (the logo is layered separately via the placement tool). Gentle vignette
//    only; hero sits in the centered 860×380 safe area.
await composite(HERO_SWARM, 3840, 1240,
  svg(3840, 1240, `<defs>
      <radialGradient id="vig" cx="50%" cy="50%" r="72%"><stop offset="56%" stop-color="#080a18" stop-opacity="0"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.5"/></radialGradient>
      <radialGradient id="bl" cx="0%" cy="100%" r="65%"><stop offset="0%" stop-color="#080a18" stop-opacity="0.8"/><stop offset="60%" stop-color="#080a18" stop-opacity="0.35"/><stop offset="100%" stop-color="#080a18" stop-opacity="0"/></radialGradient></defs>
    <rect width="3840" height="1240" fill="url(#vig)"/>
    <rect width="3840" height="1240" fill="url(#bl)"/>`),
  'steam/library-hero-3840x1240.png', 'centre');

// 3. Library logo — transparent wordmark, 1280×720 (Steam's required size).
//    Soft dark glow behind the letters so it stays legible against a bright/busy
//    hero background (Steam suggests a drop shadow for exactly this).
{
  const w = 1280, h = 720, targetW = 1040;
  const tp = textPath(PS, 'WALLOP', 100);
  const scale = targetW / tp.w;
  const drawW = tp.w * scale, drawH = tp.h * scale;
  const ox = w / 2 - drawW / 2 - tp.x1 * scale;
  const oy = h / 2 - drawH / 2 - tp.y1 * scale;
  const inner = `<defs>${GRAD('g3')}
      <filter id="lglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="11"/></filter></defs>
    <g transform="translate(${ox.toFixed(1)},${oy.toFixed(1)}) scale(${scale.toFixed(4)})">
      <path d="${tp.d}" fill="#000" filter="url(#lglow)"/>
      <path d="${tp.d}" fill="#000" filter="url(#lglow)"/>
      <path d="${tp.d}" fill="#000" filter="url(#lglow)"/>
      <path d="${tp.d}" fill="url(#g3)" stroke="#000" stroke-width="6" stroke-linejoin="round"/>
    </g>`;
  await sharp(svg(w, h, inner)).png().toFile('steam/library-logo-1280x720.png');
  console.log('wrote steam/library-logo-1280x720.png');
}

// 4. Page background 1438×810 — ambient, no text/logo (Steam tints it blue +
//    fades the edges automatically, so keep it low-contrast and quiet).
await composite(ACTION, 1438, 810,
  svg(1438, 810, `<rect width="1438" height="810" fill="#080a18" opacity="0.5"/>`),
  'steam/page-background-1438x810.png', 'centre');

// 5. Header capsule 920×430 — action bg + bold logo
await composite(ACTION, 920, 430,
  svg(920, 430, `<defs>${GRAD('gh')}${scrims()}</defs>
    <rect width="920" height="430" fill="url(#sv)"/>
    <rect width="920" height="120" fill="url(#st)"/>
    <rect y="250" width="920" height="180" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 460, cy: 215, targetW: 720, gradId: 'gh' })}`),
  'steam/header-capsule-920x430.png', 'centre');

// 5b. Library header 920×430 — client-library banner. Steam: match the Library
// Capsule branding (hero key art) with a clearly legible logo in the lower band.
await composite(HERO, 920, 430,
  svg(920, 430, `<defs>${GRAD('glh')}${scrims()}</defs>
    <rect width="920" height="430" fill="url(#sv)"/>
    <rect width="920" height="110" fill="url(#st)"/>
    <rect y="230" width="920" height="200" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 460, cy: 330, targetW: 660, gradId: 'glh' })}`),
  'steam/library-header-920x430.png', 'centre');

// 6. Main capsule 1232×706 — hero key art, logo lower third
await composite(HERO, 1232, 706,
  svg(1232, 706, `<defs>${GRAD('gm')}${scrims()}</defs>
    <rect width="1232" height="706" fill="url(#sv)"/>
    <rect width="1232" height="150" fill="url(#st)"/>
    <rect y="380" width="1232" height="326" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 616, cy: 560, targetW: 900, gradId: 'gm' })}`),
  'steam/main-capsule-1232x706.png', 'centre');

// 7. Vertical capsule 748×896 — portrait box art (logo lower third)
await composite(HERO, 748, 896,
  svg(748, 896, `<defs>${GRAD('gvc')}${scrims()}</defs>
    <rect width="748" height="896" fill="url(#sv)"/>
    <rect width="748" height="150" fill="url(#st)"/>
    <rect y="470" width="748" height="426" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 374, cy: 740, targetW: 640, gradId: 'gvc' })}`),
  'steam/vertical-capsule-748x896.png', 'centre');

// 8. Small capsule 462×174 — logo-dominant on a clean branded background
{
  const w = 462, h = 174;
  await sharp(svg(w, h, `<defs>${GRAD('gs')}
      <radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#1b2452"/><stop offset="100%" stop-color="#0a0d1e"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    ${wordmarkGroup({ cx: w/2, cy: h/2, targetW: 420, gradId: 'gs' })}`))
    .png().toFile('steam/small-capsule-462x174.png');
  console.log('wrote steam/small-capsule-462x174.png');
}

// 9. Client icons (Installation → Client Images): Shortcut Icon 512 PNG + App
//    Icon 184 JPG. Solid navy bg — the App Icon has no alpha, so any
//    transparency would convert to solid black.
{
  const ico = fs.readFileSync('assets/icons/icon.svg');
  await sharp(ico, { density: 400 }).resize(512, 512).flatten({ background: '#0d1126' }).png().toFile('steam/shortcut-icon-512.png');
  await sharp(ico, { density: 400 }).resize(184, 184).flatten({ background: '#0d1126' }).jpeg({ quality: 95 }).toFile('steam/app-icon-184.jpg');
  console.log('wrote steam/shortcut-icon-512.png + steam/app-icon-184.jpg');
}

console.log('done');
