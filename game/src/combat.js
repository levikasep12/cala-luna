// CALA LUNA — combat: fists, pistol, shotgun and rifle, plus the
// enemies who shoot back. Hitscan with a visible tracer and muzzle
// flash; enemies are rival gang members with simple seek-and-shoot AI.
// Shooting is one method per concern: the pellets fan out, the nearest
// enemy in the cone takes the hit, a kill pays pocket cash. The enemy
// turn is the same shape: chase until in range, strafe while shooting,
// stagger when hit.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

const ENEMY_HEALTH = 60;
const ENEMY_SPEED = 4.2; // closing speed, units per second
const STRAFE_SPEED = 1.6; // sideways speed while in range
const ENGAGE_RANGE = 14; // closer than this, enemies strafe instead of chase
const SHOOT_RANGE = 45; // enemies only shoot inside this
const CONE_COS = 0.985; // how narrow the player's hitscan cone is
const FLINCH_TIME = 0.5; // seconds an enemy staggers after a hit
const KNOCKBACK = 0.4; // units an enemy is pushed back by a hit
const KILL_CASH = 25; // pocket cash per rival dropped

export class Combat {
  constructor(scene, audio, effects) {
    this.scene = scene;
    this.audio = audio;
    this.effects = effects;
    this.enemies = [];
    this.fireTimer = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  // A rival in a red shirt (or a dark uniform for police gang spawns),
  // gun in hand, standing at x, z and already looking for a fight.
  spawnEnemy(x, z, gang) {
    const g = this._buildEnemyMesh(gang);
    g.position.set(x, 0, z);
    this.group.add(g);
    const e = {
      g, pos: g.position, health: ENEMY_HEALTH,
      shootTimer: 1 + Math.random() * 2, gang, dead: false,
      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeTimer: 2 + Math.random() * 2,
      flinch: 0, // seconds left of being staggered by a hit
    };
    this.enemies.push(e);
    return e;
  }

  _buildEnemyMesh(gang) {
    const shirt = new THREE.MeshLambertMaterial({ color: gang === 'police' ? 0x1c2733 : 0x8a2a2a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc88a5a });
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const g = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), pants);
    legs.position.y = 0.45;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.45), shirt);
    torso.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 2.05;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), gunMat);
    gun.position.set(0.4, 1.3, 0.4);
    g.add(legs, torso, head, gun);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }

  clearEnemies() {
    for (const e of this.enemies) this.group.remove(e.g);
    this.enemies = [];
  }

  aliveCount() { return this.enemies.filter((e) => !e.dead).length; }

  // The player fires the current weapon toward the aim point.
  // Returns the number of enemies killed.
  playerShoot(player, aimPoint, dt) {
    this.fireTimer -= dt;
    const spec = WEAPONS[player.weapon];
    if (this.fireTimer > 0) return 0;
    if (player.weapon !== 'fists') {
      if ((player.ammo[player.weapon] || 0) <= 0) return 0;
      player.ammo[player.weapon] -= 1;
    }
    this.fireTimer = spec.rate;
    const origin = player.pos.clone();
    origin.y = 1.5;
    let kills = 0;
    const pellets = spec.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      kills += this._firePellet(player, spec, origin, aimPoint, pellets);
    }
    // One flash and one report per trigger pull, not per pellet.
    // Fists don't draw a muzzle flash: a punch is not a gun.
    if (player.weapon !== 'fists') this.effects.muzzleFlash(origin, player.heading);
    if (player.weapon === 'shotgun') this.audio.shotgun();
    else if (player.weapon !== 'fists') this.audio.shoot();
    else { this.audio.punch(); player.punch(); }
    return kills;
  }

  // One pellet (or the single bullet): spread it, trace it, hit the
  // nearest enemy in the cone. Returns 1 on a kill, else 0.
  _firePellet(player, spec, origin, aimPoint, pellets) {
    const dir = aimPoint.clone().sub(origin).normalize();
    if (pellets > 1) {
      dir.x += (Math.random() - 0.5) * 0.14;
      dir.y += (Math.random() - 0.5) * 0.1;
      dir.z += (Math.random() - 0.5) * 0.14;
      dir.normalize();
    }
    const hit = this._pickTarget(origin, dir, spec.range);
    const end = origin.clone().addScaledVector(dir, hit ? hit.dist : spec.range);
    // Fists don't draw a tracer: a punch is not a gun.
    if (player.weapon !== 'fists') this.effects.tracer(origin, end);
    if (!hit) return 0;
    return this._hitEnemy(player, hit.enemy, dir, spec.damage) ? 1 : 0;
  }

  // The nearest living enemy within range and a narrow cone of the shot.
  _pickTarget(origin, dir, range) {
    let best = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = new THREE.Vector3(e.pos.x, 1.3, e.pos.z).sub(origin);
      const d = to.length();
      if (d > range) continue;
      if (to.normalize().dot(dir) < CONE_COS) continue;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best ? { enemy: best, dist: bestD } : null;
  }

  // A hit staggers the enemy half a second and knocks them back a step:
  // landing shots should feel like it interrupts them. A kill pays
  // pocket cash and drops the body. Returns true on a kill.
  _hitEnemy(player, e, dir, damage) {
    e.health -= damage;
    this.effects.blood(e.pos);
    e.flinch = FLINCH_TIME;
    e.pos.x += dir.x * KNOCKBACK;
    e.pos.z += dir.z * KNOCKBACK;
    if (e.health > 0) return false;
    e.dead = true;
    e.g.rotation.x = -Math.PI / 2;
    e.g.position.y = 0.3;
    // Rivals carry pocket cash: $25 a head, straight to Luz.
    player.cash += KILL_CASH;
    this.effects.burst(new THREE.Vector3(e.pos.x, 1, e.pos.z), 0xffd166, 6, 4, 0.25);
    return true;
  }

  // Enemies walk toward the player and shoot when in range. Returns
  // 'player-dead' if an enemy shot finishes Luz.
  update(dt, player, city) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flinch > 0) {
        // Staggered: no moving, no shooting, just recovering.
        e.flinch -= dt;
        continue;
      }
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dz, dx);
      e.g.rotation.y = -want;
      if (dist > ENGAGE_RANGE) this._chasePlayer(e, want, dt, city);
      else this._strafePlayer(e, want, dt, city);
      if (this._enemyShot(e, player, dist, dt)) return 'player-dead';
    }
    return null;
  }

  _chasePlayer(e, want, dt, city) {
    e.pos.x += Math.cos(want) * ENEMY_SPEED * dt;
    e.pos.z += -Math.sin(want) * ENEMY_SPEED * dt;
    city.resolveCollision(e.pos, 0.7);
  }

  // In range: strafe sideways so the player can't just stand still and
  // trade shots with a statue. Direction flips every couple of seconds.
  _strafePlayer(e, want, dt, city) {
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) { e.strafeTimer = 2 + Math.random() * 2; e.strafeDir *= -1; }
    e.pos.x += -Math.sin(want) * e.strafeDir * STRAFE_SPEED * dt;
    e.pos.z += -Math.cos(want) * e.strafeDir * STRAFE_SPEED * dt;
    city.resolveCollision(e.pos, 0.7);
  }

  // An enemy's shot: the timer counts down, the shot fires inside range,
  // and accuracy falls off with distance. A moving car is harder to hit
  // than a person on foot — drive-bys cut both ways, so the player in a
  // car is a worse target. Returns true if the shot killed the player.
  _enemyShot(e, player, dist, dt) {
    e.shootTimer -= dt;
    if (e.shootTimer > 0 || dist >= SHOOT_RANGE) return false;
    e.shootTimer = 1.1 + Math.random() * 0.9;
    const origin = e.pos.clone(); origin.y = 1.4;
    const target = player.pos.clone(); target.y = 1.3;
    const dir = target.sub(origin).normalize();
    const acc = (dist < 15 ? 0.55 : dist < 30 ? 0.4 : 0.25) * (player.inCar ? 0.6 : 1);
    const hit = Math.random() < acc;
    this.effects.tracer(origin, origin.clone().addScaledVector(dir, Math.min(dist, SHOOT_RANGE)));
    this.audio.shoot();
    if (hit && player.health > 0) {
      const died = player.takeDamage(8 + Math.random() * 8);
      this.effects.blood(player.pos);
      if (died) return true;
    }
    return false;
  }

  dispose() { this.scene.remove(this.group); this.enemies = []; }
}
