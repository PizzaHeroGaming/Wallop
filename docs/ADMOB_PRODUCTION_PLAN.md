# WALLOP — AdMob Production Checklist (test ads → real ads)

Status: **planned, not started.** The ad *integration* is already done and
working with Google **test** ad units. This doc is the production-launch flip to
**real** ad units. Do it as part of the going-live push (ideally bundled with
[[project_play_closed_testing]] graduation + the PGS pass).

## ⚠️ The rule that gates all of this
**Do NOT put real ad units in any build that you or your closed testers run.**
Impressions/clicks on your own real ads = **invalid traffic** → AdMob account
suspension. Keep the **test** IDs in the closed-test build. Only flip to real
units in the build headed for production (or open testing with real users you
don't control), and register your own devices as test devices first.

---

## What's already done (no work needed)
- Native bridge `AdsInterface.java` → `window.AndroidAds` (rewarded + interstitial),
  result delivered via `window.__onRewarded(success)`.
- `MainActivity` registers the JS interface and gathers **UMP consent** before
  initializing `MobileAds` / loading any ad — ad loading is deferred to
  `AdsInterface.startLoading()`, called only once `canRequestAds()` is true.
  (UMP SDK `user-messaging-platform:3.1.0` added to `build.gradle`.)
- Web `window.GameAds` fallback simulates the rewarded ad in-browser.
- Placements gated to mobile + throttled (interstitial every other run; rewarded
  for Double Slices + Armory "+3 slices"). Steam/PC never calls ad code.
- Privacy policy declares AdMob data; Play Data Safety covered.

---

## Real IDs (created 2026-07-11 — swap in at the PRODUCTION cut only)
Publisher `pub-8467944404188469`. **Do NOT put these in the closed-test build.**
- **App ID** (manifest `APPLICATION_ID`): `ca-app-pub-8467944404188469~4041925584`
- **Interstitial** (`AdsInterface.INTERSTITIAL_UNIT`): `ca-app-pub-8467944404188469/4102048028`
- **Rewarded** (`AdsInterface.REWARDED_UNIT`): `ca-app-pub-8467944404188469/6007789545`

## Exact swap points (3 IDs)
All three currently hold Google TEST IDs (`ca-app-pub-3940256099942544...`):

1. `android/app/src/main/AndroidManifest.xml:28`
   `com.google.android.gms.ads.APPLICATION_ID` → real **AdMob App ID**
   (`ca-app-pub-XXXX~YYYY`).
2. `android/app/src/main/java/com/pizzaherogaming/wallop/AdsInterface.java:28`
   `REWARDED_UNIT` → real **rewarded** ad unit (`ca-app-pub-XXXX/YYYY`).
3. `android/app/src/main/java/com/pizzaherogaming/wallop/AdsInterface.java:29`
   `INTERSTITIAL_UNIT` → real **interstitial** ad unit.

(Quick find later: `grep -rn "3940256099942544" android/app/src/main`.)

---

## Production setup steps

### A. AdMob account + units (can create now; don't swap into the build yet)
1. Create/sign in to **AdMob** (admob.google.com), complete **payment + tax** info.
2. **Add app** → link to the Play listing `com.pizzaherogaming.wallop`
   (linking is cleanest once the app is on Play, even in testing).
3. Create two ad units: **Rewarded** and **Interstitial**. Copy the App ID +
   both unit IDs into the 3 swap points above (in the production build only).

### B. UMP consent (REQUIRED before serving real ads to EEA/UK)
**Code is DONE** — the UMP SDK + consent flow (gather consent → `MobileAds.initialize`
→ `AdsInterface.startLoading`) is wired in `MainActivity`. Remaining is account-side:
4. In AdMob → **Privacy & messaging** → create a **GDPR/UMP consent message**
   (and an **ATT** message for iOS later). Until this message exists, the SDK
   returns "consent not required" and ads proceed — so create it before the
   real-ID flip.
5. Smoke-test with UMP **debug geography = EEA** (+ your device's UMP debug ID)
   to verify the consent prompt appears and ads only load after consent. To force
   a re-prompt during testing, call `consentInformation.reset()`.

### C. app-ads.txt (authorize your inventory)
6. Publish **`app-ads.txt`** at the site in the Play listing's developer website
   field. For GitHub Pages that's the **root domain**
   `https://pizzaherogaming.github.io/app-ads.txt` (root, NOT the /Wallop/
   subpath — app-ads.txt must sit at the domain root), containing the line AdMob
   gives you, e.g.:
   `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
   - Note: the dev-website domain registered in Play must match. If the listing
     points at the /Wallop/ project page, confirm AdMob resolves the root domain
     — may need a dedicated domain/root page.

### D. Test devices (protect the account)
7. In `MobileAds`/`RequestConfiguration`, add your phone's **test device ID**
   (logcat prints it on first ad request) so even post-flip you never generate
   invalid traffic while smoke-testing.

### E. Release
8. Bump `versionCode`/`versionName` (build.gradle) + `VERSION` (config.js).
9. `build-www.py` → `npx cap copy android` → `gradlew bundleRelease`.
10. Upload to the production track (or an open test with real users).

---

## Pre-flip verification
- [ ] Closed-test build still on TEST IDs (no real ads shown to testers).
- [ ] UMP prompt appears under EEA debug geography; ads only load post-consent.
- [ ] app-ads.txt live at the domain root + verified in AdMob (can take ~24h).
- [ ] Own device registered as a test device.
- [ ] Real units load a *test* ad on your registered device (shows "Test Ad").
- [ ] Interstitial still throttled (every other run); rewarded still grants the
      Double-Slices / Armory reward via `window.__onRewarded(true)`.

## iOS (later, with the Capacitor iOS build)
- Separate AdMob app + units, ATT prompt (UMP), `SKAdNetworkItems` in Info.plist.
