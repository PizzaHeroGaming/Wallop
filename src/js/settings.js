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
  fpsCap: 0,                      // 0 = unlimited (desktop); mobile fps is governed by graphicsQuality
  graphicsQuality: 'balanced',    // 'battery' | 'balanced' | 'high' — caps fps + resolution + particles (mainly mobile heat/battery)
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
  // Key bindings — action → KeyboardEvent.code. Arrow keys stay as fixed
  // movement alternates in code, so these are the primary/remappable set.
  keybinds: {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE',
  },
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
  reset() { _s = JSON.parse(JSON.stringify(DEFAULTS)); save(); },
  /** Read one key binding (falls back to default per-action). */
  getBind(action) { return (_s.keybinds && _s.keybinds[action]) || DEFAULTS.keybinds[action]; },
  /** Set one key binding + persist. */
  setBind(action, code) {
    if (!_s.keybinds) _s.keybinds = { ...DEFAULTS.keybinds };
    _s.keybinds[action] = code;
    save();
  },
  DEFAULTS,
};
