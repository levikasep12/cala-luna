// CALA LUNA — shots: staged scenes for the entry's screenshots.
// ?shot=chase|street|mission|start&seed=N sets the world to a moment
// that shows the game at its best, then sets window.__shotReady so the
// screenshot driver knows the frame is ready. All four are real gameplay
// states, not mockups: the same systems run, the scene is only arranged.
// Each scene is its own staging function, picked from a table by name;
// the ready signal waits in game seconds, because the first frames are
// slow (shader compile) and dt is clamped to 50ms.

import { Vehicle } from './vehicles.js';

export const SHOT_NAMES = ['chase', 'street', 'mission', 'start'];

// The staging function for each scene name.
const SHOT_STAGES = {
  start: stageStart,
  chase: stageChase,
  street: stageStreet,
  mission: stageMission,
};

export function applyShot(game, name) {
  game.startGame({ skipIntro: true });
  const stage = SHOT_STAGES[name];
  if (!stage) {
    setReady('unknown shot: ' + name);
    return;
  }
  stage(game);
}

function setReady(note) {
  window.__shotReady = true;
  window.__shotNote = note;
}

// Wait in GAME seconds, not wall seconds: the first frames are slow
// (shader compile) and dt is clamped to 50ms, so a wall-clock wait
// would fire before the scene has actually moved.
function waitGame(game, seconds, note) {
  const t0 = game.time;
  const wall0 = performance.now();
  const tick = () => {
    // Wall-clock fallback: if the game loop stalls (tab throttled,
    // shader compile), the shot still releases after 8s.
    if (game.time - t0 >= seconds || performance.now() - wall0 > 8000) setReady(note);
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// The banner is cleared on staged scenes: the objective bar already
// names the job, and the banner would sit over the road.
function clearBanner(game) {
  game.hud.showBanner('', 0.01);
}

function stageStart(game) {
  game.showTitle();
  game.weather.setHour(17.5);
  setReady('title screen over golden-hour Cala Luna');
}

// Cover: 4-star pursuit, roadblock ahead, helicopter above, sports car
// at speed on a downtown avenue, mission objective live.
function stageChase(game) {
  const g = game;
  g.weather.setHour(17.4);
  g.missions.jobIndex = 3;
  g.missions.start();
  clearBanner(g);
  g.player.cash = 12450;
  const car = chaseCar(g);
  chasePolice(g, car);
  g.shotCruise = 42; // keep the getaway speed up while the scene is staged
  g.traffic.ensureCount(14, g.player.pos);
  g.pedestrians.ensureCount(18, g.player.pos);
  g.pedestrians.scareAt(g.player.pos, 60);
  g.camera.yaw = 0;
  g.camera.pitch = 0.22;
  g.camera.distBoost = 6;
  g.camera.heightBoost = 2;
  g.camera.snapTo(g.player.pos, g.player.heading);
  g.hud.say('Ines', 'Roadblock on Meridian, helicopter overhead. Punch it, Luz — the marina is ninety seconds out.');
  waitGame(g, 1.4, 'chase: 4 stars, roadblock, heli, Harbor Run live, 151 km/h');
}

// Luz in a Vortex GT at speed, on the street at z=-30 (streets run at
// -330+60k; z=0 is mid-block).
function chaseCar(g) {
  const car = new Vehicle(g.scene, 'sports', -60, -30, 0);
  car.driver = 'player';
  car.speed = 42;
  g.worldCars.push(car);
  g.player.enterCar(car);
  g.player.setWeapon('pistol');
  return car;
}

// The pursuit: 4 stars, two units flanking the player's car, a roadblock
// across the avenue ahead, and the helicopter spawning on its own.
function chasePolice(g, car) {
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
  g.police._spawnRoadblock(g.player.pos, 0, 90);
  // The helicopter spawns from the police update loop at 4 stars.
  g.police.spawnTimer = 0;
}

// On foot in Old Town: on the sidewalk facing the street, with
// pedestrians, traffic and a taxi fare waiting.
function stageStreet(game) {
  const g = game;
  g.weather.setHour(17.6);
  clearBanner(g);
  // On the avenue at x=-210 (a real road: on the road, never inside
  // a building footprint), facing the intersection at z=-210.
  g.player.pos.set(-210, 0, -180);
  g.player.heading = Math.PI / 2; // face -z, down the avenue
  g.player.group.position.copy(g.player.pos);
  g.player.group.rotation.y = -g.player.heading;
  g.camera.snapTo(g.player.pos, g.player.heading);
  g.player.cash = 3250;
  stageStreetFare(g);
  g.traffic.ensureCount(16, g.player.pos);
  g.pedestrians.ensureCount(26, g.player.pos);
  // Life in the frame: a taxi coming down the avenue toward the
  // player, a sedan crossing the intersection, two people walking.
  g.traffic.spawnAt(-213, -220, -Math.PI / 2, 'taxi');
  g.traffic.spawnAt(-170, -207, Math.PI, 'sedan');
  g.pedestrians.spawnAt(-203, -190);
  g.pedestrians.spawnAt(-217, -200);
  g.hud.say('Dispatcher', 'Fare at the Old Town rank. The Marina run pays double tonight.');
  waitGame(g, 1.2, 'street: on foot, Old Town rank to Marina fare, pedestrians, traffic');
}

// The fare is deterministic here: pickup at the Old Town rank, dropoff
// at the Marina promenade — the same run the dispatcher's line
// describes. A random fare could point anywhere and the waypoint would
// land off-frame.
function stageStreetFare(g) {
  g.sidejobs.startTaxi();
  const fare = g.sidejobs.taxi;
  fare.pickup = [-240, -240];
  fare.dropoff = [240, 120];
  fare.vip = false;
  fare.fare = 120 + Math.round(Math.hypot(480, 360) / 10) * 15;
  g.hud.setObjective(`Taxi fare: pick up in ${g.city.districtAt(-240, -240).name} — $${fare.fare}`);
}

// Bank Job: on foot with the pistol out, facing the bank floor where
// the guards wait, crew recruited, 4 stars, heli overhead.
function stageMission(game) {
  const g = game;
  g.weather.setHour(17.2);
  g.missions.jobIndex = 5;
  g.missions.start();
  clearBanner(g);
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
  clearBanner(g);
  g.traffic.ensureCount(10, g.player.pos);
  g.pedestrians.ensureCount(12, g.player.pos);
  g.pedestrians.scareAt(g.player.pos, 80);
  g.hud.say('Marco', 'Four guards on the floor. Drop them, grab the cash — chopper is two minutes out.');
  waitGame(g, 1.8, 'mission: Bank Job shootout, 4 stars, crew, pistol');
}
