// CALA LUNA — vehicles: every car on the island, built from boxes
// and driven by one arcade model. A chassis table gives each silhouette
// its footprint; a part list describes the body, and the same Vehicle
// class serves traffic, the police, the player's ride and the wrecks
// left behind. The helicopter lives here too: a vehicle with no wheels,
// a spinning rotor and a searchlight pool.

import * as THREE from 'three';
import { VEHICLES } from './config.js';

// Chassis footprints: trucks and vans are longer and wider; everything
// else shares the car footprint. The truck trades its glass cabin for
// an open bed.
const CHASSIS = {
  truck: { length: 7.5, width: 2.6, bed: true },
  swat: { length: 6.5, width: 2.6, bed: false },
  car: { length: 4.6, width: 2.1, bed: false },
};

// Materials and geometries every car shares — one wheel, one glass,
// one set of lamps, reused across the whole island.
const STOCK = {
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

// One box mesh: size, material, position, parent, optional shadow.
function cube(parent, w, h, d, mat, x, y, z, shadow = false) {
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
    this.chassis = CHASSIS[type] || CHASSIS.car;
    this.length = this.chassis.length;
    this.width = this.chassis.width;
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
    this._build();
  }

  // Build the visible car: body parts from the spec list, then wheels,
  // lamps, the nitro flame, and the type's extra dressing.
  _build() {
    this._buildParts(this._bodyParts());
    this._mountWheels();
    this._fitLamps();
    this._fitFlame();
    if (this.type === 'police') this._fitLightBar();
    if (this.type === 'taxi') cube(this.group, 0.9, 0.35, 0.5, STOCK.headMat, -0.2, 2.5, 0);
  }

  // The body as a part list: the slab, then the cabin — or, for the
  // truck, the cab and the open bed instead of glass.
  _bodyParts() {
    const { length: len, width: wid } = this;
    const paint = new THREE.MeshPhongMaterial({ color: this.spec.color, shininess: 60 });
    const parts = [
      { w: len, h: 1.1, d: wid, mat: paint, x: 0, y: 0.85, z: 0, shadow: true },
    ];
    if (this.chassis.bed) {
      parts.push(
        { w: 1.8, h: 1.6, d: wid, mat: paint, x: len / 2 - 0.9, y: 1.8, z: 0, shadow: true },
        { w: 4.6, h: 1.0, d: wid - 0.2, mat: STOCK.bedMat, x: -1.1, y: 1.7, z: 0 },
      );
    } else {
      parts.push(
        { w: len * 0.45, h: 0.95, d: wid - 0.25, mat: STOCK.glassMat, x: -len * 0.05, y: 1.85, z: 0, shadow: true },
      );
    }
    return parts;
  }

  _buildParts(parts) {
    for (const p of parts) cube(this.group, p.w, p.h, p.d, p.mat, p.x, p.y, p.z, p.shadow);
  }

  _mountWheels() {
    const { length: len, width: wid } = this;
    const wx = len / 2 - 0.9;
    this.wheels = [];
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const w = new THREE.Mesh(STOCK.wheelGeo, STOCK.wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(sx * wx, 0.85, sz * wid / 2);
        this.group.add(w);
        this.wheels.push(w);
      }
    }
  }

  // Headlights, taillights (dim / bright) and the reverse lamps that
  // only light while the car is actually moving backwards.
  _fitLamps() {
    const { length: len, width: wid } = this;
    const nose = len / 2 + 0.05;
    const tail = -len / 2 - 0.05;
    const off = wid / 2 - 0.4;
    cube(this.group, 0.15, 0.3, 0.5, STOCK.headMat, nose, 0.95, off);
    cube(this.group, 0.15, 0.3, 0.5, STOCK.headMat, nose, 0.95, -off);
    this.tailLights = [
      cube(this.group, 0.15, 0.3, 0.5, STOCK.tailDim, tail, 0.95, off),
      cube(this.group, 0.15, 0.3, 0.5, STOCK.tailDim, tail, 0.95, -off),
    ];
    this.reverseLights = [
      cube(this.group, 0.15, 0.2, 0.4, STOCK.reverseMat, tail, 0.55, off),
      cube(this.group, 0.15, 0.2, 0.4, STOCK.reverseMat, tail, 0.55, -off),
    ];
    for (const l of this.reverseLights) l.visible = false;
  }

  // The nitro flame cone at the tailpipe, hidden until a boost burns.
  _fitFlame() {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), STOCK.flameMat);
    flame.rotation.z = Math.PI / 2;
    flame.position.set(-this.length / 2 - 0.8, 0.6, 0);
    flame.visible = false;
    this.group.add(flame);
    this.flame = flame;
  }

  // The police light bar: two lamps that alternate red and blue.
  _fitLightBar() {
    const bar = new THREE.Group();
    const r = cube(bar, 0.5, 0.35, 0.9, STOCK.redLight, 0, 0, 0.5);
    const b = cube(bar, 0.5, 0.35, 0.9, STOCK.blueLight, 0, 0, -0.5);
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
    this._pedal(dt, throttle, handbrake, boosting);
    this._steering(dt, steer, handbrake);
    this._lights(throttle, handbrake);
    this._nitro(boosting);
    this._place(dt);
  }

  // Longitudinal physics: pedal force, drag, and the speed cap. Reverse
  // pulls harder than forward drive so a three-point turn is quick.
  _pedal(dt, throttle, handbrake, boosting) {
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
  _steering(dt, steer, handbrake) {
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
  _lights(throttle, handbrake) {
    const braking = throttle < 0 || handbrake;
    const want = braking ? STOCK.tailBright : STOCK.tailDim;
    if (this.tailLights[0].material !== want) {
      for (const t of this.tailLights) t.material = want;
    }
    const reversing = this.speed < -0.5;
    if (this.reverseLights[0].visible !== reversing) {
      for (const l of this.reverseLights) l.visible = reversing;
    }
  }

  // The nitro flame flickers while the boost burns.
  _nitro(boosting) {
    if (!this.flame) return;
    this.flame.visible = boosting;
    if (boosting) this.flame.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  // Move the mesh to the physics state, spin the wheels, flash the bar.
  _place(dt) {
    this.pos.x += Math.cos(this.heading) * this.speed * dt;
    this.pos.z += -Math.sin(this.heading) * this.speed * dt;
    this.group.position.copy(this.pos);
    this.group.rotation.y = -this.heading;
    for (const w of this.wheels) w.rotation.y += this.speed * dt * 0.9;
    if (this.lightBar) {
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      this._barLamps[0].material = phase ? STOCK.redLight : STOCK.blueLight;
      this._barLamps[1].material = phase ? STOCK.blueLight : STOCK.redLight;
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
    this._buildBody();
    this._buildRotor();
    this._buildSpot();
    // Spawn above the target, not at the world origin.
    const sx = start ? start.x : 0;
    const sz = start ? start.z : 0;
    this.group.position.set(sx + 25, this.hoverHeight, sz + 6);
    scene.add(this.group);
  }

  _buildBody() {
    const shell = new THREE.MeshPhongMaterial({ color: 0xd8dce2, shininess: 40 });
    const body = cube(this.group, 5, 2, 2.4, shell, 0, 0, 0, true);
    body.castShadow = true;
    // Red cheatline so the light body reads as a police heli.
    cube(this.group, 5.1, 0.5, 2.5, new THREE.MeshLambertMaterial({ color: 0xc03030 }), 0, -0.3, 0);
    cube(this.group, 4, 0.8, 0.8, shell, -4, 0.4, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), shell);
    mast.position.y = 1.5;
    this.group.add(mast);
  }

  _buildRotor() {
    this.rotor = new THREE.Group();
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const blade = cube(this.rotor, 11, 0.12, 0.5, bladeMat, 0, 0, 0);
    const cross = blade.clone();
    cross.rotation.y = Math.PI / 2;
    this.rotor.add(cross);
    this.rotor.position.y = 2.1;
    this.group.add(this.rotor);
  }

  // Searchlight pool on the ground below (no cone: a cone reads as a
  // solid wedge from the chase camera). The heli itself is the signal.
  _buildSpot() {
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
