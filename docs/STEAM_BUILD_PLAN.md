# WALLOP — Steam / Desktop Build Plan

The desktop build is an **Electron wrapper** (`electron/`) around the same web
game. It serves the game from a custom secure origin (`wallop://`) so ES modules
work, and a preload sets `window.__WALLOP_STEAM = true` → `isSteamBuild()` turns
on premium behaviour (2× slice economy; ads already gated off on desktop).

Pricing/economy context: [[project_steam_economy]] ($5 premium, ~2× base slices).

## Files
- `electron/main.js` — creates the window (fullscreen), registers the `wallop://`
  protocol, serves game files. Dev = repo root; packaged = bundled `game/`.
- `electron/preload.js` — exposes `__WALLOP_STEAM`.
- `electron/package.json` — electron + electron-builder; `dir` targets (Steam
  wants raw files, not an installer).

## Run it (dev)
```
cd electron
npm install            # downloads Electron (~200 MB, one time)
npm start
```
Dev serves the repo root, so no build step needed. **Needs internet** in dev
because Three.js still loads from a CDN (see the blocker below).

## Build a distributable
```
python3 scripts/build-www.py   # assembles ../www (index.html + src + assets)
cd electron
npm run dist                   # → electron/dist/<platform>-unpacked/
```
The unpacked folder is what you upload to Steam via SteamPipe.

## ✅ DONE: Three.js vendored for offline play
`src/wallop.html` now loads Three.js r128 + all addons from
**`src/vendor/three/`** (was cdnjs/jsdelivr) — the game runs fully offline, which
a Steam build requires. `build-pages.py` rewrites `vendor/three/` →
`src/vendor/three/` for the generated `index.html`. Vendored everywhere (web too,
for PWA/offline). Verified: `THREE.REVISION === 128` + GLTFLoader/EffectComposer/
UnrealBloomPass/SkeletonUtils all load locally, game renders clean.

## Clean marketing captures
Press **F9** (or load `?nohud=1`) to hide the HUD, mobile controls, and the title
menu — for HUD-free, high-res store-capsule + trailer frames. Recomposite
capsules from clean captures via `scripts/gen-steam-art.mjs`.

## Steamworks (account LIVE as of 2026-06-29)
- **App ID: `4910280`** (Steamworks admin → WALLOP). Store packages: WALLOP 1704714,
  Beta Testing 1704713, Developer Comp 1704712; store item 1235588.
- **`electron/steam_appid.txt`** holds the App ID so `npm start` dev can init the
  SDK without launching through Steam. Must ship next to the packaged .exe too
  (add to electron-builder `extraResources`/`files` when the SDK is wired).
- **Overlay + cloud + achievements:** integrate `steamworks.js` (Node bindings)
  in `electron/main.js`; expose unlock/cloud calls to the game via preload
  (mirror the achievement list in [[project_play_closed_testing]]'s PGS plan).
  Achievements must first be defined in the Steamworks dashboard (API names).
- **Steam Cloud** can back the same Profile JSON as the PGS Saved Games path —
  one serialization, two backends chosen by build.
- No ads ever on Steam (already gated) — keep it that way for the premium promise.

## Status / verification gap
- Wrapper scaffolded; `main.js` + `preload.js` pass `node --check`.
- **Not yet run** — the dev sandbox can't open a GUI window. First local
  `npm start` is the real smoke test; expect to iterate on protocol/path issues.
- Economy (2× slices) is live in code via `isSteamBuild()`.
