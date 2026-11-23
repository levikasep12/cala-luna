// CALA LUNA — traffic: ambient cars that drive the street grid.
// Each car follows a lane, turns at random intersections, and respawns
// near the player when it gets too far away. Keeps the city alive.

import { Vehicle } from './vehicles.js';
import { WORLD } from './config.js';
import { makeRng, pick } from './random.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'coupe', 'taxi', 'truck'];

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

  _spawn(playerPos) {
    const rng = this.rng;
    // Spawn on a street near the player but out of immediate view.
    const streets = this.city.streetXs;
    const sx = pick(rng, streets);
    const sz = pick(rng, streets);
    const x = sx + pick(rng, [-1, 1]) * (40 + rng() * 140);
    const z = sz + pick(rng, [-1, 1]) * (40 + rng() * 140);
    const alongX = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    const car = new Vehicle(this.scene, pick(rng, TRAFFIC_TYPES),
      alongX ? x : sx, alongX ? sz : z, alongX ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2));
    car.driver = 'traffic';
    car.cruise = 10 + rng() * 6;
    car.nextTurn = 4 + rng() * 8;
    car.lane = pick(rng, [-3.2, 3.2]);
    this.cars.push(car);
  }

  update(dt, playerPos, city) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      // Recycle cars that are far away.
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        const dx = c.pos.x - playerPos.x, dz = c.pos.z - playerPos.z;
        if (dx * dx + dz * dz > 260 * 260) {
          c.dispose();
          this.cars.splice(i, 1);
        }
      }
    }
    for (const car of this.cars) {
      car.nextTurn -= dt;
      // Gentle steering: stay near the lane centre of the current street.
      const near = city.nearestStreet(car.pos.x, car.pos.z);
      const alongX = Math.abs(Math.sin(car.heading)) < 0.7;
      let steer = 0;
      if (alongX) {
        const want = near.z + car.lane;
        steer = Math.max(-1, Math.min(1, (want - car.pos.z) * 0.08)) * (Math.cos(car.heading) > 0 ? 1 : -1);
      } else {
        const want = near.x + car.lane;
        steer = Math.max(-1, Math.min(1, (want - car.pos.x) * 0.08)) * (Math.sin(car.heading) > 0 ? -1 : 1);
      }
      if (car.nextTurn <= 0) {
        car.nextTurn = 5 + this.rng() * 9;
        // Turn at the next intersection: rotate the heading target by 90°.
        car.heading += (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      const throttle = car.speed < car.cruise ? 0.6 : 0;
      car.drive(dt, throttle, steer, false);
      city.resolveCollision(car.pos, 2.4);
    }
  }

  // All traffic cars, for the minimap and carjacking.
  all() { return this.cars; }

  dispose() { for (const c of this.cars) c.dispose(); this.cars = []; }
}
