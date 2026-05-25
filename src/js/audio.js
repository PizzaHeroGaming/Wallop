// audio.js — single-file sound system for WALLOP.
//
// Design goals:
//   - Tiny API: Audio.play('slug') plus Audio.setMuted / Audio.setVolume.
//   - No autoplay headaches: AudioContext starts suspended and resumes on the
//     first user gesture (the splash dismissal or any button click).
//   - Throttled so a wave of 50 pickup-pings doesn't sound like a slot machine
//     — per-slug + per-channel rate limit.
//   - Tied to Profile so mute + volume persist across sessions.
//
// Adding a sound:
//   1. Drop the .ogg into one of the kenney_*-audio packs (or any folder).
//   2. Add an entry to SFX (slug → { file, vol?, throttle?, channel? }).
//   3. Call Audio.play('your_slug') from wherever the trigger fires.

import { Profile } from './profile.js?v=f2f1a0b';

const _UI_BASE  = 'assets/kenney_ui-audio/Audio/';
const _RPG_BASE = 'assets/kenney_rpg-audio/Audio/';

// Sound registry — file paths picked from the Kenney UI + RPG packs.
// Per-clip overrides:
//   vol:      0-1, baseline volume before master multiplier (default 1.0)
//   throttle: minimum ms between two plays of THIS slug (default 80ms)
//   channel:  shared cooldown bucket so e.g. all pickup pings share rate-limit
const SFX = {
  // ── UI ──
  ui_click:        { file: _UI_BASE + 'click1.ogg',          vol: 0.55, throttle: 60 },
  ui_back:         { file: _UI_BASE + 'click4.ogg',          vol: 0.45, throttle: 60 },
  ui_levelup:      { file: _UI_BASE + 'switch7.ogg',         vol: 0.80, throttle: 0  },
  ui_unlock:       { file: _UI_BASE + 'switch4.ogg',         vol: 0.85, throttle: 0  },
  // ── Pickups (all share 'pickup' channel for global rate-limit) ──
  pickup_xp:       { file: _UI_BASE + 'switch24.ogg',        vol: 0.30, channel: 'pickup', throttle: 70 },
  pickup_gold:     { file: _RPG_BASE + 'handleCoins2.ogg',   vol: 0.45, channel: 'pickup', throttle: 90 },
  pickup_slice:    { file: _RPG_BASE + 'handleCoins.ogg',    vol: 0.65, channel: 'pickup', throttle: 120 },
  // ── Chest ──
  chest_open:      { file: _RPG_BASE + 'bookOpen.ogg',       vol: 0.75, throttle: 0  },
  chest_reveal:    { file: _UI_BASE + 'switch15.ogg',        vol: 0.65, throttle: 0  },
  // ── Boss ──
  boss_spawn_mini: { file: _RPG_BASE + 'creak2.ogg',         vol: 0.85, throttle: 0  },
  boss_spawn_big:  { file: _RPG_BASE + 'creak1.ogg',         vol: 0.95, throttle: 0  },
  boss_hit:        { file: _RPG_BASE + 'chop.ogg',           vol: 0.50, channel: 'enemy_hit', throttle: 110 },
  // ── Combat ──
  enemy_hit:       { file: _RPG_BASE + 'knifeSlice.ogg',     vol: 0.20, channel: 'enemy_hit', throttle: 140 },
  enemy_die:       { file: _RPG_BASE + 'cloth1.ogg',         vol: 0.30, channel: 'enemy_die', throttle: 180 },
  // ── Player ──
  player_hurt:     { file: _RPG_BASE + 'cloth3.ogg',         vol: 0.55, throttle: 350 },
  player_death:    { file: _RPG_BASE + 'bookClose.ogg',      vol: 0.85, throttle: 0  },
  stage_clear:     { file: _UI_BASE + 'switch12.ogg',        vol: 0.85, throttle: 0  },
  victory:         { file: _UI_BASE + 'switch4.ogg',         vol: 0.95, throttle: 0  },
};

// ── Music registry — per-arena looping background tracks ──
// Files are .ogg, loopable. Missing files fail silently (see _playMusicTrack).
const MUSIC = {
  pepperoni_pines:   { file: 'assets/music/pepperoni_pines.ogg',   vol: 0.55 },
  sundried_slopes:   { file: 'assets/music/sundried_slopes.ogg',   vol: 0.55 },
  frostbite_glacier: { file: 'assets/music/frostbite_glacier.ogg', vol: 0.55 },
};
const MUSIC_FADE_MS = 800;       // cross-fade duration when swapping tracks

// ── Internal state ──
let _ctx        = null;          // AudioContext, created lazily on first user gesture
let _masterGain = null;
const _buffers  = {};            // slug → AudioBuffer (or undefined while loading)
const _lastPlay = {};            // slug → epoch ms of last play (per-clip throttle)
const _lastChan = {};            // channel → epoch ms of last play (cross-clip throttle)
let _muted      = false;
let _volume     = 0.4;           // 0..1, master multiplier on top of per-clip vol
let _ready      = false;         // true once context is created + resumed
// Music state
let _musicEl    = null;          // currently-playing <audio> element (HTMLAudio for streaming)
let _musicSlug  = null;          // current arena slug or null
let _musicFadeTimer = null;      // raf-based fade scheduler

function _initFromProfile() {
  try {
    const p = Profile.get();
    if (typeof p.audioMuted === 'boolean') _muted = p.audioMuted;
    if (typeof p.audioVolume === 'number') _volume = Math.max(0, Math.min(1, p.audioVolume));
  } catch (e) { /* Profile may not be ready */ }
}

// Build the audio context on first user gesture (required by browsers).
// We attach the gesture listener once and bootstrap there.
function _ensureContext() {
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  _ctx = new Ctx();
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = _muted ? 0 : _volume;
  _masterGain.connect(_ctx.destination);
  _ready = true;
  // Suspended state is typical on iOS Safari + Chrome before any gesture.
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  // Kick off preloads now that we have a context to decode into.
  Object.keys(SFX).forEach(slug => _preload(slug));
  return _ctx;
}

function _preload(slug) {
  if (_buffers[slug] !== undefined) return;
  _buffers[slug] = null; // in-flight sentinel
  const entry = SFX[slug];
  if (!entry || !_ctx) return;
  fetch(entry.file)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(ab => _ctx.decodeAudioData(ab))
    .then(buf => { _buffers[slug] = buf; })
    .catch(err => {
      _buffers[slug] = undefined; // null → undefined so future plays can retry
      console.warn(`[WALLOP audio] failed to load ${slug} (${entry.file})`, err && err.message);
    });
}

function play(slug) {
  if (_muted || !_ready || !_ctx) return;
  const entry = SFX[slug];
  if (!entry) return;
  const buf = _buffers[slug];
  if (!buf) return; // not loaded yet — silently drop rather than queue
  const now = Date.now();
  const throttle = entry.throttle != null ? entry.throttle : 80;
  if (_lastPlay[slug] && now - _lastPlay[slug] < throttle) return;
  if (entry.channel) {
    const chCd = throttle; // channel cooldown = clip throttle by default
    if (_lastChan[entry.channel] && now - _lastChan[entry.channel] < chCd) return;
    _lastChan[entry.channel] = now;
  }
  _lastPlay[slug] = now;
  try {
    const src = _ctx.createBufferSource();
    src.buffer = buf;
    const gn = _ctx.createGain();
    gn.gain.value = entry.vol != null ? entry.vol : 1.0;
    src.connect(gn).connect(_masterGain);
    src.start(0);
  } catch (e) {
    console.warn(`[WALLOP audio] play failed for ${slug}`, e && e.message);
  }
}

function setMuted(m) {
  _muted = !!m;
  if (_masterGain) _masterGain.gain.value = _muted ? 0 : _volume;
  try {
    const p = Profile.get();
    p.audioMuted = _muted;
    Profile.save();
  } catch (e) {}
}

function setVolume(v) {
  _volume = Math.max(0, Math.min(1, v));
  if (_masterGain && !_muted) _masterGain.gain.value = _volume;
  try {
    const p = Profile.get();
    p.audioVolume = _volume;
    Profile.save();
  } catch (e) {}
}

function isMuted() { return _muted; }
function getVolume() { return _volume; }

// ── Music: looping background track keyed off arena slug ──
// Uses HTMLAudioElement (not Web Audio) so the browser can stream from disk
// rather than fully decode upfront — music files are large (~1-3 MB each).
// Volume is multiplied by master _volume so the About menu slider controls both.
function _stopMusicNow() {
  if (_musicFadeTimer) { cancelAnimationFrame(_musicFadeTimer); _musicFadeTimer = null; }
  if (_musicEl) { try { _musicEl.pause(); } catch (e) {} _musicEl = null; }
  _musicSlug = null;
}
function _crossfade(from, to, toTargetVol) {
  // Linear fade over MUSIC_FADE_MS. If a previous fade is mid-flight, override.
  if (_musicFadeTimer) cancelAnimationFrame(_musicFadeTimer);
  const start = performance.now();
  const fromStartVol = from ? from.volume : 0;
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / MUSIC_FADE_MS);
    if (from) from.volume = fromStartVol * (1 - t);
    if (to)   to.volume   = toTargetVol * t;
    if (t < 1) {
      _musicFadeTimer = requestAnimationFrame(tick);
    } else {
      _musicFadeTimer = null;
      if (from) { try { from.pause(); } catch (e) {} }
    }
  };
  _musicFadeTimer = requestAnimationFrame(tick);
}
function playMusic(slug) {
  const entry = MUSIC[slug];
  if (!entry) return;
  if (_musicSlug === slug && _musicEl && !_musicEl.paused) return; // already playing
  if (_muted) { _musicSlug = slug; return; } // remember intent; unmute will pick it up
  const next = new window.Audio(entry.file);
  next.loop   = true;
  next.volume = 0; // fade in via crossfade
  // Catch HTTP 404 / decode errors silently so a missing music file doesn't
  // break the game — log once for debugging.
  next.addEventListener('error', () => {
    console.warn(`[WALLOP audio] music file missing or undecodable: ${entry.file}`);
    if (_musicEl === next) _musicEl = null;
  }, { once: true });
  const playPromise = next.play();
  if (playPromise && playPromise.catch) playPromise.catch(() => {/* autoplay block — first gesture will retry */});
  const targetVol = entry.vol * _volume;
  _crossfade(_musicEl, next, targetVol);
  _musicEl = next;
  _musicSlug = slug;
}
function stopMusic() {
  if (!_musicEl) return;
  _crossfade(_musicEl, null, 0);
  _musicSlug = null;
  // _musicEl is nulled by the fade's final pause via callback
  setTimeout(() => { _musicEl = null; }, MUSIC_FADE_MS + 100);
}

// Override setMuted/setVolume to also retarget the music element.
const _setMutedBase = setMuted;
function _setMutedMusicAware(m) {
  _setMutedBase(m);
  if (_musicEl) _musicEl.volume = _muted ? 0 : (MUSIC[_musicSlug]?.vol || 0.5) * _volume;
  // If unmuting and there was a pending track from before, kick it off
  if (!_muted && _musicSlug && (!_musicEl || _musicEl.paused)) {
    const slug = _musicSlug; _musicSlug = null; playMusic(slug);
  }
}
const _setVolumeBase = setVolume;
function _setVolumeMusicAware(v) {
  _setVolumeBase(v);
  if (_musicEl && !_muted && _musicSlug) {
    _musicEl.volume = (MUSIC[_musicSlug]?.vol || 0.5) * _volume;
  }
}

// Attach a one-time gesture handler that boots the audio context.
// Many browsers require this — calling AudioContext() before any user
// interaction either errors or creates a permanently suspended context.
function _attachGestureBootstrap() {
  const boot = () => {
    _ensureContext();
    window.removeEventListener('pointerdown', boot);
    window.removeEventListener('keydown', boot);
    window.removeEventListener('touchstart', boot);
  };
  window.addEventListener('pointerdown', boot, { once: false });
  window.addEventListener('keydown',     boot, { once: false });
  window.addEventListener('touchstart',  boot, { once: false });
}

_initFromProfile();
_attachGestureBootstrap();

export const Audio = {
  play,
  setMuted: _setMutedMusicAware,
  setVolume: _setVolumeMusicAware,
  isMuted, getVolume,
  playMusic, stopMusic,
};
