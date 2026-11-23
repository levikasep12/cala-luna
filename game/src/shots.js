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
  // Wait in GAME seconds, not wall seconds: the first frames are slow
  // (shader compile) and dt is clamped to 50ms, so a wall-clock wait
  // would fire before the scene has actually moved.
  const waitGame = (seconds, note) => {
    const t0 = g.time;
    const wall0 = performance.now();
    const tick = () => {
      // Wall-clock fallback: if the game loop stalls (tab throttled,
      // shader compile), the shot still releases after 8s.
      if (g.time - t0 >= seconds || performance.now() - wall0 > 8000) setReady(note);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  g.startGame({ skipIntro: true });

  if (name === 'start') {
    g.showTitle();
    g.weather.setHour(17.5);
    setReady('title screen over golden-hour Cala Luna');
    return;
  }

  if (name === 'chase') {
    // Cover: 4-star pursuit, roadblock ahead, helicopter above, sports
    // car at speed on a downtown avenue, mission objective live.
    g.weather.setHour(17.4);
    g.missions.jobIndex = 3;
    g.missions.start();
    g.hud.showBanner('', 0.01); // the objective bar already names the job; keep the road clear
    g.player.cash = 12450;
    // On the street at z=-30 (streets run at -330+60k; z=0 is mid-block).
    const car = new Vehicle(g.scene, 'sports', -60, -30, 0);
    car.driver = 'player';
    car.speed = 42;
    g.worldCars.push(car);
    g.player.enterCar(car);
    g.player.setWeapon('pistol');
    g.police.setStars(4);
    // Two pursuit cars wide across the lanes — visible at the frame
    // edges, flanking the player's car instead of covering it. (A third
    // unit spawns from the tier system on its own.)
    for (const [dx, dz] of [[-22, -9], [-26, 9]]) {
      const u = new Vehicle(g.scene, 'police', car.pos.x + dx, car.pos.z + dz, 0);
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
    g.camera.pitch = 0.22;
    g.camera.distBoost = 6;
    g.camera.heightBoost = 2;
    g.camera.snapTo(g.player.pos, g.player.heading);
    g.hud.say('Ines', 'Roadblock on Meridian, helicopter overhead. Punch it, Luz — the marina is ninety seconds out.');
    waitGame(1.4, 'chase: 4 stars, roadblock, heli, Harbor Run live, 151 km/h');
    return;
  }

  if (name === 'street') {
    // On foot in Old Town: on the sidewalk facing the street, with
    // pedestrians, traffic and a taxi fare waiting.
    g.weather.setHour(17.6);
    g.hud.showBanner('', 0.01);
    // On the avenue at x=-210 (a real road: on the road, never inside
    // a building footprint), facing the intersection at z=-210.
    g.player.pos.set(-210, 0, -180);
    g.player.heading = Math.PI / 2; // face -z, down the avenue
    g.player.group.position.copy(g.player.pos);
    g.player.group.rotation.y = -g.player.heading;
    g.camera.snapTo(g.player.pos, g.player.heading);
    g.player.cash = 3250;
    g.sidejobs.startTaxi();
    g.traffic.ensureCount(16, g.player.pos);
    g.pedestrians.ensureCount(26, g.player.pos);
    // Life in the frame: a taxi coming down the avenue toward the
    // player, a sedan crossing the intersection, two people walking.
    g.traffic.spawnAt(-213, -220, -Math.PI / 2, 'taxi');
    g.traffic.spawnAt(-170, -207, Math.PI, 'sedan');
    g.pedestrians.spawnAt(-203, -190);
    g.pedestrians.spawnAt(-217, -200);
    g.hud.say('Dispatcher', 'Fare at the Old Town rank. The Marina run pays double tonight.');
    waitGame(1.2, 'street: on foot, taxi fare, pedestrians, traffic');
    return;
  }

  if (name === 'mission') {
    // Bank Job: on foot with the pistol out, facing the bank floor
    // where the guards wait, crew recruited, 4 stars, heli overhead.
    g.weather.setHour(17.2);
    g.missions.jobIndex = 5;
    g.missions.start();
    g.hud.showBanner('', 0.01);
    g.missions.stepIndex = 1;
    g.missions._beginStep();
    g.player.pos.set(90, 0, -122);
    g.player.heading = Math.PI / 2; // face the bank floor and the guards
    g.player.group.position.copy(g.player.pos);
    g.player.group.rotation.y = -g.player.heading;
    g.camera.snapTo(g.player.pos, g.player.heading);
    g.player.setWeapon('pistol');
    g.player.ammo.pistol = 42;
    g.player.cash = 18750;
    g.player.armor = 60;
    g.police.setStars(4);
    // Parked pursuit cars flanking the bank approach — they hold
    // position instead of ramming the player mid-shot.
    for (const [x, z, h] of [[78, -128, 0], [102, -128, Math.PI]]) {
      const u = new Vehicle(g.scene, 'police', x, z, h);
      u.driver = 'police';
      u.parked = true;
      g.police.units.push(u);
    }
    g.crew.recruit('ines');
    g.hud.showBanner('', 0.01);
    g.traffic.ensureCount(10, g.player.pos);
    g.pedestrians.ensureCount(12, g.player.pos);
    g.pedestrians.scareAt(g.player.pos, 80);
    g.hud.say('Marco', 'Four guards on the floor. Drop them, grab the cash — chopper is two minutes out.');
    waitGame(1.8, 'mission: Bank Job shootout, 4 stars, crew, pistol');
    return;
  }

  setReady('unknown shot: ' + name);
}
