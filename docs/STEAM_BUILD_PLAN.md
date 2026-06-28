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

## ⚠️ BLOCKER before shipping: vendor Three.js for offline play
`src/wallop.html` loads Three.js r128 **and its addons** from
`cdnjs.cloudflare.com`. A Steam game must run **offline** — relying on a CDN
means no internet = no game. Before release:
1. Download r128 locally into `assets/vendor/three/`:
   - `three.min.js`
   - addons used: `GLTFLoader`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`,
     `ShaderPass`, `CopyShader`, `LuminosityHighPassShader`, `SkeletonUtils`
     (check the `<script>` tags in `wallop.html` for the exact list).
2. Swap the CDN `<script src="https://cdnjs...">` tags for the local
   `assets/vendor/three/...` paths.
3. Rebuild (`build-pages.py` + `build-www.py`) and re-test in `npm start`.
Keep the web build on the CDN if you like, or vendor everywhere for consistency.

## Steamworks (after the $100 account + verification clears)
- **Overlay + cloud + achievements:** integrate `steamworks.js` (Node bindings)
  in `electron/main.js`; expose unlock/cloud calls to the game via preload
  (mirror the achievement list in [[project_play_closed_testing]]'s PGS plan).
- **Steam Cloud** can back the same Profile JSON as the PGS Saved Games path —
  one serialization, two backends chosen by build.
- Set the real Steam **App ID** (a `steam_appid.txt` next to the exe for dev).
- No ads ever on Steam (already gated) — keep it that way for the premium promise.

## Status / verification gap
- Wrapper scaffolded; `main.js` + `preload.js` pass `node --check`.
- **Not yet run** — the dev sandbox can't open a GUI window. First local
  `npm start` is the real smoke test; expect to iterate on protocol/path issues.
- Economy (2× slices) is live in code via `isSteamBuild()`.
