# WALLOP — Changelog

Running notes for upcoming versions. **Unreleased** = committed + live on the web
build, but NOT yet cut as a Play Store / Steam release. When cutting the version:
bump `src/js/config.js` VERSION + `android/app/build.gradle` (versionCode/Name),
add an in-game patch-log entry (ABOUT screen in `wallop.html`), then build/upload.

---

## [Unreleased] — next (targeting v0.9.7)

Committed + live on web, pending the next Play cut (v0.9.6 is already in review, so
these ride in 0.9.7 → versionCode 8 / versionName 0.9.7).

### Improved
- **Official controller glyphs** — replaced the Unicode button symbols with the
  Xelu CC0 prompt art (real PlayStation ✕◯, Xbox A/B, Switch B/A icons) in the
  hint bar, interact prompt, and pause hint. Fixed Xbox pads showing PlayStation
  glyphs.

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
