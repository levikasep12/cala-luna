// CALA LUNA — traffic: the city's background drivers. Cars hold a
// lane along the street grid, turn at random intersections, and brake
// when Luz is right in front of them instead of rear-ending her. Cars
// that drift far away are culled so the spawn budget always refills
// the streets around the player.

import { Vehicle } from './vehicles.js';
import { WORLD } from './config.js';
import { makeRng, pick, weighted } from './random.js';

// [type, weight]: sedans own the roads; the muscle car and the
// convertible are rare — spotting one is half the reason to steal it.
const TRAFFIC_MIX = [['sedan', 5], ['coupe', 2], ['taxi', 2], ['truck', 1], ['muscle', 1], ['convertible', 1]];

// Cars further than this from Luz are culled and respawned nearby.
const CULL_RANGE = 260;
const CULL_EVERY = 1.5;
// A car brakes when Luz is this close and ahead of it.
const BRAKE_RANGE = 12;

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed + 101);
    this.cars = [];
    this.spawnTimer = 0;
  }

  ensureCount(target, playerPos) {
    while (this.cars.length < target) this._spawn(playerPos);
  }

  // Spawn on a street near the player but out of immediate view,
  // heading along one of the grid axes.
  _spawn(playerPos) {
    const rng = this.rng;
    const streets = this.city.streetXs;
    const sx = pick(rng, streets);
    const sz = pick(rng, streets);
    const x = sx + pick(rng, [-1, 1]) * (40 + rng() * 140);
    const z = sz + pick(rng, [-1, 1]) * (40 + rng() * 140);
    const alongX = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    const heading = alongX
      ? (dir > 0 ? 0 : Math.PI)
      : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.spawnAt(alongX ? x : sx, alongX ? sz : z, heading, weighted(rng, TRAFFIC_MIX));
  }

  // Place one car exactly — for staged scenes and scripted moments.
  spawnAt(x, z, heading, type = 'sedan') {
    const rng = this.rng;
    const car = new Vehicle(this.scene, type, x, z, heading);
    car.driver = 'traffic';
    car.cruise = 10 + rng() * 6;
    car.nextTurn = 4 + rng() * 8;
    car.turnTarget = null; // heading a turn is easing toward, or null
    car.lane = pick(rng, [-3.2, 3.2]);
    this.cars.push(car);
    return car;
  }

  update(dt, playerPos, city) {
    this._cull(dt, playerPos);
    for (const car of this.cars) this._step(car, dt, playerPos, city);
  }

  // Every so often, drop the cars that drifted far from the player so
  // ensureCount can respawn them nearby.
  _cull(dt, playerPos) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = CULL_EVERY;
    const limit = CULL_RANGE * CULL_RANGE;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const dx = c.pos.x - playerPos.x;
      const dz = c.pos.z - playerPos.z;
      if (dx * dx + dz * dz > limit) {
        c.dispose();
        this.cars.splice(i, 1);
      }
    }
  }

  // One car's step: steer (finish a turn, or hold the lane and maybe
  // start one), then throttle — braking if Luz is right ahead.
  _step(car, dt, playerPos, city) {
    car.nextTurn -= dt;
    const steer = this._steering(car, city);
    const throttle = this._blockedByPlayer(car, playerPos) ? -0.5 : (car.speed < car.cruise ? 0.6 : 0);
    car.drive(dt, throttle, steer, false);
    city.resolveCollision(car.pos, 2.4);
  }

  // Steering: a turn in progress eases toward its target heading;
  // otherwise the car holds its lane and schedules the next turn.
  _steering(car, city) {
    if (car.turnTarget !== null && car.turnTarget !== undefined) {
      return this._turning(car);
    }
    return this._laneKeeping(car, city);
  }

  // Ease through a turn in progress. Returns the steering input.
  _turning(car) {
    let diff = car.turnTarget - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.06) car.turnTarget = null;
    return Math.max(-1, Math.min(1, diff * 2.2));
  }

  // Lane-keeping is gentle: steer toward the lane centre of the
  // street the car is on, flipping sign with the direction of travel.
  // When the turn timer runs out, pick the next intersection turn.
  _laneKeeping(car, city) {
    const near = city.nearestStreet(car.pos.x, car.pos.z);
    const alongX = Math.abs(Math.sin(car.heading)) < 0.7;
    let steer;
    if (alongX) {
      const want = near.z + car.lane;
      steer = Math.max(-1, Math.min(1, (want - car.pos.z) * 0.08)) * (Math.cos(car.heading) > 0 ? 1 : -1);
    } else {
      const want = near.x + car.lane;
      steer = Math.max(-1, Math.min(1, (want - car.pos.x) * 0.08)) * (Math.sin(car.heading) > 0 ? -1 : 1);
    }
    if (car.nextTurn <= 0) {
      car.nextTurn = 5 + this.rng() * 9;
      // Turn at the next intersection: ease into the new heading over
      // the next second instead of snapping 90° at once.
      car.turnTarget = car.heading + (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    return steer;
  }

  // Is Luz right in front of this car? A traffic car with Luz in front
  // of it stops instead of rear-ending her. (Without this, traffic
  // piled into the player's car at every red-light moment.)
  _blockedByPlayer(car, playerPos) {
    const pdx = playerPos.x - car.pos.x;
    const pdz = playerPos.z - car.pos.z;
    const dist = Math.hypot(pdx, pdz);
    if (dist < 0.01 || dist >= BRAKE_RANGE) return false;
    const fwdX = Math.cos(car.heading);
    const fwdZ = -Math.sin(car.heading);
    return (pdx * fwdX + pdz * fwdZ) / dist > 0.7;
  }

  // All traffic cars, for the minimap and carjacking.
  all() { return this.cars; }

  dispose() {
    for (const c of this.cars) c.dispose();
    this.cars = [];
  }
}
