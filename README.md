# WALLOP — Pizza Hero Gaming

A 3D bullet-heaven roguelike. You are the Pizza Delivery Hero — fight through waves
of food-themed chaos, collect upgrades, defeat three increasingly dangerous bosses,
and push through three escalating stages. Built with Three.js r128, shipping as a
static HTML5 page first, then wrapped with Capacitor for mobile.

![icon](assets/icons/icon.svg)

---

## Quick start

```bash
# Serve locally (required for ES module imports)
python3 -m http.server -d src 8080
# Open: http://localhost:8080/wallop.html
```

For mobile testing on the same network:
```bash
# Visit http://<your-laptop-ip>:8080/wallop.html from your phone
```

The root `index.html` is the GitHub Pages build — identical to `src/wallop.html`
with the module path adjusted to `src/js/main.js`, plus a `?v=<short-sha>`
cache-buster appended to **every** module import so mobile browsers always
pick up the latest deploy. Rebuild it after any change with the bundled script:

```bash
python3 scripts/build-pages.py
```

The script rewrites every `from './X.js'` import across `src/js/` to include
`?v=<short-sha>` (idempotent — re-running with the same sha is a no-op,
a new sha bumps all imports). Without this, returning players' browsers
serve cached `config.js` / `ui.js` etc. even though `main.js` is fresh.

---

## Project structure

```
wallop/
├── CLAUDE.md                   ← Architecture briefing for Claude Code
├── README.md                   ← This file
├── index.html                  ← GitHub Pages build (generated from wallop.html)
├── .claude/settings.json       ← Pre-approved Claude Code permissions
├── .gitignore
├── scripts/
│   ├── build-pages.py          ← Rebuild index.html + cache-bust JS imports
│   └── validate.sh             ← node --check all JS modules + inline scripts
├── src/
│   ├── wallop.html             ← Game entry point (HTML shell + inline CSS + splash wiring)
│   ├── js/
│   │   ├── main.js             ← Animate loop, resize, fullscreen, context loss
│   │   ├── game.js             ← Core loop: damageEnemy, update, spawning, bosses, challenges
│   │   ├── entities.js         ← Player, enemies, projectiles, chests, gems, pools
│   │   ├── weapons.js          ← All weapon / armor / tome definitions (defWeapon etc.)
│   │   ├── upgrades.js         ← STAT_UPGRADES, SYNERGY_UPGRADES
│   │   ├── ui.js               ← HUD, level-up, armory, pause, game-over, challenges menu
│   │   ├── profile.js          ← Meta-progression: Profile singleton, CATALOG, CHALLENGES, ARENAS
│   │   ├── state.js            ← gameState (stage, arena, activeChallenge, etc.), cam
│   │   ├── config.js           ← CFG constants, STAGE_MULTS, DIFFICULTIES, VERSION
│   │   ├── renderer.js         ← Three.js scene, camera, renderer, composer
│   │   ├── world.js            ← Per-arena scenery, ground theming, obstacles
│   │   └── terrain.js          ← groundHeight(), resolveSolids()
│   └── splash/
│       └── pizza-hero-splash.html  ← PHG studio bumper (synced with Athanor)
├── assets/
│   ├── icons/icon.svg          ← 512×512 maskable app icon
│   ├── characters/             ← Character GLBs (knight, mage, barbarian, rogue, ranger, hooded)
│   ├── ui/                     ← Kenney UI pack tiles (CC0 — wood frames, buttons, slots)
│   ├── KayKit_Adventurers_2.0_FREE/   ← Source pack (untracked)
│   ├── KayKit_Skeletons_1.1_FREE/     ← Source pack (untracked)
│   └── KayKit_Forest_Nature_Pack_*/   ← Source pack (untracked)
├── kenney_ui-pack-pixel-adventure/    ← UI source pack (CC0, untracked)
└── docs/
    └── icon-preview.html
```

---

## Characters (6 — 1 default + 5 slice-unlockable)

| Character | Cost | Starter | Stat bonuses | Unique weapon | Unique armor |
|---|---|---|---|---|---|
| 🍕 Pizza Hero | default | Pizza Toss 🍕 | — | Deep Dish 🍕 | Delivery Bag 🎒 |
| 🧊 Frost Baker | 200 🍕 | Ice Cone 🧊 | Cold effects +50% duration | Blizzard 🌨️ | Frost Shell ❄️ |
| 🧱 Oven Knight | 350 🍕 | Wallop Aura 💥 | +4 armor, +25 HP, −20% speed | Forge Hammer 🔨 | Iron Hide 🪨 |
| 🏃 Crust Runner | 500 🍕 | Pepperoni Boomerang 🪃 | +35% speed, double jump, −15% cooldowns | Star Shower ⭐ | Turbo Soles 🏃 |
| 🏹 Anchovy Archer | 600 🍕 | Crossbow Bolt 🏹 | +15% crit, +30% crit dmg, +1 pierce, −10 HP | Tomahawk Anchovy 🪓 | Sniper's Cloak 🎯 |
| 🥷 Stealth Slice | 750 🍕 | Smoke Bomb 💨 | +15% dodge, +20% damage, +10% speed, −15 HP | Shadow Slice 🌑 | Phantom Hood 👤 |

**Unique item unlock system:** character-exclusive items appear only in that character's
level-up pool. Other characters can unlock them cross-character: accumulate **7,500 kills
with that specific weapon** (or 7,500 kills while that armor is equipped), then purchase
it from the Armory with Slices. Only kills dealt by that weapon count — kills from other
weapons do not contribute. Once purchased, the item appears in every character's pool
permanently.

---

## Weapons (12 base + 6 char-unique + 3 slice-unlockable)

| Weapon | How to get |
|---|---|
| Pizza Toss 🍕, Wallop Aura 💥, Pizza Wheel ☸️, Thunder Strike ⚡, Ground Pound 🌀, Fireball 🔥, Pepperoni Boomerang 🪃, Ice Cone 🧊, Crossbow Bolt 🏹, Smoke Bomb 💨, Bone Staff 🦴, Calzone Bomb 🥟 | Available by default |
| Deep Dish 🍕 | Pizza Hero exclusive / 7,500 kills with Deep Dish + 250 Slices |
| Blizzard 🌨️ | Frost Baker exclusive / 7,500 kills with Blizzard + 250 Slices |
| Forge Hammer 🔨 | Oven Knight exclusive / 7,500 kills with Forge Hammer + 300 Slices |
| Star Shower ⭐ | Crust Runner exclusive / 7,500 kills with Star Shower + 300 Slices |
| Tomahawk Anchovy 🪓 | Anchovy Archer exclusive / 7,500 kills with Tomahawk Anchovy + 325 Slices |
| Shadow Slice 🌑 | Stealth Slice exclusive / 7,500 kills with Shadow Slice + 325 Slices |
| Meatball Minigun 🍝 | 150 Slices |
| Cheese Whip 🧀 | 200 Slices |
| Olive Railgun 🫒 | 300 Slices |

## Armor (6 base + 6 char-unique + 2 slice-unlockable)

| Armor | How to get |
|---|---|
| Chest Plate 🛡️, Helmet ⛑️, Kinetic Shield 💠, Vampire Amulet 🩸, Running Shoes 👟, Thorn Gauntlets 🌵 | Available by default |
| Delivery Bag 🎒 | Pizza Hero exclusive / 7,500 kills while equipped + 200 Slices |
| Frost Shell ❄️ | Frost Baker exclusive / 7,500 kills while equipped + 200 Slices |
| Iron Hide 🪨 | Oven Knight exclusive / 7,500 kills while equipped + 275 Slices |
| Turbo Soles 🏃 | Crust Runner exclusive / 7,500 kills while equipped + 250 Slices |
| Sniper's Cloak 🎯 | Anchovy Archer exclusive / 7,500 kills while equipped + 275 Slices |
| Phantom Hood 👤 | Stealth Slice exclusive / 7,500 kills while equipped + 275 Slices |
| Mirror Vest 🪞 | 150 Slices |
| Phoenix Apron 🔥 | 300 Slices |

## Tomes (10 — 8 base + 2 implemented)

Tome of Power 📕, Tome of Swiftness 📒, Tome of Fortune 📗, Tome of Wisdom 📘,
Tome of Reach 📙, Tome of Warding 📓, Hunter's Tome 📔, Cursed Tome 💀,
Tome of Echoes 📜 (every Nth projectile fires a free duplicate),
Tome of Time ⏳ (slows ALL enemies briefly when you take damage).

---

## Arenas (3 — 1 default + 2 progression-gated)

| Arena | Unlock | Theme | Inner-arena obstacles |
|---|---|---|---|
| 🌲 Pepperoni Pines | default | Lush green forest | None (beginner-friendly) |
| 🍂 Sundried Slopes | beat Pepperoni stage 3 on Normal+ | Warm dry autumn earth | 16 sandstone boulders scattered for cover |
| 🧊 Frostbite Glacier | beat Sundried stage 3 on Normal+ | Icy mid-tone blue snow | 22 tall ice spires forming chokepoints |

Each arena swaps the sky, fog, sun/hemisphere lighting, ground texture, scenery
tint, tree-type weights, distant-hill palette, AND inner-arena terrain.

---

## Challenges (5 starter)

Special-rules runs accessed from the **🏆 CHALLENGES** button on the start menu.
Each challenge pays out Slices on **first completion only**; replays are
allowed but give nothing. Pick a challenge → run launches with its modifiers
applied.

| Challenge | Reward | Objective |
|---|---|---|
| 💥 Glass Cannon | 100 🍕 | Half max HP + 50% damage. Survive to 5:00. |
| ⚡ Speed Demon | 150 🍕 | Defeat the Sauce Slinger before 4:00 elapsed. |
| 💀 Slaughterhouse | 125 🍕 | 150 kills in the first 4:00. |
| 👻 Untouchable | 250 🍕 | Survive to 4:00 with ZERO damage taken. |
| 🍕 Pizza Purist | 200 🍕 | Beat the Sauce Slinger using only Pizza Toss. |

Add more in `src/js/profile.js` (CHALLENGES data) + `src/js/game.js`
(CHALLENGE_LOGIC[id].setup / check).

---

## Meta-progression

**Slices** 🍕 — persistent currency earned from boss kills, scaled by stage and difficulty.
Spent in the **Armory** to unlock characters, weapons, armor, and permanent run boosts.

**Permanent boosts** (Armory → Boosts tab, up to 5 levels each):
- Sharper Crust ⚔️ — +5% damage per level
- Hearty Dough ❤️ — +10 max HP per level
- Toasted Hide 🛡️ — +1 armor per level
- Quick Hands ⚡ — +5% move speed per level
- Fast Learner 📈 — +10% XP gain per level
- Coin Magnet 💰 — +10% gold gain per level
- Spare Slice 💝 — start each run with one auto-revive

---

## Stage progression

Three stages, played in sequence. Defeat the Warlord to advance.
Weapons, armor, tomes, and XP level all carry over between stages.
The player is healed 50% of max HP on each advance, and **~50% of their
weapons/armor/tomes are randomly stripped** at each advance to keep
the difficulty curve meaningful.

| Stage | Enemy scale | Boss HP | Boss DMG | Slice bonus |
|---|---|---|---|---|
| 1 | ×1.0 | ×1.0 | ×1.0 | ×1.0 |
| 2 | ×1.8 | ×2.0 | ×1.6 | ×1.5 |
| 3 | ×2.6 | ×3.2 | ×2.4 | ×2.5 |

Early enemies in stages 2 and 3 have a minimum strength floor that reflects the
player's accumulated power (Stage 2 floor ≈ 5-min equivalent, Stage 3 ≈ 8-min).

---

## Difficulty

| | Enemy scale | Slice bonus |
|---|---|---|
| Easy | ×0.7 | ×0.6 |
| Normal | ×1.0 | ×1.0 |
| Hard | ×1.45 | ×1.6 |
| Extreme | ×2.0 | ×2.5 |

Slice rewards are capped at ×4.0 total (stage × difficulty combined).

---

## Bosses

| Boss | Appears | HP | Gold | Slices | Special |
|---|---|---|---|---|---|
| The Sauce Slinger | 3:00 | 480 base | 25 | 5 | Arc sauce lobs with ground-ring telegraphs |
| The Hammer Chef | 6:00 | 1,200 base | 50 | 10 | Fan of 5 flying cleavers |
| The Warlord | 10:00 | 2,400 base | 100 | 15 | Homing shockwave + follow-up shot |

All bosses phase-shift at 50% HP (Enraged) and 25% HP (Desperate).
**Call the Boss**: spend 50 gold from the pause menu to skip to the Warlord immediately.

---

## Validate edits

After changing any JS module file:

```bash
python3 -c "
import codecs
with codecs.open('src/js/FILENAME.js', encoding='utf-8') as f:
    content = f.read()
with open('/tmp/check.js', 'w', encoding='utf-8') as f:
    f.write(content)
" && node --check /tmp/check.js
```

For `wallop.html` inline scripts:
```bash
python3 -c "
import re, codecs
with codecs.open('src/wallop.html', encoding='utf-8') as f:
    html = f.read()
scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
combined = '\n;\n'.join(scripts)
with open('/tmp/wallop_inline.js', 'w', encoding='utf-8') as f:
    f.write(combined)
" && node --check /tmp/wallop_inline.js
```

**Critical lint checks:**
- `grep -c 'scene\.remove(' src/wallop.html` → must be 0 (use `killMesh()`)
- `grep -c 'MeshLambertMaterial' src/wallop.html` → must be 0 (use `flatPhong()` / `smoothPhong()`)

---

## Working with Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude
```

First prompt: **"Read CLAUDE.md and confirm you understand the project's constraints."**

`CLAUDE.md` has the full architectural briefing — major systems, critical gotchas
(GPU leak prevention, material rules, pointer lock, mobile concerns), and conventions.

---

## Dev mode (testing)

About screen → **DEV MODE (TESTING)** section. Credentials: `Dev` / `password`.
Snapshots the current profile to a separate localStorage key, then overrides
the active profile with "everything unlocked + 999,999 slices + every boost
maxed" for QA. Exit restores the snapshot byte-for-byte. A red `🔧 DEV MODE`
chip is pinned to the top of every screen while active.

---

## Roadmap

**Content gaps still to fill:**
- Procedural sound design / SFX (game is currently silent)
- Music loops per arena
- More challenges (system supports easy addition — 5 starters)
- Boss models (currently procedural — Sauce Slinger / Hammer Chef / Warlord)

**Shipping work:**
- Capacitor wrapper for Google Play Store launch
- AdMob integration (rewarded-ad reroll already wired with simulation)
- iOS build (Capacitor handles both)

---

## License

TBD — depends on distribution plans (Play Store, Steam, etc.).
