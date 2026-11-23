// CALA LUNA — player: Luz Vega on foot and behind the wheel.
// On foot: run, jump, punch. In a car: drive, handbrake, carjack.
// Holds health, armor, cash and the current weapon.

import * as THREE from 'three';
import { PLAYER, WEAPONS } from './config.js';

export class Player {
  constructor(scene, startPos) {
    this.scene = scene;
    this.pos = new THREE.Vector3(startPos[0], 0, startPos[1]);
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
    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  _buildMesh() {
    // Luz: yellow jacket, dark jeans, cap. Distinct at a glance.
    const jacket = new THREE.MeshLambertMaterial({ color: 0xf2c230 });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const cap = new THREE.MeshLambertMaterial({ color: 0xd43a2f });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), jeans);
    legs.position.y = 0.45;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.45), jacket);
    torso.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 2.05;
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), cap);
    capTop.position.y = 2.35;
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), jacket);
    this.armL.position.set(-0.5, 1.4, 0);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.5;
    // A visible pistol in the right hand when armed.
    this.gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    this.gunMesh.position.set(0.5, 1.05, 0.3);
    this.gunMesh.visible = false;
    this.group.add(legs, torso, head, capTop, this.armL, this.armR, this.gunMesh);
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

  // Back to a new game: full health, starting cash, starting loadout,
  // on foot at the safehouse. A fresh PLAY uses this; CONTINUE loads a save.
  reset() {
    if (this.car) { this.car.driver = null; this.car = null; }
    this.pos.set(PLAYER.startPos[0], 0, PLAYER.startPos[1]);
    this.heading = 0;
    this.velY = 0;
    this.onGround = true;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.stamina = PLAYER.maxStamina;
    this.sprintLocked = false;
    this.medkits = 0;
    this.cash = PLAYER.startCash;
    this.weapon = 'fists';
    this.ammo = { pistol: 60, shotgun: 20, rifle: 0 };
    this.owned = new Set(['fists', 'pistol']);
    this.group.visible = true;
    this.group.position.copy(this.pos);
    this.gunMesh.visible = false;
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
      this.heading += Math.max(-10 * dt, Math.min(10 * dt, diff));
      this.walkPhase += dt * (wantSprint ? 13 : 8);
    }
    if (jump && this.onGround) {
      this.velY = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= 24 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    }
    city.resolveCollision(this.pos, 0.7);
    this.group.position.copy(this.pos);
    this.group.rotation.y = -this.heading;
    const swing = Math.sin(this.walkPhase) * (len > 0.01 ? 0.55 : 0);
    this.armL.rotation.x = swing;
    this.armR.rotation.x = -swing;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      this.armR.rotation.x = -1.6;
    }
  }

  punch() { this.punchTimer = 0.3; }

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
