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
### A. Controller-navigable menus (the big one)
Make every HTML overlay focus-driven + gamepad-navigable with D-pad/stick to move
focus, A=confirm, B=back, bumpers=switch tabs:
- start menu, run-config (arena/difficulty/PLAY), level-up + chest choice cards,
  pause, game-over/victory, **Armory** (tabs → grid → detail → action buttons),
  Settings (incl. the rebind rows), confirm dialogs.
- Implement a small focus/cursor model (track focused element per screen, draw a
  focus ring, route gamepad nav events). Reuse for keyboard arrow-nav too.

### B. Controller glyphs
- Detect controller type (Xbox / DualSense / Deck / generic) and swap a glyph set
  in prompts: HUD action hints, rebind screen, menu "A/B" hints.
- Cleanest if done via **Steam Input glyph API** (see C); otherwise ship a static
  glyph atlas keyed by detected type.

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
  works." Show Deck glyphs.
- **Display:** all text legible at **1280×800** (Deck native). Audit `_applyUiScale`
  at that resolution; ensure no sub-~9px text, default settings are Deck-friendly,
  no letterboxing issues. Default graphics preset acceptable on Deck.
- **Seamless:** launches straight to gameplay with no extra config, no
  compatibility warnings, no external launcher, correct default resolution.
- **Performance:** hold 60fps on Deck (reuse mobile perf paths — capped pixel
  ratio, shadow/AA tuning); verify on-device or via the Deck compatibility tester.
- After implementing: request a **Steam Deck compatibility review** in Steamworks.

## When done
- Re-run the **Controller Support Wizard**: full Xbox = Yes, Steam Input API = Yes,
  (PlayStation = Yes if glyphs cover DualShock/DualSense).
- Submit for the **Deck Verified** review.
- Update CLAUDE.md "Mobile is tier-one" → also "Controller + Deck tier-one."
