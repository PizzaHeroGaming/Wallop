// upgrades.js — STAT_UPGRADES and SYNERGY_UPGRADES
// These live here (not in profile.js) because their apply() closures
// reference `player` from entities.js, which would create a circular dep
// if placed in profile.js.
import { player } from './entities.js?v=1e8bc6f';

export const STAT_UPGRADES = [
  // Core combat
  { id: 'dmg', name: 'Bonk Power', icon: '💪', desc: '+18% damage to all sources', max: 6,
    apply: () => { player.damageMult += 0.18; } },
  { id: 'cd', name: 'Reflexes', icon: '⚡', desc: '-12% cooldowns', max: 6,
    apply: () => { player.cooldownMult *= 0.88; } },
  { id: 'crit', name: 'Sharp', icon: '🎯', desc: '+7% crit chance', max: 6,
    apply: () => { player.critChance += 0.07; } },
  { id: 'critdmg', name: 'Brutal', icon: '🔪', desc: '+0.4x crit damage', max: 4,
    apply: () => { player.critMult += 0.4; } },
  { id: 'projsize', name: 'Embiggen', icon: '🔮', desc: '+12% projectile size', max: 4,
    apply: () => { player.projectileMult *= 1.12; } },
  { id: 'aoe', name: 'Wide Bonk', icon: '💫', desc: '+15% AOE radius', max: 4,
    apply: () => { player.aoeMult *= 1.15; } },
  { id: 'duration', name: 'Long Reach', icon: '🪃', desc: '+25% projectile lifetime', max: 4,
    apply: () => { player.durationMult *= 1.25; } },
  { id: 'extraproj', name: 'Multi', icon: '➕', desc: '+1 extra projectile', max: 2,
    apply: () => { player.extraProjectiles += 1; } },
  { id: 'pierce', name: 'Pierce', icon: '🏹', desc: '+1 projectile pierce', max: 3,
    apply: () => { player.projectilePierce += 1; } },
  { id: 'knockback', name: 'Stagger', icon: '👊', desc: '+50% knockback', max: 3,
    apply: () => { player.knockback *= 1.5; } },

  // Defensive layer
  { id: 'maxhp', name: 'Tough', icon: '❤️', desc: '+25 max HP, full heal', max: 5,
    apply: () => { player.maxHp += 25; player.hp = player.maxHp; } },
  { id: 'regen', name: 'Regen', icon: '✨', desc: '+1 HP/sec', max: 5,
    apply: () => { player.hpRegen += 1; } },
  { id: 'armor', name: 'Armor', icon: '🛡️', desc: '+3 damage reduction', max: 5,
    apply: () => { player.armor += 3; } },
  { id: 'shield', name: 'Shield', icon: '❖', desc: '+30 shield (regenerates)', max: 4,
    apply: () => { player.shieldMax += 30; player.shield = player.shieldMax; } },
  { id: 'lifesteal', name: 'Vampiric', icon: '🩸', desc: '+3% lifesteal', max: 4,
    apply: () => { player.lifesteal += 0.03; } },
  { id: 'doublejump', name: 'Hops', icon: '🦘', desc: 'Double jump', max: 1,
    apply: () => { player.maxJumps = 2; } },

  // Mobility
  { id: 'speed', name: 'Sprint', icon: '👟', desc: '+10% move speed', max: 5,
    apply: () => { player.baseSpeed *= 1.10; } },

  // Economy / Holy Trinity
  { id: 'xp', name: 'XP Tome', icon: '📘', desc: '+25% XP gain', max: 5,
    apply: () => { player.xpGain *= 1.25; } },
  { id: 'pickup', name: 'Magnet', icon: '🧲', desc: '+50% pickup range', max: 4,
    apply: () => { player.pickupRange *= 1.5; } },
  { id: 'gold', name: 'Greed Tome', icon: '💰', desc: '+30% gold drops', max: 4,
    apply: () => { player.goldMult *= 1.30; } },
  { id: 'luck', name: 'Luck Tome', icon: '🍀', desc: '+1 Luck (better drops)', max: 5,
    apply: () => { player.luck += 1; } },
  { id: 'curse', name: 'Cursed Tome', icon: '☠️', desc: '+1 Curse: enemies hit harder, but drops improve dramatically', max: 5,
    apply: () => { player.curse += 1; } },
];

export const SYNERGY_UPGRADES = [
  // Pizza Toss branches
  { id: 'syn_pizza_pierce', name: 'Stuffed Crust', icon: '🍕', weaponId: 'pizza', minLevel: 2,
    desc: 'Pizzas pierce 2 additional enemies.',
    apply: () => { player.synergies.pizzaPierce = 2; } },
  { id: 'syn_pizza_seek', name: 'Hot & Ready', icon: '🍕', weaponId: 'pizza', minLevel: 4,
    desc: 'Pizzas gently home in on the nearest target.',
    apply: () => { player.synergies.pizzaSeek = true; } },
  // Aura branches
  { id: 'syn_aura_rage', name: 'Berserk Aura', icon: '💢', weaponId: 'aura', minLevel: 2,
    desc: 'Aura damage doubles below 50% HP.',
    apply: () => { player.synergies.auraRage = true; } },
  // Orbit branches
  { id: 'syn_orbit_speed', name: 'Dervish', icon: '🌀', weaponId: 'orbit', minLevel: 2,
    desc: 'Pizza slices spin 60% faster.',
    apply: () => { player.synergies.orbitSpeed = true; } },
  { id: 'syn_orbit_pierce', name: 'Saw Blades', icon: '🪚', weaponId: 'orbit', minLevel: 3,
    desc: 'Pizza slices can hit each enemy twice as often.',
    apply: () => { player.synergies.orbitPierce = true; } },
  // Thunder branches
  { id: 'syn_thunder_chain', name: 'Lightning Rod', icon: '⛓️', weaponId: 'thunder', minLevel: 2,
    desc: 'Thunder bolts chain to a nearby enemy for 50% damage.',
    apply: () => { player.synergies.thunderChain = true; } },
  { id: 'syn_thunder_mega', name: 'Eye of the Storm', icon: '🌩️', weaponId: 'thunder', minLevel: 3,
    desc: 'Every 4th bolt is a megabolt: 3x damage and bigger area.',
    apply: () => { player.synergies.thunderMega = true; } },
  // Shockwave branches
  { id: 'syn_shock_after', name: 'Aftershock', icon: '⚡', weaponId: 'shock', minLevel: 2,
    desc: 'Ground Pound triggers a second smaller shockwave.',
    apply: () => { player.synergies.shockAfter = true; } },
  // Fireball branches
  { id: 'syn_fire_burn', name: 'Ignition', icon: '🔥', weaponId: 'fire', minLevel: 2,
    desc: 'Fireballs leave burning ground that damages enemies inside.',
    apply: () => { player.synergies.fireBurn = true; } },
  { id: 'syn_fire_split', name: 'Pyromaniac', icon: '🔥', weaponId: 'fire', minLevel: 3,
    desc: 'Fireballs split into 4 smaller bombs on impact.',
    apply: () => { player.synergies.fireSplit = true; } },
];
