// CALA LUNA — territory: five districts, each held by a rival crew
// until Luz takes it. Captured districts pay a cut every two minutes
// and turn the minimap gold; rivals counter-attack held districts, and
// Luz has a window to show up and hold the ground. Hold all five for
// the finale payout.

import { DISTRICTS, TERRITORY } from './config.js';

const CUT_EVERY = 120; // seconds of play between district payouts
const FALLBACK_CUT = 250;
const CAPTURE_HEAL = 25;
const ALL_HELD_BONUS = 10000;

export class Territory {
  constructor(game) {
    this.game = game;
    this.held = new Set(); // district ids Luz controls
    this.byId = new Map(DISTRICTS.map((d) => [d.id, d]));
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
    const d = this.byId.get(id);
    if (!d) return;
    this.held.add(id);
    // Taking a district patches Luz up: the crew holds the ground now.
    this.game.player.heal(CAPTURE_HEAL);
    this.game.hud.showBanner(`${d.name} IS YOURS`);
    this.game.hud.say('Luz', `${d.name} flies our colors now. The ${d.rival} won't be back — and the crew patched me up.`);
    this.game.audio.missionPass();
    if (this.held.size === DISTRICTS.length) {
      this.game.player.cash += ALL_HELD_BONUS;
      this.game.hud.showMissionCard('ALL OF CALA LUNA', ALL_HELD_BONUS, 'Every district pays tribute. $10,000 bonus.');
    }
    this.game.saveGame();
  }

  // Districts pay a cut every two minutes of play, and rivals hit back
  // every few minutes. Nothing ticks while Luz holds no ground at all.
  update(dt, playerPos) {
    if (this.held.size === 0) return;
    this._payCutIfDue(dt);
    if (this.attack) this._attackTick(dt, playerPos);
    else this._attackCountdown(dt);
  }

  // The cut: rich districts pay more — Downtown's $400 beats Old
  // Town's $200, so the map order matters when Luz picks her next
  // fight.
  _payCutIfDue(dt) {
    this.cutTimer += dt;
    if (this.cutTimer < CUT_EVERY) return;
    this.cutTimer = 0;
    let cut = 0;
    for (const id of this.held) {
      const d = this.byId.get(id);
      cut += d ? d.cut : FALLBACK_CUT;
    }
    this.game.player.cash += cut;
    this.game.hud.say('Marco', `District cut's in: $${cut}. The streets pay rent now.`);
  }

  // An attack in progress: Luz entering the district repels it for a
  // reward; the clock running out loses the district to its rivals.
  _attackTick(dt, playerPos) {
    const d = this.byId.get(this.attack.id);
    this.attack.timer -= dt;
    const inside = d && playerPos
      && playerPos.x >= d.x0 && playerPos.x < d.x1
      && playerPos.z >= d.z0 && playerPos.z < d.z1;
    if (inside) {
      this.game.player.cash += TERRITORY.repelReward;
      this.game.hud.showBanner(`${d.name} HELD`);
      this.game.hud.say('Marco', `You showed up — the ${d.rival} backed off. $${TERRITORY.repelReward} for the crew.`);
      this.attack = null;
      this.attackTimer = 0;
      return;
    }
    if (this.attack.timer > 0) return;
    this.held.delete(this.attack.id);
    const name = d ? d.name : 'DISTRICT';
    const rival = d ? d.rival : 'rivals';
    this.game.hud.showBanner(`${name} LOST`);
    this.game.hud.say('Ines', `We lost ${name} — the ${rival} moved back in. Take it again.`);
    this.attack = null;
    this.attackTimer = 0;
    this.game.saveGame();
  }

  // Between attacks: count down to the next one, then pick a random
  // held district and put it under the gun.
  _attackCountdown(dt) {
    this.attackTimer += dt;
    if (this.attackTimer < TERRITORY.attackIntervalSec) return;
    this.attackTimer = 0;
    const held = [...this.held];
    const id = held[Math.floor(Math.random() * held.length)];
    const d = this.byId.get(id);
    this.attack = { id, timer: TERRITORY.attackWindowSec };
    this.game.hud.showBanner(`${d.name} UNDER ATTACK`);
    this.game.hud.say('Ines', `The ${d.rival} are hitting ${d.name}. Get there in ${TERRITORY.attackWindowSec} seconds or it's theirs.`);
  }

  statusText() {
    return `Territory ${this.held.size}/${DISTRICTS.length}`;
  }
}
