// CALA LUNA — main: wires every system into one playable game.
// Screens (title / play / pause / howto / stats), the frame loop, and
// all the verbs: walk, drive, carjack, shoot, shop, store, race, save.

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

class Game {
  constructor() {
    this.screen = 'title';
    this.time = 0;
    this.fps = 60;
    this.stats = {
      cashEarned: 0, missionsDone: 0, fares: 0, packages: 0, racesWon: 0,
      stunts: 0, carsStolen: 0, kills: 0, busted: 0, wasted: 0, playSeconds: 0,
    };
    this.worldCars = [];
    this.shopOpen = false;
    this.deadTimer = 0;
    this.saveTimer = 0;
    this.pedHitCooldown = 0;
    this.crashCooldown = 0;
    this.cashBaseline = PLAYER.startCash;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-root').appendChild(this.renderer.domElement);

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

    this.traffic.ensureCount(16, this.player.pos);
    this.pedestrians.ensureCount(24, this.player.pos);
    installDebugHook(this);
    this._bindMenus();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    if (SHOT) {
      applyShot(this, SHOT);
    } else {
      this.showTitle();
    }
  }

  // ---------- screens ----------
  _bindMenus() {
    const $ = (id) => document.getElementById(id);
    $('btn-play').onclick = () => { this.audio.init(); this.audio.resume(); this.audio.click(); Save.clear(); this.startGame({ fresh: true }); };
    $('btn-continue').onclick = () => { this.audio.init(); this.audio.resume(); this.audio.click(); this.startGame({ fresh: false }); };
    $('btn-howto').onclick = () => { this.audio.click(); this._showOnly('howto-screen'); };
    $('btn-howto-back').onclick = () => { this.audio.click(); this._showOnly('start-screen'); };
    $('btn-stats').onclick = () => {
      this.audio.click();
      $('stats-body').innerHTML = Save.statsText(this.stats);
      this._showOnly('stats-screen');
    };
    $('btn-stats-back').onclick = () => { this.audio.click(); this._showOnly('start-screen'); };
    $('btn-resume').onclick = () => { this.audio.click(); this.resume(); };
    $('btn-restart-mission').onclick = () => { this.audio.click(); this.resume(); this.missions.restart(); };
    $('btn-quit-title').onclick = () => { this.audio.click(); this.saveGame(); this.showTitle(); };
    const save = Save.load();
    if (!save) $('btn-continue').style.display = 'none';
  }

  _showOnly(id) {
    for (const s of ['start-screen', 'howto-screen', 'stats-screen', 'pause-screen']) {
      document.getElementById(s).classList.toggle('hidden', s !== id);
    }
    if (id) this.screen = id === 'start-screen' ? 'title' : id === 'pause-screen' ? 'pause' : 'menu';
  }

  showTitle() {
    this.screen = 'title';
    this.hud.hide();
    this._showOnly('start-screen');
    this.audio.stopMusic();
  }

  startGame({ fresh, skipIntro = false }) {
    if (!fresh) this._applySave(Save.load());
    this.screen = 'play';
    this._showOnly(null);
    this.hud.show();
    this.audio.init();
    this.audio.resume();
    this.audio.startEngine();
    this.audio.startMusic();
    if (!this.missions.active && !this.missions.done) {
      this.missions.start();
    }
    if (!skipIntro) {
      this.hud.say('Luz', 'Cala Luna. Eight jobs between me and a clean slate. First: a fare in Old Town.');
      this.hud.setHint('Follow the yellow waypoint · T taxi · P package · G garage · Q crew ability');
    }
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    document.getElementById('pause-stats').innerHTML = Save.statsText(this.stats, [
      ['District', this.territory.statusText()],
      ['Crew', `${this.crew.count} members`],
      ['Garage', this.garage.statusText()],
    ]);
    this._showOnly('pause-screen');
  }

  resume() {
    if (this.screen !== 'pause') return;
    this.screen = 'play';
    this._showOnly(null);
    this.hud.show();
  }

  // ---------- save ----------
  saveGame() {
    const p = this.player;
    Save.store({
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
      stats: this.stats,
      pos: [p.pos.x, p.pos.z],
    });
  }

  _applySave(save) {
    if (!save) return;
    const p = this.player;
    p.cash = save.cash ?? PLAYER.startCash;
    p.health = save.health ?? PLAYER.maxHealth;
    p.armor = save.armor ?? 0;
    this.missions.jobIndex = save.jobIndex ?? 0;
    this.missions.completedJobs = new Set(save.jobsDone || []);
    this.garage.stored = save.stored || [];
    this.territory.held = new Set(save.territory || []);
    for (const id of save.crew || []) this.crew.recruit(id);
    p.owned = new Set(save.owned || ['fists', 'pistol']);
    p.ammo = save.ammo || p.ammo;
    Object.assign(this.stats, save.stats || {});
    if (save.pos) {
      p.pos.set(save.pos[0], 0, save.pos[1]);
      p.group.position.copy(p.pos);
    }
  }

  // ---------- verbs ----------
  _nearestCar(maxDist) {
    let best = null, bestD = maxDist;
    const all = [...this.traffic.all(), ...this.worldCars, ...this.police.allUnits()];
    for (const c of all) {
      if (c === this.player.car) continue;
      const d = Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  _enterNearestCar(carjack) {
    const car = this._nearestCar(4.5);
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

  _aimPoint() {
    // Aim from the camera through the centre of the screen.
    const dir = new THREE.Vector3();
    this.camera.camera.getWorldDirection(dir);
    const origin = this.camera.camera.position.clone();
    return origin.addScaledVector(dir, 55);
  }

  _shoot() {
    const p = this.player;
    if (p.weapon === 'fists') {
      const hits = this.combat.playerShoot(p, this._aimPoint(), 0.016);
      // Fists also work up close on enemies.
      for (const e of this.combat.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 2.6) {
          e.health -= 25;
          if (e.health <= 0) { e.dead = true; e.g.rotation.x = -Math.PI / 2; this.stats.kills++; }
        }
      }
      return hits;
    }
    const before = this.combat.aliveCount();
    this.combat.playerShoot(p, this._aimPoint(), 0.016);
    const kills = before - this.combat.aliveCount();
    this.stats.kills += kills;
    if (this.police.stars === 0 && kills === 0) this.police.addStars(1, 'shots fired');
    this.pedestrians.scareAt(p.pos, 40);
    this.camera.addShake(0.25);
    return kills;
  }

  _handleDeath(kind) {
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
    this.deadTimer = 2.6;
  }

  _respawn() {
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

    const input = this.input;
    if (this.screen === 'title' || this.screen === 'menu') {
      this.camera.vista(this.time, { x: 0, z: 0 });
      this.weather.update(dt, null);
      this.city.update(dt, this.time);
      this.traffic.update(dt, new THREE.Vector3(0, 0, 0), this.city);
      this.renderer.render(this.scene, this.camera.camera);
      input.endFrame();
      return;
    }
    if (this.screen === 'pause') {
      this.renderer.render(this.scene, this.camera.camera);
      if (input.pressed('Escape')) this.resume();
      input.endFrame();
      return;
    }

    // --- play ---
    this.stats.playSeconds += dt;
    this.saveTimer += dt;
    if (this.saveTimer > 30) { this.saveTimer = 0; this.saveGame(); }
    if (this.pedHitCooldown > 0) this.pedHitCooldown -= dt;
    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    if (this.deadTimer > 0) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this._respawn();
      this.renderer.render(this.scene, this.camera.camera);
      input.endFrame();
      return;
    }

    const p = this.player;
    const drag = input.consumeDrag();
    if (drag.dx || drag.dy) this.camera.orbit(drag.dx, drag.dy);

    if (input.pressed('Escape')) { this.pause(); input.endFrame(); return; }
    if (input.pressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.hud.setHint(muted ? 'Sound muted' : 'Sound on');
    }
    if (input.pressed('KeyQ')) this.crew.useAbility();
    if (input.pressed('KeyR')) {
      if (this.missions.active) this.missions.restart();
      else {
        const race = RACES.find((r) => Math.hypot(p.pos.x - r.checkpoints[0][0], p.pos.z - r.checkpoints[0][1]) < 20);
        if (race) this.sidejobs.startRace(race.id);
      }
    }
    if (input.pressed('KeyT')) this.sidejobs.startTaxi();
    if (input.pressed('KeyP')) this.sidejobs.startPackage();
    if (input.pressed('KeyG')) {
      if (this.garage.nearGarage(p)) {
        if (p.inCar) this.garage.storeCurrentCar();
        else if (this.garage.stored.length) this.garage.takeOut(this.garage.stored.length - 1);
      }
    }

    // Shop open / close / buy.
    if (this.shopOpen) {
      if (input.pressed('KeyE')) { this.shopOpen = false; this.hud.clearObjective(); }
      if (input.pressed('Digit1')) this.economy.buy('pistol');
      if (input.pressed('Digit2')) this.economy.buy('shotgun');
      if (input.pressed('Digit3')) this.economy.buy('rifle');
      if (input.pressed('Digit4')) this.economy.buy('armor');
      if (this.shopOpen) this.hud.setObjective(this.economy.shopText());
    } else {
      if (input.pressed('Digit1')) p.setWeapon('fists');
      if (input.pressed('Digit2')) p.setWeapon('pistol');
      if (input.pressed('Digit3')) p.setWeapon('shotgun');
      if (input.pressed('Digit4')) p.setWeapon('rifle');
      if (input.pressed('KeyE')) {
        if (p.inCar) p.exitCar();
        else if (this.economy.nearShop(p) && !this._nearestCar(4.5)) {
          this.shopOpen = true;
          this.hud.setObjective(this.economy.shopText());
        } else this._enterNearestCar(false);
      }
      if (input.pressed('KeyF') && !p.inCar) this._enterNearestCar(true);
    }

    // Hints near points of interest.
    if (!p.inCar && this.economy.nearShop(p)) this.hud.setHint('Iron & Oak Guns — press E to shop', 0.5);
    else if (this.garage.nearGarage(p)) {
      this.hud.setHint(p.inCar ? 'Wrench Garage — press G to store this car' : (this.garage.stored.length ? 'Wrench Garage — press G to take out a car' : 'Wrench Garage — bring a car worth keeping'), 0.5);
    }

    // Move.
    const axes = input.axes();
    if (p.inCar) {
      let throttle = axes.y;
      // Staged screenshot scenes keep the getaway speed up.
      if (this.shotCruise && p.car.speed < this.shotCruise) throttle = 1;
      const steer = -axes.x;
      p.car.drive(dt, throttle, steer, input.down('Space'));
      this.city.resolveCollision(p.car.pos, 2.4);
      p.syncFromCar();
      // Car-vs-car bumps.
      for (const other of [...this.traffic.all(), ...this.police.allUnits()]) {
        if (other === p.car) continue;
        const d = Math.hypot(other.pos.x - p.car.pos.x, other.pos.z - p.car.pos.z);
        if (d < 4.2 && d > 0.01) {
          const push = (4.2 - d) / 2;
          const nx = (p.car.pos.x - other.pos.x) / d, nz = (p.car.pos.z - other.pos.z) / d;
          p.car.pos.x += nx * push; p.car.pos.z += nz * push;
          other.pos.x -= nx * push; other.pos.z -= nz * push;
          if (Math.abs(p.car.speed) > 6 && this.crashCooldown <= 0) {
            p.car.damage(4);
            other.damage(4);
            this.audio.crash();
            this.camera.addShake(0.4);
            this.crashCooldown = 0.5;
          }
        }
      }
      // Hitting pedestrians brings heat.
      if (Math.abs(p.car.speed) > 8 && this.pedHitCooldown <= 0) {
        for (const ped of this.pedestrians.peds) {
          if (Math.hypot(ped.pos.x - p.car.pos.x, ped.pos.z - p.car.pos.z) < 2.4) {
            this.pedestrians.scareAt(p.car.pos, 30);
            this.police.addStars(1, 'pedestrian down');
            this.pedHitCooldown = 3;
            break;
          }
        }
      }
      if (p.car.smoking && Math.random() < dt * 6) this.effects.smoke(p.car.pos);
      if (p.car.health <= 0) {
        const wreck = p.car;
        this.effects.explosion(wreck.pos);
        this.audio.crash();
        p.exitCar();
        wreck.dispose();
        const i = this.worldCars.indexOf(wreck);
        if (i >= 0) this.worldCars.splice(i, 1);
      }
      this.audio.setEngine(Math.abs(p.car ? p.car.speed : 0) / 55, true);
    } else {
      p.moveOnFoot(dt, axes.x, axes.y, this.camera.yaw, input.down('ShiftLeft') || input.down('ShiftRight'), input.pressed('Space'), this.city);
      this.audio.setEngine(0, false);
      if (input.consumeMouseClick()) this._shoot();
      else if (input.mouseDown && p.weapon === 'rifle') this._shoot();
    }

    // Systems.
    this.traffic.ensureCount(16, p.pos);
    this.traffic.update(dt, p.pos, this.city);
    this.pedestrians.ensureCount(24, p.pos);
    this.pedestrians.update(dt, this.city, p.pos);
    this.police.update(dt, p, this.time);
    const combatResult = this.combat.update(dt, p, this.city);
    this.missions.update(dt, p);
    this.sidejobs.update(dt, p);
    this.crew.update(dt);
    this.territory.update(dt);
    this.weather.update(dt, p.pos);
    this.city.update(dt, this.time);
    this.effects.update(dt);

    // Mission objective wins back the HUD when no side job is live.
    if (this.missions.active && !this.sidejobs.taxi && !this.sidejobs.package && !this.sidejobs.race && !this.shopOpen) {
      const s = this.missions.step;
      if (s && !s.timeLimit && this.hud.objective === '') {
        this.hud.setObjective(`${this.missions.job.name}: ${s.label}`);
      }
    }

    // Busted / wasted.
    if (this.police.busted) this._handleDeath('busted');
    else if (p.health <= 0 || combatResult === 'player-dead') this._handleDeath('wasted');

    // Camera + HUD.
    this.camera.update(dt, p.pos, p.heading, p.speedKmh, p.inCar);
    this.hud.update(dt, this);
    this.renderer.render(this.scene, this.camera.camera);
    input.endFrame();
  }
}

window.__shotReady = false;
new Game();
