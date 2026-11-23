// CALA LUNA — pedestrians: sidewalk walkers with somewhere to be.
// They stroll the blocks, wait at corners, and flee when shots are fired
// or a police chase screams past. Built from boxes, like everything else.
// Each walker is a small state machine — walk, wait, flee — and the
// frame update dispatches on the state, so each behaviour reads alone.
// The crowd is seeded (seed + 202): the rng calls happen in the same
// order as ever, so seed 7 grows the same crowd.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { makeRng, pick, range } from './random.js';

const SHIRTS = [0xd84a4a, 0x4a90d8, 0x4ad88a, 0xd8c44a, 0xb04ad8, 0x4ad8d0, 0xe8e8e8, 0x2a2a2a];
const PANTS = [0x2a3550, 0x3a3a3a, 0x5a4a3a, 0x24382a];
const SKINS = [0xe8b88a, 0xc88a5a, 0x8a5a3a, 0xf0c8a0];
const HATS = [0xd8c49a, 0x2a2a2a, 0xd43a2f];

const DESPAWN_RANGE = 280; // walkers further than this from Luz recycle
const FLEE_SPEED = 5.5;
const TURN_RATE = 2.5; // radians per second a walker can turn
const CAR_FREEZE = 4.5; // a car this close stops a walker in their tracks
const CORNER_RADIUS = 3; // close enough to a target corner to pick a new one

// A walker's body, part by part: [width, height, depth], which colour
// set it takes, position. Arms are kept as refs — they swing.
const WALKER_PARTS = [
  { size: [0.55, 0.85, 0.35], color: 'pants', at: [0, 0.42, 0] },
  { size: [0.7, 0.85, 0.4], color: 'shirt', at: [0, 1.28, 0] },
  { size: [0.45, 0.45, 0.45], color: 'skin', at: [0, 1.95, 0] },
];

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
    this._makePed(px, pz);
  }

  // Place one pedestrian exactly — for staged scenes.
  spawnAt(x, z) { this._makePed(x, z); }

  _makePed(px, pz) {
    const rng = this.rng;
    // Colours first, in the seeded order: shirt, pants, skin.
    const colors = {
      shirt: pick(rng, SHIRTS),
      pants: pick(rng, PANTS),
      skin: pick(rng, SKINS),
    };
    const g = new THREE.Group();
    for (const part of WALKER_PARTS) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]),
        new THREE.MeshLambertMaterial({ color: colors[part.color] }),
      );
      mesh.position.set(part.at[0], part.at[1], part.at[2]);
      g.add(mesh);
    }
    const armL = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.75, 0.18),
      new THREE.MeshLambertMaterial({ color: colors.shirt }),
    );
    armL.position.set(-0.45, 1.3, 0);
    const armR = armL.clone();
    armR.position.x = 0.45;
    g.add(armL, armR);
    // One pedestrian in four wears a hat: cheap variety, so the crowd
    // stops looking like it was stamped from one mould.
    if (rng() < 0.25) {
      const hat = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.14, 0.6),
        new THREE.MeshLambertMaterial({ color: pick(rng, HATS) }),
      );
      hat.position.y = 2.24;
      g.add(hat);
    }
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
      waitTimer: 0,
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

  // cars: the vehicles a walker stops for (traffic + police). A
  // pedestrian with a car on top of them freezes instead of strolling
  // through the bonnet.
  update(dt, city, playerPos, cars = []) {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const dx = p.pos.x - playerPos.x, dz = p.pos.z - playerPos.z;
      if (dx * dx + dz * dz > DESPAWN_RANGE * DESPAWN_RANGE) {
        this.group.remove(p.g);
        this.peds.splice(i, 1);
        continue;
      }
      if (p.fleeing > 0) this._fleeStep(p, dt, dx, dz);
      else if (p.state === 'wait') this._waitStep(p, dt);
      else if (cars.some((c) => Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < CAR_FREEZE)) {
        // A car is right there: stand still this frame instead of
        // walking through it. The car moves on; the walker resumes.
      } else this._walkStep(p, dt);
      city.resolveCollision(p.pos, 0.6);
      p.g.rotation.y = -p.heading;
      this._poseWalker(p, dt);
    }
  }

  // Fleeing: run straight away from the player until the panic runs out.
  _fleeStep(p, dt, dx, dz) {
    p.fleeing -= dt;
    const d = Math.max(1, Math.hypot(dx, dz));
    p.heading = Math.atan2(-dz / d, dx / d);
    p.pos.x += Math.cos(p.heading) * FLEE_SPEED * dt;
    p.pos.z += -Math.sin(p.heading) * FLEE_SPEED * dt;
    if (p.fleeing <= 0) p.state = 'walk';
  }

  // Waiting: standing at the corner, deciding where to go next.
  _waitStep(p, dt) {
    p.waitTimer -= dt;
    if (p.waitTimer <= 0) {
      p.state = 'walk';
      p.target = this._newTarget(p.pos.x, p.pos.z);
    }
  }

  // Walking: turn toward the target corner and stroll. On arrival,
  // sometimes wait a few seconds instead of pivoting at once, like a
  // person with somewhere to be.
  _walkStep(p, dt) {
    const t = p.target;
    const tx = t.x - p.pos.x, tz = t.z - p.pos.z;
    const dist = Math.hypot(tx, tz);
    if (dist < CORNER_RADIUS) {
      if (this.rng() < 0.4) {
        p.state = 'wait';
        p.waitTimer = 2 + this.rng() * 3;
      } else {
        p.target = this._newTarget(p.pos.x, p.pos.z);
      }
      return;
    }
    const want = Math.atan2(-tz, tx);
    let diff = want - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
    p.pos.x += Math.cos(p.heading) * p.speed * dt;
    p.pos.z += -Math.sin(p.heading) * p.speed * dt;
  }

  // The walk cycle: arms swing against the stride, faster while fleeing,
  // still while waiting; a little bounce off the ground.
  _poseWalker(p, dt) {
    if (p.state !== 'wait') p.walkPhase += dt * (p.state === 'flee' ? 14 : 7);
    const swing = p.state === 'wait' ? 0 : Math.sin(p.walkPhase) * (p.state === 'flee' ? 0.9 : 0.5);
    p.armL.rotation.x = swing;
    p.armR.rotation.x = -swing;
    p.g.position.y = p.state === 'wait' ? 0 : Math.abs(Math.sin(p.walkPhase)) * 0.06;
  }

  dispose() { this.scene.remove(this.group); this.peds = []; }
}
