// CALA LUNA — main: the game itself. One Game object owns the
// renderer, the world and every system, and runs the frame loop. Each
// screen — title, pause, play — has its own frame handler, picked from
// a dispatch table every tick. The play frame runs a fixed pipeline:
// clocks, the death card, keys, movement, the world tick, the
// objective, the death check, then camera and HUD. Keys come from a
// binding table: one row per key, a mode (any, shop, play), and the
// method it calls — so the whole control scheme reads as a list.
// Everything the player can do — walk, drive, carjack, shoot, shop,
// store, race, save — is a verb here, wired to the systems that carry
// it out.

import * as THREE from 'three';
import { WORLD, PLAYER, SHOPS, RACES, SAVE_KEY } from './config.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { City } from './city.js';
import { Weather } from './weather.js';
import { Camera } from './camera.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { Missions } from './missions.js';
import { SideJobs } from './sidejobs.js';
import { Crew } from './crew.js';
import { Territory } from './territory.js';
import { Garage } from './garage.js';
import { Economy } from './economy.js';
import { Hud } from './hud.js';
import { Save } from './save.js';
import { applyShot } from './shots.js';
import { installDebugHook } from './debug.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed')) || WORLD.seed;
const SHOT = params.get('shot');

const SCREEN_IDS = ['start-screen', 'howto-screen', 'stats-screen', 'pause-screen'];
const AUTOSAVE_SEC = 30; // seconds between autosaves
const DEATH_CARD_SEC = 2.6; // seconds on the BUSTED / WASTED card

class Game {
  constructor() {
    this.screen = 'title';
    this.time = 0;
    this.fps = 60;
    this.stats = this._blankStats();
    this.worldCars = [];
    this.shopOpen = false;
    this.deadTimer = 0;
    this.saveTimer = 0;
    this.pedHitCooldown = 0;
    this.crashCooldown = 0;
    this._lastCash = PLAYER.startCash; // cashEarned counts every gain
    this._keys = this._keyBindings();
    this._screens = {
      title: (dt) => this._titleFrame(dt),
      menu: (dt) => this._titleFrame(dt),
      pause: () => this._pauseFrame(),
      play: (dt) => this._playFrame(dt),
    };

    this._makeRenderer();
    this._makeWorld();
    this.traffic.ensureCount(16, this.player.pos);
    this.pedestrians.ensureCount(24, this.player.pos);
    installDebugHook(this);
    this._wireMenus();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    if (SHOT) {
      applyShot(this, SHOT);
    } else {
      this.showTitle();
    }
  }

  _makeRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-root').appendChild(this.renderer.domElement);
  }

  // Every system, built in dependency order: the world first, then the
  // things that live in it, then the things that watch them.
  _makeWorld() {
    this.scene = new THREE.Scene();
    this.input = new Input();
    this.audio = new Audio();
    this.city = new City(this.scene, SEED);
    this.weather = new Weather(this.scene);
    this.camera = new Camera(this.scene, this.renderer);
    this.effects = new Effects(this.scene);
    this.player = new Player(this.scene, PLAYER.startPos);
    this.traffic = new Traffic(this.scene, this.city, SEED);
    this.pedestrians = new Pedestrians(this.scene, this.city, SEED);
    this.police = new Police(this.scene, this.city, this.audio);
    this.combat = new Combat(this.scene, this.audio, this.effects);
    this.missions = new Missions(this);
    this.sidejobs = new SideJobs(this);
    this.crew = new Crew(this);
    this.territory = new Territory(this);
    this.garage = new Garage(this);
    this.economy = new Economy(this);
    this.hud = new Hud();
  }

  // ---------- screens ----------
  _blankStats() {
    return {
      cashEarned: 0, missionsDone: 0, fares: 0, packages: 0, racesWon: 0,
      stunts: 0, carsStolen: 0, kills: 0, busted: 0, wasted: 0, playSeconds: 0,
      distanceKm: 0,
    };
  }

  _wireMenus() {
    const $ = (id) => document.getElementById(id);
    const bootAudio = () => { this.audio.init(); this.audio.resume(); this.audio.click(); };
    const buttons = [
      ['btn-play', () => { bootAudio(); Save.clear(); this.startGame({ fresh: true }); }],
      ['btn-continue', () => { bootAudio(); this.startGame({ fresh: false }); }],
      ['btn-howto', () => { this.audio.click(); this._show('howto-screen'); }],
      ['btn-howto-back', () => { this.audio.click(); this._show('start-screen'); }],
      ['btn-stats', () => {
        this.audio.click();
        $('stats-body').innerHTML = Save.statsText(this.stats);
        this._show('stats-screen');
      }],
      ['btn-stats-back', () => { this.audio.click(); this._show('start-screen'); }],
      ['btn-resume', () => { this.audio.click(); this.resume(); }],
      ['btn-restart-mission', () => { this.audio.click(); this.resume(); this.missions.restart(); }],
      ['btn-quit-title', () => { this.audio.click(); this.saveGame(); this.showTitle(); }],
    ];
    for (const [id, fn] of buttons) $(id).onclick = fn;
    if (!Save.exists()) $('btn-continue').style.display = 'none';
    // Alt-tabbing mid-job pauses the game: mission timers used to keep
    // running while the tab was hidden, and Luz came back to a fail.
    window.addEventListener('blur', () => { if (this.screen === 'play') this.pause(); });
  }

  _show(id) {
    for (const s of SCREEN_IDS) {
      document.getElementById(s).classList.toggle('hidden', s !== id);
    }
    if (id) this.screen = id === 'start-screen' ? 'title' : id === 'pause-screen' ? 'pause' : 'menu';
  }

  showTitle() {
    this.screen = 'title';
    this.hud.hide();
    this._show('start-screen');
    this.audio.stopMusic();
    this.audio.stopEngine();
  }

  startGame({ fresh, skipIntro = false }) {
    if (fresh) this._newGame();
    else {
      this._restore(Save.load());
      this._lastCash = this.player.cash;
    }
    this.screen = 'play';
    this._show(null);
    this.hud.show();
    this.audio.init();
    this.audio.resume();
    this.audio.startEngine();
    this.audio.startMusic();
    this.camera.snapTo(this.player.pos, this.player.heading);
    if (!this.missions.active && !this.missions.done) {
      this.missions.start();
    }
    if (!skipIntro) {
      this.hud.say('Luz', 'Cala Luna. Eight jobs between me and a clean slate. First: a fare in Old Town.');
      this.hud.setHint('Follow the yellow waypoint · T taxi · P package · G garage · Q crew ability');
    }
  }

  // A new game starts clean: a second PLAY in one page load used to
  // keep the old crew, territory, garage and mission progress.
  _newGame() {
    this.player.reset();
    this.missions.reset();
    this.crew.reset();
    this.territory.reset();
    this.garage.reset();
    this.sidejobs.reset();
    this.police.setStars(0);
    this.police.clearAll();
    this.combat.clearEnemies();
    this.stats = this._blankStats();
    this.shopOpen = false;
    this.deadTimer = 0;
    this._lastCash = PLAYER.startCash;
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    document.getElementById('pause-stats').innerHTML = Save.statsText(this.stats, [
      ['District', this.territory.statusText()],
      ['Crew', `${this.crew.count} members`],
      ['Garage', this.garage.statusText()],
    ]);
    this._show('pause-screen');
  }

  resume() {
    if (this.screen !== 'pause') return;
    this.screen = 'play';
    this._show(null);
    this.hud.show();
  }

  // ---------- save ----------
  saveGame() {
    Save.store(this._snapshot());
  }

  // Everything a continue needs: wallet, body, progress, garage,
  // turf, crew, loadout, lifetime stats, and where Luz stood.
  _snapshot() {
    const p = this.player;
    return {
      cash: p.cash,
      health: p.health,
      armor: p.armor,
      jobIndex: this.missions.jobIndex,
      jobsDone: [...this.missions.completedJobs],
      stored: this.garage.stored,
      territory: [...this.territory.held],
      crew: Object.keys(this.crew.members),
      owned: [...p.owned],
      ammo: p.ammo,
      medkits: p.medkits,
      stats: this.stats,
      pos: [p.pos.x, p.pos.z],
    };
  }

  _restore(save) {
    if (!save) return;
    const p = this.player;
    p.cash = save.cash ?? PLAYER.startCash;
    p.health = save.health ?? PLAYER.maxHealth;
    p.armor = save.armor ?? 0;
    this.missions.jobIndex = save.jobIndex ?? 0;
    this.missions.completedJobs = new Set(save.jobsDone || []);
    // Stored cars may be bare type strings from an older save; the
    // garage normalises them to {type, health} entries.
    this.garage.stored = Garage.normalize(save.stored);
    this.territory.held = new Set(save.territory || []);
    for (const id of save.crew || []) this.crew.recruit(id);
    p.owned = new Set(save.owned || ['fists', 'pistol']);
    p.ammo = save.ammo || p.ammo;
    p.medkits = save.medkits ?? 0;
    Object.assign(this.stats, save.stats || {});
    if (save.pos) {
      p.pos.set(save.pos[0], 0, save.pos[1]);
      p.group.position.copy(p.pos);
    }
  }

  // ---------- keys ----------
  // The whole control scheme as a table: code, the mode it lives in
  // ('any' = always live, 'shop' / 'play' = only in that mode), the
  // method it calls, and its argument. Rows run in order, so Escape
  // still wins the frame over everything below it.
  _keyBindings() {
    return [
      { code: 'Escape', mode: 'any', method: '_escape' },
      { code: 'KeyM', mode: 'any', method: '_toggleMute' },
      { code: 'KeyQ', mode: 'any', method: '_useAbility' },
      { code: 'KeyH', mode: 'any', method: '_honk' },
      { code: 'KeyC', mode: 'any', method: '_cycleCamera' },
      { code: 'KeyR', mode: 'any', method: '_restartOrRace' },
      { code: 'KeyT', mode: 'any', method: '_hailTaxi' },
      { code: 'KeyP', mode: 'any', method: '_runPackage' },
      { code: 'KeyG', mode: 'any', method: '_garageKey' },
      { code: 'KeyE', mode: 'shop', method: '_closeShop' },
      { code: 'Digit1', mode: 'shop', method: '_buy', arg: 'pistol' },
      { code: 'Digit2', mode: 'shop', method: '_buy', arg: 'shotgun' },
      { code: 'Digit3', mode: 'shop', method: '_buy', arg: 'rifle' },
      { code: 'Digit4', mode: 'shop', method: '_buy', arg: 'armor' },
      { code: 'Digit5', mode: 'shop', method: '_buy', arg: 'medkit' },
      { code: 'Digit6', mode: 'shop', method: '_buy', arg: 'crate' },
      { code: 'Digit1', mode: 'play', method: '_arm', arg: 'fists' },
      { code: 'Digit2', mode: 'play', method: '_arm', arg: 'pistol' },
      { code: 'Digit3', mode: 'play', method: '_arm', arg: 'shotgun' },
      { code: 'Digit4', mode: 'play', method: '_arm', arg: 'rifle' },
      { code: 'Digit5', mode: 'play', method: '_useMedkit' },
      { code: 'KeyE', mode: 'play', method: '_interact' },
      { code: 'KeyF', mode: 'play', method: '_carjackKey' },
    ];
  }

  // Walk the binding table. Returns true when the frame should end
  // here (Escape paused the game). The mode is snapshotted at the
  // start of the frame: closing the shop with E must not cancel a
  // Digit pressed in the same frame, and opening it must not cancel F.
  _handleKeys() {
    const inShop = this.shopOpen;
    for (const b of this._keys) {
      if (b.mode === 'shop' && !inShop) continue;
      if (b.mode === 'play' && inShop) continue;
      if (!this.input.pressed(b.code)) continue;
      if (this[b.method](b.arg) === 'halt') return true;
    }
    if (this.shopOpen) this.hud.setObjective(this.economy.shopText());
    this._poiHint();
    return false;
  }

  _escape() {
    this.pause();
    return 'halt';
  }

  _toggleMute() {
    const muted = this.audio.toggleMute();
    this.hud.setHint(muted ? 'Sound muted' : 'Sound on');
  }

  _useAbility() { this.crew.useAbility(); }

  _honk() {
    if (!this.player.inCar) return;
    this.audio.horn();
    this.pedestrians.scareAt(this.player.pos, 15);
  }

  _cycleCamera() {
    const view = this.camera.cycleView();
    this.hud.setHint(`Camera: ${view}`);
  }

  // R restarts the live mission, or starts the race whose first
  // checkpoint Luz is standing near.
  _restartOrRace() {
    const p = this.player;
    if (this.missions.active) {
      this.missions.restart();
      return;
    }
    const race = RACES.find((r) => Math.hypot(p.pos.x - r.checkpoints[0][0], p.pos.z - r.checkpoints[0][1]) < 20);
    if (race) this.sidejobs.startRace(race.id);
  }

  _hailTaxi() { this.sidejobs.startTaxi(); }

  _runPackage() { this.sidejobs.startPackage(); }

  // G at the garage: store the car Luz is driving, or take the last
  // stored one back out.
  _garageKey() {
    const p = this.player;
    if (!this.garage.nearGarage(p)) return;
    if (p.inCar) this.garage.storeCurrentCar();
    else if (this.garage.stored.length) this.garage.takeOut(this.garage.stored.length - 1);
  }

  _closeShop() {
    this.shopOpen = false;
    this.hud.clearObjective();
  }

  _buy(item) { this.economy.buy(item); }

  _arm(weapon) { this.player.setWeapon(weapon); }

  // 5 spends a medkit from the pouch, with a word for each outcome.
  _useMedkit() {
    const p = this.player;
    const used = p.useMedkit();
    if (used === 'used') {
      this.effects.heal(p.pos);
      this.audio.pickup();
      this.hud.say('Luz', 'Patched up. Back to it.');
    } else if (used === 'empty') {
      this.hud.setHint('No medkits — buy one at Iron & Oak');
    } else {
      this.hud.setHint('Already at full health');
    }
  }

  // E on foot: step out of the car, open the shop, or climb into the
  // nearest car — in that order.
  _interact() {
    const p = this.player;
    if (p.inCar) p.exitCar();
    else if (this.economy.nearShop(p) && !this._findCar(4.5)) {
      this.shopOpen = true;
      this.hud.setObjective(this.economy.shopText());
    } else this._takeCar(false);
  }

  _carjackKey() {
    if (!this.player.inCar) this._takeCar(true);
  }

  // Hints near points of interest.
  _poiHint() {
    const p = this.player;
    if (!p.inCar && this.economy.nearShop(p)) {
      this.hud.setHint('Iron & Oak Guns — press E to shop', 0.5);
    } else if (this.garage.nearGarage(p)) {
      this.hud.setHint(p.inCar
        ? 'Wrench Garage — press G to store this car'
        : (this.garage.stored.length ? 'Wrench Garage — press G to take out a car' : 'Wrench Garage — bring a car worth keeping'), 0.5);
    }
  }

  // ---------- verbs ----------
  _findCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    const all = [...this.traffic.all(), ...this.worldCars, ...this.police.allUnits()];
    for (const c of all) {
      if (c === this.player.car) continue;
      const d = Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  _takeCar(carjack) {
    const car = this._findCar(4.5);
    if (!car) return false;
    const wasTraffic = this.traffic.all().includes(car);
    const wasPolice = this.police.allUnits().includes(car);
    if (wasTraffic) {
      this.traffic.cars.splice(this.traffic.cars.indexOf(car), 1);
      this.worldCars.push(car);
    }
    if (carjack || wasTraffic) {
      this.stats.carsStolen++;
      this.police.addStars(wasPolice ? 2 : 1, 'carjack');
      this.hud.say('Luz', wasPolice ? 'Borrowing a cop car. This is a terrible idea.' : 'Thanks for the ride. I\'ll bring it back. Probably.');
    }
    this.player.enterCar(car);
    this.audio.click();
    return true;
  }

  // Aim from the camera through the centre of the screen.
  _aim() {
    const dir = new THREE.Vector3();
    this.camera.camera.getWorldDirection(dir);
    const origin = this.camera.camera.position.clone();
    return origin.addScaledVector(dir, 55);
  }

  _fire() {
    const p = this.player;
    // Dry fire: an empty gun clicks and says where the ammo is, instead
    // of silently doing nothing while the player wonders why.
    if (p.weapon !== 'fists' && (p.ammo[p.weapon] || 0) <= 0) {
      this.audio.denied();
      this.hud.setHint('Out of ammo — Iron & Oak sells more');
      return 0;
    }
    if (p.weapon === 'fists') {
      // Fists hit through combat.playerShoot alone: the old code also
      // ran a second melee loop here, so every punch landed twice.
      const kills = this.combat.playerShoot(p, this._aim(), 0.016);
      this.stats.kills += kills;
      this.pedestrians.scareAt(p.pos, 20);
      return kills;
    }
    const before = this.combat.aliveCount();
    this.combat.playerShoot(p, this._aim(), 0.016);
    const kills = before - this.combat.aliveCount();
    this.stats.kills += kills;
    if (this.police.stars === 0 && kills === 0) this.police.addStars(1, 'shots fired');
    this.pedestrians.scareAt(p.pos, 40);
    this.camera.addShake(0.25);
    return kills;
  }

  _kill(kind) {
    const p = this.player;
    if (kind === 'busted') {
      this.stats.busted++;
      p.cash = Math.max(0, p.cash - 500);
      this.hud.showBusted('BUSTED', 'The CLPD caught up with Luz. $500 bail paid.');
    } else {
      this.stats.wasted++;
      p.cash = Math.max(0, Math.floor(p.cash / 2));
      this.hud.showBusted('WASTED', 'Luz woke up at the Marina clinic. Half the cash is gone.');
    }
    if (this.missions.active) this.missions.fail(kind === 'busted' ? 'Busted by the CLPD.' : 'Luz was wasted.');
    this.police.setStars(0);
    this.police.clearAll();
    this.deadTimer = DEATH_CARD_SEC;
  }

  _revive() {
    const p = this.player;
    this.hud.hideBusted();
    if (p.inCar) {
      p.car.dispose();
      const i = this.worldCars.indexOf(p.car);
      if (i >= 0) this.worldCars.splice(i, 1);
      p.car = null;
      p.group.visible = true;
    }
    p.pos.set(SHOPS.safehouse.at[0], 0, SHOPS.safehouse.at[1]);
    p.group.position.copy(p.pos);
    this.camera.snapTo(p.pos, p.heading);
    p.health = PLAYER.maxHealth;
    p.armor = 0;
    this.saveGame();
  }

  // ---------- frame ----------
  _loop(t) {
    requestAnimationFrame(this._loop);
    const now = t / 1000;
    let dt = Math.min(0.05, now - (this._lastT || now));
    this._lastT = now;
    if (dt <= 0) dt = 0.016;
    this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.time += dt;

    const run = this._screens[this.screen] || this._screens.play;
    run(dt);
  }

  // Title screen: the city idles behind the menu — a slow vista orbit,
  // weather and water moving, traffic cruising the empty grid.
  _titleFrame(dt) {
    this.camera.vista(this.time, { x: 0, z: 0 });
    this.weather.update(dt, null);
    this.city.update(dt, this.time);
    this.traffic.update(dt, new THREE.Vector3(0, 0, 0), this.city);
    this.renderer.render(this.scene, this.camera.camera);
    this.input.endFrame();
  }

  // Paused: frozen world, Escape resumes.
  _pauseFrame() {
    this.renderer.render(this.scene, this.camera.camera);
    if (this.input.pressed('Escape')) this.resume();
    this.input.endFrame();
  }

  // One play frame: clocks, death card, keys, movement, world, death.
  _playFrame(dt) {
    this._clocks(dt);
    if (this._deathCard(dt)) {
      this.renderer.render(this.scene, this.camera.camera);
      this.input.endFrame();
      return;
    }
    const input = this.input;
    const drag = input.consumeDrag();
    if (drag.dx || drag.dy) this.camera.orbit(drag.dx, drag.dy);
    if (this._handleKeys()) {
      input.endFrame();
      return;
    }
    this._steerPlayer(dt);
    const combatResult = this._tickWorld(dt);
    this._refreshObjective();
    this._checkDeath(combatResult);
    this.camera.update(dt, this.player.pos, this.player.heading, this.player.speedKmh, this.player.inCar);
    this.hud.update(dt, this);
    this.renderer.render(this.scene, this.camera.camera);
    input.endFrame();
  }

  // Lifetime stats and the ticking clocks: autosave, hit cooldowns.
  _clocks(dt) {
    const p = this.player;
    this.stats.playSeconds += dt;
    // Lifetime stats: cash earned counts every dollar that arrives,
    // distance counts every kilometre driven.
    if (p.cash > this._lastCash) this.stats.cashEarned += p.cash - this._lastCash;
    this._lastCash = p.cash;
    if (p.inCar) this.stats.distanceKm += (Math.abs(p.car.speed) * dt) / 1000;
    this.saveTimer += dt;
    if (this.saveTimer > AUTOSAVE_SEC) {
      this.saveTimer = 0;
      this.saveGame();
    }
    if (this.pedHitCooldown > 0) this.pedHitCooldown -= dt;
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
  }

  // The BUSTED / WASTED card: counts down, respawns, and holds the
  // frame until it does. Returns true while the card is up.
  _deathCard(dt) {
    if (this.deadTimer <= 0) return false;
    this.deadTimer -= dt;
    if (this.deadTimer <= 0) this._revive();
    return true;
  }

  // Move Luz: drive the car, or walk.
  _steerPlayer(dt) {
    const input = this.input;
    const p = this.player;
    const axes = input.axes();
    if (p.inCar) this._drive(dt, axes);
    else {
      p.moveOnFoot(dt, axes.x, axes.y, this.camera.yaw, input.sprint(), input.pressed('Space'), this.city);
      this.audio.setEngine(0, false);
      if (input.consumeMouseClick()) this._fire();
      else if (input.mouseDown && p.weapon === 'rifle') this._fire();
    }
  }

  // Drive the player's car: throttle, steering, handbrake, and the
  // consequences of sharing the road.
  _drive(dt, axes) {
    const input = this.input;
    const p = this.player;
    let throttle = axes.y;
    // Staged screenshot scenes keep the getaway speed up.
    if (this.shotCruise && p.car.speed < this.shotCruise) throttle = 1;
    p.car.drive(dt, throttle, -axes.x, input.down('Space'));
    this.city.resolveCollision(p.car.pos, 2.4);
    p.syncFromCar();
    // Handbrake at speed: tyres complain, and smoke says so.
    if (input.down('Space') && Math.abs(p.car.speed) > 15 && Math.random() < dt * 3) {
      this.audio.skid();
      this.effects.tireSmoke(p.car.pos);
    }
    this._bumps(dt);
    this._pedStrike(dt);
    if (p.car.smoking && Math.random() < dt * 6) this.effects.smoke(p.car.pos);
    if (p.car.health <= 0) this._burnout();
    this.audio.setEngine(Math.abs(p.car ? p.car.speed : 0) / 55, true);
  }

  // Car-vs-car bumps: push apart, and damage both cars on a hard hit.
  _bumps(dt) {
    const p = this.player;
    for (const other of [...this.traffic.all(), ...this.police.allUnits()]) {
      if (other === p.car) continue;
      const d = Math.hypot(other.pos.x - p.car.pos.x, other.pos.z - p.car.pos.z);
      if (d >= 4.2 || d <= 0.01) continue;
      const push = (4.2 - d) / 2;
      const nx = (p.car.pos.x - other.pos.x) / d;
      const nz = (p.car.pos.z - other.pos.z) / d;
      p.car.pos.x += nx * push;
      p.car.pos.z += nz * push;
      other.pos.x -= nx * push;
      other.pos.z -= nz * push;
      if (Math.abs(p.car.speed) > 6 && this.crashCooldown <= 0) {
        p.car.damage(4);
        other.damage(4);
        this.audio.crash();
        this.effects.sparks(p.car.pos);
        this.camera.addShake(0.4);
        this.crashCooldown = 0.5;
      }
    }
  }

  // Hitting pedestrians brings heat.
  _pedStrike(dt) {
    const p = this.player;
    if (Math.abs(p.car.speed) <= 8 || this.pedHitCooldown > 0) return;
    for (const ped of this.pedestrians.peds) {
      if (Math.hypot(ped.pos.x - p.car.pos.x, ped.pos.z - p.car.pos.z) < 2.4) {
        this.pedestrians.scareAt(p.car.pos, 30);
        this.police.addStars(1, 'pedestrian down');
        this.pedHitCooldown = 3;
        break;
      }
    }
  }

  // A wrecked car explodes and Luz is left standing in the street.
  _burnout() {
    const p = this.player;
    const wreck = p.car;
    this.effects.explosion(wreck.pos);
    this.audio.crash();
    p.exitCar();
    wreck.dispose();
    const i = this.worldCars.indexOf(wreck);
    if (i >= 0) this.worldCars.splice(i, 1);
  }

  // Tick every system. Returns combat's verdict on the player.
  _tickWorld(dt) {
    const p = this.player;
    this.traffic.ensureCount(16, p.pos);
    this.traffic.update(dt, p.pos, this.city);
    this.pedestrians.ensureCount(24, p.pos);
    this.pedestrians.update(dt, this.city, p.pos, [...this.traffic.all(), ...this.police.allUnits()]);
    this.police.update(dt, p, this.time);
    // The rotor follows the helicopter: thump while the heli is up,
    // silence the moment it leaves.
    if (this.police.heli && !this.audio.rotorOn) this.audio.startRotor();
    else if (!this.police.heli && this.audio.rotorOn) this.audio.stopRotor();
    const combatResult = this.combat.update(dt, p, this.city);
    this.missions.update(dt, p);
    this.sidejobs.update(dt, p);
    this.crew.update(dt);
    this.territory.update(dt, p.pos);
    this.weather.update(dt, p.pos);
    this.city.update(dt, this.time);
    this.effects.update(dt);
    return combatResult;
  }

  // Mission objective wins back the HUD when no side job is live.
  _refreshObjective() {
    if (this.missions.active && !this.sidejobs.taxi && !this.sidejobs.package && !this.sidejobs.race && !this.shopOpen) {
      const s = this.missions.step;
      if (s && !s.timeLimit && this.hud.objective === '') {
        this.hud.setObjective(`${this.missions.job.name} (${this.missions.stepIndex + 1}/${this.missions.job.steps.length}): ${s.label}`);
      }
    }
  }

  // Busted / wasted.
  _checkDeath(combatResult) {
    const p = this.player;
    if (this.police.busted) this._kill('busted');
    else if (p.health <= 0 || combatResult === 'player-dead') this._kill('wasted');
  }
}

window.__shotReady = false;
new Game();
