# WALLOP — Changelog

Running notes for upcoming versions. **Unreleased** = committed + live on the web
build, but NOT yet cut as a Play Store / Steam release. When cutting the version:
bump `src/js/config.js` VERSION + `android/app/build.gradle` (versionCode/Name),
add an in-game patch-log entry (ABOUT screen in `wallop.html`), then build/upload.

---

## [Unreleased] — next version (targeting v0.9.6)

Last shipped to Google Play: **v0.9.5** (closed testing). Everything below is
pending the next Play build.

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

### Dev / infra (not player-facing)
- Desktop (Steam) build: Electron wrapper packages an NSIS installer
  (`WALLOP-Setup-<ver>.exe`) with app icon; `?cap=1` capture hook + headless
  capture scripts for store art; F12 devtools + dev cache-clear in the wrapper.
- Steam store page submitted for review; full graphical-asset suite generated.

---

## v0.9.5 — shipped to Play closed testing
(Previous releases are in the in-game ABOUT patch log.)
