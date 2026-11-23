// CALA LUNA — police: the wanted system and the CLPD response. Heat
// runs 0 to 5 stars, and each tier fields its own mix of patrols,
// chase units, roadblocks, a helicopter and SWAT. The force is kept at
// the tier's numbers while Luz is seen; heat bleeds away only while
// she is unseen, and a slow Luz caught on foot is BUSTED after a short
// grace.

import * as THREE from 'three';
import { Vehicle, Helicopter } from './vehicles.js';
import { WANTED } from './config.js';

// Every number the response tuning hangs on, in one place.
const TUNING = {
  sight: 55, // how far away a unit can still see Luz
  sirenEvery: 1.4, // seconds between siren blips while wanted
  spawnEvery: 2.5, // seconds between force top-ups
  ambientEvery: 3, // seconds between ambient patrol spawns at 0 stars
  blockChance: 0.25, // per second while wanted and driving
  blockLife: 25, // seconds a roadblock stands before it packs up
  blockTrigger: 30, // Luz this close and the block joins the chase
  blockSpacing: 40, // never two blocks on one intersection
  joinRange: 35, // a patrol this close joins the chase
  bustRange: 4, // police this close can bust Luz
  bustSpeed: 12, // km/h — a sprinting Luz is never busted
  bustGrace: 1.2, // seconds cornered before the bust lands
};

// Normalize an angle difference into [-PI, PI].
function normalizeAngle(diff) {
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// Steering input (-1..1) that turns a heading toward a target heading.
function aimSteering(heading, target, gain) {
  return Math.max(-1, Math.min(1, normalizeAngle(target - heading) * gain));
}

export class Police {
  constructor(scene, city, audio) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.stars = 0;
    this.units = []; // police vehicles in pursuit
    this.patrols = []; // patrol cars cruising the grid
    this.swat = []; // SWAT vans (5 stars only)
    this.heli = null;
    this.roadblocks = []; // {cars, x, z, timer}
    this.heatTimer = 0; // time since last seen
    this.cooldown = 0; // counts down while hidden
    this.spawnTimer = 0;
    this.sirenTimer = 0;
    this.busted = false;
    this.bustedTimer = 0;
  }

  // Raise the heat, with the sting and a fresh sighting.
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

  // Dismiss the whole force: every car, the heli, every roadblock.
  clearAll() {
    for (const u of this.allUnits()) u.dispose();
    for (const r of this.roadblocks) {
      for (const v of r.cars) v.dispose();
    }
    if (this.heli) this.heli.dispose();
    this.units = [];
    this.patrols = [];
    this.swat = [];
    this.roadblocks = [];
    this.heli = null;
  }

  allUnits() { return [...this.units, ...this.patrols, ...this.swat]; }

  // The tier's force table for the current heat (1 star is the floor:
  // WANTED has no 0-star row).
  _tier() {
    return WANTED[this.stars] || WANTED[1];
  }

  update(dt, player, time) {
    this._siren(dt);
    // The tier is read before decay: on the frame a star drops, the
    // roster still answers to the tier Luz just left.
    const tier = this._tier();
    // Heat first: decay may drop the last star, and then the force
    // stands down instead of topping itself back up to the old tier.
    if (this._heat(dt, player)) this._roster(dt, player, tier);
    else this._standDown(dt, player);
    const nearest = this._driveAll(dt, player);
    this._blocks(dt, player);
    if (this.heli) this.heli.update(dt, player.pos, time);
    this._arrest(dt, player, nearest);
    return { nearestDist: nearest };
  }

  // A siren blip every second and a half while wanted.
  _siren(dt) {
    this.sirenTimer -= dt;
    if (this.stars > 0 && this.sirenTimer <= 0) {
      this.sirenTimer = TUNING.sirenEvery;
      this.audio.sirenBlip();
    }
  }

  // Heat decays only while Luz is unseen: no unit within sight range
  // and no helicopter overhead. Cooling takes longer at high heat —
  // 8s at 1 star, 16s at 5 — and losing the last star stands the
  // whole force down. Returns true while any heat remains.
  _heat(dt, player) {
    if (this.stars <= 0) return false;
    let seen = !!this.heli;
    if (!seen) {
      for (const u of this.allUnits()) {
        if (u.pos.distanceTo(player.pos) < TUNING.sight) { seen = true; break; }
      }
    }
    if (seen) {
      this.heatTimer = 0;
      this.cooldown = 0;
      return true;
    }
    this.cooldown += dt;
    if (this.cooldown > 6 + this.stars * 2) {
      this.cooldown = 0;
      this.stars = Math.max(0, this.stars - 1);
      if (this.stars === 0) this.clearAll();
    }
    return this.stars > 0;
  }

  // Keep the force at the tier's numbers, lay roadblocks ahead of a
  // driving Luz, and bring the helicopter up or down with the tier.
  _roster(dt, player, tier) {
    this.spawnTimer -= dt;
    const shortChase = this.units.length < tier.chase;
    const shortSwat = this.swat.length < tier.swat;
    const shortPatrol = this.patrols.length < tier.patrols;
    if (this.spawnTimer <= 0 && (shortChase || shortSwat || shortPatrol)) {
      this.spawnTimer = TUNING.spawnEvery;
      if (shortChase) this.units.push(this._freshUnit(player.pos, 'police'));
      else if (shortSwat) this.swat.push(this._freshUnit(player.pos, 'swat'));
      else this.patrols.push(this._freshPatrol(player.pos));
    }
    if (tier.roadblocks > this.roadblocks.length && player.inCar && Math.random() < dt * TUNING.blockChance) {
      this._spawnRoadblock(player.pos, player.heading);
    }
    if (tier.heli && !this.heli) this.heli = new Helicopter(this.scene, player.pos);
    if (!tier.heli && this.heli) {
      this.heli.dispose();
      this.heli = null;
    }
  }

  // No heat: the heli goes home, but the city still has cops. One
  // ambient patrol keeps cruising the grid; it never chases — see the
  // stars guard in _patrol — it just makes the streets feel watched.
  _standDown(dt, player) {
    if (this.heli) {
      this.heli.dispose();
      this.heli = null;
    }
    if (this.patrols.length >= 1) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = TUNING.ambientEvery;
      this.patrols.push(this._freshPatrol(player.pos));
    }
  }

  // Drive every unit and report the closest one to Luz.
  _driveAll(dt, player) {
    let nearest = Infinity;
    for (const u of this.units) nearest = Math.min(nearest, this._chase(u, player, dt, 1));
    for (const u of this.swat) nearest = Math.min(nearest, this._chase(u, player, dt, 0.9));
    for (const u of this.patrols) nearest = Math.min(nearest, this._patrol(u, player, dt));
    return nearest;
  }

  // Roadblocks age out — but a roadblock Luz drives up to doesn't sit
  // there: its cars unpark and join the chase.
  _blocks(dt, player) {
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const r = this.roadblocks[i];
      if (Math.hypot(player.pos.x - r.x, player.pos.z - r.z) < TUNING.blockTrigger) {
        for (const v of r.cars) {
          v.parked = false;
          this.units.push(v);
        }
        this.roadblocks.splice(i, 1);
        continue;
      }
      r.timer -= dt;
      if (r.timer <= 0) {
        for (const v of r.cars) v.dispose();
        this.roadblocks.splice(i, 1);
      }
    }
  }

  // BUSTED: on foot, police very close, player slow — but only after a
  // grace window, so a cop brushing past doesn't end the run and the
  // player gets a moment to sprint away.
  _arrest(dt, player, nearestDist) {
    const cornered = this.stars > 0 && !player.inCar && nearestDist < TUNING.bustRange
      && player.speedKmh < TUNING.bustSpeed && player.health > 0;
    if (cornered) {
      this.bustedTimer += dt;
      this.busted = this.bustedTimer > TUNING.bustGrace;
    } else {
      this.bustedTimer = 0;
      this.busted = false;
    }
  }

  // Spawn on a street near the player, off-screen-ish, facing her.
  _freshUnit(playerPos, type) {
    const jx = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60);
    const jz = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 60);
    const near = this.city.nearestStreet(playerPos.x + jx, playerPos.z + jz);
    const heading = Math.atan2(-(playerPos.z - near.z), playerPos.x - near.x);
    const v = new Vehicle(this.scene, type, near.x, near.z, heading);
    v.driver = 'police';
    v.health = 120;
    return v;
  }

  // A patrol car cruises the grid on its own beat and only joins the
  // chase when Luz gets close — this is what 1-star heat actually is.
  _freshPatrol(playerPos) {
    const v = this._freshUnit(playerPos, 'police');
    v.patrolTarget = this._randomBeat();
    return v;
  }

  // A random intersection on the grid, as a patrol waypoint.
  _randomBeat() {
    const streets = this.city.streetXs;
    const pickStreet = () => streets[Math.floor(Math.random() * streets.length)];
    return { x: pickStreet(), z: pickStreet() };
  }

  // Two police cars parked across the road ahead of the player.
  _spawnRoadblock(playerPos, playerHeading, ahead = 55) {
    const ax = playerPos.x + Math.cos(playerHeading) * ahead;
    const az = playerPos.z - Math.sin(playerHeading) * ahead;
    const near = this.city.nearestStreet(ax, az);
    // Never stack two roadblocks on the same intersection.
    for (const r of this.roadblocks) {
      if (Math.hypot(r.x - near.x, r.z - near.z) < TUNING.blockSpacing) return;
    }
    const perp = playerHeading + Math.PI / 2;
    const cars = [];
    for (const off of [-4.5, 4.5]) {
      const v = new Vehicle(
        this.scene,
        'police',
        near.x + Math.cos(perp) * off,
        near.z - Math.sin(perp) * off,
        playerHeading + Math.PI / 2,
      );
      v.driver = 'police';
      v.parked = true;
      cars.push(v);
    }
    this.roadblocks.push({ cars, x: near.x, z: near.z, timer: TUNING.blockLife });
  }

  // One chase step: seek the player, ram on contact. Parked units hold.
  // Returns the distance to the player (used for the BUSTED check).
  _chase(u, player, dt, aggression) {
    const dx = player.pos.x - u.pos.x;
    const dz = player.pos.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    if (u.parked) return dist;
    const want = Math.atan2(-dz, dx);
    const steer = aimSteering(u.heading, want, 1.6);
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
  // enough to spot AND wanted, join the chase like any other unit.
  // The stars guard matters: the ambient 0-star patrol must cruise
  // past Luz, not ram her for nothing.
  _patrol(u, player, dt) {
    const dx = player.pos.x - u.pos.x;
    const dz = player.pos.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < TUNING.joinRange && this.stars > 0) {
      return this._chase(u, player, dt, 1);
    }
    const t = u.patrolTarget;
    const tx = t.x - u.pos.x;
    const tz = t.z - u.pos.z;
    if (Math.hypot(tx, tz) < 10) {
      u.patrolTarget = this._randomBeat();
    } else {
      const want = Math.atan2(-tz, tx);
      const steer = aimSteering(u.heading, want, 1.2);
      const throttle = u.speed < 13 ? 0.5 : 0;
      u.drive(dt, throttle, steer, false);
      this.city.resolveCollision(u.pos, 2.4);
    }
    return dist;
  }

  dispose() { this.clearAll(); }
}
