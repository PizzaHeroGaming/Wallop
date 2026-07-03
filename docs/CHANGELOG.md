# WALLOP — Changelog

Running notes for upcoming versions. **Unreleased** = committed + live on the web
build, but NOT yet cut as a Play Store / Steam release. When cutting the version:
bump `src/js/config.js` VERSION + `android/app/build.gradle` (versionCode/Name),
add an in-game patch-log entry (ABOUT screen in `wallop.html`), then build/upload.

---

## [Unreleased] — next Play cut (v0.9.8)

Committed + live on web since 0.9.7, riding the next store release.

### New
- **In-game update check** — on boot the game fetches a canonical `version.json`
  from Pages and, if the running build is behind the latest for its platform,
  shows a dismissible prompt (web→reload, android→Play Store, steam→auto). Per-
  platform versions so a web push never nags store users. Fail-silent, non-blocking.

### Fixed
- **Boss HP bar no longer overlaps the timer/stats on phones** (tester report).
  The mobile bar was center-anchored with a fixed width and drifted into the
  stat tiles on narrower landscape phones. It's now anchored between the HP bar
  (left) and the stat cluster (right) so its width is fluid — clean gaps on both
  sides at every landscape width, and it stays clear even as KILLS/GOLD grow to
  5 digits mid-fight. Verified 568–932px.

---

## v0.9.7 — 2026-07-03 (cut for Play — versionCode 8 / versionName 0.9.7)

Bundles everything on web since 0.9.6 (which is in Play review). Built + signed AAB
uploaded to Play closed testing.

### Improved
- **Official controller glyphs** — replaced the Unicode button symbols with the
  Xelu CC0 prompt art (real PlayStation ✕◯, Xbox A/B, Switch B/A icons) in the
  hint bar, interact prompt, and pause hint. Fixed Xbox pads showing PlayStation
  glyphs.
- **Smaller download** — trimmed ~41 MB of unused assets from the bundle (74 MB →
  33 MB) by keeping only files the game actually loads.

### Fixed
- **Gold now magnetizes to the player** like XP gems — coins use the same wider
  (4×), latched, ramped attraction instead of only pulling within base pickup
  range.
- **Music no longer dies after a rewarded ad** (mobile) — the OS pauses our audio
  during a fullscreen ad and the visibilitychange resume is autoplay-blocked, so
  we now re-arm the track in the ad-completion callback (a user-gesture context).
- **Slices counter is legible again** — the start-screen number was yellow-on-wood
  (illegible); now dark ink, matching the already-fixed Armory pill.

### Dev / infra (desktop / Steam — not player-facing; inert in the Play build)
- **Steamworks integration scaffolded** (desktop build only; fully inert on
  web + mobile). `steamworks.js` runs in the Electron main process and is exposed
  to the game over the preload bridge (`window.WallopSteam`):
  - **Achievements** — all 25 from `docs/STEAMWORKS_FEATURES_SPEC.md` wired to
    existing game signals (first kill, bosses, wins by difficulty, levels, full
    loadout, maxed weapon, gold, chests, arena clears, roster/signature, slices,
    challenges). Deduped; unlocks verified against live Steam.
  - **Steam Cloud** — the `wallop_profile_v1` save syncs as a timestamped
    envelope; hydrated (newer-wins) at boot in the preload before the game reads
    localStorage, and pushed on run-end.
  - **Leaderboards** — 6 boards' `submitScore` calls are in place at run-end, but
    steamworks.js 0.4.0 has no leaderboard API, so the bridge stubs the upload
    (documented; only `electron/steam.js → submitScore` changes when supported).
  - Packaging: `steam.js` + steamworks.js added to the electron-builder `files`
    with `asarUnpack` for the native binding. SteamPipe depot scripts +
    upload guide in `steam/scripts/`. Dashboard still needs the achievement/
    leaderboard entities created (exact API names in the spec).

### Dev / infra (desktop / Steam — not player-facing on web/mobile)
- **Steamworks integration scaffolded** (desktop build only; fully inert on
  web + mobile). `steamworks.js` runs in the Electron main process and is exposed
  to the game over the preload bridge (`window.WallopSteam`):
  - **Achievements** — all 25 from `docs/STEAMWORKS_FEATURES_SPEC.md` wired to
    existing game signals (first kill, bosses, wins by difficulty, levels, full
    loadout, maxed weapon, gold, chests, arena clears, roster/signature, slices,
    challenges). Deduped; unlocks verified against live Steam.
  - **Steam Cloud** — the `wallop_profile_v1` save syncs as a timestamped
    envelope; hydrated (newer-wins) at boot in the preload before the game reads
    localStorage, and pushed on run-end.
  - **Leaderboards** — 6 boards' `submitScore` calls are in place at run-end, but
    steamworks.js 0.4.0 has no leaderboard API, so the bridge stubs the upload
    (documented; only `electron/steam.js → submitScore` changes when supported).
  - Packaging: `steam.js` + steamworks.js added to the electron-builder `files`
    with `asarUnpack` for the native binding. SteamPipe depot scripts +
    upload guide in `steam/scripts/`. Dashboard still needs the achievement/
    leaderboard entities created (exact API names in the spec).

---

## v0.9.6 — 2026-07-01 (submitted to Play for review)

Cut from the batch that was on web since 0.9.5. versionCode 7 / versionName 0.9.6.
**Submitted to Play closed testing** — do not re-upload versionCode 7.

### New
- **Full controller support for menus** — navigate every screen with a gamepad
  (D-pad / left stick), ✕/A select, ◯/B back, Options pause. Keyboard arrows work
  too.
- **Adaptive on-screen button glyphs** — prompts show the *connected* controller's
  icons: PlayStation ✕◯▢, Xbox A/B/X, or Switch B/A/Y (auto-detected).
- **First-run tutorial now covers JUMP and DASH** (4 steps: Move → Look → Jump →
  Dash) — *tester request*.
- **Controller hint bar** — a bottom prompt strip (Select / Back / Navigate, plus
  Adjust on sliders and LB/RB Tabs in the Armory).

### Improved
- Settings are fully controller-operable: checkboxes toggle (✕), sliders +
  dropdowns adjust/cycle with ◀▶.
- Armory: LB/RB flip tabs; menus open with focus on the obvious control (Play,
  Resume, first tab…) instead of the close button.
- Adaptive prompts everywhere — chest "▢ Open", pause "◯ Resume", tutorial
  move/look text all match the active device.
- **Steam Deck readiness:** menu UI no longer renders too small at 1280×800.

### Fixed
- Menu navigation edge cases: left/right stays within a row of cards/buttons
  (level-up & chest choices go left→middle→right, down to Skip/Reroll); the
  controller hint bar no longer hides bottom content in Settings/dialogs.
- **Boss HP bar placement on phones** (tester report): it was dropped ~52px and
  floating mid-screen; now pinned to the top row, aligned with the player HP bar
  and stat tiles, sized to the gap so it never overlaps them at any phone width.

### Dev / infra (not player-facing)
- Desktop (Steam) build: Electron wrapper packages an NSIS installer
  (`WALLOP-Setup-<ver>.exe`) with app icon; `?cap=1` capture hook + headless
  capture scripts for store art; F12 devtools + dev cache-clear in the wrapper.
- Steam store page submitted for review; full graphical-asset suite generated.

---

## v0.9.5 — shipped to Play closed testing
(Previous releases are in the in-game ABOUT patch log.)
