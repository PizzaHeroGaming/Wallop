# WALLOP — Play Games Services Plan (cloud save + achievements)

Status: **planned, not started.** Do this as ONE deliberate pass AFTER the
closed-test window stabilizes — both features share the same PGS prerequisite.
Keep it OFF the critical path of the current closed test.

Both features run on **Google Play Games Services (PGS)**:
- **Cloud save** = PGS **Saved Games** (Google hosts the snapshot — the
  serverless cloud-save we wanted).
- **Achievements** = PGS **achievements**.

Set up PGS once → both unlock. Everything below is **Android-only** and must be
gated like ads (`isMobile()` / native-bridge presence), so the web + future
Steam builds keep the existing localStorage-only path untouched.

---

## Part 1 — Setup checklist

### A. Play Console (one-time config)
1. **Play Console → Grow → Play Games Services → Setup and management → Configuration.**
2. Create a PGS configuration; link the app `com.pizzaherogaming.wallop`.
3. **Credentials / OAuth:** add an Android credential with the signing-cert
   SHA-1. Add BOTH fingerprints:
   - the **upload key** SHA-1 (`android/upload-keystore.jks`), and
   - the **Play App Signing** key SHA-1 (Console → App integrity).
   Without both, sign-in fails for some installs.
4. **Enable "Saved Games"** in the PGS configuration (required for cloud save).
5. **PGS testers:** PGS has its OWN tester list — add the same tester accounts
   here or sign-in fails during testing.
6. **Publish the PGS configuration** (separate publish step from app releases).
7. Note the generated **Game/App ID** (numeric) — goes in the manifest.

### B. Define achievements in the Console
For each (see Part 2 list): title, description, **icon 512×512**, points,
**incremental vs standard**, **revealed vs hidden**. Copy each achievement's
**string ID** — that's what the code references.

### C. Client integration (mirror the existing `AdsInterface` pattern)
- Add Play Games v2 SDK to `android/app/build.gradle`:
  `com.google.android.gms:play-services-games-v2:+`
- Add `<meta-data android:name="com.google.android.gms.games.APP_ID"
  android:value="@string/game_services_project_id"/>` to AndroidManifest.
- Write a native bridge **`PgsInterface.java`** (same shape as `AdsInterface`)
  exposing to the WebView via `window.AndroidPGS`:
  - `signIn()` / `isSignedIn()`
  - `unlockAchievement(id)` / `incrementAchievement(id, n)`
  - `showAchievements()` (opens the PGS achievements UI)
  - `saveGame(jsonString)` / `loadGame()` → result via `window.__onCloudLoad(json)`
- PGS v2 auto-attempts sign-in on launch (GamesSignInClient). Handle
  signed-in/out; degrade silently to local-only if not signed in.

### D. Profile / cloud-save wiring (`profile.js`)
- Reuse the existing `_state` serialization (already JSON for `wallop_profile_v1`).
- Add a schema field for conflict resolution: `updatedAt` (ms) AND/OR a
  monotonic `rev` counter, bumped on every `save()`.
- **Conflict resolution on load:** fetch cloud snapshot, compare to local; take
  the one with the higher `rev` / newer `updatedAt`. (Tie-break: higher lifetime
  slices.)
- **First sign-in, empty cloud, existing local progress:** upload local.
- **Save cadence:** push to cloud on meaningful changes (run end, unlock, slice
  change) — throttled (e.g. debounce 5–10s, plus a flush on pause/app-background).
- Keep `Profile.save()` writing localStorage as it does now; cloud is a layer
  ON TOP, not a replacement. localStorage stays the source of truth offline.

### E. Build-pipeline note
- Bump `versionCode` (+ `versionName`) in `android/app/build.gradle` and
  `VERSION` in `src/js/config.js` for the release that adds PGS.
- `build-www.py` → `npx cap copy android` → `gradlew bundleRelease` as usual.

### F. Gotchas
- **Steam-safe:** every PGS call gated so PC/Steam never touches it (same policy
  as ads — see [[project_steam_economy]]).
- **localStorage in private mode** already swallows errors (Gotcha #9); cloud
  save shouldn't assume localStorage persisted.
- Achievement unlocks are fire-and-forget but idempotent — safe to call again.
- Test cloud save by: play → earn slices → reinstall → sign in → progress
  restored. Then second device → both converge.

---

## Part 2 — First-draft achievement list

Mix of standard (one-shot) and incremental (progress bar). Counts left generic
("every character") so they don't break when the roster grows. Each maps to an
event the code already fires, so wiring is mostly `unlock()` calls at existing
hook points (boss kill, kill milestone, slice add, unlock, challenge complete).

### Progression
| Suggested ID | Title | Unlock | Type |
|---|---|---|---|
| `ach_first_win` | First Delivery | Win your first run (beat the Warlord) | standard |
| `ach_sauce` | Sauce Boss | Defeat the Sauce Slinger | standard |
| `ach_hammer` | Hammer Time | Defeat the Hammer Chef | standard |
| `ach_clear_arena` | Clean Sweep | Clear all 3 stages of an arena | standard |
| `ach_all_arenas` | World Tour | Clear every arena | standard |

### Combat / mastery
| Suggested ID | Title | Unlock | Type |
|---|---|---|---|
| `ach_kills_1k` | Swarm Cruncher | 1,000 lifetime kills | incremental |
| `ach_kills_10k` | Food Court Massacre | 10,000 lifetime kills | incremental |
| `ach_run_500` | Overkill | 500 kills in a single run | standard |
| `ach_max_weapon` | Fully Loaded | Max a weapon to its top level | standard |
| `ach_synergy` | Synergy Chef | Trigger a synergy/evolution upgrade | standard |
| `ach_full_loadout` | Geared Up | Fill all 3 weapon + armor + tome slots in one run | standard |
| `ach_no_hit_boss` | Untouchable | Beat a boss without taking damage | standard (hard) |

### Meta / collection
| Suggested ID | Title | Unlock | Type |
|---|---|---|---|
| `ach_slices_1k` | Pizza Fortune | 1,000 lifetime slices | incremental |
| `ach_slices_10k` | High Roller | 10,000 lifetime slices | incremental |
| `ach_all_chars` | Full Roster | Unlock every character | standard |
| `ach_all_items` | Armory Stocked | Unlock every weapon, armor, and tome | standard |

### Challenge / skill
| Suggested ID | Title | Unlock | Type |
|---|---|---|---|
| `ach_first_challenge` | Challenger | Complete your first challenge | standard |
| `ach_all_challenges` | Gauntlet Master | Complete all challenges | incremental |
| `ach_survive_10` | Survivor | Survive to the 10-minute mark | standard |
| `ach_level_20` | Overpowered | Reach level 20 in a single run | standard |

### Hidden / fun (optional)
| Suggested ID | Title | Unlock | Type |
|---|---|---|---|
| `ach_glass_cannon` | Live Dangerously | Win the glass-cannon challenge | hidden |
| `ach_first_death` | Welcome to the Job | Die for the first time | hidden |

Lifetime stats (`Profile.stats`) already track kills/slices etc., so the
incremental ones have a data source. Confirm each stat exists before wiring.
