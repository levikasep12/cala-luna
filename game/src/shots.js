// CALA LUNA — shots: staged scenes for the entry's screenshots.
// ?shot=chase|street|mission|start&seed=N sets the world to a moment
// that shows the game at its best, then sets window.__shotReady so the
// screenshot driver knows the frame is ready. All four are real gameplay
// states, not mockups: the same systems run, the scene is only arranged.

import { Vehicle } from './vehicles.js';

export const SHOT_NAMES = ['chase', 'street', 'mission', 'start'];

export function applyShot(game, name) {
  const g = game;
  const setReady = (note) => {
    window.__shotReady = true;
    window.__shotNote = note;
  };
  g.startGame({ skipIntro: true });

  if (name === 'start') {
    g.showTitle();
    g.weather.setHour(18.4);
    setReady('title screen over golden-hour Cala Luna');
    return;
  }

  if (name === 'chase') {
    // Cover: 4-star pursuit, roadblock ahead, helicopter above, sports
    // car at speed on a downtown avenue, mission objective live.
    g.weather.setHour(18.35);
    g.missions.jobIndex = 3;
    g.missions.start();
    g.player.cash = 12450;
    const car = new Vehicle(g.scene, 'sports', -60, 0, 0);
    car.driver = 'player';
    car.speed = 42;
    g.worldCars.push(car);
    g.player.enterCar(car);
    g.player.setWeapon('pistol');
    g.police.setStars(4);
    // Two pursuit cars tucked behind, one ahead.
    for (const [dx, dz, h] of [[-14, -3.5, 0], [-20, 3.5, 0], [30, -3.5, Math.PI]]) {
      const u = new Vehicle(g.scene, 'police', car.pos.x + dx, car.pos.z + dz, h);
      u.driver = 'police';
      u.speed = 40;
      g.police.units.push(u);
    }
    // A roadblock across the avenue ahead.
    g.police._spawnRoadblock(g.player.pos, 0, 90);
    // The helicopter spawns from the police update loop at 4 stars.
    g.police.spawnTimer = 0;
    // Keep the getaway speed up while the scene is staged.
    g.shotCruise = 42;
    g.traffic.ensureCount(14, g.player.pos);
    g.pedestrians.ensureCount(18, g.player.pos);
    g.pedestrians.scareAt(g.player.pos, 60);
    g.camera.yaw = 0;
    g.hud.say('Ines', 'Roadblock on Meridian, helicopter overhead. Punch it, Luz — the marina is ninety seconds out.');
    setTimeout(() => setReady('chase: 4 stars, roadblock, heli, Harbor Run live, 151 km/h'), 900);
    return;
  }

  if (name === 'street') {
    // On foot in Old Town: pedestrians, traffic, a taxi fare waiting.
    g.weather.setHour(17.6);
    g.player.pos.set(-240, 0, -240);
    g.player.heading = Math.PI / 4;
    g.player.group.position.copy(g.player.pos);
    g.player.group.rotation.y = -g.player.heading;
    g.player.cash = 3250;
    g.sidejobs.startTaxi();
    g.traffic.ensureCount(16, g.player.pos);
    g.pedestrians.ensureCount(26, g.player.pos);
    g.hud.say('Dispatcher', 'Fare at the Old Town rank. The Marina run pays double tonight.');
    setTimeout(() => setReady('street: on foot, taxi fare, pedestrians, traffic'), 1200);
    return;
  }

  if (name === 'mission') {
    // Bank Job: on foot with the pistol out, guards down, crew beside
    // the player, 4 stars and the vault cash in sight.
    g.weather.setHour(19.1);
    g.missions.jobIndex = 5;
    g.missions.start();
    g.missions.stepIndex = 1;
    g.missions._beginStep();
    g.player.pos.set(90, 0, -120);
    g.player.heading = Math.PI;
    g.player.group.position.copy(g.player.pos);
    g.player.group.rotation.y = -g.player.heading;
    g.player.setWeapon('pistol');
    g.player.ammo.pistol = 42;
    g.player.cash = 18750;
    g.player.armor = 60;
    g.police.setStars(4);
    for (const [dx, dz, h] of [[-12, -8, 0], [-18, 6, 0]]) {
      const u = new Vehicle(g.scene, 'police', 90 + dx, -120 + dz, h);
      u.driver = 'police';
      g.police.units.push(u);
    }
    g.crew.recruit('ines');
    g.traffic.ensureCount(10, g.player.pos);
    g.pedestrians.ensureCount(12, g.player.pos);
    g.pedestrians.scareAt(g.player.pos, 80);
    g.hud.say('Marco', 'Guards are down, vault is open. Grab the cash and run — chopper is two minutes out.');
    setTimeout(() => setReady('mission: Bank Job shootout, 4 stars, crew, pistol'), 1400);
    return;
  }

  setReady('unknown shot: ' + name);
}
