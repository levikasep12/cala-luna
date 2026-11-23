// CALA LUNA — crew: the two specialists Luz recruits on the job.
// Marco repairs the car anywhere; Ines wipes a wanted star. Each
// ability has a cooldown, shown in the HUD. Press Q to use the ready one.

import { CREW } from './config.js';

export class Crew {
  constructor(game) {
    this.game = game;
    this.members = {}; // id -> {def, readyIn}
    this.recruit('marco'); // Marco joins in the intro
  }

  recruit(id) {
    const def = CREW.find((c) => c.id === id);
    if (!def || this.members[id]) return;
    this.members[id] = { def, readyIn: 0 };
    // The HUD may not exist yet when the constructor recruits Marco.
    if (!this.game.hud) return;
    this.game.hud.say(def.name.split('"')[1] || def.name, `I'm in, Luz. ${def.ability} — say the word.`);
    this.game.hud.showBanner(`${def.name.split(' ')[0].toUpperCase()} JOINED THE CREW`);
  }

  get count() { return Object.keys(this.members).length; }

  readyAbility() {
    for (const id of Object.keys(this.members)) {
      if (this.members[id].readyIn <= 0) return id;
    }
    return null;
  }

  useAbility() {
    const id = this.readyAbility();
    if (!id) return false;
    const g = this.game;
    const m = this.members[id];
    m.readyIn = m.def.cooldown;
    if (id === 'marco') {
      if (g.player.inCar) g.player.car.repair();
      g.player.heal(25);
      g.hud.say('Marco', 'Good as new. Try not to fold it again.');
      g.audio.pickup();
    } else if (id === 'ines') {
      g.police.addStars(-1);
      g.hud.say('Ines', 'Cameras looped, plates spoofed. One star, gone.');
      g.audio.pickup();
    }
    return true;
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
