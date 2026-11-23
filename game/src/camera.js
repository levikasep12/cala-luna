// CALA LUNA — camera: third-person chase camera with mouse orbit.
// Sits behind the player (or the car), pulls back with speed, widens
// the lens at speed, and smooths every move so the drive feels right.
// One spot calculation serves both the snap and the per-frame chase.

import * as THREE from 'three';

// Chase distances (C cycles them): close, standard, far.
const VIEWS = [
  { dist: -3, height: -1, label: 'CLOSE' },
  { dist: 0, height: 0, label: 'STANDARD' },
  { dist: 6, height: 2.5, label: 'FAR' },
];

const BASE_FOV = 62;
const MIN_HEIGHT = 1.6;

export class Camera {
  constructor(scene, renderer) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 900);
    this.yaw = 0; // orbit around the player
    this.pitch = 0.32; // 0 = level, up to ~0.9 looking down
    this.dist = 11;
    this.pos = new THREE.Vector3(0, 8, -12);
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.mode = 'chase'; // chase | vista
    this.distBoost = 0; // extra pull-back (shots and camera views)
    this.heightBoost = 0;
    this.viewIndex = 1; // 0 close, 1 standard, 2 far
    this.views = VIEWS;
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Cycle the chase distance (C key). Returns the new view's label
  // for the HUD hint.
  cycleView() {
    this.viewIndex = (this.viewIndex + 1) % this.views.length;
    const v = this.views[this.viewIndex];
    this.distBoost = v.dist;
    this.heightBoost = v.height;
    return v.label;
  }

  // Where the camera wants to be: behind the target's heading, blended
  // toward the orbit yaw, at the given distance and height.
  _chaseSpot(targetPos, targetHeading, dist, height) {
    const back = targetHeading + Math.PI + this.yaw;
    return new THREE.Vector3(
      targetPos.x + Math.cos(back) * dist * Math.cos(this.pitch),
      targetPos.y + height + Math.sin(this.pitch) * dist * 0.6,
      targetPos.z - Math.sin(back) * dist * Math.cos(this.pitch),
    );
  }

  // Jump the camera to its chase spot at once: no cross-map swoop
  // when the game starts, the player respawns, or a shot is staged.
  // The snap honours the current view: the old code always snapped to
  // the standard distance, so a respawn in FAR view lurched forward
  // and then drifted back out over the next second.
  snapTo(targetPos, targetHeading) {
    const spot = this._chaseSpot(targetPos, targetHeading, 11 + this.distBoost, 5 + this.heightBoost);
    this.pos.copy(spot);
    this.lookAt.set(targetPos.x, targetPos.y + 2.2, targetPos.z);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.004;
    this.pitch = Math.max(0.05, Math.min(1.0, this.pitch + dy * 0.003));
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  // Vista mode: a slow cinematic orbit for the title screen.
  vista(time, center) {
    const a = time * 0.05;
    this.pos.set(center.x + Math.cos(a) * 120, 55 + Math.sin(time * 0.1) * 8, center.z + Math.sin(a) * 120);
    this.lookAt.set(center.x, 10, center.z);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }

  update(dt, targetPos, targetHeading, speedKmh, inCar) {
    const wantDist = (inCar ? 12 + Math.min(6, speedKmh / 30) : 9) + this.distBoost;
    const wantHeight = (inCar ? 5.2 : 4.4) + this.heightBoost;
    const want = this._chaseSpot(targetPos, targetHeading, wantDist, wantHeight);
    this.pos.lerp(want, Math.min(1, dt * 5));
    if (this.pos.y < MIN_HEIGHT) this.pos.y = MIN_HEIGHT;
    this._easeFov(dt, speedKmh, inCar);
    this.lookAt.lerp(
      new THREE.Vector3(targetPos.x, targetPos.y + 2.2, targetPos.z),
      Math.min(1, dt * 8),
    );
    this._applyShake(dt);
  }

  // Speed widens the lens: up to +12° of FOV flat-out in a car, so
  // 150 km/h feels like 150 km/h instead of 60. Eased, never snapped.
  _easeFov(dt, speedKmh, inCar) {
    const targetFov = inCar ? BASE_FOV + Math.min(12, speedKmh / 14) : BASE_FOV;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  // Shake decays and jitters the lens around the smoothed position.
  _applyShake(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * sh * 0.7;
    const sy = (Math.random() - 0.5) * sh * 0.7;
    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.lookAt);
  }
}
