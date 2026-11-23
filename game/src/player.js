// CALA LUNA — player: Luz Vega, on foot and behind the wheel.
// On foot she walks, sprints, jumps and punches; in a car the car does
// the moving and she just rides. She also carries the run's state:
// health, armor, stamina, cash, the medkit pouch and her weapons.
// The body is built from a parts table — every box in one place — and
// each frame of walking is three small steps: move, fall, pose.

import * as THREE from 'three';
import { PLAYER, WEAPONS } from './config.js';

const GRAVITY = 24; // units per second squared, while airborne
const TURN_RATE = 10; // radians per second the body can turn
const ARM_SWING = 0.55; // radians of arm swing at a walk
const PUNCH_ANGLE = -1.6; // right arm extended while punching
const PUNCH_TIME = 0.3; // seconds a punch pose lasts

// Luz's body, part by part: [width, height, depth], material, position.
// Yellow jacket, dark jeans, cap — distinct at a glance.
const BODY_PARTS = [
  { size: [0.6, 0.9, 0.4], mat: 'jeans', at: [0, 0.45, 0] },
  { size: [0.75, 0.9, 0.45], mat: 'jacket', at: [0, 1.35, 0] },
  { size: [0.5, 0.5, 0.5], mat: 'skin', at: [0, 2.05, 0] },
  { size: [0.55, 0.18, 0.55], mat: 'cap', at: [0, 2.35, 0] },
];

const BODY_COLORS = {
  jacket: 0xf2c230,
  jeans: 0x2a3550,
  skin: 0xe8b88a,
  cap: 0xd43a2f,
};

export class Player {
  constructor(scene, startPos) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.group = new THREE.Group();
    this._buildMesh();
    this._freshState(startPos);
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  // A new game, or a reset to one: full health, starting cash, starting
  // loadout, on foot at the given spot. The constructor and reset()
  // share it, so a fresh PLAY and a new Player can never drift apart.
  _freshState(startPos) {
    this.pos.set(startPos[0], 0, startPos[1]);
    this.heading = 0;
    this.velY = 0;
    this.onGround = true;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.stamina = PLAYER.maxStamina;
    this.sprintLocked = false; // sprint blocked until stamina recovers
    this.medkits = 0; // carried medkits, bought at Iron & Oak (key 5 to use)
    this.cash = PLAYER.startCash;
    this.weapon = 'fists';
    this.ammo = { pistol: 60, shotgun: 20, rifle: 0 };
    this.owned = new Set(['fists', 'pistol']);
    this.car = null; // Vehicle or null
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.gunMesh.visible = false;
  }

  _part(size, material, at) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(at[0], at[1], at[2]);
    return mesh;
  }

  _buildMesh() {
    const mats = {};
    for (const [name, color] of Object.entries(BODY_COLORS)) {
      mats[name] = new THREE.MeshLambertMaterial({ color });
    }
    for (const part of BODY_PARTS) {
      this.group.add(this._part(part.size, mats[part.mat], part.at));
    }
    this.armL = this._part([0.2, 0.8, 0.2], mats.jacket, [-0.5, 1.4, 0]);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.5;
    // A visible pistol in the right hand when armed.
    this.gunMesh = this._part([0.45, 0.14, 0.14],
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }), [0.5, 1.05, 0.3]);
    this.gunMesh.visible = false;
    this.group.add(this.armL, this.armR, this.gunMesh);
    this.group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  }

  get inCar() { return this.car !== null; }
  get speedKmh() { return this.car ? this.car.speedKmh : 0; }

  setWeapon(id) {
    if (!this.owned.has(id)) return false;
    this.weapon = id;
    this.gunMesh.visible = id !== 'fists';
    return true;
  }

  // Armor eats 60% of each hit until it runs out; the rest is health.
  takeDamage(amount) {
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.6);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) { this.health = Math.min(PLAYER.maxHealth, this.health + amount); }

  // Use a carried medkit: 'used', 'empty' (none carried) or 'full'
  // (already at full health — the kit stays in the pouch). The caller
  // shows the feedback; this only spends the kit on a real heal.
  useMedkit() {
    if (this.medkits <= 0) return 'empty';
    if (this.health >= PLAYER.maxHealth) return 'full';
    this.medkits--;
    this.heal(50);
    return 'used';
  }

  // Back to a new game: the fresh state, on foot at the safehouse, the
  // body visible again. A fresh PLAY uses this; CONTINUE loads a save.
  reset() {
    if (this.car) { this.car.driver = null; this.car = null; }
    this._freshState(PLAYER.startPos);
    this.group.visible = true;
    this.group.position.copy(this.pos);
  }

  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    this.group.visible = false;
    this.pos.copy(car.pos);
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.driver = null;
    this.car = null;
    const side = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
    this.pos.copy(car.pos).addScaledVector(side, 3);
    this.pos.y = 0;
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.heading = car.heading;
  }

  // On-foot movement for one step. moveX/moveY are camera-relative axes.
  moveOnFoot(dt, moveX, moveY, camYaw, sprint, jump, city) {
    if (this.inCar) { this._regenStamina(dt); return; }
    const moving = this._stepWalk(dt, moveX, moveY, camYaw, sprint);
    this._stepGravity(dt, jump);
    city.resolveCollision(this.pos, 0.7);
    this.group.position.copy(this.pos);
    this.group.rotation.y = -this.heading;
    this._stepPose(dt, moving);
  }

  // Walk: camera-relative direction, sprint draining stamina, the body
  // turning toward the direction of travel. Returns whether Luz moved.
  _stepWalk(dt, moveX, moveY, camYaw, sprint) {
    // Camera-relative: forward is -z rotated by camYaw.
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = fx * moveY + rx * moveX;
    let mz = fz * moveY + rz * moveX;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    // Sprinting drains stamina; at 0 the sprint locks until the bar
    // recovers past the refill mark, so a flat-out run needs pacing.
    const wantSprint = sprint && moving && !this.sprintLocked;
    const speed = wantSprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrain * dt);
      if (this.stamina <= 0) this.sprintLocked = true;
    } else {
      this._regenStamina(dt);
    }
    if (moving) {
      mx /= len; mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      const want = Math.atan2(-mz, mx);
      let diff = want - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
      this.walkPhase += dt * (wantSprint ? 13 : 8);
    }
    return moving;
  }

  // Jump and fall: a jump only leaves the ground, gravity brings Luz
  // back, and landing resets the jump.
  _stepGravity(dt, jump) {
    if (jump && this.onGround) {
      this.velY = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= GRAVITY * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    }
  }

  // The walk cycle: arms swing against the stride, still when standing.
  // A punch overrides the right arm while its timer runs.
  _stepPose(dt, moving) {
    const swing = Math.sin(this.walkPhase) * (moving ? ARM_SWING : 0);
    this.armL.rotation.x = swing;
    this.armR.rotation.x = -swing;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      this.armR.rotation.x = PUNCH_ANGLE;
    }
  }

  punch() { this.punchTimer = PUNCH_TIME; }

  _regenStamina(dt) {
    this.stamina = Math.min(PLAYER.maxStamina, this.stamina + PLAYER.staminaRegen * dt);
    if (this.stamina >= PLAYER.staminaRefill) this.sprintLocked = false;
  }

  syncFromCar() {
    if (this.car) {
      this.pos.copy(this.car.pos);
      this.heading = this.car.heading;
    }
  }

  dispose() { this.scene.remove(this.group); }
}
