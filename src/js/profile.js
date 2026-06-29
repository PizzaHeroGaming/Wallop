// =====================================================================
// META PROGRESSION — persistent profile, catalog of unlocks, "Slices" currency
// =====================================================================

const PROFILE_KEY = 'wallop_profile_v1';
const PROFILE_VERSION = 2;

// =====================================================================
// ARENAS — themed visual palettes that swap at run start.
// Each entry contains everything renderer.js, world.js, and terrain.js
// need to apply the look of that arena.  Terrain SHAPE is identical
// across arenas (so collision and movement stay consistent); only
// colors, sky, fog, lights, and prop tints change.
// Slugs are forever — once shipped, never rename.
// =====================================================================
export const ARENAS = {
  pepperoni_pines: {
    slug: 'pepperoni_pines', name: 'Pepperoni Pines', icon: '🌲',
    desc: 'A lush green forest. Where every Pizza Hero begins.',
    defaultUnlocked: true, order: 1, unlocksFrom: null,
    sky:    { top: '#3a72b8', mid: '#7aafd8', low: '#cfe2f0', bottom: '#f5e9c8', wisp: '#ffffff' },
    fog:    { color: 0xcfe2f0, density: 0.008 },
    lights: { sun: 0xfff4d4, sunIntensity: 1.0, rim: 0xffd6a8, hemiSky: 0xc7e3ff, hemiGround: 0x4a7c2a },
    ground: { base: '#5a9a4a', accent1: '#4a863c', accent2: '#6eaa5a', accent3: '#569648', flowers: ['#ff5a9c', '#ffd23f', '#9d6dff', '#ff9230', '#ffffff'] },
    grass:  0x4ea03f, fern: 0x2f7d3e, log: 0x6a3818, logCap: 0xa07a48, mushroomCaps: [0xc8302e, 0xd0a32e, 0x9c5a18],
    sceneryTint: null,                    // no tint — use original GLB colors
    treeWeights: { leafy: 0.65, pine: 0.25, bare: 0.10 },
    distantHillHueRange: [0.30, 0.35], distantHillSat: 0.30, distantHillLig: 0.48,
    // Beginner arena — no in-arena obstacles
    terrain: { obstacles: 0 },
  },
  sundried_slopes: {
    slug: 'sundried_slopes', name: 'Sundried Slopes', icon: '🍂',
    desc: 'Autumn descends. Trees go gold, winds turn cold.',
    order: 2, unlocksFrom: 'pepperoni_pines',
    sky:    { top: '#6b3a78', mid: '#c45a48', low: '#ffb070', bottom: '#ffd494', wisp: '#ffaa6e' },
    fog:    { color: 0xd8b890, density: 0.009 },
    // Sun intensity lowered (1.10 → 0.85) and hemisphere ground darkened
    // so warm lighting doesn't push the brown ground into glowing-red territory
    lights: { sun: 0xffb86e, sunIntensity: 0.85, rim: 0xff7a3c, hemiSky: 0xeeb878, hemiGround: 0x5a3820 },
    // Ground darkened + desaturated (was fluorescent red/orange, washed cape out).
    // New palette reads as warm dry earth + dust, contrasting both the green
    // and red of the Pizza Hero outfit.
    ground: { base: '#6a4222', accent1: '#553318', accent2: '#7a5230', accent3: '#5e3a1c', flowers: ['#ff5a1f', '#ffaa3a', '#d4a838', '#a83820', '#ffd07a'] },
    grass:  0xa07a3a, fern: 0x6a4020, log: 0x3e2008, logCap: 0x6a4220, mushroomCaps: [0xa83018, 0xd07a2a, 0x6a3a14],
    sceneryTint: 0xc89868,                // warm dusty tan tint
    treeWeights: { leafy: 0.30, pine: 0.20, bare: 0.50 },
    distantHillHueRange: [0.05, 0.10], distantHillSat: 0.40, distantHillLig: 0.42,
    // Rocky autumn terrain — sandstone boulders scattered across the full
    // arena (was capped at radius 48 / 80 — left the outer ring empty)
    terrain: {
      obstacles: 26,
      kind: 'boulder',
      minR: 8, maxR: 74,
      scaleRange: [1.6, 3.2],
      color: 0x8a5a3a,
    },
  },
  frostbite_glacier: {
    slug: 'frostbite_glacier', name: 'Frostbite Glacier', icon: '🧊',
    desc: 'Snow blankets every slope. Cold seeps into your crust.',
    order: 3, unlocksFrom: 'sundried_slopes',
    sky:    { top: '#3a5a90', mid: '#7ea4c8', low: '#b8cfde', bottom: '#d2e2ee', wisp: '#ffffff' },
    // Darker, denser fog so distance reads as cold mist rather than white void
    fog:    { color: 0x8aa5b8, density: 0.011 },
    // Sun intensity dropped 0.95 → 0.7; hemisphere ground darkened so the
    // pale ground isn't lit into pure white from all sides at once
    lights: { sun: 0xe0eeff, sunIntensity: 0.70, rim: 0x7ea4c8, hemiSky: 0xbacde4, hemiGround: 0x4a5a6a },
    // Mid-tone icy blue-gray ground with proper contrast — was near-white
    // (#dde8f0) and washing everything out under the cool sun
    ground: { base: '#7c93a8', accent1: '#5e7488', accent2: '#9aaec0', accent3: '#506478', flowers: ['#ffffff', '#a8c8ee', '#e0e8f0', '#c8d4e8', '#ffffff'] },
    grass:  0x8ca0b4, fern: 0x6a7e92, log: 0x3a3025, logCap: 0x6a5e4e, mushroomCaps: [0xc8d8ec, 0x8aa0b8, 0x586878],
    sceneryTint: 0x88aacc,                // deeper cool blue tint
    treeWeights: { leafy: 0.10, pine: 0.60, bare: 0.30 },
    distantHillHueRange: [0.55, 0.60], distantHillSat: 0.18, distantHillLig: 0.42,
    // Brutal icy maze — tall narrow ice spires distributed across the full
    // arena (was capped at radius 50 / 80 — left the outer ring empty)
    terrain: {
      obstacles: 34,
      kind: 'spire',
      minR: 8, maxR: 74,
      scaleRange: [1.0, 2.2],
      color: 0xb8e0ff,
      emissive: 0x224466,
    },
  },
};

// Difficulty rank for arena unlock check (Normal+ unlocks the next arena)
const _DIFFICULTY_RANK = { easy: 0, normal: 1, hard: 2, extreme: 3 };

// Catalog of every unlockable in the game, grouped by category.
export const CATALOG = {
  characters: [
    {
      slug: 'pizza_hero',
      name: 'Pizza Hero',
      icon: '🍕',
      desc: 'The Pizza Delivery Hero. Starts with Pizza Toss. Balanced damage and survivability.',
      defaultUnlocked: true,
    },
    {
      slug: 'frost_baker',
      name: 'Frost Baker',
      icon: '🧊',
      desc: 'Ice specialist. Starts with Ice Cone. Cold effects last 50% longer. Unique: Blizzard + Frost Shell.',
      sliceCost: 200,
    },
    {
      slug: 'oven_knight',
      name: 'Oven Knight',
      icon: '🧱',
      desc: 'Heavy tank. Starts with Wallop Aura. +4 armor, +25 max HP, slower movement. Unique: Forge Hammer + Iron Hide.',
      sliceCost: 350,
    },
    {
      slug: 'crust_runner',
      name: 'Crust Runner',
      icon: '🏃',
      desc: 'Speed demon. Starts with Pepperoni Boomerang. +35% speed, double jump, -15% cooldowns. Unique: Star Shower + Turbo Soles.',
      sliceCost: 500,
    },
    {
      slug: 'anchovy_archer',
      name: 'Anchovy Archer',
      icon: '🏹',
      desc: 'Long-range purist. Starts with Crossbow Bolt. +15% crit, +30% crit dmg, +1 pierce, -10 max HP. Unique: Tomahawk Anchovy + Sniper\'s Cloak.',
      sliceCost: 600,
    },
    {
      slug: 'stealth_slice',
      name: 'Stealth Slice',
      icon: '🥷',
      desc: 'Late-night delivery shadow. Starts with Smoke Bomb. +15% dodge, +20% damage, +10% speed, -15 max HP. Unique: Shadow Slice + Phantom Hood.',
      sliceCost: 750,
    },
  ],

  weapons: [
    { slug: 'pizza',     gameRef: 'pizza',     defaultUnlocked: true },
    { slug: 'aura',      gameRef: 'aura',      defaultUnlocked: true },
    { slug: 'orbit',     gameRef: 'orbit',     defaultUnlocked: true },
    { slug: 'thunder',   gameRef: 'thunder',   defaultUnlocked: true },
    { slug: 'shock',     gameRef: 'shock',     defaultUnlocked: true },
    { slug: 'fire',      gameRef: 'fire',      defaultUnlocked: true },
    { slug: 'boomerang', gameRef: 'boomerang', defaultUnlocked: true },
    { slug: 'calzone',   gameRef: 'calzone',   defaultUnlocked: true },
    { slug: 'ice',       gameRef: 'ice',       defaultUnlocked: true },
    { slug: 'crossbow',  gameRef: 'crossbow',  defaultUnlocked: true },
    { slug: 'smoke',     gameRef: 'smoke',     defaultUnlocked: true },
    { slug: 'staff',     gameRef: 'staff',     defaultUnlocked: true },
    // Character-unique weapons — free for their owner; other chars unlock at 1500 kills then purchase
    { slug: 'deep_dish',        gameRef: 'deep_dish',        characterUnique: 'pizza_hero',     killThreshold: 7500, sliceCost: 250 },
    { slug: 'blizzard',         gameRef: 'blizzard',         characterUnique: 'frost_baker',    killThreshold: 7500, sliceCost: 250 },
    { slug: 'forge_hammer',     gameRef: 'forge_hammer',     characterUnique: 'oven_knight',    killThreshold: 7500, sliceCost: 300 },
    { slug: 'star_shower',      gameRef: 'star_shower',      characterUnique: 'crust_runner',   killThreshold: 7500, sliceCost: 300 },
    { slug: 'tomahawk_anchovy', gameRef: 'tomahawk_anchovy', characterUnique: 'anchovy_archer', killThreshold: 7500, sliceCost: 325 },
    { slug: 'shadow_slice',     gameRef: 'shadow_slice',     characterUnique: 'stealth_slice',  killThreshold: 7500, sliceCost: 325 },
    {
      slug: 'meatball_minigun',
      name: 'Meatball Minigun', icon: '🍝',
      gameRef: 'meatball_minigun', sliceCost: 150,
    },
    {
      slug: 'cheese_whip',
      name: 'Cheese Whip', icon: '🧀',
      gameRef: 'cheese_whip', sliceCost: 200,
    },
    {
      slug: 'olive_railgun',
      name: 'Olive Railgun', icon: '🫒',
      gameRef: 'olive_railgun', sliceCost: 300,
    },
  ],

  armor: [
    { slug: 'plate',  gameRef: 'plate',  defaultUnlocked: true },
    { slug: 'helmet', gameRef: 'helmet', defaultUnlocked: true },
    { slug: 'shield', gameRef: 'shield', defaultUnlocked: true },
    { slug: 'vamp',   gameRef: 'vamp',   defaultUnlocked: true },
    { slug: 'boots',  gameRef: 'boots',  defaultUnlocked: true },
    { slug: 'thorns', gameRef: 'thorns', defaultUnlocked: true },
    // Character-unique armors — free for their owner; other chars unlock at 1500 kills then purchase
    { slug: 'delivery_bag',  gameRef: 'delivery_bag',  characterUnique: 'pizza_hero',     killThreshold: 7500, sliceCost: 200 },
    { slug: 'frost_shell',   gameRef: 'frost_shell',   characterUnique: 'frost_baker',    killThreshold: 7500, sliceCost: 200 },
    { slug: 'iron_hide',     gameRef: 'iron_hide',     characterUnique: 'oven_knight',    killThreshold: 7500, sliceCost: 275 },
    { slug: 'turbo_soles',   gameRef: 'turbo_soles',   characterUnique: 'crust_runner',   killThreshold: 7500, sliceCost: 250 },
    { slug: 'snipers_cloak', gameRef: 'snipers_cloak', characterUnique: 'anchovy_archer', killThreshold: 7500, sliceCost: 275 },
    { slug: 'phantom_hood',  gameRef: 'phantom_hood',  characterUnique: 'stealth_slice',  killThreshold: 7500, sliceCost: 275 },
    {
      slug: 'mirror_vest',
      name: 'Mirror Vest', icon: '🪞',
      gameRef: 'mirror_vest', sliceCost: 150,
    },
    {
      slug: 'phoenix_apron',
      name: 'Phoenix Apron', icon: '🔥',
      gameRef: 'phoenix_apron', sliceCost: 300,
    },
  ],

  tomes: [
    { slug: 'power',    gameRef: 'power',    defaultUnlocked: true },
    { slug: 'swift',    gameRef: 'swift',    defaultUnlocked: true },
    { slug: 'fortune',  gameRef: 'fortune',  defaultUnlocked: true },
    { slug: 'wisdom',   gameRef: 'wisdom',   defaultUnlocked: true },
    { slug: 'spectral', gameRef: 'spectral', defaultUnlocked: true },
    { slug: 'warding',  gameRef: 'warding',  defaultUnlocked: true },
    { slug: 'hunter',   gameRef: 'hunter',   defaultUnlocked: true },
    { slug: 'cursed',   gameRef: 'cursed',   defaultUnlocked: true },
    {
      slug: 'tome_of_echoes',
      gameRef: 'tome_of_echoes',
      sliceCost: 200,
    },
    {
      slug: 'tome_of_time',
      gameRef: 'tome_of_time',
      sliceCost: 250,
    },
  ],

  boosts: [
    {
      slug: 'boost_damage',
      name: 'Sharper Crust', icon: '⚔️',
      desc: '+5% damage at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5, defaultUnlocked: true,
    },
    {
      slug: 'boost_health',
      name: 'Hearty Dough', icon: '❤️',
      desc: '+10 max HP at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5, defaultUnlocked: true,
    },
    {
      slug: 'boost_armor',
      name: 'Toasted Hide', icon: '🛡️',
      desc: '+1 armor at the start of every run, per level.',
      sliceCost: 150, maxLevel: 5, defaultUnlocked: true,
    },
    {
      slug: 'boost_speed',
      name: 'Quick Hands', icon: '⚡',
      desc: '+5% move speed at the start of every run, per level.',
      sliceCost: 150, maxLevel: 5, defaultUnlocked: true,
    },
    {
      slug: 'boost_xp',
      name: 'Fast Learner', icon: '📈',
      desc: '+10% XP gain at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5, defaultUnlocked: true,
    },
    {
      slug: 'boost_gold',
      name: 'Coin Magnet', icon: '💰',
      desc: '+10% gold gain at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5, defaultUnlocked: true,
    },
    {
      slug: 'boost_revive',
      name: 'Spare Slice', icon: '💝',
      desc: 'Start each run with one auto-revive. Survive a lethal hit at 1 HP!',
      sliceCost: 500, maxLevel: 1, defaultUnlocked: true,
    },
  ],
};

// Profile state: what the player has, what they've unlocked, current Slices.
export const Profile = (function () {
  function defaultProfile() {
    return {
      version: PROFILE_VERSION,
      slices: 0,
      unlocked: {},
      boostLevels: {},
      equippedCharacter: 'pizza_hero',
      equippedArena: 'pepperoni_pines',
      stats: {
        runsPlayed: 0,
        runsWon: 0,
        totalKills: 0,
        bestTime: 0,
      },
      // Legacy field kept in sync (read-only) for backwards compat with any
      // older callers; new code should use arenaProgress.<arena>.clearedStages.
      clearedStages: { 1: false, 2: false, 3: false },
      arenaProgress: {
        pepperoni_pines:   { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null },
        sundried_slopes:   { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null },
        frostbite_glacier: { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null },
      },
      unlockedArenas: { pepperoni_pines: true },
      itemKills: {},
      completedChallenges: {},
      // Audio prefs — persisted across sessions, defaults match "low + on"
      audioMuted: false,
      audioVolume: 0.4,
      // First-run tutorial (move + camera). Set true once the player has either
      // completed or skipped the tutorial so it never shows again.
      tutorialDone: false,
      // Watch-ad-for-slices on-demand reward: daily-capped. Tracks the date of
      // the last grant and how many have been claimed today.
      adSlicesDate: '',
      adSlicesCount: 0,
    };
  }
  function migrate(saved) {
    if (!saved) return defaultProfile();
    // V1 → V2: copy legacy clearedStages into arenaProgress.pepperoni_pines and
    // initialize the new arena fields.  Preserve all other progression data.
    if (saved.version === 1) {
      const def = defaultProfile();
      const migrated = { ...def, ...saved, version: PROFILE_VERSION };
      migrated.arenaProgress = {
        pepperoni_pines: {
          clearedStages: {
            1: !!(saved.clearedStages && saved.clearedStages[1]),
            2: !!(saved.clearedStages && saved.clearedStages[2]),
            3: !!(saved.clearedStages && saved.clearedStages[3]),
          },
          // Mark migrated full clears as 'normal' (safe default — we don't know
          // what difficulty the legacy run used, but Normal is the unlock floor).
          bestDifficulty: (saved.clearedStages && saved.clearedStages[3]) ? 'normal' : null,
        },
        sundried_slopes:   { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null },
        frostbite_glacier: { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null },
      };
      migrated.unlockedArenas = { pepperoni_pines: true };
      // If the player already cleared stage 3 on the legacy single arena, unlock
      // sundried_slopes immediately so progression isn't lost on migration.
      if (migrated.arenaProgress.pepperoni_pines.clearedStages[3]) {
        migrated.unlockedArenas.sundried_slopes = true;
      }
      if (!migrated.equippedArena) migrated.equippedArena = 'pepperoni_pines';
      return migrated;
    }
    if (saved.version !== PROFILE_VERSION) return defaultProfile();
    return saved;
  }
  function load() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return defaultProfile();
      return migrate(JSON.parse(raw));
    } catch (e) {
      return defaultProfile();
    }
  }
  let _state = load();
  // Dev mode was removed. Auto-revert anyone still flagged into it (restore their
  // real profile snapshot) so they're not stranded with a god-mode save.
  if (_state && _state.devMode) {
    try {
      const snapRaw = localStorage.getItem('wallop_dev_snapshot_v1');
      if (snapRaw) _state = JSON.parse(snapRaw);
    } catch (e) {}
    if (_state) _state.devMode = false;
    try { localStorage.removeItem('wallop_dev_snapshot_v1'); } catch (e) {}
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(_state)); } catch (e) {}
  }
  function get() { return _state; }
  function save() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(_state)); }
    catch (e) {}
  }
  function isUnlocked(slug) {
    for (const cat of Object.values(CATALOG)) {
      const entry = cat.find(e => e.slug === slug);
      if (entry) {
        if (entry.defaultUnlocked) return true;
        return !!_state.unlocked[slug];
      }
    }
    return false;
  }
  function unlock(slug) {
    _state.unlocked[slug] = true;
    save();
  }
  function spendSlices(n) {
    if (_state.slices < n) return false;
    _state.slices -= n;
    save();
    return true;
  }
  function addSlices(n) {
    _state.slices += n;
    save();
  }
  function getBoostLevel(slug) { return _state.boostLevels[slug] || 0; }
  function setBoostLevel(slug, lvl) { _state.boostLevels[slug] = lvl; save(); }
  function setEquippedCharacter(slug) {
    if (isUnlocked(slug)) {
      _state.equippedCharacter = slug;
      save();
    }
  }
  function clearStage(n) {
    if (!_state.clearedStages) _state.clearedStages = {};
    if (!_state.clearedStages[n]) {
      _state.stats.runsWon = (_state.stats.runsWon || 0) + 1;
    }
    _state.clearedStages[n] = true;
    save();
  }
  function isStageCleared(n) {
    return !!(_state.clearedStages && _state.clearedStages[n]);
  }
  // ── Arena progression helpers ──
  function _ensureArenaProgress() {
    if (!_state.arenaProgress) _state.arenaProgress = {};
    for (const slug of Object.keys(ARENAS)) {
      if (!_state.arenaProgress[slug]) {
        _state.arenaProgress[slug] = { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null };
      }
    }
    if (!_state.unlockedArenas) _state.unlockedArenas = { pepperoni_pines: true };
  }
  function isArenaUnlocked(slug) {
    const def = ARENAS[slug];
    if (!def) return false;
    if (def.defaultUnlocked) return true;
    _ensureArenaProgress();
    return !!_state.unlockedArenas[slug];
  }
  function getArenaProgress(slug) {
    _ensureArenaProgress();
    return _state.arenaProgress[slug] || { clearedStages: { 1: false, 2: false, 3: false }, bestDifficulty: null };
  }
  // Per-arena difficulty gating. Easy + Normal are always available; Hard
  // unlocks once you've fully cleared Normal on that arena, Extreme once you've
  // cleared Hard on it. Uses the per-arena bestDifficulty already tracked by
  // recordArenaClear.
  function isDifficultyUnlocked(arenaSlug, difficulty) {
    const rank = _DIFFICULTY_RANK[difficulty] ?? _DIFFICULTY_RANK.normal;
    if (rank <= _DIFFICULTY_RANK.normal) return true;        // easy + normal: always
    const best = _DIFFICULTY_RANK[getArenaProgress(arenaSlug).bestDifficulty] ?? -1;
    return best >= rank - 1;                                  // hard←normal, extreme←hard
  }
  function recordStageClear(arenaSlug, stageNum) {
    _ensureArenaProgress();
    const ap = _state.arenaProgress[arenaSlug];
    if (!ap) return;
    ap.clearedStages[stageNum] = true;
    // Mirror to legacy clearedStages so old callers keep working for the
    // *currently equipped* arena's progress only.
    if (arenaSlug === (_state.equippedArena || 'pepperoni_pines')) {
      if (!_state.clearedStages) _state.clearedStages = {};
      _state.clearedStages[stageNum] = true;
    }
    save();
  }
  function getNextArena(slug) {
    for (const k of Object.keys(ARENAS)) {
      if (ARENAS[k].unlocksFrom === slug) return k;
    }
    return null;
  }
  // Records the player's full-arena clear (stage 3 boss kill).  If the run was
  // on Normal+, unlocks the next arena.  Returns the slug of any newly-unlocked
  // arena (so the UI can announce it), or null.
  function recordArenaClear(arenaSlug, difficulty) {
    _ensureArenaProgress();
    const ap = _state.arenaProgress[arenaSlug];
    if (!ap) return null;
    ap.clearedStages[3] = true;
    // Track best difficulty cleared
    const newRank = _DIFFICULTY_RANK[difficulty] ?? -1;
    const oldRank = _DIFFICULTY_RANK[ap.bestDifficulty] ?? -1;
    if (newRank > oldRank) ap.bestDifficulty = difficulty;
    // Increment global runsWon once per arena's first stage 3 clear
    _state.stats.runsWon = (_state.stats.runsWon || 0) + 1;
    let newlyUnlocked = null;
    // Normal+ unlocks the next arena
    if (newRank >= _DIFFICULTY_RANK.normal) {
      const next = getNextArena(arenaSlug);
      if (next && !_state.unlockedArenas[next]) {
        _state.unlockedArenas[next] = true;
        newlyUnlocked = next;
      }
    }
    save();
    return newlyUnlocked;
  }
  function setEquippedArena(slug) {
    if (isArenaUnlocked(slug)) {
      _state.equippedArena = slug;
      save();
    }
  }
  function getEquippedArena() {
    return _state.equippedArena || 'pepperoni_pines';
  }
  function addItemKill(slug) {
    if (!_state.itemKills) _state.itemKills = {};
    _state.itemKills[slug] = (_state.itemKills[slug] || 0) + 1;
    // batched save — caller should call save() at run-end
  }
  function getItemKills(slug) {
    return (_state.itemKills && _state.itemKills[slug]) || 0;
  }
  function reset() {
    _state = defaultProfile();
    save();
  }

  // ── Challenges ──
  function isChallengeCompleted(id) {
    return !!(_state.completedChallenges && _state.completedChallenges[id]);
  }
  // Marks a challenge as completed. Returns true if this was the FIRST completion
  // (so callers know whether to grant the slice reward — challenges only pay out once).
  function markChallengeCompleted(id) {
    if (!_state.completedChallenges) _state.completedChallenges = {};
    if (_state.completedChallenges[id]) { save(); return false; }
    _state.completedChallenges[id] = true;
    save();
    return true;
  }

  return {
    get, save, isUnlocked, unlock, spendSlices, addSlices,
    getBoostLevel, setBoostLevel, setEquippedCharacter,
    clearStage, isStageCleared,
    isArenaUnlocked, getArenaProgress, isDifficultyUnlocked, recordStageClear, recordArenaClear,
    getNextArena, setEquippedArena, getEquippedArena,
    addItemKill, getItemKills,
    reset,
    isChallengeCompleted, markChallengeCompleted,
    isTutorialDone, markTutorialDone,
    adSlicesRemainingToday, recordAdSliceWatch,
  };

  function isTutorialDone() { return !!_state.tutorialDone; }
  function markTutorialDone() { _state.tutorialDone = true; save(); }

  // ── Watch-ad-for-slices (on-demand, daily-capped) ──
  function _todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function adSlicesRemainingToday() {
    if (_state.adSlicesDate !== _todayStr()) return AD_SLICES_DAILY_CAP; // new day → full allowance
    return Math.max(0, AD_SLICES_DAILY_CAP - (_state.adSlicesCount || 0));
  }
  function recordAdSliceWatch() {
    const today = _todayStr();
    if (_state.adSlicesDate !== today) { _state.adSlicesDate = today; _state.adSlicesCount = 0; }
    _state.adSlicesCount = (_state.adSlicesCount || 0) + 1;
    save();
  }
})();
const AD_SLICES_DAILY_CAP = 10;

// ============================================================
// CHALLENGES — handcrafted run-modifier objectives.  Data only.
// The actual setup/check logic lives in game.js CHALLENGE_LOGIC[id]
// where it has access to player + gameState + WEAPONS.
// ============================================================
export const CHALLENGES = [
  {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    icon: '💥',
    desc: 'Start with 40% max HP and +50% damage. Survive to 6:00.',
    reward: 100,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    icon: '⚡',
    desc: 'Defeat the Sauce Slinger within 30s of its arrival — before 3:30.',
    reward: 150,
  },
  {
    id: 'slaughterhouse',
    name: 'Slaughterhouse',
    icon: '💀',
    desc: 'Reach 200 kills within the first 4:00.',
    reward: 125,
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    icon: '👻',
    desc: 'Survive to 4:00 WITHOUT taking a single point of damage.',
    reward: 250,
  },
  {
    id: 'pizza_purist',
    name: 'Pizza Purist',
    icon: '🍕',
    desc: 'Beat the Sauce Slinger using only Pizza Toss (no other weapons offered).',
    reward: 200,
  },

  // ── More any-character challenges ──
  {
    id: 'double_trouble',
    name: 'Double Trouble',
    icon: '👹',
    desc: 'Defeat the Sauce Slinger AND the Hammer Chef before 7:00.',
    reward: 200,
  },
  {
    id: 'level_rush',
    name: 'Level Rush',
    icon: '📈',
    desc: 'Reach character level 20 before 5:00.',
    reward: 125,
  },

  // ── Character-specific challenges ──
  // `requiresChar` gates the card: it stays LOCKED until that character is
  // unlocked, and launching it force-equips that character for the run.
  {
    id: 'bullseye',
    name: 'Bullseye',
    icon: '🎯',
    desc: 'As the Anchovy Archer: defeat the Sauce Slinger before 3:30.',
    reward: 200,
    requiresChar: 'anchovy_archer',
  },
  {
    id: 'cold_snap',
    name: 'Cold Snap',
    icon: '❄️',
    desc: 'As the Frost Baker: defeat the Sauce Slinger before 3:45.',
    reward: 175,
    requiresChar: 'frost_baker',
  },
  {
    id: 'immovable',
    name: 'Immovable',
    icon: '🛡️',
    desc: 'As the Oven Knight: survive to 7:00.',
    reward: 200,
    requiresChar: 'oven_knight',
  },
  {
    id: 'hit_and_run',
    name: 'Hit & Run',
    icon: '💨',
    desc: 'As the Crust Runner: reach 150 kills before 3:30.',
    reward: 175,
    requiresChar: 'crust_runner',
  },
  {
    id: 'night_shift',
    name: 'Night Shift',
    icon: '🌙',
    desc: 'As the Stealth Slice: survive to 4:30 without taking a single hit.',
    reward: 225,
    requiresChar: 'stealth_slice',
  },
];

// Note: STAT_UPGRADES and SYNERGY_UPGRADES are defined in upgrades.js (not here)
// because their apply() closures reference `player` from entities.js.
// Both ui.js and game.js import them from upgrades.js.
