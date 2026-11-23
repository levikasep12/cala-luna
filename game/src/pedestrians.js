// CALA LUNA — pedestrians: sidewalk walkers with somewhere to be.
// They stroll the blocks, wait at corners, and flee when shots are fired
// or a police chase screams past. Built from boxes, like everything else.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { makeRng, pick, range } from './random.js';

const SHIRTS = [0xd84a4a, 0x4a90d8, 0x4ad88a, 0xd8c44a, 0xb04ad8, 0x4ad8d0, 0xe8e8e8, 0x2a2a2a];
const PANTS = [0x2a3550, 0x3a3a3a, 0x5a4a3a, 0x24382a];

export class Pedestrians {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed + 202);
    this.peds = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  ensureCount(target, playerPos) {
    while (this.peds.length < target) this._spawn(playerPos);
  }

  _spawn(playerPos) {
    const rng = this.rng;
    const streets = this.city.streetXs;
    const x = pick(rng, streets) + pick(rng, [-1, 1]) * (8 + rng() * 4);
    const z = pick(rng, streets) + pick(rng, [-1, 1]) * (8 + rng() * 4);
    const px = x + range(rng, -120, 120);
    const pz = z + range(rng, -120, 120);
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
    const pants = new THREE.MeshLambertMaterial({ color: pick(rng, PANTS) });
    const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xe8b88a, 0xc88a5a, 0x8a5a3a, 0xf0c8a0]) });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.35), pants);
    legs.position.y = 0.42;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), shirt);
    torso.position.y = 1.28;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin);
    head.position.y = 1.95;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), shirt);
    armL.position.set(-0.45, 1.3, 0);
    const armR = armL.clone();
    armR.position.x = 0.45;
    g.add(legs, torso, head, armL, armR);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(px, 0, pz);
    this.group.add(g);
    this.peds.push({
      g, armL, armR,
      pos: g.position,
      heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 0.9,
      walkPhase: rng() * 6,
      target: this._newTarget(px, pz),
      fleeing: 0,
      state: 'walk',
    });
  }

  _newTarget(x, z) {
    const streets = this.city.streetXs;
    return new THREE.Vector3(pick(this.rng, streets), 0, pick(this.rng, streets));
  }

  scareAt(pos, radius) {
    for (const p of this.peds) {
      const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z;
      if (dx * dx + dz * dz < radius * radius) {
        p.fleeing = 4 + this.rng() * 3;
        p.state = 'flee';
      }
    }
  }

  update(dt, city, playerPos) {
    const rng = this.rng;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const dx = p.pos.x - playerPos.x, dz = p.pos.z - playerPos.z;
      if (dx * dx + dz * dz > 280 * 280) {
        this.group.remove(p.g);
        this.peds.splice(i, 1);
        continue;
      }
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        // Run away from the player.
        const d = Math.max(1, Math.hypot(dx, dz));
        p.heading = Math.atan2(-dz / d, dx / d);
        p.pos.x += Math.cos(p.heading) * 5.5 * dt;
        p.pos.z += -Math.sin(p.heading) * 5.5 * dt;
        if (p.fleeing <= 0) p.state = 'walk';
      } else {
        const t = p.target;
        const tx = t.x - p.pos.x, tz = t.z - p.pos.z;
        const dist = Math.hypot(tx, tz);
        if (dist < 3) {
          p.target = this._newTarget(p.pos.x, p.pos.z);
        } else {
          const want = Math.atan2(-tz, tx);
          let diff = want - p.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.heading += Math.max(-2.5 * dt, Math.min(2.5 * dt, diff));
          p.pos.x += Math.cos(p.heading) * p.speed * dt;
          p.pos.z += -Math.sin(p.heading) * p.speed * dt;
        }
      }
      city.resolveCollision(p.pos, 0.6);
      p.g.rotation.y = -p.heading;
      p.walkPhase += dt * (p.state === 'flee' ? 14 : 7);
      const swing = Math.sin(p.walkPhase) * (p.state === 'flee' ? 0.9 : 0.5);
      p.armL.rotation.x = swing;
      p.armR.rotation.x = -swing;
      p.g.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.06;
    }
  }

  dispose() { this.scene.remove(this.group); this.peds = []; }
}
