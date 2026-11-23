// CALA LUNA — camera: the eye over Luz's shoulder. A chase camera
// that rides behind the player or the car, drifts back as the speed
// climbs, and opens the lens up so a flat-out run down Meridian feels
// fast. The mouse swings it around her; C steps through three
// distances. On the title screen it forgets Luz entirely and orbits
// the city instead.

import * as THREE from 'three';

// The three chase distances C cycles through: pull is the extra
// distance behind the target, lift the extra height above it.
const CAMERA_VIEWS = [
  { pull: -3, lift: -1, name: 'CLOSE' },
  { pull: 0, lift: 0, name: 'STANDARD' },
  { pull: 6, lift: 2.5, name: 'FAR' },
];

const LENS_BASE = 62; // degrees, standing still
const LENS_EXTRA = 12; // degrees more, flat-out in a car
const FLOOR_Y = 1.6; // the lens never dips below this height
const SNAP_DIST = 11; // snap distance before the view offset
const SNAP_HEIGHT = 5; // snap height before the view offset

export class Camera {
  constructor(scene, renderer) {
    this.camera = new THREE.PerspectiveCamera(LENS_BASE, window.innerWidth / window.innerHeight, 0.1, 900);
    this.yaw = 0; // orbit around the player, from the mouse
    this.pitch = 0.32; // 0 = level, up to ~0.9 looking down
    this.dist = 11;
    this.pos = new THREE.Vector3(0, 8, -12);
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.mode = 'chase'; // chase | vista
    this.distBoost = 0; // extra pull-back (shots and camera views)
    this.heightBoost = 0;
    this.viewIndex = 1; // 0 close, 1 standard, 2 far
    this.views = CAMERA_VIEWS;
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Step to the next chase distance (C key) and hand back its label
  // for the HUD hint.
  cycleView() {
    this.viewIndex = (this.viewIndex + 1) % this.views.length;
    const v = this.views[this.viewIndex];
    this.distBoost = v.pull;
    this.heightBoost = v.lift;
    return v.name;
  }

  // Where the lens wants to sit for a target: behind the heading,
  // swung by the orbit yaw, pitched down a little, at the rig's
  // distance and height.
  _orbitSpot(targetPos, targetHeading, dist, height) {
    const behind = targetHeading + Math.PI + this.yaw;
    const flat = dist * Math.cos(this.pitch);
    const rise = height + Math.sin(this.pitch) * dist * 0.6;
    return new THREE.Vector3(
      targetPos.x + Math.cos(behind) * flat,
      targetPos.y + rise,
      targetPos.z - Math.sin(behind) * flat,
    );
  }

  // Teleport the lens to its chase spot: no cross-map swoop when the
  // game starts, the player respawns, or a shot is staged. The snap
  // honours the current view, so a respawn in FAR view doesn't lurch
  // forward and drift back out over the next second.
  snapTo(targetPos, targetHeading) {
    const spot = this._orbitSpot(targetPos, targetHeading, SNAP_DIST + this.distBoost, SNAP_HEIGHT + this.heightBoost);
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

  // Title screen: a slow cinematic orbit high above the city centre.
  vista(time, center) {
    const a = time * 0.05;
    this.pos.set(center.x + Math.cos(a) * 120, 55 + Math.sin(time * 0.1) * 8, center.z + Math.sin(a) * 120);
    this.lookAt.set(center.x, 10, center.z);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }

  // The chase rig: how far back and how high for this speed, on foot
  // or behind the wheel. Speed pulls the camera back; the view offset
  // stacks on top.
  _rig(speedKmh, inCar) {
    const dist = inCar ? 12 + Math.min(6, speedKmh / 30) : 9;
    const height = inCar ? 5.2 : 4.4;
    return { dist: dist + this.distBoost, height: height + this.heightBoost };
  }

  update(dt, targetPos, targetHeading, speedKmh, inCar) {
    const rig = this._rig(speedKmh, inCar);
    const want = this._orbitSpot(targetPos, targetHeading, rig.dist, rig.height);
    this.pos.lerp(want, Math.min(1, dt * 5));
    if (this.pos.y < FLOOR_Y) this.pos.y = FLOOR_Y;
    this._lens(dt, speedKmh, inCar);
    this.lookAt.lerp(
      new THREE.Vector3(targetPos.x, targetPos.y + 2.2, targetPos.z),
      Math.min(1, dt * 8),
    );
    this._tremble(dt);
  }

  // The lens widens with speed — up to twelve extra degrees flat-out
  // in a car, so 150 km/h feels like 150 km/h instead of 60. Eased,
  // never snapped, and only while driving.
  _lens(dt, speedKmh, inCar) {
    const targetFov = inCar ? LENS_BASE + Math.min(LENS_EXTRA, speedKmh / 14) : LENS_BASE;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  // Shake decays and rattles the lens around its smoothed position.
  _tremble(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * sh * 0.7;
    const sy = (Math.random() - 0.5) * sh * 0.7;
    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.lookAt);
  }
}
