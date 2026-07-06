# WALLOP — Steamworks Features Spec (achievements, leaderboards, cloud)

The exact entities to create in the **Steamworks dashboard** (App 4910280) plus how
each maps to in-game triggers I'll wire in the `WallopSteam` bridge. Achievements
are driven from the game's own `Profile`/run events (no Steam *stats* required for
v1), so you only need to create **Achievements** + **Leaderboards** in the
dashboard. Related: `docs/STEAM_BUILD_PLAN.md`, `docs/PLAY_GAMES_SERVICES_PLAN.md`
(the Android/PGS mirror uses the same triggers).

Dashboard path: **App Admin → Stats & Achievements → Achievements** (and
**→ Leaderboards**). Each achievement needs an **API Name** (exact, permanent),
display name, description, and two icons (achieved + locked/greyed, 256×256 PNG).

---

## Leaderboards (6)
Create under **Stats & Achievements → Leaderboards** (or I can create them at
runtime via the API — but dashboard is cleaner). Config = sort + display type.

| API Name | Display Name | Sort | Display | Submitted when |
|---|---|---|---|---|
| `LB_SURVIVAL_PINES`   | Longest Survival — Pepperoni Pines | Descending | Seconds | run ends in Pepperoni Pines (time survived) |
| `LB_SURVIVAL_SLOPES`  | Longest Survival — Sundried Slopes | Descending | Seconds | run ends in Sundried Slopes |
| `LB_SURVIVAL_GLACIER` | Longest Survival — Frostbite Glacier | Descending | Seconds | run ends in Frostbite Glacier |
| `LB_HIGH_LEVEL`       | Highest Level (single run) | Descending | Numeric | run ends (peak level) |
| `LB_MOST_KILLS`       | Most Kills (single run) | Descending | Numeric | run ends (run kill count) |
| `LB_FAST_WIN`         | Fastest Warlord Kill | Ascending | Seconds | on victory (time to beat Warlord) |

Notes: "Descending" = higher is better (survival/level/kills). Fast-win is
Ascending (lower time wins). Only submit if the new score beats the player's
existing entry (`k_ELeaderboardUploadScoreMethodKeepBest`). Survival goes to the
board matching `gameState.arena`.

---

## Achievements (27)
API names are permanent. "Src" = where the trigger fires (r = per-run, L =
lifetime via Profile). None hidden except the two marked 🔒 (secret).

Thresholds rebalanced 2026-07-06 after playtest sim (a strong run reaches ~LV 77 /
~4,000 kills / ~1,700 gold; XP-stacked runs hit the hundreds). Icons in
`steam/achievements/` (`ACH_XXX.png` + `ACH_XXX_locked.png`).

| # | API Name | Display | Description | Src / Condition |
|--|--|--|--|--|
| 1 | `ACH_FIRST_DELIVERY` | First Delivery | Reach level 5 in a run. | r: player.level≥5 |
| 2 | `ACH_SAUCE_SLINGER` | Saucy | Defeat the Sauce Slinger. | r: mini1 boss killed |
| 3 | `ACH_HAMMER_CHEF` | Tenderized | Defeat the Hammer Chef. | r: mini2 boss killed |
| 4 | `ACH_WARLORD` | Employee of the Month | Defeat the Warlord. | r: final boss killed (win) |
| 5 | `ACH_TRIPLE_THREAT` | Triple Threat | Defeat all three bosses in one run. | r: mini1+mini2+final same run |
| 6 | `ACH_WIN_NORMAL` | Well Done | Win a run on Normal. | r: victory, difficulty=normal |
| 7 | `ACH_WIN_HARD` | Extra Crispy | Win a run on Hard. | r: victory, difficulty=hard |
| 8 | `ACH_WIN_EXTREME` | Burnt to a Crisp | Win a run on Extreme. | r: victory, difficulty=extreme |
| 9 | `ACH_LEVEL_50` | Getting Warmed Up | Reach level 50 in a run. | r: player.level≥50 |
| 10 | `ACH_LEVEL_150` | Fully Stacked | Reach level 150 in a run. | r: player.level≥150 |
| 11 | `ACH_LEVEL_300` | Overcooked | Reach level 300 in a run. | r: player.level≥300 |
| 12 | `ACH_FULL_LOADOUT` | The Works | Carry 3 weapons, 3 armor, and 3 tomes at once. | r: all slots full |
| 13 | `ACH_MAX_WEAPON` | Perfected Recipe | Max out any weapon. | r: a weapon hits maxLevel |
| 14 | `ACH_GOLD_2500` | Big Tipper | Hold 2,500 gold in a single run. | r: player.gold≥2500 |
| 15 | `ACH_RUSH_HOUR` | Rush Hour | Defeat 5,000 enemies in a single run. | r: run kills≥5000 |
| 16 | `ACH_KILLS_100000` | Meat Grinder | Defeat 100,000 enemies (lifetime). | L: lifetime kills≥100000 |
| 17 | `ACH_CHESTS_250` | Treasure Hunter | Open 250 chests (lifetime). | L: chests opened≥250 |
| 18 | `ACH_CLEAR_PINES` | Pines Patrol | Clear Pepperoni Pines. | L: arenaProgress.pepperoni_pines cleared |
| 19 | `ACH_CLEAR_SLOPES` | Slope Style | Clear Sundried Slopes. | L: sundried_slopes cleared |
| 20 | `ACH_CLEAR_GLACIER` | Cold Cuts | Clear Frostbite Glacier. | L: frostbite_glacier cleared |
| 21 | `ACH_NEW_HIRE` | New Hire | Unlock a second character. | L: ≥2 characters unlocked |
| 22 | `ACH_FULL_ROSTER` | Full Roster | Unlock every character. | L: all 6 unlocked |
| 23 | `ACH_SIGNATURE` | Signature Dish | Unlock a character-signature item (7,500 kills). | L: any signature item unlocked |
| 24 | `ACH_SLICE_BARON` | Slice Baron | Earn 500 slices (lifetime). | L: lifetime slices≥500 |
| 25 | `ACH_OVERACHIEVER` | Overachiever | Complete a challenge. | L: any challenge completed |
| 26 | `ACH_UNTOUCHABLE` | Untouchable | Win a run without taking a single hit. | r: victory + no damage taken |
| 27 | `ACH_SPEED_DEMON` | Speed Demon | Melt the Warlord within ~60s of it appearing. | r: victory, run time<660s (tune) |

If level cap isn't 50, tell me and I'll adjust #11's threshold. Icons: the pizza/
food theme gives easy motifs (a slice, a boss silhouette, a trophy, an arena
vignette). 256×256 PNG each, achieved (colored) + locked (greyed/dark).

---

## Cloud saves (approach)
Use the **Steam Cloud API** (`ISteamRemoteStorage` via steamworks.js), not
file-based Auto-Cloud — the game's save is a `localStorage` blob
(`wallop_profile_v1`), so the bridge will:
- On launch: read the cloud blob → hydrate `localStorage` before the game boots
  (newer timestamp wins vs local).
- On save (`Profile.save()`): also write the blob to Steam Cloud.
- One JSON serialization, two backends (Steam Cloud on desktop, PGS Saved Games
  on Android) chosen by build — mirrors `docs/STEAM_BUILD_PLAN.md`.
Enable Steam Cloud + set a byte quota in **App Admin → Cloud**.

---

## How this gets wired (my side, after the build smoke-tests)
1. `electron/`: init steamworks.js, expose `window.WallopSteam` via preload:
   `unlock(api)`, `cloudSave(json)` / `cloudLoad()`, `submitScore(board, value)`.
2. Game: a thin `steamFeatures.js` that no-ops unless `isSteamBuild()`; call
   `unlock()` at each trigger above, `submitScore()` on run end, and hook
   `Profile` load/save to the cloud bridge.
3. Achievements fire from existing signals (boss-kill, level-up, victory,
   `Profile` counters) — no gameplay changes, just taps.
