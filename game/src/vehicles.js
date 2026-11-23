// CALA LUNA — vehicles: builds every car from boxes, and drives them.
// Arcade physics: acceleration, steering, handbrake, damage and smoke.
// One factory makes traffic cars, police cars, the player's ride and wrecks.

import * as THREE from 'three';
import { VEHICLES } from './config.js';

const WHEEL_GEO = new THREE.CylinderGeometry(0.85, 0.85, 0.6, 10);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const GLASS_MAT = new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 90, transparent: true, opacity: 0.75 });
const LIGHT_RED = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
const LIGHT_BLUE = new THREE.MeshBasicMaterial({ color: 0x2a6aff });

export class Vehicle {
  constructor(scene, type, x, z, heading) {
    this.scene = scene;
    this.type = type;
    this.spec = VEHICLES[type];
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading; // radians, 0 = +x
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.smoking = false;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.rotation.y = -heading;
    scene.add(this.group);
    this._buildMesh();
  }

  _buildMesh() {
    const s = this.spec;
    const bodyMat = new THREE.MeshPhongMaterial({ color: s.color, shininess: 60 });
    const isTruck = this.type === 'truck';
    const isVan = this.type === 'swat';
    const len = isTruck ? 7.5 : isVan ? 6.5 : 4.6;
    const wid = isTruck || isVan ? 2.6 : 2.1;
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, wid), bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    this.group.add(body);
    if (isTruck) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, wid), bodyMat);
      cab.position.set(len / 2 - 0.9, 1.8, 0);
      cab.castShadow = true;
      this.group.add(cab);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, wid - 0.2),
        new THREE.MeshLambertMaterial({ color: 0x6a5a48 }));
      bed.position.set(-1.1, 1.7, 0);
      this.group.add(bed);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.45, 0.95, wid - 0.25), GLASS_MAT);
      cabin.position.set(-len * 0.05, 1.85, 0);
      cabin.castShadow = true;
      this.group.add(cabin);
    }
    // Wheels
    this.wheels = [];
    const wx = len / 2 - 0.9;
    for (const [x, z] of [[wx, wid / 2], [wx, -wid / 2], [-wx, wid / 2], [-wx, -wid / 2]]) {
      const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.85, z);
      this.group.add(w);
      this.wheels.push(w);
    }
    // Headlights + taillights
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    hl.position.set(len / 2 + 0.05, 0.95, wid / 2 - 0.4);
    this.group.add(hl);
    const hl2 = hl.clone(); hl2.position.z = -wid / 2 + 0.4; this.group.add(hl2);
    const tlMat = new THREE.MeshBasicMaterial({ color: 0x881512 });
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.5), tlMat);
    tl.position.set(-len / 2 - 0.05, 0.95, wid / 2 - 0.4);
    this.group.add(tl);
    const tl2 = tl.clone(); tl2.position.z = -wid / 2 + 0.4; this.group.add(tl2);
    // Brake lights: dim at cruise, bright when reversing or handbraking.
    this.tailLights = [tl, tl2];
    this.tailDim = tlMat;
    this.tailBright = new THREE.MeshBasicMaterial({ color: 0xff3020 });
    // Police light bar
    if (this.type === 'police') {
      const bar = new THREE.Group();
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), LIGHT_RED);
      r.position.z = 0.5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), LIGHT_BLUE);
      b.position.z = -0.5;
      bar.add(r, b);
      bar.position.set(-0.2, 2.5, 0);
      this.group.add(bar);
      this.lightBar = bar;
    }
    if (this.type === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
      sign.position.set(-0.2, 2.5, 0);
      this.group.add(sign);
    }
    this.length = len;
    this.width = wid;
  }

  // Drive the car for one step. throttle -1..1, steer -1..1, handbrake bool.
  drive(dt, throttle, steer, handbrake) {
    const s = this.spec;
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);
    const accel = throttle > 0 ? s.accel : s.accel * 1.4;
    this.speed += throttle * accel * dt;
    // Drag + rolling resistance
    this.speed -= this.speed * (handbrake ? 1.6 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const max = s.topSpeed * (this.health < 30 ? 0.55 : 1);
    this.speed = Math.max(-12, Math.min(max, this.speed));
    // Damage degrades the handling, not just the top speed: a beaten-up
    // car turns sluggish, so a chase in a wreck feels like a chase.
    const handling = 0.6 + 0.4 * (this.health / 100);
    const turnRate = this.steer * (0.9 + Math.min(1, Math.abs(this.speed) / 20) * 0.9) * (handbrake ? 1.7 : 1) * handling;
    this.heading += turnRate * dt * Math.sign(this.speed || 1) * Math.min(1, Math.abs(this.speed) / 6 + 0.25);
    // Brake lights: brighten when reversing or handbraking.
    const braking = throttle < 0 || handbrake;
    const wantMat = braking ? this.tailBright : this.tailDim;
    if (this.tailLights[0].material !== wantMat) {
      for (const t of this.tailLights) t.material = wantMat;
    }
    const dx = Math.cos(this.heading) * this.speed * dt;
    const dz = -Math.sin(this.heading) * this.speed * dt;
    this.pos.x += dx;
    this.pos.z += dz;
    this.group.position.copy(this.pos);
    this.group.rotation.y = -this.heading;
    for (const w of this.wheels) w.rotation.y += this.speed * dt * 0.9;
    if (this.lightBar) {
      const on = Math.floor(performance.now() / 180) % 2 === 0;
      this.lightBar.children[0].material = on ? LIGHT_RED : LIGHT_BLUE;
      this.lightBar.children[1].material = on ? LIGHT_BLUE : LIGHT_RED;
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
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xd8dce2, shininess: 40 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.4), bodyMat);
    body.castShadow = true;
    this.group.add(body);
    // Red cheatline so the light body reads as a police heli.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.5, 2.5), new THREE.MeshLambertMaterial({ color: 0xc03030 }));
    stripe.position.y = -0.3;
    this.group.add(stripe);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 0.8), bodyMat);
    tail.position.set(-4, 0.4, 0);
    this.group.add(tail);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6), bodyMat);
    mast.position.y = 1.5;
    this.group.add(mast);
    this.rotor = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    this.rotor.add(blade);
    const blade2 = blade.clone();
    blade2.rotation.y = Math.PI / 2;
    this.rotor.add(blade2);
    this.rotor.position.y = 2.1;
    this.group.add(this.rotor);
    // Searchlight pool on the ground below (no cone: a cone reads as a
    // solid wedge from the chase camera). The heli itself is the signal.
    const spot = new THREE.Mesh(new THREE.CircleGeometry(6, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.22 }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = -13;
    this.group.add(spot);
    this.spot = spot;
    this.hoverHeight = 15;
    // Spawn above the target, not at the world origin.
    const sx = start ? start.x : 0;
    const sz = start ? start.z : 0;
    this.group.position.set(sx + 25, this.hoverHeight, sz + 6);
    scene.add(this.group);
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
    this.group.rotation.y = Math.atan2(target.x - this.group.position.x, target.z - this.group.position.z);
    // The searchlight sweeps a slow circle around the target instead of
    // sitting dead-centre: the heli is visibly hunting.
    const sw = time * 0.7;
    this.spot.position.x = Math.cos(sw) * 4;
    this.spot.position.z = Math.sin(sw) * 4;
  }

  dispose() { this.scene.remove(this.group); }
}
