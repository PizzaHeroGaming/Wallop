# WALLOP — Full Controller Support + Steam Deck Plan

**Goal (pre-release, not yet done):** upgrade from *Partial* to **Full Controller
Support** and earn **Steam Deck Verified**. At launch we ship Partial (honest:
gamepad drives gameplay via the browser Gamepad API + remap, but menus need
mouse/keyboard and there are no controller glyphs). This doc is the upgrade path.

Related: [[project_steam_launch]] · `docs/STEAM_BUILD_PLAN.md` (the Steamworks /
steamworks.js wrapper this builds on).

## Where we are now (launch = Partial)
- `pollGamepad()` in main.js/ui.js reads controllers via `navigator.getGamepads()`
  and drives **in-run** input (move, aim, jump, dash, use) + has key/button rebind.
- **Gaps for Full:** menus aren't controller-navigable, no on-screen controller
  glyphs, no Steam Input API, no auto-pause on controller disconnect.
- Steam Controller Support Wizard answered: "Mouse+keyboard plus gamepads",
  full Xbox = **No**, PlayStation = **No**, Steam Input API = **No**.

## Steam's Full Controller Support criteria (all required)
1. Do **everything** with only a controller — launchers, **all menus**, settings,
   exit. (Launch/exit is handled by Steam/Big Picture; the gap is our menus.)
2. Show **correct controller glyphs** when prompting a button.
3. Any **text entry** opens an on-screen keyboard. (WALLOP has ~no text input —
   low effort; Deck/Big Picture provide the OSK.)
4. Local multiplayer works with multiple controllers — **N/A** (single-player).

## Work items
### A. Controller-navigable menus — ✅ DONE (2026-06-30)
Implemented in `ui.js`: a **spatial focus-navigation** model (`_gpMove/_gpActivate/
_gpBack`, `gpMenuNav`) driven by D-pad + left stick, A=confirm, B=back. Keyboard
arrows/Enter mirror it; Escape backs out of armory/about/challenges/run-config.
Focus ring is painted inline with `!important` (`_gpPaint`) — the themed button
styles out-specify any stylesheet rule, and it re-homes to the new menu after each
activate/back (`_gpRehome`). One generic model covers every overlay
(`_GP_OVERLAYS`): start, run-config, level-up/chest cards, pause, game-over,
Armory (tabs→grid→detail), Settings, confirm. Verified end-to-end: start → PLAY →
run-config → PLAY starts a run; Escape → pause → navigate.
- **Remaining polish:** per-menu *default* focus (e.g. open Armory on the first
  tab, not the ✕); let arrows adjust Settings sliders/checkboxes when one is
  focused; bumper (LB/RB) tab-switching in the Armory.

### B. Controller glyphs — ✅ menu hints DONE (2026-06-30)
- `_padType()` detects PS (DualSense/DualShock) / Xbox / Switch / generic from the
  gamepad `id`; `_GLYPHS` + `_glyph()` render the matching face-button symbols
  (✕◯▢ / A B X / B A Y) with platform colors. `_updateGpHints()` shows a
  controller-only hint bar (`#gp-hints`) while a menu is open — Select / Back /
  Navigate — and swaps live when the pad changes. Verified across PS/Xbox/Switch.
- **Remaining:** in-game HUD action glyphs (jump/dash/use/pause) during active
  combat; rebind-screen glyphs. When Steam Input (C) lands, prefer its glyph API
  for exact per-model art (incl. Deck) instead of this static set.

### C. Steam Input API integration (recommended — also flips wizard to Full)
- In the Electron wrapper, init **steamworks.js** Steam Input; define action sets
  (Menu, InGame) + action manifest (`controller_*.vdf`); query action origins to
  draw the right glyphs → satisfies "200+ controllers, future models, correct
  glyphs" and the Steam Input wizard step.
- Bridge action events to the web layer via preload (mirror the existing
  `window.WallopDesktop` IPC pattern).
- Add **auto-pause on controller disconnect**.

### D. Steam Deck Verified checklist
- **Input:** Full Controller Support (A–C) + default Steam Input config that "just
  works." Show Deck glyphs. (A✅ menu nav + B✅ glyphs already work off the Deck's
  built-in gamepad via the Gamepad API; C/Steam-Input still needed for the badge.)
- **Display:** ✅ *partially done (2026-06-30)* — `_applyUiScale` floored at **0.8**
  so menus stay legible at 1280×800 (was 0.667, too small on the 7" panel).
  Verified no overflow at 1280×800; 1080p+ unchanged. **Still to check on-device:**
  in-game HUD element sizes, no sub-~9px text anywhere, no letterboxing.
- **Seamless:** launches straight to gameplay with no extra config, no
  compatibility warnings, no external launcher, correct default resolution.
- **Performance:** hold 60fps on Deck (reuse mobile perf paths — capped pixel
  ratio, shadow/AA tuning); verify on-device or via the Deck compatibility tester.
- **Verify on device:** whether `isMobile()` returns true on Deck (touchscreen +
  Electron UA) — if so it takes the mobile layout/scale path instead of the
  desktop one; decide which we want for Deck.
- After implementing: request a **Steam Deck compatibility review** in Steamworks.

## When done
- Re-run the **Controller Support Wizard**: full Xbox = Yes, Steam Input API = Yes,
  (PlayStation = Yes if glyphs cover DualShock/DualSense).
- Submit for the **Deck Verified** review.
- Update CLAUDE.md "Mobile is tier-one" → also "Controller + Deck tier-one."
