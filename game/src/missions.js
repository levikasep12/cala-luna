// CALA LUNA — missions: the 8-job story chain and its state machine.
// Each job has steps (drive / steal / clear / hold). The HUD shows the
// current objective, the minimap shows the waypoint, and finishing a job
// pays cash, recruits crew and unlocks the next one.

import * as THREE from 'three';
import { STORY } from './config.js';
import { Vehicle } from './vehicles.js';

export class Missions {
  constructor(game) {
    this.game = game;
    this.jobIndex = 0;      // index into STORY
    this.stepIndex = 0;
    this.active = false;
    this.stepTimer = 0;
    this.holdTimer = 0;
    this.marker = null;     // 3D waypoint beacon
    this.stealCar = null;   // the target car of a 'steal' step, if any
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
    if (this.stealCar) {
      // Only remove it if Luz never took it: a stolen car she is
      // driving (or parked) stays in the world.
      if (this.stealCar.driver !== 'player') {
        this.stealCar.dispose();
        const i = this.game.worldCars.indexOf(this.stealCar);
        if (i >= 0) this.game.worldCars.splice(i, 1);
      }
      this.stealCar = null;
    }
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

  _beginStep() {
    const s = this.step;
    if (!s) return;
    this.stepTimer = s.timeLimit || 0;
    this.holdTimer = 0;
    if (s.wanted) this.game.police.setStars(s.wanted);
    if (s.type === 'steal') {
      // The target car waits at the marker, parked and unlocked.
      // Restarting the step replaces it instead of stacking a second car.
      this._clearStealCar();
      const car = new Vehicle(this.game.scene, s.vehicle || 'sports', s.at[0], s.at[1], 0);
      this.stealCar = car;
      this.game.worldCars.push(car);
      this.game.hud.say('Marco', `There's the ${car.spec.name}. Take it — quiet if you can.`);
    }
    if (s.enemies) {
      for (let i = 0; i < s.enemies; i++) {
        const a = (i / s.enemies) * Math.PI * 2;
        this.game.combat.spawnEnemy(s.at[0] + Math.cos(a) * 14, s.at[1] + Math.sin(a) * 14, 'rival');
      }
    }
    this._placeMarker(s.at[0], s.at[1]);
    this.game.hud.setObjective(`${this.job.name} (${this.stepIndex + 1}/${this.job.steps.length}): ${s.label}`);
  }

  _placeMarker(x, z) {
    this._clearMarker();
    const geo = new THREE.CylinderGeometry(3.2, 3.2, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(x, 30, z);
    this.game.scene.add(this.marker);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    this.game.scene.add(ring);
    this.markerRing = ring;
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

  _advance() {
    const s = this.step;
    if (s.reward) {
      this.game.player.cash += s.reward;
      this.game.audio.cash();
    }
    // Beat the clock, get paid for it: timed steps pay $5 per second
    // left, up to $300. A clean fast run is worth more than a crawl.
    if (s.timeLimit && this.stepTimer > 0) {
      const bonus = Math.min(300, Math.floor(this.stepTimer) * 5);
      if (bonus > 0) {
        this.game.player.cash += bonus;
        this.game.hud.say('Luz', `Beat the clock — $${bonus} time bonus.`);
      }
    }
    if (s.recruit) this.game.crew.recruit(s.recruit);
    if (s.takeDistrict) this.game.territory.capture(s.takeDistrict);
    this.stepIndex++;
    if (this.stepIndex >= this.job.steps.length) {
      this._completeJob();
    } else {
      this._beginStep();
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
    const s = this.step;
    if (this.stepTimer > 0) {
      this.stepTimer -= dt;
      this.game.hud.setObjective(`${this.job.name} (${this.stepIndex + 1}/${this.job.steps.length}): ${s.label} — ${Math.ceil(this.stepTimer)}s`, this.stepTimer);
      if (this.stepTimer <= 0) {
        this.fail('Out of time.');
        return;
      }
    }
    const dx = player.pos.x - s.at[0];
    const dz = player.pos.z - s.at[1];
    const dist = Math.hypot(dx, dz);
    if (s.type === 'drive' || s.type === 'steal') {
      if (dist < 9) {
        if (s.type === 'steal') {
          // The target car waits here; entering it completes the step.
          if (player.inCar && player.car.type === (s.vehicle || 'sports')) this._advance();
          else this.game.hud.setHint('Get in the Vortex GT (E)');
        } else this._advance();
      }
    } else if (s.type === 'clear') {
      if (this.game.combat.aliveCount() === 0 && dist < 40) this._advance();
    } else if (s.type === 'hold') {
      if (dist < 14) {
        this.holdTimer += dt;
        this.game.hud.setObjective(`${this.job.name} (${this.stepIndex + 1}/${this.job.steps.length}): ${s.label} — ${Math.ceil(s.holdSec - this.holdTimer)}s`, s.holdSec - this.holdTimer);
        if (this.holdTimer >= s.holdSec) this._advance();
      } else {
        this.holdTimer = 0;
      }
    }
  }

  waypoint() {
    const s = this.step;
    return s ? { x: s.at[0], z: s.at[1] } : null;
  }
}
