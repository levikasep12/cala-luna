// CALA LUNA — combat: fists, pistol, shotgun and rifle, plus the
// enemies who shoot back. Hitscan with a visible tracer and muzzle
// flash; enemies are rival gang members with simple seek-and-shoot AI.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

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

  spawnEnemy(x, z, gang) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: gang === 'police' ? 0x1c2733 : 0x8a2a2a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc88a5a });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), pants);
    legs.position.y = 0.45;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.45), shirt);
    torso.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 2.05;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.4, 1.3, 0.4);
    g.add(legs, torso, head, gun);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(x, 0, z);
    this.group.add(g);
    const e = {
      g, pos: g.position, health: 60, shootTimer: 1 + Math.random() * 2, gang, dead: false,
      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeTimer: 2 + Math.random() * 2,
      flinch: 0, // seconds left of being staggered by a hit
    };
    this.enemies.push(e);
    return e;
  }

  clearEnemies() {
    for (const e of this.enemies) this.group.remove(e.g);
    this.enemies = [];
  }

  aliveCount() { return this.enemies.filter((e) => !e.dead).length; }

  // The player fires the current weapon toward the aim point.
  // Returns the number of enemies hit.
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
    let hits = 0;
    const pellets = spec.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const dir = aimPoint.clone().sub(origin).normalize();
      if (pellets > 1) {
        dir.x += (Math.random() - 0.5) * 0.14;
        dir.y += (Math.random() - 0.5) * 0.1;
        dir.z += (Math.random() - 0.5) * 0.14;
        dir.normalize();
      }
      // Hit the nearest enemy within range and a narrow cone.
      let best = null, bestD = spec.range;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const to = new THREE.Vector3(e.pos.x, 1.3, e.pos.z).sub(origin);
        const d = to.length();
        if (d > spec.range) continue;
        const cos = to.normalize().dot(dir);
        if (cos < 0.985) continue;
        if (d < bestD) { best = e; bestD = d; }
      }
      const end = origin.clone().addScaledVector(dir, best ? bestD : spec.range);
      // Fists don't draw a tracer or a muzzle flash: a punch is not a gun.
      if (player.weapon !== 'fists') this.effects.tracer(origin, end);
      if (best) {
        best.health -= spec.damage;
        this.effects.blood(best.pos);
        // A hit staggers the enemy half a second and knocks them back
        // a step: landing shots should feel like it interrupts them.
        best.flinch = 0.5;
        best.pos.x += dir.x * 0.4;
        best.pos.z += dir.z * 0.4;
        if (best.health <= 0) {
          best.dead = true;
          best.g.rotation.x = -Math.PI / 2;
          best.g.position.y = 0.3;
          // Rivals carry pocket cash: $25 a head, straight to Luz.
          player.cash += 25;
          this.effects.burst(new THREE.Vector3(best.pos.x, 1, best.pos.z), 0xffd166, 6, 4, 0.25);
          hits++;
        }
      }
    }
    if (player.weapon !== 'fists') this.effects.muzzleFlash(origin, player.heading);
    if (player.weapon === 'shotgun') this.audio.shotgun();
    else if (player.weapon !== 'fists') this.audio.shoot();
    else { this.audio.punch(); player.punch(); }
    return hits;
  }

  // Enemies walk toward the player and shoot when in range.
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
      if (dist > 14) {
        e.pos.x += Math.cos(want) * 4.2 * dt;
        e.pos.z += -Math.sin(want) * 4.2 * dt;
        city.resolveCollision(e.pos, 0.7);
      } else {
        // In range: strafe sideways so the player can't just stand
        // still and trade shots with a statue. Direction flips every
        // couple of seconds.
        e.strafeTimer -= dt;
        if (e.strafeTimer <= 0) { e.strafeTimer = 2 + Math.random() * 2; e.strafeDir *= -1; }
        e.pos.x += -Math.sin(want) * e.strafeDir * 1.6 * dt;
        e.pos.z += -Math.cos(want) * e.strafeDir * 1.6 * dt;
        city.resolveCollision(e.pos, 0.7);
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 45) {
        e.shootTimer = 1.1 + Math.random() * 0.9;
        const origin = e.pos.clone(); origin.y = 1.4;
        const target = player.pos.clone(); target.y = 1.3;
        const dir = target.sub(origin).normalize();
        // Accuracy falls off with range: point-blank is dangerous, a
        // potshot from across the street mostly misses. And a moving
        // car is harder to hit than a person on foot — drive-bys cut
        // both ways, so the player in a car is a worse target.
        const acc = (dist < 15 ? 0.55 : dist < 30 ? 0.4 : 0.25) * (player.inCar ? 0.6 : 1);
        const hit = Math.random() < acc;
        this.effects.tracer(origin, origin.clone().addScaledVector(dir, Math.min(dist, 45)));
        this.audio.shoot();
        if (hit && player.health > 0) {
          const died = player.takeDamage(8 + Math.random() * 8);
          this.effects.blood(player.pos);
          if (died) return 'player-dead';
        }
      }
    }
    return null;
  }

  dispose() { this.scene.remove(this.group); this.enemies = []; }
}
