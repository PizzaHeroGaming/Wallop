# WALLOP — Changelog

Running notes for upcoming versions. **Unreleased** = committed + live on the web
build, but NOT yet cut as a Play Store / Steam release. When cutting the version:
bump `src/js/config.js` VERSION + `android/app/build.gradle` (versionCode/Name),
add an in-game patch-log entry (ABOUT screen in `wallop.html`), then build/upload.

---

## [Unreleased]

---

## v0.12.6 — 2026-07-17 (Steam review — clean resubmit build)

### Reverted
- **Pause-on-Steam-Overlay via `BOverlayNeedsPresent` (0.12.5) — removed.** On-device
  it pulsed true on its own every couple seconds (Steam housekeeping/notifications)
  without tracking the actual overlay → spurious pauses, and it never fired on the
  real overlay. So that signal is unusable. Overlay-pause genuinely needs the
  `GameOverlayActivated_t` broadcast callback, which `steamworks-ffi-node` doesn't
  deliver (would need custom manual-dispatch FFI). **Deferred post-launch** — it's a
  Steam *caution*, not a release blocker. The renderer-side pause wiring
  (`preload` `wallop:overlay-open` event → `ui.js`) is left in place for that day.

This is the clean resubmit build: controller works (before-launch + hotplug), pauses
on unplug, overlay hooks, Developer's Recommended Configuration published; F10 debug
tool stripped (0.12.5). Only the overlay-pause caution remains, post-launch.

---

## v0.12.5 — 2026-07-17 (Steam review — overlay pause attempt + cleanup)

### Added
- **Pause on Steam Overlay (attempt)** — the lib exposes no `GameOverlayActivated`
  callback, but it DOES bind `BOverlayNeedsPresent`. `electron/steam.js` now polls
  `steam.utils.overlayNeedsPresent()` in the callback timer and, on the rising edge,
  sends `wallop:overlay-open` → preload re-dispatches as a window event → `ui.js`
  pauses the run. ⚠️ Steam docs warn `BOverlayNeedsPresent` can also read true for
  notification popups; **needs on-device verification that achievement toasts don't
  spuriously pause mid-run.** If they do, gate/remove it (it's a caution, not a
  release blocker).

### Removed
- **F10 gamepad diagnostic overlay** — stripped for the clean review build (it did
  its job finding the phantom-headset root cause in 0.12.4).

---

## v0.12.4 — 2026-07-16 (Steam review — phantom HID pad = root cause)

### Fixed
- **Ignore phantom HID "gamepads"** — root cause of the controller-unplug and
  mid-run hotplug issues. A **Corsair HS80 headset** enumerates through the Gamepad
  API as a connected "gamepad" (no sticks/buttons, `mapping: ""`, frozen timestamp).
  Confirmed via the F10 diagnostic: after unplugging the Xbox, `getGamepads()` still
  returned the headset as `conn=true`, and the game even switched to it as the active
  pad (`chosen=1`). So the game never saw "no controller" (→ never paused on unplug),
  and a mid-run hotplug landed on the headset instead of the Xbox (→ "recognized but
  doesn't work"). Added `_isGamePad()` — only standard-mapped pads, or pads with ≥4
  axes + ≥12 buttons, count. A headset clears neither bar. `pollGamepad`'s scan +
  the disconnect glyph check now filter through it, so unplugging the real pad
  correctly triggers the poll-based auto-pause and input never routes to a headset.
- F10 gamepad diagnostic overlay retained (now shows `real=`/`map=`/`ax=`/`bt=`).

### Still a caution (post-launch)
- **Pause on Steam Overlay** — needs a native `GameOverlayActivated` callback the
  lib doesn't expose; not a release blocker.

---

## v0.12.3 — 2026-07-16 (Steam review — controller-unplug pause)

### Fixed
- **Pause on controller unplug now works** — the previous fix relied on the
  `gamepaddisconnected` event, which doesn't fire reliably in Electron / Steam
  Input, so it never paused. Replaced with **poll-based detection** in
  `pollGamepad`: it watches for a present→absent transition each frame (debounced
  ~6 frames to ignore a transient Steam-Input flicker) and pauses mid-run when the
  pad vanishes. Unplug is a hardware removal Chromium reflects without a gesture,
  so the poll catches it where the event didn't. The `gamepaddisconnected` handler
  now only hides the on-screen glyphs.

### Still a caution (post-launch)
- **Pause on Steam Overlay** — the overlay is an injected layer that doesn't fire
  window `blur`, and `steamworks-ffi-node` exposes no `GameOverlayActivated`
  callback, so it can't be detected without custom koffi FFI. Not a release
  blocker (Steam lists it as best-practice, not required).

---

## v0.12.2 — 2026-07-16 (Steam review round 2)

Follow-up to the reviewer retest of the 0.12.1 build: overlay now hooks and the
controller works when connected before launch. Remaining review items:

### Fixed
- **Pause on Steam Overlay** — a single-player game must pause when the overlay
  opens (Steam requirement). The existing pointer-lock auto-pause missed it when
  playing on a **controller** (pointer lock is never engaged) or when the overlay
  doesn't release lock, so added a **window `blur`** auto-pause (desktop build
  only, `window.WallopDesktop`) — the overlay grabs OS focus, and this also covers
  Alt-Tab.
- **Controller mid-run hotplug (best-effort)** — prime `navigator.getGamepads()`
  from inside the `gamepadconnected` gesture so a pad plugged in during a run has
  a better chance of registering. NOTE: Chromium only exposes a pad after a
  *focused* button-press gesture, so a mid-session hotplug may still need a button
  press with the window focused — a platform limitation, not fully fixable in JS.
  Connecting the pad before launch works reliably (the review blocker is cleared).

---

## v0.12.1 — 2026-07-14 (Steam review fixes)

Response to the Steamworks review of BuildID 24166958, which failed on
"Full Controller Support" (Xbox pad read as completely dead) and flagged the
Steam Overlay never appearing. Both trace to the same root cause.

### Fixed
- **Steam Overlay never hooked** — Electron renders in a separate GPU process by
  default, but Steam's overlay hooks the process where `SteamAPI_Init` ran (main),
  so it never found a rendering surface and Shift+Tab/Home did nothing. Added
  `in-process-gpu` (moves rendering into the main process so the overlay can hook)
  + `disable-direct-composition` (stops the overlay drawing as a white rect) in
  `electron/main.js`, set before app-ready. Steam Input rides the same injection
  path, so this is also the prime suspect for the dead controller.
- **No auto-pause on controller unplug** — `gamepaddisconnected` only hid the
  button glyphs; it now calls `openPauseMenu()` when the last pad is removed so a
  controller-only player isn't stranded mid-run.

### Verified (no change needed)
- Leaderboards are fully controller-navigable: category / arena / difficulty /
  Global-Friends scope / BACK are all reachable and A activates them (the picker
  chips are real `<button>`s and `leaderboard-screen` is in `_GP_OVERLAYS`).
- `controllerEnabled` already defaults to **true**, so the pad never required a
  mouse to switch on — ruling out the obvious "opt-in toggle" explanation.

---

## v0.12.0 — 2026-07-13 (cut for Play — versionCode 14 / versionName 0.12.0)

Follow-up fixes on the 0.11.0 Play Games services release.

### Fixed
- **Quit-to-menu now counts as an end run** — leaving mid-run via the pause menu
  or stage-clear screen banks all kills (weekly + lifetime + leaderboards) and, in
  Endless, records the survival time (local best + leaderboard). Previously an
  abandoned run recorded nothing.
- **Mobile start screen** — hid the live weekly-kills panel on phones, where it
  crowded the slice total + logo. Mobile reaches boards via the 📊 button.

---

## v0.11.0 — 2026-07-13 (cut for Play — versionCode 13 / versionName 0.11.0)

Big mobile services release: Play Games cloud save, achievements, leaderboards,
and the AdMob production go-live. All Android-only and gated on the native
bridges, so the web + Steam builds are functionally unchanged.

### New
- **Play Games cloud save** — the whole `wallop_profile_v1` blob syncs to Play
  Games Saved Games (`SavesBridge.java` / `src/js/cloud.js`), last-write-wins by
  timestamp so a reinstall/new device restores progress and a reset propagates.
  Settings gains a **CLOUD SAVE** section (status line + manual "Back Up") and a
  transient `#cloud-sync` indicator.
- **Achievements (27)** — the existing Steam achievement triggers now also drive
  Play Games (`GamesBridge.java` / `src/js/pgs.js`); `src/js/steam.js` became the
  platform-neutral trigger layer. Icons + bulk-import ZIP generated by
  `scripts/gen-pgs-import.py` (512² from `scripts/gen-achievement-icons.mjs PGS=1`).
- **Leaderboards (37)** — endless / fastest-win / highest-level per arena ×
  difficulty (36) + a weekly Most Kills board (PGS built-in weekly window). Start
  screen reveals 📊 LEADERBOARDS + 🏅 ACHIEVEMENTS on Android; IDs mapped in
  `src/js/pgs-ids.js` (generated by `scripts/gen-pgs-ids.py` from Get-resources).
- **AdMob production** — real ad units (`pub-8467944404188469`) swapped into the
  manifest + `AdsInterface.java`; the Athanor test device is registered in
  `MainActivity` so dev/tester phones still get test creatives (no invalid traffic).

### Changed
- **Enemies no longer merge into the player** — a lightweight player collider
  pushes any non-boss enemy that reaches the hero out to a contact boundary just
  inside its damage range, so it presses against the player (still deals contact
  damage) instead of overlapping the model. O(1) per enemy; bosses excluded.
  (Was on the web build; rides along to Play with this cut.)

---

## v0.9.9 — 2026-07-03 (cut for Play — versionCode 10 / versionName 0.9.9)

Bundles the web changes since 0.9.8. Built + signed AAB for Play closed testing.

### New
- **Steam wishlist "sticker" badge** on the start screen — an artistic rotated
  badge (pulsing blue aura, bob animation) pinned bottom-right, clear of the hero,
  the desktop character panel, and the top-right slice chip. Replaces the flat pill
  that sat under the title. Auto-hidden on the Steam build.

### Fixed
- **Clearer stat-upgrade level tags on the level-up screen** — the badge now reads
  e.g. `LV 3->4` (with `MAX` on the final level) instead of `4/4`, which a tester
  misread as "already capped / pointless." It always showed the level the pick
  *reaches*, and maxed stats are never offered; the wording just makes that obvious.

### Infra
- `version.json` `android` bumped 0.9.7 → 0.9.8 now that 0.9.8 is live in Play
  testing (so 0.9.8 is the update floor). Bump to 0.9.9 once THIS build is live.

---

## v0.9.8 — 2026-07-03 (cut for Play — versionCode 9 / versionName 0.9.8)

Bundles everything on web since 0.9.7. Built + signed AAB for Play closed testing.

### New
- **"Wishlist on Steam" banner** on the start screen (web + mobile) — opens the
  Steam store page; auto-hidden on the Steam build itself. Drives pre-launch
  wishlists now that the store page is live.
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
