// CALA LUNA — garage: the cars Luz steals and keeps.
// Drive a car into the Wrench Garage to store it; walk in on foot to
// take one back out. The collection shows in the pause stats.

import { Vehicle } from './vehicles.js';
import { SHOPS } from './config.js';

export class Garage {
  constructor(game) {
    this.game = game;
    this.stored = []; // vehicle types, in the order stored
    this.at = SHOPS.garage.at;
  }

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
    this.stored.push(type);
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
    const type = this.stored[index];
    if (!type) return false;
    this.stored.splice(index, 1);
    const car = new Vehicle(g.scene, type, this.at[0] + 16, this.at[1], 0);
    car.driver = null;
    g.player.enterCar(car);
    g.worldCars.push(car);
    g.hud.say('Marco', `${car.spec.name}, fueled and ready. Don't scratch her.`);
    g.saveGame();
    return true;
  }

  statusText() {
    if (this.stored.length === 0) return 'Garage: empty — steal something worth keeping';
    return `Garage (${this.stored.length}): ${this.stored.join(', ')}`;
  }
}
