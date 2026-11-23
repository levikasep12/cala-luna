// CALA LUNA — garage: the cars Luz steals and keeps.
// Drive a car into the Wrench Garage to store it; walk in on foot to
// take one back out. The collection shows in the pause stats. Stored
// cars keep their health — storing a wreck and taking out a showroom
// car was a free repair, so the collection keeps what Luz actually
// parked. Old saves stored bare type strings; a fresh load normalises
// them to full-health entries so the garage never chokes on v1 data.

import { Vehicle } from './vehicles.js';
import { SHOPS, VEHICLES } from './config.js';

// Six bays, six cars: the collection has a roof, and the roof is visible.
const GARAGE_CAPACITY = 6;
const COP_TYPES = ['police', 'swat']; // Marco won't store a cop car

export class Garage {
  constructor(game) {
    this.game = game;
    // Stored cars, in the order parked: {type, health}.
    this.stored = [];
    this.at = SHOPS.garage.at;
  }

  static normalize(stored) {
    return (stored || []).map((s) => typeof s === 'string' ? { type: s, health: 100 } : s);
  }

  // Back to a new game: an empty garage.
  reset() { this.stored = []; }

  nearGarage(player) {
    return Math.hypot(player.pos.x - this.at[0], player.pos.z - this.at[1]) < 14;
  }

  // The type of a stored entry, whether it is a v1 string or an object.
  _entryType(entry) {
    return typeof entry === 'string' ? entry : entry.type;
  }

  // The health of a stored entry: v1 strings come out at full health.
  _entryHealth(entry) {
    return typeof entry === 'string' ? 100 : entry.health;
  }

  storeCurrentCar() {
    const g = this.game;
    const p = g.player;
    if (!p.inCar) return false;
    if (COP_TYPES.includes(p.car.type)) {
      g.hud.say('Marco', 'I am NOT storing a cop car, Luz. Lose it.');
      return false;
    }
    if (this.stored.length >= GARAGE_CAPACITY) {
      g.hud.say('Marco', `Garage is full — ${GARAGE_CAPACITY} cars. Take one out before you park another.`);
      return false;
    }
    this.stored.push({ type: p.car.type, health: Math.round(p.car.health) });
    g.hud.say('Marco', `${p.car.spec.name} is in the collection. ${this.stored.length} car${this.stored.length > 1 ? 's' : ''} and counting.`);
    g.audio.pickup();
    p.car.dispose();
    p.car = null;
    p.group.visible = true;
    p.group.position.copy(p.pos);
    g.saveGame();
    return true;
  }

  takeOut(index) {
    const g = this.game;
    const entry = this.stored[index];
    if (!entry) return false;
    const type = this._entryType(entry);
    const health = this._entryHealth(entry);
    this.stored.splice(index, 1);
    const car = new Vehicle(g.scene, type, this.at[0] + 16, this.at[1], 0);
    car.health = health;
    car.smoking = health < 35;
    car.driver = null;
    g.player.enterCar(car);
    g.worldCars.push(car);
    g.hud.say('Marco', `${car.spec.name}, fueled and ready. Don't scratch her.`);
    g.saveGame();
    return true;
  }

  statusText() {
    if (this.stored.length === 0) return 'Garage: empty — steal something worth keeping';
    const names = this.stored.map((e) => {
      const t = this._entryType(e);
      return VEHICLES[t] ? VEHICLES[t].name : t;
    });
    const worth = this.stored.reduce((sum, e) => {
      const t = this._entryType(e);
      return sum + (VEHICLES[t] ? VEHICLES[t].value : 0);
    }, 0);
    return `Garage (${this.stored.length}/${GARAGE_CAPACITY}): ${names.join(', ')} — worth $${worth.toLocaleString()}`;
  }
}
