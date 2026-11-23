// CALA LUNA — territory: the map as five turf wars. Each district
// starts in a rival crew's hands; Luz takes them one at a time, and
// held turf pays rent every two minutes and turns gold on the minimap.
// Rivals don't sit still: every few minutes they hit a held district,
// and Luz has ninety seconds to show up or lose it. Take all five and
// the whole island pays tribute.

import { DISTRICTS, TERRITORY } from './config.js';

// Payout rhythm and the numbers the turf war hangs on.
const RENT_EVERY = 120; // seconds of play between district payouts
const RENT_DEFAULT = 250; // a district with no cut listed still pays
const CLAIM_HEAL = 25; // taking turf patches Luz up
const SWEEP_BONUS = 10000; // holding every district at once

export class Territory {
  constructor(game) {
    this.game = game;
    this.held = new Set(); // district ids under Luz's colors
    // Plain lookup table, built once: the district rows never change.
    this.index = {};
    for (const d of DISTRICTS) this.index[d.id] = d;
    this.rentTimer = 0;
    this.siegeTimer = 0; // counts up to the next rival counter-attack
    this.siege = null; // {id, remaining} while a district is under fire
  }

  get heldCount() { return this.held.size; }
  get total() { return DISTRICTS.length; }

  holds(id) { return this.held.has(id); }

  // A new game starts with no turf, no rent pending, no siege.
  reset() {
    this.held = new Set();
    this.rentTimer = 0;
    this.siegeTimer = 0;
    this.siege = null;
  }

  // Take a district: heal, celebrate, and check for the sweep bonus.
  capture(id) {
    if (this.held.has(id)) return;
    const d = this.index[id];
    if (!d) return;
    this.held.add(id);
    this._claim(d);
    this.game.saveGame();
  }

  _claim(d) {
    // The crew holds the ground now, so they patch Luz up on the spot.
    this.game.player.heal(CLAIM_HEAL);
    this.game.hud.showBanner(`${d.name} IS YOURS`);
    this.game.hud.say('Luz', `${d.name} flies our colors now. The ${d.rival} won't be back — and the crew patched me up.`);
    this.game.audio.missionPass();
    if (this.held.size === DISTRICTS.length) {
      this.game.player.cash += SWEEP_BONUS;
      this.game.hud.showMissionCard('ALL OF CALA LUNA', SWEEP_BONUS, 'Every district pays tribute. $10,000 bonus.');
    }
  }

  // Nothing ticks while Luz holds no ground at all: no rent, no raids.
  update(dt, playerPos) {
    if (this.held.size === 0) return;
    this._incomePhase(dt);
    this._siegePhase(dt, playerPos);
  }

  // Rent: rich turf pays more, so the order Luz takes districts in
  // decides how fast the money rolls in — Downtown's $400 beats Old
  // Town's $200.
  _incomePhase(dt) {
    this.rentTimer += dt;
    if (this.rentTimer < RENT_EVERY) return;
    this.rentTimer = 0;
    let rent = 0;
    for (const id of this.held) {
      const d = this.index[id];
      rent += d ? d.cut : RENT_DEFAULT;
    }
    this.game.player.cash += rent;
    this.game.hud.say('Marco', `District cut's in: $${rent}. The streets pay rent now.`);
  }

  // A siege in progress resolves by arrival or by the clock; between
  // sieges the next raid counts down.
  _siegePhase(dt, playerPos) {
    if (this.siege) this._siegeUnderway(dt, playerPos);
    else this._siegeCountdown(dt);
  }

  // Luz inside the district while it's under attack drives the rivals
  // off for a reward. The clock running out loses the turf.
  _siegeUnderway(dt, playerPos) {
    const d = this.index[this.siege.id];
    this.siege.remaining -= dt;
    if (this._inside(d, playerPos)) {
      this._resolveSiege(true, d);
      return;
    }
    if (this.siege.remaining > 0) return;
    this._resolveSiege(false, d);
  }

  // Is Luz standing inside this district's rectangle?
  _inside(d, playerPos) {
    return !!d && !!playerPos
      && playerPos.x >= d.x0 && playerPos.x < d.x1
      && playerPos.z >= d.z0 && playerPos.z < d.z1;
  }

  // End a siege: repelled (cash + banner) or lost (turf + banner).
  _resolveSiege(held, d) {
    const name = d ? d.name : 'DISTRICT';
    const rival = d ? d.rival : 'rivals';
    if (held) {
      this.game.player.cash += TERRITORY.repelReward;
      this.game.hud.showBanner(`${name} HELD`);
      this.game.hud.say('Marco', `You showed up — the ${rival} backed off. $${TERRITORY.repelReward} for the crew.`);
    } else {
      this.held.delete(this.siege.id);
      this.game.hud.showBanner(`${name} LOST`);
      this.game.hud.say('Ines', `We lost ${name} — the ${rival} moved back in. Take it again.`);
      this.game.saveGame();
    }
    this.siege = null;
    this.siegeTimer = 0;
  }

  // Between raids: count down, then put a random held district under
  // the gun for the window.
  _siegeCountdown(dt) {
    this.siegeTimer += dt;
    if (this.siegeTimer < TERRITORY.attackIntervalSec) return;
    this.siegeTimer = 0;
    const held = [...this.held];
    const id = held[Math.floor(Math.random() * held.length)];
    const d = this.index[id];
    this.siege = { id, remaining: TERRITORY.attackWindowSec };
    this.game.hud.showBanner(`${d.name} UNDER ATTACK`);
    this.game.hud.say('Ines', `The ${d.rival} are hitting ${d.name}. Get there in ${TERRITORY.attackWindowSec} seconds or it's theirs.`);
  }

  statusText() {
    return `Territory ${this.held.size}/${DISTRICTS.length}`;
  }
}
