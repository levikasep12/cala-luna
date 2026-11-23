// CALA LUNA — debug: the window.__game hook the screenshot driver and
// play-testers use. Read-only state plus a few safe cheats (cash, stars,
// teleport) that never ship into the dossier as gameplay.

import { WEAPONS } from './config.js';

export function installDebugHook(game) {
  window.__game = {
    state() {
      const p = game.player;
      return {
        ready: true,
        screen: game.screen,
        cash: p.cash,
        health: p.health,
        armor: p.armor,
        stamina: Math.round(p.stamina),
        stars: game.police.stars,
        inCar: p.inCar,
        car: p.inCar ? p.car.type : null,
        speedKmh: Math.round(p.speedKmh),
        weapon: p.weapon,
        mission: game.missions.job ? game.missions.job.name : 'none',
        step: game.missions.step ? game.missions.step.label : 'none',
        objective: game.hud.objective,
        traffic: game.traffic.all().length,
        peds: game.pedestrians.peds.length,
        police: game.police.allUnits().length,
        heli: !!game.police.heli,
        roadblocks: game.police.roadblocks.length,
        px: Math.round(p.pos.x), pz: Math.round(p.pos.z),
        rb: game.police.roadblocks.map(r => r.cars.map(c => [Math.round(c.pos.x), Math.round(c.pos.z)])),
        heliPos: game.police.heli ? [Math.round(game.police.heli.group.position.x), Math.round(game.police.heli.group.position.z)] : null,
        crew: game.crew.count,
        crewReady: game.crew.readyAbility(),
        garage: game.garage.stored.length,
        territory: `${game.territory.heldCount}/${game.territory.total}`,
        hour: game.weather.clockString(),
        fps: Math.round(game.fps),
      };
    },
    giveCash(n) { game.player.cash += n; return game.player.cash; },
    setStars(n) { game.police.setStars(n); return game.police.stars; },
    giveWeapon(id) {
      if (!WEAPONS[id]) return null;
      const p = game.player;
      p.owned.add(id);
      p.ammo[id] = 999;
      p.setWeapon(id);
      return p.weapon;
    },
    heal() { game.player.heal(100); game.player.armor = 100; return game.player.health; },
    setHour(h) { game.weather.setHour(h); return game.weather.clockString(); },
    teleport(x, z) {
      game.player.pos.set(x, 0, z);
      if (game.player.inCar) game.player.car.pos.set(x, 0, z);
      game.player.group.position.copy(game.player.pos);
      return [x, z];
    },
    startJob(i) {
      game.missions.jobIndex = i;
      game.missions.start();
      return game.missions.job.name;
    },
  };
}
