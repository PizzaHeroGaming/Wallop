# WALLOP — Steam Trailer Plan

The trailer is Steam's single biggest conversion lever. Needs real gameplay
capture, so this is prep now + record later. Aim: **60–75s**, hook in the first
**5 seconds**, gameplay-forward (Steam buyers want to see the loop, not logos).

## Specs (Steam)
- 1920×1080, **MP4 (H.264)**, 30 or 60 fps, stereo audio.
- First frame matters (it's the thumbnail before play) — make it a strong action
  frame, not a black/logo frame.
- Keep under ~90s; most viewers bail by 30s, so front-load the good stuff.

## Capture toolchain (free)
- **OBS Studio** — capture the desktop build (or browser) at 1080p60, high
  bitrate (~20–40 Mbps). Game-capture the Electron window.
- Optional clean shots: a HUD-hide toggle would make cinematic capture easy
  (see "nice-to-have" below).
- Edit in **DaVinci Resolve** (free) or **CapCut**. Music: a CC0/royalty-free
  track, or the game's own audio bed.

## Shot list / structure (~70s)
1. **Hook (0–5s):** drop straight into chaos — a dense swarm getting deleted, or
   a boss telegraph → screen-clear. Quick WALLOP logo sting (use
   `steam/library-logo.png`) over the action, then keep moving.
2. **Core loop (5–25s):** show auto-combat + movement/dodging; cut to a level-up
   choice screen picking a weapon; show the new weapon firing. Communicate
   "you move + pick, the weapons fire."
3. **Snowball (25–45s):** the build coming online — multiple weapons + orbitals +
   chain lightning, bigger swarms melting. Escalating pace + hits.
4. **Variety (45–60s):** quick cuts — the 3 arenas, a mini-boss and the Warlord,
   a couple of distinct characters/weapons. Proves depth.
5. **Meta + challenges (60–68s):** flash the Armory (unlocks), characters, a
   challenge modifier. "Progress carries over."
6. **Close (68–72s):** logo + `smash. survive. snowball.` + CTA card
   ("Wishlist now on Steam"). End on the logo frame.

## Editing notes
- Cut on the beat; match hits/explosions to audio accents.
- Text callouts sparingly (2–4 max): e.g. "AUTO-FIGHT", "STACK ABSURD BUILDS",
  "3 ARENAS · 3 BOSSES". Use the brand fonts (Press Start 2P / VT323).
- Keep each clip ~1.5–3s; momentum > lingering.
- Grade slightly punchier (the game already bloom/color-grades on desktop).

## Capture checklist (record a few clean runs)
- [ ] A run that snowballs hard by ~5 min (lots of weapons) for the carnage beats.
- [ ] A boss telegraph → kill (Sauce Slinger ring; Warlord).
- [ ] A level-up pick (pause-worthy choice screen).
- [ ] Armory + character select b-roll.
- [ ] One clip per arena for the variety cut.

## Nice-to-have before recording
- **HUD-hide toggle** (e.g. `?nohud=1` or a key) so some shots can be HUD-free
  and cinematic — also fixes the store-capsule source-art problem (clean,
  high-res frames to recomposite via `scripts/gen-steam-art.mjs`). Small code add.

## Assets ready to drop in
- `steam/library-logo.png` (transparent wordmark) — logo sting + end card.
- Brand fonts in `store/.fonts/` (Press Start 2P, VT323) for callouts.
