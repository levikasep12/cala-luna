// CALA LUNA — police: the wanted system and the CLPD response.
// Stars 1-5 escalate: patrols, chases, roadblocks, helicopter, SWAT.
// Heat cools when the player breaks line of sight; getting caught on
// foot at low speed means BUSTED.

import * as THREE from 'three';
import { Vehicle, Helicopter } from './vehicles.js';
import { WANTED } from './config.js';

export class Police {
  constructor(scene, city, audio) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.stars = 0;
    this.units = []; // police vehicles in pursuit
    this.patrols = []; // patrol cars cruising the grid (tier.patrols)
    this.swat = [];
    this.heli = null;
    this.roadblocks = [];
    this.heatTimer = 0;   // time since last seen
    this.cooldown = 0;    // counts down while hidden
    this.spawnTimer = 0;
    this.sirenTimer = 0;
    this.busted = false;
    this.bustedTimer = 0;
  }

  addStars(n, reason) {
    const before = this.stars;
    this.stars = Math.max(0, Math.min(5, this.stars + n));
    if (this.stars > before) {
      this.audio.wantedUp();
      this.heatTimer = 0;
      this.cooldown = 0;
    }
    return this.stars;
  }

  setStars(n) {
    this.stars = Math.max(0, Math.min(5, n));
    this.heatTimer = 0;
    this.cooldown = 0;
  }

  clearAll() {
    for (const u of this.units) u.dispose();
    for (const u of this.patrols) u.dispose();
    for (const u of this.swat) u.dispose();
    for (const r of this.roadblocks) for (const v of r.cars) v.dispose();
    if (this.heli) this.heli.dispose();
    this.units = [];
    this.patrols = [];
    this.swat = [];
    this.roadblocks = [];
    this.heli = null;
  }

  _spawnUnit(playerPos, type) {
    // Spawn on a street near the player, off-screen-ish.
    const sx = playerPos.x + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60);
    const sz = playerPos.z + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60);
    const near = this.city.nearestStreet(sx, sz);
    const heading = Math.atan2(-(playerPos.z - near.z), playerPos.x - near.x);
    const v = new Vehicle(this.scene, type, near.x, near.z, heading);
    v.driver = 'police';
    v.health = 120;
    return v;
  }

  _spawnPatrol(playerPos) {
    // A patrol car cruises the grid on its own beat and only joins the
    // chase when Luz gets close — this is what 1-star heat actually is.
    const v = this._spawnUnit(playerPos, 'police');
    const s = this.city.streetXs;
    v.patrolTarget = { x: s[Math.floor(Math.random() * s.length)], z: s[Math.floor(Math.random() * s.length)] };
    return v;
  }

  _spawnRoadblock(playerPos, playerHeading, ahead = 55) {
    // Two police cars parked across the road ahead of the player.
    const ax = playerPos.x + Math.cos(playerHeading) * ahead;
    const az = playerPos.z - Math.sin(playerHeading) * ahead;
    const near = this.city.nearestStreet(ax, az);
    // Never stack two roadblocks on the same intersection.
    for (const r of this.roadblocks) {
      if (Math.hypot(r.x - near.x, r.z - near.z) < 40) return;
    }
    const cars = [];
    const perp = playerHeading + Math.PI / 2;
    for (const off of [-4.5, 4.5]) {
      const v = new Vehicle(this.scene, 'police',
        near.x + Math.cos(perp) * off, near.z - Math.sin(perp) * off, playerHeading + Math.PI / 2);
      v.driver = 'police';
      v.parked = true;
      cars.push(v);
    }
    this.roadblocks.push({ cars, x: near.x, z: near.z, timer: 25 });
  }

  update(dt, player, time) {
    const tier = WANTED[this.stars] || WANTED[1];
    this.sirenTimer -= dt;
    if (this.stars > 0 && this.sirenTimer <= 0) {
      this.sirenTimer = 1.4;
      this.audio.sirenBlip();
    }

    // Wanted decay: hidden = no unit within 45 units and no heli.
    // Cooling off takes longer at high heat: 8s at 1 star, 16s at 5.
    if (this.stars > 0) {
      let seen = false;
      for (const u of [...this.units, ...this.patrols, ...this.swat]) {
        if (u.pos.distanceTo(player.pos) < 55) { seen = true; break; }
      }
      if (this.heli) seen = true;
      if (seen) { this.heatTimer = 0; this.cooldown = 0; }
      else {
        this.cooldown += dt;
        if (this.cooldown > 6 + this.stars * 2) {
          this.cooldown = 0;
          this.stars = Math.max(0, this.stars - 1);
          if (this.stars === 0) this.clearAll();
        }
      }
    }

    // Keep the right number of units for the tier.
    if (this.stars > 0) {
      this.spawnTimer -= dt;
      const wantChase = tier.chase;
      const wantSwat = tier.swat;
      const wantPatrols = tier.patrols;
      if (this.spawnTimer <= 0 && (this.units.length < wantChase || this.swat.length < wantSwat || this.patrols.length < wantPatrols)) {
        this.spawnTimer = 2.5;
        if (this.units.length < wantChase) this.units.push(this._spawnUnit(player.pos, 'police'));
        else if (this.swat.length < wantSwat) this.swat.push(this._spawnUnit(player.pos, 'swat'));
        else if (this.patrols.length < wantPatrols) this.patrols.push(this._spawnPatrol(player.pos));
      }
      if (tier.roadblocks > this.roadblocks.length && player.inCar && Math.random() < dt * 0.25) {
        this._spawnRoadblock(player.pos, player.heading);
      }
      if (tier.heli && !this.heli) this.heli = new Helicopter(this.scene, player.pos);
      if (!tier.heli && this.heli) { this.heli.dispose(); this.heli = null; }
    } else if (this.heli) {
      this.heli.dispose();
      this.heli = null;
    }

    // Chase AI: seek the player, ram on contact. Parked units hold.
    // Patrols cruise the grid and only join the chase up close.
    let nearestDist = Infinity;
    for (const u of this.units) nearestDist = Math.min(nearestDist, this._driveChase(u, player, dt, 1));
    for (const u of this.swat) nearestDist = Math.min(nearestDist, this._driveChase(u, player, dt, 0.9));
    for (const u of this.patrols) nearestDist = Math.min(nearestDist, this._drivePatrol(u, player, dt));

    // Roadblocks age out.
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const r = this.roadblocks[i];
      r.timer -= dt;
      if (r.timer <= 0) {
        for (const v of r.cars) v.dispose();
        this.roadblocks.splice(i, 1);
      }
    }

    if (this.heli) this.heli.update(dt, player.pos, time);

    // BUSTED: on foot, police very close, player slow — but only after
    // a 1.2s grace window, so a cop brushing past doesn't end the run
    // and the player gets a moment to sprint away.
    if (this.stars > 0 && !player.inCar && nearestDist < 4 && player.speedKmh < 12 && player.health > 0) {
      this.bustedTimer += dt;
      this.busted = this.bustedTimer > 1.2;
    } else {
      this.bustedTimer = 0;
      this.busted = false;
    }
    return { nearestDist };
  }

  allUnits() { return [...this.units, ...this.patrols, ...this.swat]; }

  // One chase step: seek the player, ram on contact. Parked units hold.
  // Returns the distance to the player (used for the BUSTED check).
  _driveChase(u, player, dt, aggression) {
    const dx = player.pos.x - u.pos.x;
    const dz = player.pos.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    if (u.parked) return dist;
    const want = Math.atan2(-dz, dx);
    let diff = want - u.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));
    const throttle = dist > 6 ? 1 : 0.4;
    u.drive(dt, throttle * aggression, steer, false);
    this.city.resolveCollision(u.pos, 2.4);
    // Ram damage to the player's car.
    if (player.inCar && dist < 4.5) {
      player.car.damage(6 * dt);
      if (Math.random() < dt * 2) this.audio.crash();
    }
    return dist;
  }

  // One patrol step: cruise toward the beat waypoint; if Luz is close
  // enough to spot, join the chase like any other unit.
  _drivePatrol(u, player, dt) {
    const dx = player.pos.x - u.pos.x;
    const dz = player.pos.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 35) return this._driveChase(u, player, dt, 1);
    const t = u.patrolTarget;
    const tx = t.x - u.pos.x, tz = t.z - u.pos.z;
    if (Math.hypot(tx, tz) < 10) {
      const s = this.city.streetXs;
      u.patrolTarget = { x: s[Math.floor(Math.random() * s.length)], z: s[Math.floor(Math.random() * s.length)] };
    } else {
      const want = Math.atan2(-tz, tx);
      let diff = want - u.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.drive(dt, u.speed < 13 ? 0.5 : 0, Math.max(-1, Math.min(1, diff * 1.2)), false);
      this.city.resolveCollision(u.pos, 2.4);
    }
    return dist;
  }

  dispose() { this.clearAll(); }
}
