/**
 * Rasterize assets/icons/icon.svg into the PNG sources @capacitor/assets needs.
 *
 * Outputs to cap-resources/:
 *   icon-only.png        — full maskable icon (legacy launcher icon)
 *   icon-foreground.png  — same, used as the adaptive-icon foreground
 *   icon-background.png   — solid #0d1126 (the icon's navy), adaptive background
 *
 * Then run:  npx @capacitor/assets generate --android --assetPath cap-resources
 *
 * Uses the `sharp` that ships with @capacitor/assets. Re-run whenever icon.svg
 * changes. cap-resources/ is a generated source dir (git-ignored).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icons', 'icon.svg');
const OUT = path.join(ROOT, 'cap-resources');
const SIZE = 1024;
const NAVY = '#0d1126';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // density 288 renders the 512-viewBox SVG at ~2048px, then we downscale to
  // 1024 for a crisp, supersampled result.
  const icon = await sharp(SVG, { density: 288 }).resize(SIZE, SIZE).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'icon-only.png'), icon);
  fs.writeFileSync(path.join(OUT, 'icon-foreground.png'), icon);
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: NAVY },
  }).png().toFile(path.join(OUT, 'icon-background.png'));
  console.log(`Wrote icon-only / icon-foreground / icon-background (${SIZE}px) to cap-resources/`);
})().catch(e => { console.error(e); process.exit(1); });
