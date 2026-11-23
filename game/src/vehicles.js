// CALA LUNA — vehicles: every car on the island, built from boxes and
// driven by one arcade model. A car is a body style (dimensions) plus a
// spec (speed, grip, colour); the same class serves traffic, the police,
// the player's ride and the wrecks left behind. The helicopter lives
// here too: it is a vehicle with no wheels and a searchlight.

import * as THREE from 'three';
import { VEHICLES } from './config.js';

// Body styles: length and width per silhouette. Trucks and vans are
// longer and wider; everything else shares the car footprint.
const BODY_STYLES = {
  truck: { length: 7.5, width: 2.6, cab: true },
  swat: { length: 6.5, width: 2.6, cab: false },
  car: { length: 4.6, width: 2.1, cab: false },
};

// Materials and geometries shared by every car on the road.
const SHARED = {
  wheelGeo: new THREE.CylinderGeometry(0.85, 0.85, 0.6, 10),
  wheelMat: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  glassMat: new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 90, transparent: true, opacity: 0.75 }),
  headMat: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  tailDim: new THREE.MeshBasicMaterial({ color: 0x881512 }),
  tailBright: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  reverseMat: new THREE.MeshBasicMaterial({ color: 0xf0f4ff }),
  redLight: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  blueLight: new THREE.MeshBasicMaterial({ color: 0x2a6aff }),
  bedMat: new THREE.MeshLambertMaterial({ color: 0x6a5a48 }),
  flameMat: new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 }),
};

// One box mesh: geometry, material, position, parent, optional shadow.
function box(parent, w, h, d, mat, x, y, z, shadow = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}

export class Vehicle {
  constructor(scene, type, x, z, heading) {
    this.scene = scene;
    this.type = type;
    this.spec = VEHICLES[type];
    this.style = BODY_STYLES[type] || BODY_STYLES.car;
    this.length = this.style.length;
    this.width = this.style.width;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading; // radians, 0 = +x
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.smoking = false;
    this.boostTimer = 0; // seconds of nitro left (Dante's ability)
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.rotation.y = -heading;
    scene.add(this.group);
    this._assemble();
  }

  // Build the visible car, part by part.
  _assemble() {
    const { length: len, width: wid } = this;
    const paint = new THREE.MeshPhongMaterial({ color: this.spec.color, shininess: 60 });
    box(this.group, len, 1.1, wid, paint, 0, 0.85, 0, true);
    if (this.style.cab) this._truckBed(paint);
    else box(this.group, len * 0.45, 0.95, wid - 0.25, SHARED.glassMat, -len * 0.05, 1.85, 0, true);
    this._wheels();
    this._lamps();
    this._nitroFlame();
    if (this.type === 'police') this._lightBar();
    if (this.type === 'taxi') box(this.group, 0.9, 0.35, 0.5, SHARED.headMat, -0.2, 2.5, 0);
  }

  // The truck's open bed and cab, in place of a glass cabin.
  _truckBed(paint) {
    const { length: len, width: wid } = this;
    box(this.group, 1.8, 1.6, wid, paint, len / 2 - 0.9, 1.8, 0, true);
    box(this.group, 4.6, 1.0, wid - 0.2, SHARED.bedMat, -1.1, 1.7, 0);
  }

  _wheels() {
    const { length: len, width: wid } = this;
    const wx = len / 2 - 0.9;
    this.wheels = [];
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const w = new THREE.Mesh(SHARED.wheelGeo, SHARED.wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(sx * wx, 0.85, sz * wid / 2);
        this.group.add(w);
        this.wheels.push(w);
      }
    }
  }

  // Headlights, taillights (dim / bright) and the reverse lamps that
  // only light while the car is actually moving backwards.
  _lamps() {
    const { length: len, width: wid } = this;
    const nose = len / 2 + 0.05;
    const tail = -len / 2 - 0.05;
    const off = wid / 2 - 0.4;
    box(this.group, 0.15, 0.3, 0.5, SHARED.headMat, nose, 0.95, off);
    box(this.group, 0.15, 0.3, 0.5, SHARED.headMat, nose, 0.95, -off);
    this.tailLights = [
      box(this.group, 0.15, 0.3, 0.5, SHARED.tailDim, tail, 0.95, off),
      box(this.group, 0.15, 0.3, 0.5, SHARED.tailDim, tail, 0.95, -off),
    ];
    this.reverseLights = [
      box(this.group, 0.15, 0.2, 0.4, SHARED.reverseMat, tail, 0.55, off),
      box(this.group, 0.15, 0.2, 0.4, SHARED.reverseMat, tail, 0.55, -off),
    ];
    for (const l of this.reverseLights) l.visible = false;
  }

  // The nitro flame cone at the tailpipe, hidden until a boost burns.
  _nitroFlame() {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), SHARED.flameMat);
    flame.rotation.z = Math.PI / 2;
    flame.position.set(-this.length / 2 - 0.8, 0.6, 0);
    flame.visible = false;
    this.group.add(flame);
    this.flame = flame;
  }

  // The police light bar: two lamps that alternate red and blue.
  _lightBar() {
    const bar = new THREE.Group();
    const r = box(bar, 0.5, 0.35, 0.9, SHARED.redLight, 0, 0, 0.5);
    const b = box(bar, 0.5, 0.35, 0.9, SHARED.blueLight, 0, 0, -0.5);
    bar.position.set(-0.2, 2.5, 0);
    this.group.add(bar);
    this.lightBar = bar;
    this._barLamps = [r, b];
  }

  // Nitro: a few seconds of extra top speed and acceleration.
  // Dante's crew ability calls this; the flame shows while it burns.
  boost(seconds) { this.boostTimer = Math.max(this.boostTimer, seconds); }

  // Drive the car for one step. throttle -1..1, steer -1..1, handbrake bool.
  drive(dt, throttle, steer, handbrake) {
    const boosting = this.boostTimer > 0;
    if (boosting) this.boostTimer -= dt;
    this._integrateSpeed(dt, throttle, handbrake, boosting);
    this._integrateHeading(dt, steer, handbrake);
    this._refreshLamps(throttle, handbrake);
    this._refreshFlame(boosting);
    this._syncPose(dt);
  }

  // Longitudinal physics: pedal force, drag, and the speed cap. Reverse
  // pulls harder than forward drive so a three-point turn is quick.
  _integrateSpeed(dt, throttle, handbrake, boosting) {
    const s = this.spec;
    const pedal = throttle > 0 ? s.accel : s.accel * 1.4;
    this.speed += throttle * pedal * (boosting ? 1.5 : 1) * dt;
    this.speed -= this.speed * (handbrake ? 1.6 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const damaged = this.health < 30 ? 0.55 : 1;
    const cap = s.topSpeed * damaged * (boosting ? 1.35 : 1);
    this.speed = Math.max(-12, Math.min(cap, this.speed));
  }

  // Steering: the wheel eases toward the input, and the car turns in
  // proportion to speed. Damage degrades the handling, not just the top
  // speed: a beaten-up car turns sluggish, so a chase in a wreck feels
  // like a chase.
  _integrateHeading(dt, steer, handbrake) {
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);
    const pace = Math.abs(this.speed);
    const handling = 0.6 + 0.4 * (this.health / 100);
    const turnRate = this.steer * (0.9 + Math.min(1, pace / 20) * 0.9)
      * (handbrake ? 1.7 : 1) * handling;
    const bite = Math.min(1, pace / 6 + 0.25);
    this.heading += turnRate * dt * Math.sign(this.speed || 1) * bite;
  }

  // Brake lights brighten when reversing or handbraking. Reverse lights
  // follow actual rearward motion, not the pedal: a car rolling back
  // downhill lights them too.
  _refreshLamps(throttle, handbrake) {
    const braking = throttle < 0 || handbrake;
    const want = braking ? SHARED.tailBright : SHARED.tailDim;
    if (this.tailLights[0].material !== want) {
      for (const t of this.tailLights) t.material = want;
    }
    const reversing = this.speed < -0.5;
    if (this.reverseLights[0].visible !== reversing) {
      for (const l of this.reverseLights) l.visible = reversing;
    }
  }

  // The nitro flame flickers while the boost burns.
  _refreshFlame(boosting) {
    if (!this.flame) return;
    this.flame.visible = boosting;
    if (boosting) this.flame.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  // Move the mesh to the physics state, spin the wheels, flash the bar.
  _syncPose(dt) {
    this.pos.x += Math.cos(this.heading) * this.speed * dt;
    this.pos.z += -Math.sin(this.heading) * this.speed * dt;
    this.group.position.copy(this.pos);
    this.group.rotation.y = -this.heading;
    for (const w of this.wheels) w.rotation.y += this.speed * dt * 0.9;
    if (this.lightBar) {
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      this._barLamps[0].material = phase ? SHARED.redLight : SHARED.blueLight;
      this._barLamps[1].material = phase ? SHARED.blueLight : SHARED.redLight;
    }
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health < 35 && !this.smoking) this.smoking = true;
  }

  repair() { this.health = 100; this.smoking = false; }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }

  dispose() {
    this.scene.remove(this.group);
  }
}

// A police helicopter: hovers above a target, shines a searchlight pool.
export class Helicopter {
  constructor(scene, start = null) {
    this.scene = scene;
    this.hoverHeight = 15;
    this.group = new THREE.Group();
    this._airframe();
    this._rotorAssembly();
    this._searchlight();
    // Spawn above the target, not at the world origin.
    const sx = start ? start.x : 0;
    const sz = start ? start.z : 0;
    this.group.position.set(sx + 25, this.hoverHeight, sz + 6);
    scene.add(this.group);
  }

  _airframe() {
    const shell = new THREE.MeshPhongMaterial({ color: 0xd8dce2, shininess: 40 });
    const body = box(this.group, 5, 2, 2.4, shell, 0, 0, 0, true);
    body.castShadow = true;
    // Red cheatline so the light body reads as a police heli.
    box(this.group, 5.1, 0.5, 2.5, new THREE.MeshLambertMaterial({ color: 0xc03030 }), 0, -0.3, 0);
    box(this.group, 4, 0.8, 0.8, shell, -4, 0.4, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), shell);
    mast.position.y = 1.5;
    this.group.add(mast);
  }

  _rotorAssembly() {
    this.rotor = new THREE.Group();
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const blade = box(this.rotor, 11, 0.12, 0.5, bladeMat, 0, 0, 0);
    const cross = blade.clone();
    cross.rotation.y = Math.PI / 2;
    this.rotor.add(cross);
    this.rotor.position.y = 2.1;
    this.group.add(this.rotor);
  }

  // Searchlight pool on the ground below (no cone: a cone reads as a
  // solid wedge from the chase camera). The heli itself is the signal.
  _searchlight() {
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(6, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.22 }),
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = -13;
    this.group.add(spot);
    this.spot = spot;
  }

  update(dt, target, time) {
    this.rotor.rotation.y += dt * 22;
    // Hover ahead of the target, slightly to the side, close and low
    // enough for the chase camera to see it in the top of the frame.
    const want = new THREE.Vector3(
      target.x + 25 + Math.sin(time * 0.4) * 8,
      this.hoverHeight,
      target.z + 6 + Math.cos(time * 0.3) * 8,
    );
    this.group.position.lerp(want, Math.min(1, dt * 1.8));
    this.group.rotation.y = Math.atan2(
      target.x - this.group.position.x,
      target.z - this.group.position.z,
    );
    // The searchlight sweeps a slow circle around the target instead of
    // sitting dead-centre: the heli is visibly hunting.
    const sweep = time * 0.7;
    this.spot.position.x = Math.cos(sweep) * 4;
    this.spot.position.z = Math.sin(sweep) * 4;
  }

  dispose() { this.scene.remove(this.group); }
}
