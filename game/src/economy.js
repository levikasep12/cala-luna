// CALA LUNA — economy: cash, the gun shop and ammo.
// Walk into Iron & Oak to buy weapons, ammo and armor. Prices are in
// config; the shop is a simple proximity menu driven by number keys.

import { WEAPONS, SHOPS } from './config.js';

export class Economy {
  constructor(game) {
    this.game = game;
    this.at = SHOPS.gunshop.at;
    this.open = false;
  }

  nearShop(player) {
    return Math.hypot(player.pos.x - this.at[0], player.pos.z - this.at[1]) < 12;
  }

  shopText() {
    const p = this.game.player;
    const lines = ['IRON & OAK GUNS — press 1-4 to buy, E to leave'];
    const items = [
      ['1', 'pistol', 'Pistol + 60 ammo'],
      ['2', 'shotgun', 'Shotgun + 24 ammo'],
      ['3', 'rifle', 'Rifle + 100 ammo'],
      ['4', 'armor', 'Full armor'],
    ];
    for (const [key, id, label] of items) {
      const price = id === 'armor' ? 800 : WEAPONS[id].price;
      const owned = id === 'armor' ? p.armor >= 100 : p.owned.has(id);
      lines.push(`[${key}] ${label} — $${price}${owned ? ' (owned)' : ''}`);
    }
    return lines.join('\n');
  }

  buy(id) {
    const g = this.game;
    const p = g.player;
    if (id === 'armor') {
      if (p.cash < 800) { g.hud.say('Shopkeep', 'Armor is $800. Come back with the cash.'); return false; }
      if (p.armor >= 100) { g.hud.say('Shopkeep', "You're already plated up."); return false; }
      p.cash -= 800;
      p.armor = 100;
      g.audio.pickup();
      g.hud.say('Shopkeep', 'Full plates. Walk tall, Luz.');
      return true;
    }
    const w = WEAPONS[id];
    if (!w) return false;
    if (p.owned.has(id)) {
      // Top up ammo at half price.
      const topUp = Math.floor(w.price / 2);
      if (p.cash < topUp) { g.hud.say('Shopkeep', `Ammo top-up is $${topUp}.`); return false; }
      p.cash -= topUp;
      p.ammo[id] = (p.ammo[id] || 0) + Math.floor(w.ammo / 2);
      g.audio.pickup();
      return true;
    }
    if (p.cash < w.price) {
      g.hud.say('Shopkeep', `The ${w.name} is $${w.price}. No credit, no exceptions.`);
      return false;
    }
    p.cash -= w.price;
    p.owned.add(id);
    p.ammo[id] = w.ammo;
    p.setWeapon(id);
    g.audio.pickup();
    g.hud.say('Shopkeep', `${w.name}, fresh out of the case. Don't bring it back dirty.`);
    return true;
  }
}
