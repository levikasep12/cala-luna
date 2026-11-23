// CALA LUNA — garage: the cars Luz steals and keeps.
// Drive a car into the Wrench Garage to store it; walk in on foot to
// take one back out. The collection shows in the pause stats.

import { Vehicle } from './vehicles.js';
import { SHOPS, VEHICLES } from './config.js';

// Six bays, six cars: the collection has a roof, and the roof is visible.
const GARAGE_CAPACITY = 6;

export class Garage {
  constructor(game) {
    this.game = game;
    // Stored cars, in the order parked: {type, health}. Health rides
    // along because storing a wreck and taking out a showroom car was
    // a free repair — the collection keeps what Luz actually parked.
    this.stored = [];
    this.at = SHOPS.garage.at;
  }

  // Old saves stored bare type strings; a fresh load normalises them
  // to full-health entries so the garage never chokes on v1 data.
  static normalize(stored) {
    return (stored || []).map((s) => typeof s === 'string' ? { type: s, health: 100 } : s);
  }

  // Back to a new game: an empty garage.
  reset() { this.stored = []; }

  nearGarage(player) {
    return Math.hypot(player.pos.x - this.at[0], player.pos.z - this.at[1]) < 14;
  }

  storeCurrentCar() {
    const g = this.game;
    const p = g.player;
    if (!p.inCar) return false;
    const type = p.car.type;
    if (type === 'police' || type === 'swat') {
      g.hud.say('Marco', 'I am NOT storing a cop car, Luz. Lose it.');
      return false;
    }
    if (this.stored.length >= GARAGE_CAPACITY) {
      g.hud.say('Marco', `Garage is full — ${GARAGE_CAPACITY} cars. Take one out before you park another.`);
      return false;
    }
    this.stored.push({ type, health: Math.round(p.car.health) });
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
    const type = typeof entry === 'string' ? entry : entry.type;
    const health = typeof entry === 'string' ? 100 : entry.health;
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
      const t = typeof e === 'string' ? e : e.type;
      return VEHICLES[t] ? VEHICLES[t].name : t;
    });
    const worth = this.stored.reduce((sum, e) => {
      const t = typeof e === 'string' ? e : e.type;
      return sum + (VEHICLES[t] ? VEHICLES[t].value : 0);
    }, 0);
    return `Garage (${this.stored.length}/${GARAGE_CAPACITY}): ${names.join(', ')} — worth $${worth.toLocaleString()}`;
  }
}
