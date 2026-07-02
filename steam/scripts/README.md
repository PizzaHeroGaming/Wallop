# WALLOP — Steam desktop upload (SteamPipe)

How to push a desktop build to Steam. App ID **4910280**.

## One-time
- Confirm the **Depot ID** in the Steamworks dashboard (App Admin → 4910280 →
  SteamPipe → Depots). If it isn't `4910281`, rename the depot VDF and update the
  `depots` block in `app_build_4910280.vdf`.
- The Steamworks SDK must be extracted locally at `steamworks_sdk_164/`
  (gitignored). steamcmd lives in
  `steamworks_sdk_164/sdk/tools/ContentBuilder/builder/steamcmd.exe`.

## Each release
1. **Cut the version** (see `docs/CHANGELOG.md`): bump `electron/package.json`
   `version`, and if the web/game changed, run the web pipeline first:
   `python scripts/build-pages.py && python scripts/build-www.py`.
2. **Build the unpacked app:**
   ```
   cd electron
   npm install        # first time / after dep changes
   npm run dist       # produces electron/dist/win-unpacked/ (+ NSIS installer)
   ```
   The depot uploads `win-unpacked/`, NOT the installer — Steam is the installer.
3. **Upload via steamcmd** (from the repo root), pointing at the app build script:
   ```
   steamworks_sdk_164\sdk\tools\ContentBuilder\builder\steamcmd.exe ^
     +login <steam_builder_account> ^
     +run_app_build "%CD%\steam\scripts\app_build_4910280.vdf" ^
     +quit
   ```
   (Use an absolute path to the VDF. `contentroot`/`buildoutput` inside the VDFs
   are resolved relative to the VDF file, so they work regardless of cwd.)
4. In Steamworks → SteamPipe → Builds, **set the new build live** on a branch
   (use a `beta` branch first; promote to default when verified). `setlive` in
   the VDF is left blank on purpose so uploads never auto-publish to the public.

## Steamworks dashboard setup still required
- **Achievements + Leaderboards:** create every entity in
  `docs/STEAMWORKS_FEATURES_SPEC.md` with the exact API names (the game already
  calls them). Leaderboards are wired game-side but the bridge stubs the actual
  submit — see below.
- **Steam Cloud:** already enabled for the app (verified). The save syncs as
  `wallop_profile_v1.json` via the bridge.

## Known limitation — leaderboards
`steamworks.js` 0.4.0 has **no leaderboard API**. The game submits scores at
run-end and the bridge logs them but no-ops the upload (`electron/steam.js →
submitScore`). Achievements + cloud saves are fully functional. When a leaderboard
path exists (steamworks.js upgrade or a native addition against the SDK's
ISteamUserStats), only `submitScore` in `electron/steam.js` needs to change.
