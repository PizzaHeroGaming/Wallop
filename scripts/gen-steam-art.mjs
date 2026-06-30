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

const SHOTS = 'steam/screenshots';

// 1. Library capsule 600×900 (portrait box art)
await composite(`${SHOTS}/02-boss.png`, 600, 900,
  svg(600, 900, `<defs>${GRAD('g1')}
    <linearGradient id="sc1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080a18" stop-opacity="0"/><stop offset="55%" stop-color="#080a18" stop-opacity="0.82"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.97"/></linearGradient>
    <linearGradient id="sctop1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080a18" stop-opacity="0.95"/><stop offset="100%" stop-color="#080a18" stop-opacity="0"/></linearGradient></defs>
    <rect width="600" height="900" fill="#0d1126" opacity="0.18"/>
    <rect x="0" y="0" width="600" height="170" fill="url(#sctop1)"/>
    <rect x="0" y="430" width="600" height="470" fill="url(#sc1)" />
    ${wordmarkGroup({ cx: 300, cy: 600, targetW: 500, gradId: 'g1' })}
    ${taglineGroup({ text: 'smash. survive. snowball.', cx: 300, cy: 720, targetW: 360 })}`),
  'steam/library-capsule-600x900.png', 'top');

// 2. Library hero 3840×1240 (ultrawide banner)
await composite(`${SHOTS}/01-swarm.png`, 3840, 1240,
  svg(3840, 1240, `<defs>${GRAD('g2')}
    <linearGradient id="sc2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080a18" stop-opacity="0.1"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.8"/></linearGradient>
    <linearGradient id="sctop2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080a18" stop-opacity="0.92"/><stop offset="100%" stop-color="#080a18" stop-opacity="0"/></linearGradient>
    <radialGradient id="vig" cx="50%" cy="48%" r="62%"><stop offset="62%" stop-color="#080a18" stop-opacity="0"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.6"/></radialGradient></defs>
    <rect width="3840" height="1240" fill="url(#sc2)"/>
    <rect x="0" y="0" width="3840" height="360" fill="url(#sctop2)"/>
    <rect width="3840" height="1240" fill="url(#vig)"/>
    ${wordmarkGroup({ cx: 1920, cy: 580, targetW: 1700, gradId: 'g2' })}
    ${taglineGroup({ text: 'smash. survive. snowball.', cx: 1920, cy: 820, targetW: 760 })}`),
  'steam/library-hero-3840x1240.png', 'centre');

// 3. Library logo (transparent wordmark, ~1400×640)
{
  const w = 1400, h = 640;
  await sharp(svg(w, h, `<defs>${GRAD('g3')}</defs>${wordmarkGroup({ cx: w/2, cy: h/2, targetW: 1240, gradId: 'g3' })}`))
    .png().toFile('steam/library-logo.png');
  console.log('wrote steam/library-logo.png');
}

// 4. Page background 1920×1080 (darkened atmosphere, faint logo)
await composite(`${SHOTS}/01-swarm.png`, 1920, 1080,
  svg(1920, 1080, `<rect width="1920" height="1080" fill="#080a18" opacity="0.62"/>`),
  'steam/page-background-1920x1080.png', 'centre');

// ── STORE CAPSULES (current Steam dimensions) ──
// Reusable scrim defs: bottom-up + top-down darkening + radial vignette.
const scrims = (w, h) => `
  <linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="40%" stop-color="#080a18" stop-opacity="0"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.92"/></linearGradient>
  <linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080a18" stop-opacity="0.8"/><stop offset="100%" stop-color="#080a18" stop-opacity="0"/></linearGradient>
  <radialGradient id="sv" cx="50%" cy="45%" r="70%"><stop offset="55%" stop-color="#080a18" stop-opacity="0"/><stop offset="100%" stop-color="#080a18" stop-opacity="0.55"/></radialGradient>`;

// 5. Header capsule 920×430 — action bg + bold logo
await composite(`${SHOTS}/01-swarm.png`, 920, 430,
  svg(920, 430, `<defs>${GRAD('gh')}${scrims(920,430)}</defs>
    <rect width="920" height="430" fill="url(#sv)"/>
    <rect width="920" height="120" fill="url(#st)"/>
    <rect y="250" width="920" height="180" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 460, cy: 200, targetW: 720, gradId: 'gh' })}
    ${taglineGroup({ text: 'smash. survive. snowball.', cx: 460, cy: 320, targetW: 430 })}`),
  'steam/header-capsule-920x430.png', 'centre');

// 6. Main capsule 1232×706 — dramatic boss key art + logo
await composite(`${SHOTS}/02-boss.png`, 1232, 706,
  svg(1232, 706, `<defs>${GRAD('gm')}${scrims(1232,706)}</defs>
    <rect width="1232" height="706" fill="url(#sv)"/>
    <rect width="1232" height="180" fill="url(#st)"/>
    <rect y="430" width="1232" height="276" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 616, cy: 300, targetW: 920, gradId: 'gm' })}
    ${taglineGroup({ text: 'smash. survive. snowball.', cx: 616, cy: 450, targetW: 560 })}`),
  'steam/main-capsule-1232x706.png', 'centre');

// 7. Vertical capsule 748×896 — portrait box art (logo lower third)
await composite(`${SHOTS}/01-swarm.png`, 748, 896,
  svg(748, 896, `<defs>${GRAD('gvc')}${scrims(748,896)}</defs>
    <rect width="748" height="896" fill="url(#sv)"/>
    <rect width="748" height="150" fill="url(#st)"/>
    <rect y="470" width="748" height="426" fill="url(#sb)"/>
    ${wordmarkGroup({ cx: 374, cy: 650, targetW: 620, gradId: 'gvc' })}
    ${taglineGroup({ text: 'smash. survive. snowball.', cx: 374, cy: 770, targetW: 440 })}`),
  'steam/vertical-capsule-748x896.png', 'top');

// 8. Small capsule 462×174 — logo-dominant on a clean branded background
//    (Steam requires the logo to nearly fill + stay legible at the smallest size)
{
  const w = 462, h = 174;
  await sharp(svg(w, h, `<defs>${GRAD('gs')}
      <radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#1b2452"/><stop offset="100%" stop-color="#0a0d1e"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    ${wordmarkGroup({ cx: w/2, cy: h/2, targetW: 420, gradId: 'gs' })}`))
    .png().toFile('steam/small-capsule-462x174.png');
  console.log('wrote steam/small-capsule-462x174.png');
}

console.log('done');
