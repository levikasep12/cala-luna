// CALA LUNA — missions: the eight-job story chain, run as a step machine.
// A job is a list of steps; each step is one of four kinds (drive to a
// marker, steal a car, clear the enemies, hold the ground) and the
// machine dispatches on the kind: setup when the step begins, a check
// every frame, a payout when it completes. Finishing a job pays cash,
// recruits crew and unlocks the next one; failing one sends Luz back to
// the start of it with R.

import * as THREE from 'three';
import { STORY } from './config.js';
import { Vehicle } from './vehicles.js';

// How close Luz must get before a step can complete, by step kind.
const REACH = { drive: 9, steal: 9, clear: 40, hold: 14 };
const ENEMY_RING = 14; // guards spawn in a ring this far from the marker
const TIME_BONUS_PER_SEC = 5;
const TIME_BONUS_CAP = 300;
const BEACON_COLOR = 0xffd166;

// Which check method runs each frame for a step of this kind.
const STEP_CHECK = {
  drive: '_checkDrive',
  steal: '_checkSteal',
  clear: '_checkClear',
  hold: '_checkHold',
};

export class Missions {
  constructor(game) {
    this.game = game;
    this.jobIndex = 0; // index into STORY
    this.stepIndex = 0;
    this.active = false;
    this.stepTimer = 0; // seconds left on a timed step
    this.holdTimer = 0; // seconds held so far on a hold step
    this.marker = null; // 3D waypoint beacon
    this.markerRing = null;
    this.stealCar = null; // the target car of a 'steal' step, if any
    this.completedJobs = new Set();
  }

  // Back to a new game: job 1, step 1, no markers, no spawned cars.
  reset() {
    this.game.combat.clearEnemies();
    this._clearMarker();
    this._clearStealCar();
    this.jobIndex = 0;
    this.stepIndex = 0;
    this.active = false;
    this.completedJobs = new Set();
  }

  _clearStealCar() {
    if (!this.stealCar) return;
    // Only remove it if Luz never took it: a stolen car she is driving
    // (or parked) stays in the world.
    if (this.stealCar.driver !== 'player') {
      this.stealCar.dispose();
      const i = this.game.worldCars.indexOf(this.stealCar);
      if (i >= 0) this.game.worldCars.splice(i, 1);
    }
    this.stealCar = null;
  }

  get job() { return STORY[this.jobIndex]; }
  get step() { return this.job ? this.job.steps[this.stepIndex] : null; }
  get done() { return this.jobIndex >= STORY.length; }

  start() {
    if (this.done) return;
    this.active = true;
    this.stepIndex = 0;
    this._beginStep();
    this.game.hud.showBanner(this.job.name);
    this.game.hud.say('Luz', this.job.brief);
  }

  // A step begins: reset its clocks, stage whatever it needs (heat, a
  // car to steal, a ring of guards), drop the beacon, name the objective.
  _beginStep() {
    const s = this.step;
    if (!s) return;
    this.stepTimer = s.timeLimit || 0;
    this.holdTimer = 0;
    this._stageStep(s);
    this._placeMarker(s.at[0], s.at[1]);
    this.game.hud.setObjective(`${this.job.name} (${this.stepIndex + 1}/${this.job.steps.length}): ${s.label}`);
  }

  _stageStep(s) {
    if (s.wanted) this.game.police.setStars(s.wanted);
    if (s.type === 'steal') this._parkStealCar(s);
    if (s.enemies) this._ringEnemies(s);
  }

  // The target car waits at the marker, parked and unlocked.
  // Restarting the step replaces it instead of stacking a second car.
  _parkStealCar(s) {
    this._clearStealCar();
    const car = new Vehicle(this.game.scene, s.vehicle || 'sports', s.at[0], s.at[1], 0);
    this.stealCar = car;
    this.game.worldCars.push(car);
    this.game.hud.say('Marco', `There's the ${car.spec.name}. Take it — quiet if you can.`);
  }

  _ringEnemies(s) {
    for (let i = 0; i < s.enemies; i++) {
      const a = (i / s.enemies) * Math.PI * 2;
      this.game.combat.spawnEnemy(s.at[0] + Math.cos(a) * ENEMY_RING, s.at[1] + Math.sin(a) * ENEMY_RING, 'rival');
    }
  }

  _placeMarker(x, z) {
    this._clearMarker();
    this.marker = this._beacon(x, z);
    this.markerRing = this._groundRing(x, z);
  }

  // The tall translucent column of light over the objective.
  _beacon(x, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: BEACON_COLOR, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 60, 12, 1, true), mat);
    column.position.set(x, 30, z);
    this.game.scene.add(column);
    return column;
  }

  // The flat ring on the ground under the beacon.
  _groundRing(x, z) {
    const mat = new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 24), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    this.game.scene.add(ring);
    return ring;
  }

  _clearMarker() {
    if (this.marker) { this.game.scene.remove(this.marker); this.marker = null; }
    if (this.markerRing) { this.game.scene.remove(this.markerRing); this.markerRing = null; }
  }

  restart() {
    this.game.combat.clearEnemies();
    this._clearMarker();
    this._clearStealCar();
    this.stepIndex = 0;
    this.active = true;
    this._beginStep();
    this.game.hud.say('Luz', 'Back to the start of this one. ' + this.job.brief);
  }

  // A step is done: pay for it, apply its side effects (crew, district),
  // then start the next step — or finish the job.
  _advance() {
    const s = this.step;
    this._payStep(s);
    if (s.recruit) this.game.crew.recruit(s.recruit);
    if (s.takeDistrict) this.game.territory.capture(s.takeDistrict);
    this.stepIndex++;
    if (this.stepIndex >= this.job.steps.length) this._completeJob();
    else this._beginStep();
  }

  // The step's cash: its flat reward, plus a time bonus on timed steps —
  // beat the clock, get paid for it: $5 per second left, up to $300. A
  // clean fast run is worth more than a crawl.
  _payStep(s) {
    if (s.reward) {
      this.game.player.cash += s.reward;
      this.game.audio.cash();
    }
    if (s.timeLimit && this.stepTimer > 0) {
      const bonus = Math.min(TIME_BONUS_CAP, Math.floor(this.stepTimer) * TIME_BONUS_PER_SEC);
      if (bonus > 0) {
        this.game.player.cash += bonus;
        this.game.hud.say('Luz', `Beat the clock — $${bonus} time bonus.`);
      }
    }
  }

  _completeJob() {
    const job = this.job;
    this.completedJobs.add(job.id);
    this._clearMarker();
    this.active = false;
    this.game.stats.missionsDone++;
    this.game.audio.missionPass();
    // Gold in the air over Luz: a finished job should look finished.
    const at = this.game.player.pos.clone();
    at.y = 1.5;
    this.game.effects.burst(at, 0xffd166, 20, 8, 0.4);
    const total = job.steps.reduce((a, s) => a + (s.reward || 0), 0);
    this.game.hud.showMissionCard(job.name, total,
      this.jobIndex + 1 < STORY.length ? `Next job: ${STORY[this.jobIndex + 1].name}` : 'The whole city is yours, Luz.');
    this.jobIndex++;
    this.game.saveGame();
    if (job.steps.some((s) => s.finale)) {
      this.game.hud.showBanner('CALA LUNA IS YOURS');
    }
  }

  fail(reason) {
    this._clearMarker();
    // The job's enemies leave with it: the old code left Bank Job
    // guards standing around after a fail, and a retry stacked a
    // second ring of guards on top of the survivors.
    this.game.combat.clearEnemies();
    this.active = false;
    this.game.audio.missionFail();
    this.game.hud.showMissionCard('MISSION FAILED', 0, reason + ' — press R to retry.');
  }

  update(dt, player) {
    if (this.marker) this.marker.rotation.y += dt * 0.8;
    if (!this.active || !this.step) return;
    if (this._tickClock(dt)) return;
    this[STEP_CHECK[this.step.type]](dt, player, this.step);
  }

  // The step clock: counts down, shows the seconds left, fails the job
  // at zero. Returns true when the clock ran out.
  _tickClock(dt) {
    if (this.stepTimer <= 0) return false;
    const s = this.step;
    this.stepTimer -= dt;
    this.game.hud.setObjective(`${this.job.name} (${this.stepIndex + 1}/${this.job.steps.length}): ${s.label} — ${Math.ceil(this.stepTimer)}s`, this.stepTimer);
    if (this.stepTimer <= 0) {
      this.fail('Out of time.');
      return true;
    }
    return false;
  }

  _distTo(player, s) {
    return Math.hypot(player.pos.x - s.at[0], player.pos.z - s.at[1]);
  }

  _checkDrive(dt, player, s) {
    if (this._distTo(player, s) < REACH.drive) this._advance();
  }

  _checkSteal(dt, player, s) {
    if (this._distTo(player, s) >= REACH.steal) return;
    // The target car waits here; entering it completes the step.
    if (player.inCar && player.car.type === (s.vehicle || 'sports')) this._advance();
    else this.game.hud.setHint('Get in the Vortex GT (E)');
  }

  _checkClear(dt, player, s) {
    if (this.game.combat.aliveCount() === 0 && this._distTo(player, s) < REACH.clear) this._advance();
  }

  // Hold the ground: stay inside the ring until the timer fills. Step
  // out and the hold resets.
  _checkHold(dt, player, s) {
    if (this._distTo(player, s) < REACH.hold) {
      this.holdTimer += dt;
      this.game.hud.setObjective(`${this.job.name} (${this.stepIndex + 1}/${this.job.steps.length}): ${s.label} — ${Math.ceil(s.holdSec - this.holdTimer)}s`, s.holdSec - this.holdTimer);
      if (this.holdTimer >= s.holdSec) this._advance();
    } else {
      this.holdTimer = 0;
    }
  }

  waypoint() {
    const s = this.step;
    return s ? { x: s.at[0], z: s.at[1] } : null;
  }
}
