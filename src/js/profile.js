// =====================================================================
// META PROGRESSION — persistent profile, catalog of unlocks, "Slices" currency
// =====================================================================

const PROFILE_KEY = 'wallop_profile_v1';
const PROFILE_VERSION = 1;

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
      icon: '🛡️',
      desc: 'Heavy tank. Starts with Wallop Aura. +4 armor, +25 max HP, slower movement. Unique: Forge Hammer + Iron Hide.',
      sliceCost: 350,
    },
    {
      slug: 'crust_runner',
      name: 'Crust Runner',
      icon: '👟',
      desc: 'Speed demon. Starts with Pepperoni Boomerang. +35% speed, double jump, -15% cooldowns. Unique: Star Shower + Turbo Soles.',
      sliceCost: 500,
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
    // Character-unique weapons (available only to their character, or after 1500 weapon kills)
    { slug: 'deep_dish',    gameRef: 'deep_dish',    characterUnique: 'pizza_hero',   killThreshold: 1500 },
    { slug: 'blizzard',     gameRef: 'blizzard',     characterUnique: 'frost_baker',  killThreshold: 1500 },
    { slug: 'forge_hammer', gameRef: 'forge_hammer', characterUnique: 'oven_knight',  killThreshold: 1500 },
    { slug: 'star_shower',  gameRef: 'star_shower',  characterUnique: 'crust_runner', killThreshold: 1500 },
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
    // Character-unique armors
    { slug: 'delivery_bag', gameRef: 'delivery_bag', characterUnique: 'pizza_hero',   killThreshold: 1500 },
    { slug: 'frost_shell',  gameRef: 'frost_shell',  characterUnique: 'frost_baker',  killThreshold: 1500 },
    { slug: 'iron_hide',    gameRef: 'iron_hide',    characterUnique: 'oven_knight',  killThreshold: 1500 },
    { slug: 'turbo_soles',  gameRef: 'turbo_soles',  characterUnique: 'crust_runner', killThreshold: 1500 },
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
      name: 'Tome of Echoes', icon: '📜',
      desc: 'COMING SOON — Every 10th projectile fires a free duplicate.',
      placeholder: true, sliceCost: 200,
    },
    {
      slug: 'tome_of_time',
      name: 'Tome of Time', icon: '⏳',
      desc: 'COMING SOON — Slows enemies briefly when you take damage.',
      placeholder: true, sliceCost: 250,
    },
  ],

  boosts: [
    {
      slug: 'boost_damage',
      name: 'Sharper Crust', icon: '⚔️',
      desc: '+5% damage at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5,
    },
    {
      slug: 'boost_health',
      name: 'Hearty Dough', icon: '❤️',
      desc: '+10 max HP at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5,
    },
    {
      slug: 'boost_armor',
      name: 'Toasted Hide', icon: '🛡️',
      desc: '+1 armor at the start of every run, per level.',
      sliceCost: 150, maxLevel: 5,
    },
    {
      slug: 'boost_speed',
      name: 'Quick Hands', icon: '⚡',
      desc: '+5% move speed at the start of every run, per level.',
      sliceCost: 150, maxLevel: 5,
    },
    {
      slug: 'boost_xp',
      name: 'Fast Learner', icon: '📈',
      desc: '+10% XP gain at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5,
    },
    {
      slug: 'boost_gold',
      name: 'Coin Magnet', icon: '💰',
      desc: '+10% gold gain at the start of every run, per level.',
      sliceCost: 100, maxLevel: 5,
    },
    {
      slug: 'boost_revive',
      name: 'Spare Slice', icon: '💝',
      desc: 'Start each run with one auto-revive. Survive a lethal hit at 1 HP!',
      sliceCost: 500, maxLevel: 1,
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
      stats: {
        runsPlayed: 0,
        runsWon: 0,
        totalKills: 0,
        bestTime: 0,
      },
      clearedStages: { 1: false, 2: false, 3: false },
      itemKills: {},
    };
  }
  function migrate(saved) {
    if (!saved || saved.version !== PROFILE_VERSION) {
      return defaultProfile();
    }
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
  return {
    get, save, isUnlocked, unlock, spendSlices, addSlices,
    getBoostLevel, setBoostLevel, setEquippedCharacter,
    clearStage, isStageCleared,
    addItemKill, getItemKills,
    reset,
  };
})();

// Note: STAT_UPGRADES and SYNERGY_UPGRADES are defined in upgrades.js (not here)
// because their apply() closures reference `player` from entities.js.
// Both ui.js and game.js import them from upgrades.js.
