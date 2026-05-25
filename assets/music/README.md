# Music

Per-**stage** background music. All 3 arenas share the same 3-stage progression:

```
stage_1.ogg   — early-run vibe (lower stakes, exploratory)
stage_2.ogg   — escalation (tension rising)
stage_3.ogg   — final push (intense, urgent)
```

When per-arena tracks are sourced later, the `MUSIC` registry in
`src/js/audio.js` can be expanded to a nested `{ arena: { stage_N }}` map
and the call sites in `game.js` updated to read the current arena too.

## Sources

- **Tallbeard Studios Music Loop Bundle** (CC0, .ogg native):
  https://tallbeard.itch.io/music-loop-bundle
- **Pixabay Music** (CC0-equivalent, .mp3): https://pixabay.com/music/

## Format requirements

- **.ogg Vorbis** preferred (matches Kenney SFX format)
- Seamlessly loopable (audio.js sets `loop: true`)
- ≤ 3 MB per track keeps initial load light
- If you only have .mp3:
  ```
  ffmpeg -i input.mp3 -c:a libvorbis -q 5 output.ogg
  ```

## How it's wired

- `src/js/game.js → resetGame()` calls `Audio.playMusic('stage_1')` at run start
- `src/js/game.js → advanceStage()` calls `Audio.playMusic('stage_' + gameState.stage)` when boss dies and stage bumps
- `src/js/ui.js → triggerGameOver()` calls `Audio.stopMusic()` on death/victory
- 800ms cross-fade between tracks
- Mute toggle + volume slider in About menu control music + SFX together
