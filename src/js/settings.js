// settings.js — player-facing settings (display, controls, accessibility),
// persisted to localStorage under a key separate from the save Profile.
// Dependency-free on purpose (no game-module imports) so anything can read it
// without circular-import risk. Audio volume/mute stays in the Audio module
// (it persists to the Profile), so it's intentionally NOT duplicated here.

const KEY = 'wallop_settings_v1';

const DEFAULTS = {
  // Display — desktop/Electron only (hidden on web + mobile)
  displayMode: 'fullscreen',     // 'fullscreen' | 'borderless' | 'windowed'
  resolution: 'native',          // 'native' | '1920x1080' | ...
  fpsCap: 0,                      // 0 = unlimited (desktop); mobile is capped separately
  // Controls
  mouseSensitivity: 1.0,         // multiplier on mouse-look
  invertY: false,
  controllerEnabled: true,
  stickSensitivity: 1.0,         // right-stick camera speed multiplier
  vibration: true,
  // Accessibility / feel
  screenShake: true,
  reduceFlashes: false,          // dampen bloom + skip big screen flashes
  damageNumbers: true,
};

let _s = _load();

function _load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULTS };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(_s)); } catch (e) {}
}

export const Settings = {
  /** Read one setting. */
  get(k) { return _s[k]; },
  /** Write one setting + persist. */
  set(k, v) { _s[k] = v; save(); },
  /** The whole settings object (read-only intent). */
  all() { return _s; },
  /** Reset everything to defaults. */
  reset() { _s = { ...DEFAULTS }; save(); },
  DEFAULTS,
};
