// CALA LUNA — crew: the specialists Luz recruits on the job.
// Marco repairs the car anywhere; Ines wipes a wanted star; Dante gives
// the car nitro (or patches Luz up on foot). Each ability has a
// cooldown, shown in the HUD. Press Q to use the ready one — and Q is
// smart about which: heat first, then the getaway, then whoever is
// ready. The priority rules are a table, and each ability is its own
// handler, so adding a fourth crew member is one row and one method.

import { CREW, PLAYER } from './config.js';

// Priority rules for Q, in order. The first rule whose member is
// recruited, ready, and whose condition holds wins; if none fires, Q
// falls back to the first ready member in join order.
const PRIORITY = [
  // Heat first: if the CLPD is all over Luz, Ines' star wipe beats a
  // repair, even when Marco is also ready.
  { id: 'ines', when: (g) => g.police && g.police.stars >= 3 },
  // Then the getaway: in a car with heat on, Dante's nitro beats a
  // repair — distance is worth more than a fresh bumper.
  { id: 'dante', when: (g) => g.player && g.player.inCar && g.police && g.police.stars >= 1 },
];

export class Crew {
  constructor(game) {
    this.game = game;
    this.members = {}; // id -> {def, readyIn}
    this.recruit('marco'); // Marco joins in the intro
  }

  recruit(id, silent = false) {
    const def = CREW.find((c) => c.id === id);
    if (!def || this.members[id]) return;
    this.members[id] = { def, readyIn: 0 };
    // The HUD may not exist yet when the constructor recruits Marco.
    if (!this.game.hud || silent) return;
    this.game.hud.say(def.name.split('"')[1] || def.name, `I'm in, Luz. ${def.ability} — say the word.`);
    this.game.hud.showBanner(`${def.name.split(' ')[0].toUpperCase()} JOINED THE CREW`);
  }

  // Back to a new game: Marco only, as in the intro, no fanfare.
  reset() {
    this.members = {};
    this.recruit('marco', true);
  }

  get count() { return Object.keys(this.members).length; }

  _isReady(id) {
    const m = this.members[id];
    return m && m.readyIn <= 0;
  }

  readyAbility() {
    for (const rule of PRIORITY) {
      if (rule.when(this.game) && this._isReady(rule.id)) return rule.id;
    }
    for (const id of Object.keys(this.members)) {
      if (this.members[id].readyIn <= 0) return id;
    }
    return null;
  }

  useAbility() {
    const id = this.readyAbility();
    if (!id) return false;
    const m = this.members[id];
    m.readyIn = m.def.cooldown;
    this._ability(id);
    return true;
  }

  _ability(id) {
    if (id === 'marco') this._repair();
    else if (id === 'ines') this._ghost();
    else if (id === 'dante') this._nitro();
  }

  // Marco: the car back to full health, and Luz patched up too.
  _repair() {
    const g = this.game;
    if (g.player.inCar) g.player.car.repair();
    g.player.heal(25);
    g.hud.say('Marco', 'Good as new. Try not to fold it again.');
    g.audio.pickup();
  }

  // Ines: cameras looped, plates spoofed — one star, gone.
  _ghost() {
    const g = this.game;
    g.police.addStars(-1);
    g.hud.say('Ines', 'Cameras looped, plates spoofed. One star, gone.');
    g.audio.pickup();
  }

  // Dante: nitro in the car; on foot there is no engine to boost, so he
  // patches Luz up and she gets her breath back instead.
  _nitro() {
    const g = this.game;
    if (g.player.inCar && g.player.car) {
      g.player.car.boost(3);
      g.hud.say('Dante', 'Nitro! Hold on tight.');
    } else {
      g.player.heal(25);
      g.player.stamina = PLAYER.maxStamina;
      g.hud.say('Dante', 'Caught your breath? Good — run.');
    }
    g.audio.pickup();
  }

  update(dt) {
    for (const m of Object.values(this.members)) {
      if (m.readyIn > 0) m.readyIn -= dt;
    }
  }

  statusText() {
    const parts = [];
    for (const m of Object.values(this.members)) {
      const name = m.def.name.split(' ')[0];
      parts.push(m.readyIn <= 0 ? `${name}: ${m.def.ability} READY [Q]` : `${name}: ${Math.ceil(m.readyIn)}s`);
    }
    return parts.join('  ·  ');
  }
}
