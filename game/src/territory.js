// CALA LUNA — territory: five districts, each held by a rival crew
// until Luz takes it. Captured districts pay a daily cut and turn the
// minimap gold. Hold all five for the finale payout.

import { DISTRICTS, TERRITORY } from './config.js';

export class Territory {
  constructor(game) {
    this.game = game;
    this.held = new Set(); // district ids Luz controls
    this.cutTimer = 0;
    this.attackTimer = 0; // counts up to the next rival counter-attack
    this.attack = null; // {id, timer} while a district is under attack
  }

  get heldCount() { return this.held.size; }
  get total() { return DISTRICTS.length; }

  holds(id) { return this.held.has(id); }

  // Back to a new game: no districts held, no cut pending, no attack.
  reset() {
    this.held = new Set();
    this.cutTimer = 0;
    this.attackTimer = 0;
    this.attack = null;
  }

  capture(id) {
    if (this.held.has(id)) return;
    const d = DISTRICTS.find((x) => x.id === id);
    if (!d) return;
    this.held.add(id);
    // Taking a district patches Luz up: the crew holds the ground now.
    this.game.player.heal(25);
    this.game.hud.showBanner(`${d.name} IS YOURS`);
    this.game.hud.say('Luz', `${d.name} flies our colors now. The ${d.rival} won't be back — and the crew patched me up.`);
    this.game.audio.missionPass();
    if (this.held.size === DISTRICTS.length) {
      this.game.player.cash += 10000;
      this.game.hud.showMissionCard('ALL OF CALA LUNA', 10000, 'Every district pays tribute. $10,000 bonus.');
    }
    this.game.saveGame();
  }

  // Districts pay a cut every two minutes of play. Rich districts pay
  // more: Downtown's $400 beats Old Town's $200, so the map order
  // matters when Luz picks her next fight.
  update(dt, playerPos) {
    if (this.held.size === 0) return;
    this.cutTimer += dt;
    if (this.cutTimer >= 120) {
      this.cutTimer = 0;
      const cut = [...this.held].reduce((sum, id) => {
        const d = DISTRICTS.find((x) => x.id === id);
        return sum + (d ? d.cut : 250);
      }, 0);
      this.game.player.cash += cut;
      this.game.hud.say('Marco', `District cut's in: $${cut}. The streets pay rent now.`);
    }

    // Rival counter-attacks: every few minutes a held district comes
    // under attack. Luz has a window to show up and hold the ground;
    // if she doesn't, the district falls back to its rival crew.
    if (this.attack) {
      const d = DISTRICTS.find((x) => x.id === this.attack.id);
      this.attack.timer -= dt;
      if (d && playerPos && playerPos.x >= d.x0 && playerPos.x < d.x1 && playerPos.z >= d.z0 && playerPos.z < d.z1) {
        this.game.player.cash += TERRITORY.repelReward;
        this.game.hud.showBanner(`${d.name} HELD`);
        this.game.hud.say('Marco', `You showed up — the ${d.rival} backed off. $${TERRITORY.repelReward} for the crew.`);
        this.attack = null;
        this.attackTimer = 0;
      } else if (this.attack.timer <= 0) {
        this.held.delete(this.attack.id);
        this.game.hud.showBanner(`${d ? d.name : 'DISTRICT'} LOST`);
        this.game.hud.say('Ines', `We lost ${d ? d.name : 'a district'} — the ${d ? d.rival : 'rivals'} moved back in. Take it again.`);
        this.attack = null;
        this.attackTimer = 0;
        this.game.saveGame();
      }
      return;
    }
    this.attackTimer += dt;
    if (this.attackTimer >= TERRITORY.attackIntervalSec) {
      this.attackTimer = 0;
      const held = [...this.held];
      const id = held[Math.floor(Math.random() * held.length)];
      const d = DISTRICTS.find((x) => x.id === id);
      this.attack = { id, timer: TERRITORY.attackWindowSec };
      this.game.hud.showBanner(`${d.name} UNDER ATTACK`);
      this.game.hud.say('Ines', `The ${d.rival} are hitting ${d.name}. Get there in ${TERRITORY.attackWindowSec} seconds or it's theirs.`);
    }
  }

  statusText() {
    return `Territory ${this.held.size}/${DISTRICTS.length}`;
  }
}
