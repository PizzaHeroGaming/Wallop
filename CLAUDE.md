# WALLOP — Pizza Hero Gaming

A 3D bullet-heaven roguelike inspired by Megabonk, themed as a pizza-delivery hero
fighting through swarms of food-themed enemies. Built as a single-file HTML5 game
using Three.js r128. Designed to ship as a web build first, then wrapped with
Capacitor for the Google Play Store and (eventually) iOS App Store.

The single-file architecture is **a deliberate constraint**. The whole game —
HTML, CSS, ~8,000 lines of JS, embedded SVG icon, inline PWA manifest — lives in
`src/wallop.html`. Don't suggest splitting it into modules unless explicitly
asked. The constraint is what keeps the project shippable as a static page,
embeddable on any host, and trivially wrappable as a WebView.

---

## Project layout

```
wallop/
├── CLAUDE.md                       ← this file
├── README.md                       ← user-facing description (optional)
├── .gitignore
├── .claude/
│   └── settings.json               ← Claude Code permissions
├── src/
│   ├── wallop.html                 ← MAIN GAME, single source of truth
│   └── splash/
│       └── pizza-hero-splash.html  ← Pizza Hero Gaming studio bumper (integrated)
├── assets/
│   └── icons/
│       └── icon.svg                ← 512×512 maskable app icon
└── docs/
    └── icon-preview.html           ← shows icon at every install size
```

When the Capacitor wrapper gets built, `android/` and `ios/` will appear at the
project root — both .gitignore'd by default until we're ready to commit them.

---

## High-level architecture

### Rendering
- **Three.js r128** loaded from `cdnjs.cloudflare.com`
- WebGLRenderer with mobile-aware settings (pixel ratio, antialias, shadow map)
- Scene graph: ground plane + procedurally placed scenery + entity meshes
- Camera follows player at fixed offset, yaw/pitch driven by mouse or right joystick

### Game loop
- `requestAnimationFrame` driven, dt clamped to `Math.min(0.05, clock.getDelta())`
- Single `update(dt)` function dispatches to: `updatePlayer`, `updateEnemies`,
  `updateProjectiles`, `updateEnemyProjectiles`, `updateOrbitals`, `updateGems`,
  `updateGoldCoins`, `updateAura`, `updateChests`, `updateParticles`, `updateSpawning`
- A `body.playing` class is toggled every frame based on `gameState.state` —
  CSS uses it to show/hide play-only HUD (mobile controls, pause button)

### State machine
`gameState.state` is one of: `'start'`, `'playing'`, `'levelup'`, `'paused'`,
`'gameover'`, `'victory'`. Most subsystems gate their updates on `'playing'`.

---

## Major systems

### Player (~line 2750–3200)
- Pizza Delivery Hero, articulated mesh built in `buildPlayer()`
- V-taper torso (NOT cylindrical): stacked tapered boxes — hips, waist, chest,
  yoke, shoulder caps. Total at y=1.05 in player-local space.
- Red polo with PHG yellow logo, jeans with knee bulges, white sneakers with
  red swoosh, baseball cap with PHG diamond logo, pizza box satchel slung
  diagonally on back
- Smooth-shaded skin via `smoothPhong()`, flat-shaded clothes via `flatPhong()`
- Animation groups: `player.legL/legR/armL/armR/torso/head/bag` driven by walk cycle

### Enemies (~line 3266 `ENEMY_DEFS`)
6 types: `goblin`, `bat`, `brute`, `skelly`, `imp`, `warlord`. Each has:
- `hp`, `dmg`, `speed`, `xp`, `scale`
- `spawnTime` — earliest game-time second they can appear
- Mesh built by `makeEnemyMesh(def)` which dispatches to per-type builders

### Bosses (~line 7413 `BOSS_TIERS`)
Three tiers, all share `isBoss: true`:
| tier   | name              | spawn | base HP | gold | slices |
|--------|-------------------|-------|---------|------|--------|
| mini1  | THE SAUCE SLINGER | 3:00  | 480     | 25   | 5      |
| mini2  | THE HAMMER CHEF   | 6:00  | 1200    | 50   | 10     |
| final  | THE WARLORD       | 10:00 | 2400    | 100  | 15     |

- HP scales: `baseHp + player.level * hpPerLvl`
- Damage scales similarly via `baseDmg + player.level * dmgPerLvl`
- Each boss has a **telegraphed ranged attack** in `bossRangedAttack(boss)`:
  - mini1: `sauce` — arc lob, ground ring telegraph 1.1s before impact
  - mini2: `cleaver_fan` — fan of 5 cleavers in player direction
  - final: `shockwave` — fast homing red orb + 0.35s follow-up shot
- **Win condition** checks for `bossTier === 'final'` only — mini-bosses don't
  end the run when defeated
- Mini-bosses summon minions on their `minionCd` cooldown
- Boss kills drop their `goldDrop` immediately to `player.gold` and award
  `sliceDrop` to `Profile.addSlices()` (persistent)

### Weapons (~line 4815 `WEAPONS`)
9 weapons, registered via `defWeapon(id, config)`:
1. `pizza` — Pizza Toss starter (replaced original "bone")
2. `aura` — Wallop Aura, AOE around player
3. `orbit` — Pizza Wheel orbiting projectiles
4. `thunder` — chain lightning
5. `shock` — area shock
6. `fire` — fireball with burn DOT
7. `boomerang` — pepperoni boomerang
8. `calzone` — arc lob with AOE explode
9. `ice` — Ice Cone with slow status

Each has `init`, `upgrade`, `describeNext`, `tick(w, dt)`. Cooldowns multiply
by `player.cooldownMult` and weapon-specific `cdMod`.

### Armor (~line 5419 `ARMOR`)
6 pieces: `plate`, `helmet`, `shield`, `vamp`, `boots`, `thorns`. Registered via
`defArmor(id, config)`.

### Tomes (~line 5520 `TOMES`)
8 tomes: `power`, `swift`, `fortune`, `wisdom`, `spectral`, `warding`, `hunter`,
`cursed`. Registered via `defTome(id, config)`. They modify `player.*` stats.

### Synergies & stat upgrades
- `SYNERGY_UPGRADES` — appear when prerequisite items are owned (e.g.
  `pizza_pierce` / Stuffed Crust requires Pizza Toss)
- `STAT_UPGRADES` — 20+ multi-level stat upgrades shown on level-up
- 3-slot lock: `player.maxWeaponSlots / maxArmorSlots / maxTomeSlots = 3`. Once
  full, only level-ups for owned items are offered.

### Currencies
- **Gold** (`player.gold`, in-run) — earned from kills, chests, boss drops.
  Used for the **gold reroll button** on level-up + chest screens. Resets each run.
- **Slices** (`Profile.get().slices`, persistent) — meta currency, stored in
  localStorage under key `wallop_profile_v1`. Earned ONLY from boss kills:
  5 / 10 / 15 per tier. Spent in the Armory.

### Profile system (~line 1759, 1931)
- `Profile` module — localStorage-backed, version-schemaed
- Stores: `slices`, `unlocked` (slug → true map), `boostLevels` (slug → int),
  `equippedCharacter`, lifetime `stats`
- `Profile.isUnlocked(slug)` resolves catalog `defaultUnlocked` flag too
- `Profile.spendSlices(n)` returns `false` if insufficient
- Default profile if missing or schema mismatch — no migration logic yet

### Catalog & Armory (~line 1772 `CATALOG`)
Five categories: `characters` (4), `weapons` (12), `armor` (8), `tomes` (10),
`boosts` (7). Each entry has:
- `slug` — stable persistent ID, **never change after release**
- `name`, `icon`, `desc`, `placeholder`, `sliceCost`, `defaultUnlocked`
- `gameRef` — optional pointer to a WEAPONS/ARMOR/TOMES entry so the Armory
  pulls live data instead of duplicating descriptions

The Armory UI is a tabbed full-screen overlay reachable from the start screen.
Detail modal handles UNLOCK / EQUIP / UPGRADE flows.

### Chests (~line 3500ish)
- 5 spawn at run start, +1 every 2min via `chestTimer`
- Common (blue glow) and rare (gold glow)
- Opening triggers a 3-card pick screen via `presentChoiceScreen()` reusing the
  level-up choice infrastructure
- 7-reward pool: gold bag, hot slice (heal+max HP), gem cache, aegis buff,
  adrenaline rush, lucky streak, cooldown boost
- Skip + reroll (gold + ad) supported

### Level-up + chest choice screen
- `presentChoiceScreen({offers, title, canSkip, allowReroll, rerollSource, onPick, onSkip})`
- Reroll buttons:
  - **Gold reroll** — every platform, costs `20 + level*10`, ×1.5 per reroll
  - **Watch ad reroll** — mobile only, gated on `isMobile()` so Steam build
    never shows it
- `buildChoiceCard(o, onPick)` renders any offer kind including `chest-loot`

### World / terrain
- Arena: `CFG.ARENA = 80`, run length: 600s
- Ground: 640×640 plane, 60×60 segments, displaced by `terrainHeight(x, z)`
  shared with `groundHeight()` collision so player walks naturally on rolling
  terrain past `TERRAIN_INNER`
- **Inner arena is intentionally clean** — no hills, no platforms, no big rock
  clusters (these were removed because they clashed with the natural rolling
  terrain). Only 14 small loose stones (radius < 0.5, no collision)
- Solid props use `solidProps[]` + `addSolid(x, z, radius)` + `resolveSolids(x, z, agentRadius)`
- Bosses bypass collision; flyers (bats, imps) bypass too
- Forest ring of ~220 props beyond arena boundary; two distant hill bands at
  +50 and +100 units for depth

### HUD
- Boss HP bar (top center, hidden until boss spawns, shows active boss's name)
- HP bar (top-left) with shield overlay, text shows `current/max + ❖shield`
- Loadout strip (left side under HP): 3 rows × 3 slots (WEAPONS / ARMOR / TOMES)
  rendered by `updateLoadoutDisplay()`
- Top stat tiles: TIME / KILLS / GOLD
- XP bar at bottom with LV badge
- Pause button (⏸) at top-right HUD, gated to `body.playing`
- Splash screen `PizzaHeroSplash` integrated, waits for click/tap

### Mobile controls (floating thumbsticks)
- Two invisible touch zones cover the bottom 80% of left/right halves of screen
- Touching anywhere spawns a joystick at that location, follows further drags
- Per-touch ID tracking so two thumbs can drive both at once
- 6px dead zone, 60px max radius
- `bindFloatingStick()` in `setupMobile()`
- Action buttons (JUMP, DASH, USE, PAUSE) sit at z-index 25, eat their own
  touches via `stopPropagation()`
- Touch zones know to ignore touches starting on those buttons
- Dash button has CSS cooldown sweep via `--dash-cd` variable, updated each
  `updateHUD()` tick
- `applyCameraJoystick(dt)` rotates yaw/pitch per frame from right-stick input

---

## Critical gotchas (DO NOT re-introduce)

These are bugs that bit hard during development and were properly fixed.
Re-introducing them will cause the same symptoms.

### 1. `scene.remove(mesh)` LEAKS GPU RESOURCES → context loss

**ALWAYS** use `killMesh(mesh)` instead of `scene.remove(mesh)`.

`scene.remove()` only detaches the mesh from the scene graph. The geometry,
materials, and textures stay allocated on the GPU until garbage collection runs
— which may never happen during a long run. After ~1500+ enemy kills the GPU
runs out of memory and Android forcibly yanks the WebGL context. Symptoms:
sky goes black, all enemies/ground turn pink/magenta, doesn't recover until
reload. This is the "Pixel pink screen" bug.

`killMesh` recursively walks the mesh tree, disposes geometries and materials
(including all texture references on each material). Helpers `disposeMesh`,
`disposeMaterial`, `killMesh` are defined right after `clamp()` declaration.

There's also a `webglcontextlost` handler that pauses the game cleanly with a
"Reloading graphics…" overlay if it ever does happen.

**Lint check**: `grep -n 'scene\.remove(' src/wallop.html` should return ZERO
matches outside the comment in `disposeMesh`.

### 2. `MeshLambertMaterial` does NOT support `flatShading` in r128

Use `MeshPhongMaterial` everywhere. The codebase has helpers:
- `flatPhong(color, shininess)` for armor, cloth, weapons
- `smoothPhong(color, shininess)` for organic body parts (skin, faces)

If a `MeshLambertMaterial flatShading not a property of` warning appears, it's
**always** a browser cache issue at this point — every Lambert material has
been migrated. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) and verify "Disable
cache" is on in DevTools Network tab.

**Lint check**: `grep -c 'MeshLambertMaterial' src/wallop.html` should return 0.

### 3. Camera-relative WASD movement

`camRight = (-camForward.z, 0, camForward.x)` — this is the correct
right-handed Y-up cross product. A and D were inverted at one point because
the wrong sign was used. If movement feels backward, check this.

### 4. Calzone targeting needs zero-distance guard

When the target is right on top of the player, `horizDist = 0` produces
`vx = 0/0 = NaN` velocities and the calzone shoots into the void. The fix
is in the calzone `tick`: if `horizDist < 0.5`, retarget to a random spot
4 units out before computing velocities.

Same pattern applies to any future weapon that does `dx/horizDist` math —
always guard the divide.

### 5. Enemy spawn eligibility

`Object.keys(ENEMY_DEFS).filter(k => ENEMY_DEFS[k].spawnTime <= t)` — bosses
have `spawnTime: 9999` so they're excluded from regular spawn pools. If a new
enemy is added without a `spawnTime`, it becomes immediately eligible at t=0
which is usually wrong.

### 6. Aura damage stacking

Per-enemy `auraCd` cooldown prevents the aura from one-shotting bosses every
frame:
- boss: 1.4s
- elite: 1.0s
- brute/warlord: 0.85s
- skelly: 0.55s
- small enemies: 0 (no cooldown, aura kills them every tick)

Size-based knockback resistance also applies (boss 10%, elite 30%, brute 40%,
etc) plus diminishing returns on stacked knockback velocity.

### 7. Splash screen integration

`PizzaHeroSplash.show({duration: 0, tagline: 'GAMING'})` waits for click/tap
to dismiss. `duration: 0` means no auto-advance. The splash exists for the
PHG studio identity. Don't auto-advance it.

### 8. Boss banner timing

When a boss dies, the slice reward alert shows first, then the boss-defeat
banner shows 800ms later. This is intentional — players need to see the meta
reward before the gameplay banner. Don't change the order.

### 9. localStorage in private browsing

`Profile.save()` swallows `try/catch` errors silently because Safari Private
Mode and quota-exceeded scenarios both throw on `localStorage.setItem`. The
in-memory state still works in those sessions; data just won't persist.

---

## Mobile-specific concerns

### Performance budget
- **Pixel ratio capped at 1.5** on mobile (was 2). devicePixelRatio is often 3
  on modern phones, meaning 9× the pixels of 1080p PC.
- Antialias **disabled** on mobile
- Shadow map: 512² mobile / 1024² desktop, `BasicShadowMap` mobile / `PCFSoftShadowMap` desktop
- Particle counts auto-halved on mobile via `IS_MOBILE_EARLY` check in `spawnParticle`

### Mobile detection
Two-phase: `IS_MOBILE_EARLY` is a UA + touch + width check evaluated before
the renderer initializes. `isMobile()` is the runtime helper used everywhere
else. They should agree but the early one exists because we need it before
`isMobile()` is defined.

### Viewport & fullscreen
- `viewport-fit=cover`, `apple-mobile-web-app-capable`, `theme-color`
- Inline PWA manifest declaring fullscreen, landscape orientation, app icon
- `100dvh` body height (dynamic viewport, excludes URL bar on modern Safari)
- `tryEnterFullscreen()` fires on every state transition (start, restart,
  level-up close, chest close, pause-resume) and on first tap via
  `rearmFullscreenOnNextTap()`
- Auto-recovers on `fullscreenchange` if user accidentally exits
- iOS gets `window.scrollTo(0, 1)` fallback since real fullscreen API is blocked

### Touch hardening
- `contextmenu` blocked
- `gesturestart/change/end` blocked (iOS pinch-zoom)
- Double-tap zoom blocked via timing check on `touchend`
- All HUD elements set to `user-select: none`, `touch-callout: none`
- Auto-pause on `visibilitychange`

### Ad bridge (`window.GameAds`)
- `showInterstitial(cb)` — called on game over, throttled to every other run
- `showRewarded(cb)` — used by the watch-ad reroll button, fake-ad simulation
  shows in browser (5s countdown), real native bridge takes priority
- `preload()` — preload an interstitial
- Native shell injects `window.AndroidAds`. Web fallback shows the simulated
  rewarded-ad overlay so the flow can be tested without a wrapper
- **Steam-safe by design**: ad reroll button is gated on `isMobile()`, so PC
  builds will never trigger any ad code at all

### Capacitor wrapping (planned, not yet built)
When wrapping for Play Store / App Store:
1. `npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android`
2. `npx cap init Wallop com.pizzaherogaming.wallop --web-dir=www`
3. Drop `src/wallop.html` into `www/index.html`
4. `npx cap add android`
5. `npm i @capacitor-community/admob && npx cap sync android`
6. Add Kotlin bridge: `bridge.webView.addJavascriptInterface(AdsInterface(this), "AndroidAds")`
7. The `AdsInterface` class wraps Capacitor AdMob plugin to expose
   `showInterstitial`, `showRewarded`, `preloadInterstitial` to the WebView
8. Native side calls `window.__onRewarded(success)` to deliver the result
9. `npx capacitor-assets generate --iconPath assets/icons/icon.svg` to populate
   `android/app/src/main/res/mipmap-*` with the app icon at every density

### `App.exitApp()` from EXIT GAME button
When wrapped with Capacitor, the exit button calls
`window.Capacitor.Plugins.App.exitApp()`. In the browser it falls back to
`window.close()` and then a friendly "close this tab" dialog if both fail.

---

## Code conventions

### Materials
- `flatPhong(color, shininess)` — armor, cloth, weapons, props
- `smoothPhong(color, shininess)` — skin, organic body parts
- Never `MeshLambertMaterial` — see Gotcha #2

### Mesh disposal
- Always `killMesh(mesh)` — never bare `scene.remove(mesh)` — see Gotcha #1
- For elements that may be re-used, use `mesh.parent.remove(mesh)` only if
  you're going to re-add it

### Mobile-aware code paths
```js
// At init / one-time setup:
if (IS_MOBILE_EARLY) { /* renderer config */ }
// At runtime / inside functions:
if (isMobile()) { /* per-frame or per-event behavior */ }
```

### Adding a new weapon
1. Add a `defWeapon('id', { name, icon, desc, maxLevel, init, upgrade, describeNext, tick })` block
2. Add an entry in `CATALOG.weapons` with matching slug + `gameRef: 'id'`
3. If it's a starter weapon for a future character, set the character's `starter` field
4. Test: pick it from the level-up screen, level it to max, verify upgrade descriptions
5. Sanity check: any divide-by-distance math needs zero-distance guards

### Adding a new boss
1. Add a tier in `BOSS_TIERS` with stats + `slices` reward
2. Add the spawn trigger in `updateSpawning` at the desired game time
3. Add a `rangedKind` case in `bossRangedAttack(boss)` with telegraph
4. Update the win condition if it's a new endgame boss (`bossTier === 'final'`)
5. Test: the boss banner uses `e.def.name`, slice reward uses `e.sliceDrop`,
   gold uses `e.goldDrop`

### Adding a new unlockable
1. Add a `CATALOG.<category>` entry with stable `slug`, `placeholder: true`,
   `sliceCost`
2. The Armory UI auto-renders it as LOCKED with the slice cost
3. When the actual content is built, set `placeholder: false` and provide
   `gameRef` if the data lives in WEAPONS/ARMOR/TOMES
4. **Slugs are forever** — once shipped, never rename. Migration would orphan
   user unlocks.

### Tone & formatting
- Visual: chunky retro pixel-art with thick black outlines and offset shadows
- Color palette:
  - `--bg: #0d1126` (deep navy)
  - `--panel: #1b1f3a`
  - `--panel-2: #252a4d`
  - `--accent: #ffd23f` (yellow)
  - `--hot: #ff3864` (red/pink)
  - `--ink: #ffffff`, `--ink-dim: #b8bce0`
- Fonts: `Press Start 2P` (headings, button labels), `VT323` (body, descriptions)
- Buttons: 3px solid black border, 4px offset shadow, hover lifts up 2px and
  shadow grows, active drops 2px and shadow shrinks
- Don't use emojis in code unless it's a UI icon (the icon field of a weapon/
  armor/tome/character/boost is an emoji by convention)

---

## Build & test

### Currently
- No build step. Open `src/wallop.html` directly in a browser.
- For local mobile testing: `python3 -m http.server -d src 8000` then visit
  `http://<your-laptop-ip>:8000/wallop.html` from your phone on the same network.

### Validation before shipping
After any non-trivial edit, validate JS syntax. The whole game's JS lives in
inline `<script>` blocks, so:

```bash
python3 -c "
import re
with open('src/wallop.html') as f:
    html = f.read()
scripts = re.findall(r'<script(?![^>]*\\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
combined = '\\n;\\n'.join(scripts)
open('/tmp/all-inline.js', 'w').write(combined)
"
node --check /tmp/all-inline.js
```

If `node --check` passes, push the change. If not, fix before continuing.

### Manual playtest checklist (before any release)
- [ ] Start screen renders, ARMORY opens, EXIT GAME shows the friendly dialog
- [ ] First chest spawns, opening it shows the 3-card picker
- [ ] First level-up shows weapons, picking one adds it to the loadout strip
- [ ] At 3:00, Sauce Slinger spawns with orange ground-ring telegraphs
- [ ] At 6:00, Hammer Chef spawns and throws cleaver fans
- [ ] At 10:00, Warlord spawns, killing it triggers victory screen
- [ ] Boss kills award the right number of slices (5/10/15)
- [ ] Slice counter updates on start screen and Armory after a run
- [ ] Pause button works, RESUME / RESTART / MAIN MENU all behave correctly
- [ ] On phone: floating joysticks spawn anywhere on left/right zones
- [ ] On phone: JUMP / DASH / USE / PAUSE buttons all tap-responsive without
      spawning a joystick underneath them
- [ ] Dash cooldown sweep visibly drains on the dash button
- [ ] Reload page after a long run — Armory still shows correct slice count

---

## Roadmap

### Near-term
- Wire up the placeholder boost effects (currently buyable but no-op):
  `boost_damage`, `boost_health`, `boost_armor`, `boost_speed`, `boost_xp`,
  `boost_gold`, `boost_revive`. Each should apply at the start of `resetGame()`
  by reading `Profile.getBoostLevel(slug)`.
- Implement the placeholder characters: `frost_baker`, `oven_knight`, `crust_runner`.
  Each needs a starter weapon mapping read in `resetGame()` based on
  `Profile.get().equippedCharacter`.

### Medium-term
- Capacitor wrapper for Google Play Store launch
- AdMob integration via `@capacitor-community/admob`
- Real native ad units replacing the simulated rewarded-ad overlay

### Future content
- Placeholder weapons: Meatball Minigun, Cheese Whip, Olive Railgun
- Placeholder armor: Mirror Vest, Phoenix Apron
- Placeholder tomes: Tome of Echoes, Tome of Time

### Eventually
- iOS build (Capacitor handles both)
- Steam build via Tauri or Electron wrapper (no ads — already gated)
- Procedurally varied biomes / arena themes
- Boss variety per-run (currently the same 3 every time)

---

## Working agreements (for Claude Code)

1. **Prefer focused edits.** Don't rewrite an entire weapon when only the
   `tick` function needs a change. Use targeted str_replace.

2. **Test before declaring done.** After any change to the game's JS, run the
   `node --check` validation block. Don't say "this should work" — verify it
   parses, at minimum.

3. **Single-file is a feature.** `src/wallop.html` stays as one file. If a
   change starts to feel like it wants helper modules, raise that as a
   discussion before splitting. The single file is what makes deployment,
   sharing, and Capacitor wrapping trivial.

4. **Don't break the splash.** `pizza-hero-splash.html` is a separate authored
   file; the game integrates it as `PizzaHeroSplash`. Don't rewrite the splash
   internals casually.

5. **Slugs are forever.** Once an entry in `CATALOG` ships with a slug, that
   slug is a permanent identifier in user save data. Renaming = orphaning
   unlocks for every existing player.

6. **Mobile is a tier-one platform.** Every change needs to work on a Pixel
   phone in landscape. If a feature is desktop-only, gate it on `!isMobile()`
   explicitly so the mobile build doesn't carry dead code paths.

7. **Disposal discipline.** Every mesh added to the scene needs a clear
   killMesh path — when the entity dies, when the run resets, when the game is
   re-entered. Memory leaks on mobile cause the pink-screen bug.

8. **Be conservative with frame-rate-impacting work.** Per-frame allocations,
   per-frame `getElementById`, per-frame string concatenation in hot loops —
   all real perf footguns at 60fps × 70 enemies × 9 weapons. Cache references,
   pre-allocate vectors via the existing `tmp` / `tmp2` `Vector3` pool.

9. **Commit often.** This is a single-developer project; small commits make it
   easy to bisect when a regression shows up two sessions later.

10. **When stuck on a graphics issue, the answer is usually `killMesh`.**
    Half the bugs in this project's history have been GPU resource leaks.
