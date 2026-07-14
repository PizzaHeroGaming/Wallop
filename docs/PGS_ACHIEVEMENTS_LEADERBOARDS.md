# WALLOP — Play Games Achievements + Leaderboards (console setup)

Status (2026-07-13): **CODE DONE — blocked only on Play Console entry creation.**
The mobile achievement + leaderboard integration is fully wired and boot-tested.
What remains is entirely account-side: create each achievement + leaderboard in
the Play Console, then paste the generated IDs into `src/js/pgs-ids.js`.

## How it works (already built)
- `GamesBridge.java` → `window.AndroidGames` (unlock / submitScore / fetch /
  showAchievements / showLeaderboard), registered in `MainActivity`.
- `src/js/pgs.js` — game-side bridge (async results via `__onPgsResult`).
- `src/js/steam.js` is now the **platform-neutral** trigger layer: every existing
  achievement/leaderboard trigger fires **both** Steam (desktop) and Play Games
  (mobile). No call sites changed.
- `src/js/pgs-ids.js` — the **ID map you fill in** (keys are permanent internal
  names; paste the console-generated IDs as the values).
- `src/js/ui.js` — reveals 📊 LEADERBOARDS + 🏅 ACHIEVEMENTS on the start screen
  when the Android bridge is present; the in-game Leaderboards screen reads PGS.
- Icons: 27 achievement icons at **512×512** in `store/pgs-achievements/`.

## The golden rule: fill IDs incrementally
Until an ID is filled in `pgs-ids.js`, that achievement/board **silently no-ops**
on mobile — the game runs fine, it just won't record. So you can create entries
in the console in any order and paste IDs as you go; nothing breaks half-done.

---

## Part 1 — Achievements (27) — BULK IMPORT (one drop, not 27 entries)

Achievements support a ZIP import, so all 27 are created in one shot. I generated
the ZIP for you: **`store/pgs-import/achievements-import.zip`** (27 icons +
`AchievementsMetadata.csv` + `AchievementsIconsMappings.csv` — no header rows,
comma-free text, name+description in Metadata as the en-US default, Untouchable +
Speed Demon marked Hidden, points summing to 995 under Google's 1000 cap). There's
deliberately **no** `AchievementsLocalizations.csv` — that file is only for
non-default locales, so an en-US row there is rejected ("Wrong locale").

**Console path:** Play Games Services → Achievements → **Import achievements** →
drop `achievements-import.zip`.

To regenerate (e.g. after tweaking names/points in `scripts/gen-pgs-import.py`):
```
PGS=1 node scripts/gen-achievement-icons.mjs   # only if icons changed
python scripts/gen-pgs-import.py
```

The table below is the reference for what's in the ZIP (you don't hand-enter it):

| Key (→ pgs-ids.js) | Display name | Description | Pts | Icon file |
|---|---|---|---|---|
| `ACH_FIRST_DELIVERY` | First Delivery | Reach level 5 in a run. | 20 | ACH_FIRST_DELIVERY.png |
| `ACH_SAUCE_SLINGER` | Saucy | Defeat the Sauce Slinger. | 20 | ACH_SAUCE_SLINGER.png |
| `ACH_HAMMER_CHEF` | Tenderized | Defeat the Hammer Chef. | 20 | ACH_HAMMER_CHEF.png |
| `ACH_NEW_HIRE` | New Hire | Unlock a second character. | 20 | ACH_NEW_HIRE.png |
| `ACH_OVERACHIEVER` | Overachiever | Complete a challenge. | 20 | ACH_OVERACHIEVER.png |
| `ACH_LEVEL_50` | Getting Warmed Up | Reach level 50 in a run. | 20 | ACH_LEVEL_50.png |
| `ACH_GOLD_2500` | Big Tipper | Hold 2,500 gold in a single run. | 20 | ACH_GOLD_2500.png |
| `ACH_CLEAR_PINES` | Pines Patrol | Clear Pepperoni Pines. | 20 | ACH_CLEAR_PINES.png |
| `ACH_WARLORD` | Employee of the Month | Defeat the Warlord. | 35 | ACH_WARLORD.png |
| `ACH_WIN_NORMAL` | Well Done | Win a run on Normal. | 35 | ACH_WIN_NORMAL.png |
| `ACH_FULL_LOADOUT` | The Works | Carry 3 weapons, 3 armor, and 3 tomes at once. | 35 | ACH_FULL_LOADOUT.png |
| `ACH_MAX_WEAPON` | Perfected Recipe | Max out any weapon. | 35 | ACH_MAX_WEAPON.png |
| `ACH_CHESTS_250` | Treasure Hunter | Open 250 chests (lifetime). | 35 | ACH_CHESTS_250.png |
| `ACH_CLEAR_SLOPES` | Slope Style | Clear Sundried Slopes. | 35 | ACH_CLEAR_SLOPES.png |
| `ACH_SLICE_BARON` | Slice Baron | Earn 500 slices (lifetime). | 35 | ACH_SLICE_BARON.png |
| `ACH_LEVEL_150` | Fully Stacked | Reach level 150 in a run. | 35 | ACH_LEVEL_150.png |
| `ACH_TRIPLE_THREAT` | Triple Threat | Defeat all three bosses in one run. | 45 | ACH_TRIPLE_THREAT.png |
| `ACH_WIN_HARD` | Extra Crispy | Win a run on Hard. | 45 | ACH_WIN_HARD.png |
| `ACH_RUSH_HOUR` | Rush Hour | Defeat 5,000 enemies in a single run. | 45 | ACH_RUSH_HOUR.png |
| `ACH_CLEAR_GLACIER` | Cold Cuts | Clear Frostbite Glacier. | 45 | ACH_CLEAR_GLACIER.png |
| `ACH_FULL_ROSTER` | Full Roster | Unlock every character. | 45 | ACH_FULL_ROSTER.png |
| `ACH_SIGNATURE` | Signature Dish | Unlock a character-signature item. | 45 | ACH_SIGNATURE.png |
| `ACH_SPEED_DEMON` 🔒 | Speed Demon | Melt the Warlord within ~60s of it appearing. | 45 | ACH_SPEED_DEMON.png |
| `ACH_WIN_EXTREME` | Burnt to a Crisp | Win a run on Extreme. | 60 | ACH_WIN_EXTREME.png |
| `ACH_LEVEL_300` | Overcooked | Reach level 300 in a run. | 60 | ACH_LEVEL_300.png |
| `ACH_KILLS_100000` | Meat Grinder | Defeat 100,000 enemies (lifetime). | 60 | ACH_KILLS_100000.png |
| `ACH_UNTOUCHABLE` 🔒 | Untouchable | Win a run without taking a single hit. | 60 | ACH_UNTOUCHABLE.png |

---

## Part 2 — Leaderboards (37)

**Console path:** Play Games Services → Setup and management → **Leaderboards** →
Add leaderboard.

**Critical settings per board:**
- **Score ordering:** as noted per row (Larger better for Endless/Level/Weekly;
  **Smaller better** for Fastest Win — lowest time wins).
- **Score formatting:** **Time** for Endless/Fastwin, **Numeric** for Level/Weekly.
  ⚠️ The game submits time boards in **milliseconds** (handled in code) so PGS's
  Time formatter shows mm:ss correctly — just set the format to **Time**.
- **Icon:** PGS requires one. Simplest: reuse `store/icon-512.png` for all 37
  (or per-arena art if you want flair — not required).
- **Limits:** score update rate = normal. Leave list size default.
- Paste each generated ID into the matching `PGS_LEADERBOARDS` key in `pgs-ids.js`.
  The **weekly** board is a **single** entry — PGS's built-in *Weekly* time span
  handles the reset (note: PGS weekly resets on Pacific time, not the Sunday-ET
  used on Steam — acceptable platform difference).

| Key (→ pgs-ids.js) | Display name | Order | Format |
|---|---|---|---|
| `LB_ENDLESS_PINES_EASY` | Endless — Pepperoni Pines (Easy) | Larger is better | Time |
| `LB_ENDLESS_PINES_NORMAL` | Endless — Pepperoni Pines (Normal) | Larger is better | Time |
| `LB_ENDLESS_PINES_HARD` | Endless — Pepperoni Pines (Hard) | Larger is better | Time |
| `LB_ENDLESS_PINES_EXTREME` | Endless — Pepperoni Pines (Extreme) | Larger is better | Time |
| `LB_ENDLESS_SLOPES_EASY` | Endless — Sundried Slopes (Easy) | Larger is better | Time |
| `LB_ENDLESS_SLOPES_NORMAL` | Endless — Sundried Slopes (Normal) | Larger is better | Time |
| `LB_ENDLESS_SLOPES_HARD` | Endless — Sundried Slopes (Hard) | Larger is better | Time |
| `LB_ENDLESS_SLOPES_EXTREME` | Endless — Sundried Slopes (Extreme) | Larger is better | Time |
| `LB_ENDLESS_GLACIER_EASY` | Endless — Frostbite Glacier (Easy) | Larger is better | Time |
| `LB_ENDLESS_GLACIER_NORMAL` | Endless — Frostbite Glacier (Normal) | Larger is better | Time |
| `LB_ENDLESS_GLACIER_HARD` | Endless — Frostbite Glacier (Hard) | Larger is better | Time |
| `LB_ENDLESS_GLACIER_EXTREME` | Endless — Frostbite Glacier (Extreme) | Larger is better | Time |
| `LB_FASTWIN_PINES_EASY` | Fastest Win — Pepperoni Pines (Easy) | Smaller is better | Time |
| `LB_FASTWIN_PINES_NORMAL` | Fastest Win — Pepperoni Pines (Normal) | Smaller is better | Time |
| `LB_FASTWIN_PINES_HARD` | Fastest Win — Pepperoni Pines (Hard) | Smaller is better | Time |
| `LB_FASTWIN_PINES_EXTREME` | Fastest Win — Pepperoni Pines (Extreme) | Smaller is better | Time |
| `LB_FASTWIN_SLOPES_EASY` | Fastest Win — Sundried Slopes (Easy) | Smaller is better | Time |
| `LB_FASTWIN_SLOPES_NORMAL` | Fastest Win — Sundried Slopes (Normal) | Smaller is better | Time |
| `LB_FASTWIN_SLOPES_HARD` | Fastest Win — Sundried Slopes (Hard) | Smaller is better | Time |
| `LB_FASTWIN_SLOPES_EXTREME` | Fastest Win — Sundried Slopes (Extreme) | Smaller is better | Time |
| `LB_FASTWIN_GLACIER_EASY` | Fastest Win — Frostbite Glacier (Easy) | Smaller is better | Time |
| `LB_FASTWIN_GLACIER_NORMAL` | Fastest Win — Frostbite Glacier (Normal) | Smaller is better | Time |
| `LB_FASTWIN_GLACIER_HARD` | Fastest Win — Frostbite Glacier (Hard) | Smaller is better | Time |
| `LB_FASTWIN_GLACIER_EXTREME` | Fastest Win — Frostbite Glacier (Extreme) | Smaller is better | Time |
| `LB_LEVEL_PINES_EASY` | Highest Level — Pepperoni Pines (Easy) | Larger is better | Numeric |
| `LB_LEVEL_PINES_NORMAL` | Highest Level — Pepperoni Pines (Normal) | Larger is better | Numeric |
| `LB_LEVEL_PINES_HARD` | Highest Level — Pepperoni Pines (Hard) | Larger is better | Numeric |
| `LB_LEVEL_PINES_EXTREME` | Highest Level — Pepperoni Pines (Extreme) | Larger is better | Numeric |
| `LB_LEVEL_SLOPES_EASY` | Highest Level — Sundried Slopes (Easy) | Larger is better | Numeric |
| `LB_LEVEL_SLOPES_NORMAL` | Highest Level — Sundried Slopes (Normal) | Larger is better | Numeric |
| `LB_LEVEL_SLOPES_HARD` | Highest Level — Sundried Slopes (Hard) | Larger is better | Numeric |
| `LB_LEVEL_SLOPES_EXTREME` | Highest Level — Sundried Slopes (Extreme) | Larger is better | Numeric |
| `LB_LEVEL_GLACIER_EASY` | Highest Level — Frostbite Glacier (Easy) | Larger is better | Numeric |
| `LB_LEVEL_GLACIER_NORMAL` | Highest Level — Frostbite Glacier (Normal) | Larger is better | Numeric |
| `LB_LEVEL_GLACIER_HARD` | Highest Level — Frostbite Glacier (Hard) | Larger is better | Numeric |
| `LB_LEVEL_GLACIER_EXTREME` | Highest Level — Frostbite Glacier (Extreme) | Larger is better | Numeric |
| `LB_WEEKLY_KILLS` | Weekly Kills | Larger is better | Numeric |

---

## Part 3 — Collecting the IDs (the easy way)

Don't copy 64 IDs by hand. After importing achievements + creating the boards,
use the console's **"Get resources"** (Play Games Services config page, top of the
Credentials section). It emits an Android `games-ids.xml` listing EVERY id:

```xml
<string name="app_id">635605242379</string>
<string name="achievement_first_delivery">CgkI…EAIQAQ</string>
<string name="leaderboard_endless_pines_easy">CgkI…EAIQBA</string>
…
```

**Paste that whole XML back to me** (or save it to the repo) and I'll auto-fill
`src/js/pgs-ids.js` from it — no manual pasting.

## Part 4 — After IDs are filled
1. **Publish** the PGS changes (Play Console → Publish) — achievements/boards must
   be published to work for players.
2. Rebuild the AAB (next version cut) so the app carries the code + icons.
3. Verify on-device: unlock fires a PGS toast; the 🏅 ACHIEVEMENTS button opens the
   native UI; a run posts to the matching board; 📊 LEADERBOARDS shows entries.
