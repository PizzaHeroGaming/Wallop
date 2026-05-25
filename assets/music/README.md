# Music

Per-arena background music. The code expects these exact filenames:

```
pepperoni_pines.ogg     — light fantasy / forest adventure
sundried_slopes.ogg     — warm ominous / dry desert tension
frostbite_glacier.ogg   — cold sparse / eerie tundra ambient
```

## Recommended source

**Tallbeard Studios — Music Loop Bundle**
https://tallbeard.itch.io/music-loop-bundle

- CC0 licensed (no attribution required)
- 200+ seamless loops, all .ogg native
- Pay-what-you-want, set $0
- One download covers all three arenas

## Format requirements

- **.ogg Vorbis** preferred (matches Kenney pack format, smallest browser footprint)
- Seamlessly loopable (audio.js sets `loop: true` on the HTMLAudio element)
- ≤ 3 MB per track keeps initial load reasonable
- If you only have .mp3, convert with:
  ```
  ffmpeg -i input.mp3 -c:a libvorbis -q 5 output.ogg
  ```

## How it's wired

`src/js/world.js → setWorldArena(slug)` calls `Audio.playMusic(slug)`, which
cross-fades to the matching track over 800ms. Game-over triggers
`Audio.stopMusic()`. Master volume + mute controls in About menu drive
music volume the same as SFX.

Mapping lives at `src/js/audio.js → MUSIC` registry. Per-track volume can
be overridden there (defaults to 0.55 × master).
