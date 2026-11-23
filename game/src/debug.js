// CALA LUNA — debug: the window.__game hook the screenshot driver and
// play-testers use. Read-only state plus a few safe cheats (cash, stars,
// teleport) that never ship into the dossier as gameplay.

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
        crew: game.crew.count,
        territory: `${game.territory.heldCount}/${game.territory.total}`,
        hour: game.weather.clockString(),
        fps: Math.round(game.fps),
      };
    },
    giveCash(n) { game.player.cash += n; return game.player.cash; },
    setStars(n) { game.police.setStars(n); return game.police.stars; },
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
