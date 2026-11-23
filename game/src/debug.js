// CALA LUNA — debug: the window.__game hook the screenshot driver and
// play-testers use. Read-only state plus a few safe cheats (cash, stars,
// teleport) that never ship into the dossier as gameplay. The snapshot
// is built in sections — Luz, the world around her, the mission, the
// systems — and each cheat is a small function that takes the game and
// returns what changed.

import { WEAPONS } from './config.js';

export function installDebugHook(game) {
  window.__game = {
    state: () => collectState(game),
    giveCash: (n) => { game.player.cash += n; return game.player.cash; },
    setCash: (n) => { game.player.cash = Math.max(0, Math.floor(n)); return game.player.cash; },
    setStars: (n) => { game.police.setStars(n); return game.police.stars; },
    giveWeapon: (id) => giveWeapon(game, id),
    giveAll: () => giveAll(game),
    skipJob: () => skipJob(game),
    heal: () => { game.player.heal(100); game.player.armor = 100; return game.player.health; },
    setHour: (h) => { game.weather.setHour(h); return game.weather.clockString(); },
    teleport: (x, z) => teleport(game, x, z),
    startJob: (i) => { game.missions.jobIndex = i; game.missions.start(); return game.missions.job.name; },
  };
}

// The full read-only snapshot: Luz, the world, the mission, the systems.
function collectState(game) {
  const p = game.player;
  return {
    ready: true,
    screen: game.screen,
    ...luzState(game, p),
    ...worldState(game, p),
    ...missionState(game),
    ...systemsState(game),
    fps: Math.round(game.fps),
  };
}

// Luz: cash, health, gear, where she is and what she is driving.
function luzState(game, p) {
  return {
    cash: p.cash,
    health: p.health,
    armor: p.armor,
    stamina: Math.round(p.stamina),
    medkits: p.medkits,
    ammo: { ...p.ammo },
    inCar: p.inCar,
    car: p.inCar ? p.car.type : null,
    speedKmh: Math.round(p.speedKmh),
    weapon: p.weapon,
    px: Math.round(p.pos.x), pz: Math.round(p.pos.z),
  };
}

// The world around her: district, traffic, peds, the heat.
function worldState(game, p) {
  return {
    district: game.city.districtAt(p.pos.x, p.pos.z).name,
    stars: game.police.stars,
    traffic: game.traffic.all().length,
    peds: game.pedestrians.peds.length,
    police: game.police.allUnits().length,
    heli: !!game.police.heli,
    roadblocks: game.police.roadblocks.length,
    rb: game.police.roadblocks.map((r) => r.cars.map((c) => [Math.round(c.pos.x), Math.round(c.pos.z)])),
    heliPos: game.police.heli ? [Math.round(game.police.heli.group.position.x), Math.round(game.police.heli.group.position.z)] : null,
  };
}

// The mission: which job, which step, what the HUD is showing.
function missionState(game) {
  return {
    mission: game.missions.job ? game.missions.job.name : 'none',
    step: game.missions.step ? game.missions.step.label : 'none',
    objective: game.hud.objective,
  };
}

// The systems: crew, garage, territory, the clock.
function systemsState(game) {
  return {
    crew: game.crew.count,
    crewReady: game.crew.readyAbility(),
    garage: game.garage.stored.length,
    territory: `${game.territory.heldCount}/${game.territory.total}`,
    hour: game.weather.clockString(),
  };
}

function giveWeapon(game, id) {
  if (!WEAPONS[id]) return null;
  const p = game.player;
  p.owned.add(id);
  p.ammo[id] = 999;
  p.setWeapon(id);
  return p.weapon;
}

// Full loadout for play-testing: every weapon, full ammo, armor.
function giveAll(game) {
  const p = game.player;
  for (const id of Object.keys(WEAPONS)) {
    if (id === 'fists') continue;
    p.owned.add(id);
    p.ammo[id] = WEAPONS[id].ammo;
  }
  p.armor = 100;
  p.medkits = 3;
  p.setWeapon('rifle');
  return [...p.owned];
}

// Skip the current job and start the next one (play-testing only).
function skipJob(game) {
  if (game.missions.done) return 'done';
  game.missions.active = false;
  game.missions._clearMarker();
  game.combat.clearEnemies();
  game.missions.jobIndex++;
  game.missions.start();
  return game.missions.job ? game.missions.job.name : 'done';
}

function teleport(game, x, z) {
  game.player.pos.set(x, 0, z);
  if (game.player.inCar) game.player.car.pos.set(x, 0, z);
  game.player.group.position.copy(game.player.pos);
  return [x, z];
}
