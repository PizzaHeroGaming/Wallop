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

## Achievements (25)
API names are permanent. "Src" = where the trigger fires (r = per-run, L =
lifetime via Profile). None hidden except the two marked 🔒 (secret).

| # | API Name | Display | Description | Src / Condition |
|--|--|--|--|--|
| 1 | `ACH_FIRST_DELIVERY` | First Delivery | Defeat your first enemy. | r: first kill |
| 2 | `ACH_SAUCE_SLINGER` | Saucy | Defeat the Sauce Slinger. | r: mini1 boss killed |
| 3 | `ACH_HAMMER_CHEF` | Tenderized | Defeat the Hammer Chef. | r: mini2 boss killed |
| 4 | `ACH_WARLORD` | Employee of the Month | Defeat the Warlord. | r: final boss killed (win) |
| 5 | `ACH_TRIPLE_THREAT` | Triple Threat | Defeat all three bosses in one run. | r: mini1+mini2+final same run |
| 6 | `ACH_WIN_NORMAL` | Well Done | Win a run on Normal. | r: victory, difficulty=normal |
| 7 | `ACH_WIN_HARD` | Extra Crispy | Win a run on Hard. | r: victory, difficulty=hard |
| 8 | `ACH_WIN_EXTREME` | Burnt to a Crisp | Win a run on Extreme. | r: victory, difficulty=extreme |
| 9 | `ACH_LEVEL_10` | Getting Warmed Up | Reach level 10 in a run. | r: player.level≥10 |
| 10 | `ACH_LEVEL_25` | Fully Stacked | Reach level 25 in a run. | r: player.level≥25 |
| 11 | `ACH_LEVEL_50` | Overcooked | Reach level 50 in a run. | r: player.level≥50 |
| 12 | `ACH_FULL_LOADOUT` | The Works | Carry 3 weapons, 3 armor, and 3 tomes at once. | r: all slots full |
| 13 | `ACH_MAX_WEAPON` | Perfected Recipe | Max out any weapon. | r: a weapon hits maxLevel |
| 14 | `ACH_GOLD_1000` | Big Tipper | Hold 1,000 gold in a single run. | r: player.gold≥1000 |
| 15 | `ACH_KILLS_1000` | Rush Hour | Defeat 1,000 enemies (lifetime). | L: stats.kills≥1000 |
| 16 | `ACH_KILLS_10000` | Meat Grinder | Defeat 10,000 enemies (lifetime). | L: stats.kills≥10000 |
| 17 | `ACH_CHESTS_50` | Treasure Hunter | Open 50 chests (lifetime). | L: chests opened≥50 |
| 18 | `ACH_CLEAR_PINES` | Pines Patrol | Clear Pepperoni Pines. | L: arenaProgress.pepperoni_pines cleared |
| 19 | `ACH_CLEAR_SLOPES` | Slope Style | Clear Sundried Slopes. | L: sundried_slopes cleared |
| 20 | `ACH_CLEAR_GLACIER` | Cold Cuts | Clear Frostbite Glacier. | L: frostbite_glacier cleared |
| 21 | `ACH_NEW_HIRE` | New Hire | Unlock a second character. | L: ≥2 characters unlocked |
| 22 | `ACH_FULL_ROSTER` | Full Roster | Unlock every character. | L: all 6 unlocked |
| 23 | `ACH_SIGNATURE` | Signature Dish | Unlock a character-signature item (7,500 kills). | L: any signature item unlocked |
| 24 | `ACH_SLICE_BARON` | Slice Baron | Earn 500 slices (lifetime). | L: lifetime slices≥500 |
| 25 | `ACH_OVERACHIEVER` | Overachiever | Complete a challenge. | L: any challenge completed |

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
