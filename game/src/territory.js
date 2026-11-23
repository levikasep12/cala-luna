// CALA LUNA — territory: five districts, each held by a rival crew
// until Luz takes it. Captured districts pay a daily cut and turn the
// minimap gold. Hold all five for the finale payout.

import { DISTRICTS } from './config.js';

export class Territory {
  constructor(game) {
    this.game = game;
    this.held = new Set(); // district ids Luz controls
    this.cutTimer = 0;
  }

  get heldCount() { return this.held.size; }
  get total() { return DISTRICTS.length; }

  holds(id) { return this.held.has(id); }

  capture(id) {
    if (this.held.has(id)) return;
    const d = DISTRICTS.find((x) => x.id === id);
    if (!d) return;
    this.held.add(id);
    this.game.hud.showBanner(`${d.name} IS YOURS`);
    this.game.hud.say('Luz', `${d.name} flies our colors now. The ${d.rival} won't be back.`);
    this.game.audio.missionPass();
    if (this.held.size === DISTRICTS.length) {
      this.game.player.cash += 10000;
      this.game.hud.showMissionCard('ALL OF CALA LUNA', 10000, 'Every district pays tribute. $10,000 bonus.');
    }
    this.game.saveGame();
  }

  // Districts pay a cut every two minutes of play.
  update(dt) {
    if (this.held.size === 0) return;
    this.cutTimer += dt;
    if (this.cutTimer >= 120) {
      this.cutTimer = 0;
      const cut = this.held.size * 250;
      this.game.player.cash += cut;
      this.game.hud.say('Marco', `District cut's in: $${cut}. The streets pay rent now.`);
    }
  }

  statusText() {
    return `Territory ${this.held.size}/${DISTRICTS.length}`;
  }
}
