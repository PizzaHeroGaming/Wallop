# WALLOP — Steamworks Achievement Entry Sheet

App **4910280** → **Stats & Achievements → Achievements → New Achievement**.
Per achievement the form wants: **API Name** (permanent!), **Display Name**,
**Description**, **Achieved icon**, **Locked/Gray icon**. Icons live in this folder
(`steam/achievements/`). After adding all 27, hit **Publish** on the SteamPipe /
config page or the achievements will stay in preview only.

⚠️ **API Names are permanent** — copy them exactly, no typos. They already match
the icon filenames for drag-and-drop.

| # | API Name | Display Name | Description | Achieved icon | Locked icon |
|--|--|--|--|--|--|
| 1 | `ACH_FIRST_DELIVERY` | First Delivery | Reach level 5 in a run. | ACH_FIRST_DELIVERY.png | ACH_FIRST_DELIVERY_locked.png |
| 2 | `ACH_SAUCE_SLINGER` | Saucy | Defeat the Sauce Slinger. | ACH_SAUCE_SLINGER.png | ACH_SAUCE_SLINGER_locked.png |
| 3 | `ACH_HAMMER_CHEF` | Tenderized | Defeat the Hammer Chef. | ACH_HAMMER_CHEF.png | ACH_HAMMER_CHEF_locked.png |
| 4 | `ACH_WARLORD` | Employee of the Month | Defeat the Warlord. | ACH_WARLORD.png | ACH_WARLORD_locked.png |
| 5 | `ACH_TRIPLE_THREAT` | Triple Threat | Defeat all three bosses in one run. | ACH_TRIPLE_THREAT.png | ACH_TRIPLE_THREAT_locked.png |
| 6 | `ACH_WIN_NORMAL` | Well Done | Win a run on Normal. | ACH_WIN_NORMAL.png | ACH_WIN_NORMAL_locked.png |
| 7 | `ACH_WIN_HARD` | Extra Crispy | Win a run on Hard. | ACH_WIN_HARD.png | ACH_WIN_HARD_locked.png |
| 8 | `ACH_WIN_EXTREME` | Burnt to a Crisp | Win a run on Extreme. | ACH_WIN_EXTREME.png | ACH_WIN_EXTREME_locked.png |
| 9 | `ACH_LEVEL_50` | Getting Warmed Up | Reach level 50 in a run. | ACH_LEVEL_50.png | ACH_LEVEL_50_locked.png |
| 10 | `ACH_LEVEL_150` | Fully Stacked | Reach level 150 in a run. | ACH_LEVEL_150.png | ACH_LEVEL_150_locked.png |
| 11 | `ACH_LEVEL_300` | Overcooked | Reach level 300 in a run. | ACH_LEVEL_300.png | ACH_LEVEL_300_locked.png |
| 12 | `ACH_FULL_LOADOUT` | The Works | Carry 3 weapons, 3 armor, and 3 tomes at once. | ACH_FULL_LOADOUT.png | ACH_FULL_LOADOUT_locked.png |
| 13 | `ACH_MAX_WEAPON` | Perfected Recipe | Max out any weapon. | ACH_MAX_WEAPON.png | ACH_MAX_WEAPON_locked.png |
| 14 | `ACH_GOLD_2500` | Big Tipper | Hold 2,500 gold in a single run. | ACH_GOLD_2500.png | ACH_GOLD_2500_locked.png |
| 15 | `ACH_RUSH_HOUR` | Rush Hour | Defeat 5,000 enemies in a single run. | ACH_RUSH_HOUR.png | ACH_RUSH_HOUR_locked.png |
| 16 | `ACH_KILLS_100000` | Meat Grinder | Defeat 100,000 enemies (lifetime). | ACH_KILLS_100000.png | ACH_KILLS_100000_locked.png |
| 17 | `ACH_CHESTS_250` | Treasure Hunter | Open 250 chests (lifetime). | ACH_CHESTS_250.png | ACH_CHESTS_250_locked.png |
| 18 | `ACH_CLEAR_PINES` | Pines Patrol | Clear Pepperoni Pines. | ACH_CLEAR_PINES.png | ACH_CLEAR_PINES_locked.png |
| 19 | `ACH_CLEAR_SLOPES` | Slope Style | Clear Sundried Slopes. | ACH_CLEAR_SLOPES.png | ACH_CLEAR_SLOPES_locked.png |
| 20 | `ACH_CLEAR_GLACIER` | Cold Cuts | Clear Frostbite Glacier. | ACH_CLEAR_GLACIER.png | ACH_CLEAR_GLACIER_locked.png |
| 21 | `ACH_NEW_HIRE` | New Hire | Unlock a second character. | ACH_NEW_HIRE.png | ACH_NEW_HIRE_locked.png |
| 22 | `ACH_FULL_ROSTER` | Full Roster | Unlock every character. | ACH_FULL_ROSTER.png | ACH_FULL_ROSTER_locked.png |
| 23 | `ACH_SIGNATURE` | Signature Dish | Unlock a character-signature item. | ACH_SIGNATURE.png | ACH_SIGNATURE_locked.png |
| 24 | `ACH_SLICE_BARON` | Slice Baron | Earn 500 slices (lifetime). | ACH_SLICE_BARON.png | ACH_SLICE_BARON_locked.png |
| 25 | `ACH_OVERACHIEVER` | Overachiever | Complete a challenge. | ACH_OVERACHIEVER.png | ACH_OVERACHIEVER_locked.png |
| 26 | `ACH_UNTOUCHABLE` | Untouchable | Win a run without taking a single hit. | ACH_UNTOUCHABLE.png | ACH_UNTOUCHABLE_locked.png |
| 27 | `ACH_SPEED_DEMON` | Speed Demon | Melt the Warlord within ~60s of it appearing. | ACH_SPEED_DEMON.png | ACH_SPEED_DEMON_locked.png |

### Optional: mark as Hidden (secret) achievements
Steamworks lets you flag an achievement **Hidden** so its name/description are
concealed until earned. Good candidates (spoilers / bragging-rights):
- `ACH_UNTOUCHABLE`, `ACH_SPEED_DEMON` — prestige flexes, fun as surprises.
- `ACH_WARLORD`, `ACH_WIN_EXTREME` — endgame, but usually left visible so players
  have a goal. Your call.

### After entry
1. **Publish** the achievements (SteamPipe → app config, or the achievements page
   "Publish" — changes are in preview until published to the live branch).
2. Achievements only *fire* from the Steam/Electron desktop build (the `unlock()`
   calls in `src/js/steam.js`). Web + Play builds no-op — that's by design.
3. Tune `ACH_SPEED_DEMON` threshold (`_SPEED_WIN_TIME = 660` in steam.js) after a
   real Extreme win.
