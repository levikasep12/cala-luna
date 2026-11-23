// CALA LUNA — economy: cash, the gun shop and ammo.
// Walk into Iron & Oak to buy weapons, ammo and armor. Prices are in
// config; the shop is a simple proximity menu driven by number keys.

import { WEAPONS, SHOPS, SHOP, PLAYER } from './config.js';

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
    const lines = [`IRON & OAK GUNS — $${p.cash.toLocaleString()} in your pocket · press 1-6 to buy, E to leave`];
    const items = [
      ['1', 'pistol', 'Pistol + 60 ammo'],
      ['2', 'shotgun', 'Shotgun + 24 ammo'],
      ['3', 'rifle', 'Rifle + 100 ammo'],
      ['4', 'armor', 'Full armor'],
      ['5', 'medkit', `Medkit +${SHOP.medkitHeal} HP (pouch ${p.medkits}/${PLAYER.maxMedkits})`],
      ['6', 'crate', 'Ammo crate — refill every owned weapon'],
    ];
    for (const [key, id, label] of items) {
      const price = id === 'armor' ? SHOP.armorPrice : id === 'medkit' ? SHOP.medkitPrice : id === 'crate' ? SHOP.ammoCratePrice : WEAPONS[id].price;
      let suffix = '';
      if (id === 'armor' && p.armor >= 100) suffix = ' (plated)';
      else if (id === 'medkit' && p.medkits >= PLAYER.maxMedkits) suffix = ' (pouch full)';
      else if (id !== 'armor' && id !== 'medkit' && id !== 'crate' && p.owned.has(id)) suffix = ' (owned)';
      lines.push(`[${key}] ${label} — $${price}${suffix}`);
    }
    return lines.join('\n');
  }

  buy(id) {
    const g = this.game;
    const p = g.player;
    if (id === 'armor') {
      if (p.cash < SHOP.armorPrice) { g.audio.denied(); g.hud.say('Shopkeep', `Armor is $${SHOP.armorPrice}. Come back with the cash.`); return false; }
      if (p.armor >= 100) { g.audio.denied(); g.hud.say('Shopkeep', "You're already plated up."); return false; }
      p.cash -= SHOP.armorPrice;
      p.armor = 100;
      g.audio.pickup();
      g.hud.say('Shopkeep', 'Full plates. Walk tall, Luz.');
      return true;
    }
    if (id === 'medkit') {
      // Medkits go into the pouch, not straight into Luz: she buys them
      // healthy and spends them mid-job (key 5). The old code healed on
      // the spot, so a kit bought at full health was money thrown away.
      if (p.medkits >= PLAYER.maxMedkits) { g.audio.denied(); g.hud.say('Shopkeep', 'Your pouch is full — three kits, no more.'); return false; }
      if (p.cash < SHOP.medkitPrice) { g.audio.denied(); g.hud.say('Shopkeep', `Medkit is $${SHOP.medkitPrice}.`); return false; }
      p.cash -= SHOP.medkitPrice;
      p.medkits++;
      g.audio.pickup();
      g.hud.say('Shopkeep', 'Bandages and bravado. Press 5 when you need it.');
      return true;
    }
    if (id === 'crate') {
      if (p.cash < SHOP.ammoCratePrice) { g.audio.denied(); g.hud.say('Shopkeep', `The crate is $${SHOP.ammoCratePrice}.`); return false; }
      p.cash -= SHOP.ammoCratePrice;
      for (const wid of p.owned) {
        if (wid !== 'fists' && WEAPONS[wid]) p.ammo[wid] = WEAPONS[wid].ammo;
      }
      g.audio.pickup();
      g.hud.say('Shopkeep', 'Every mag topped off. Go loud, Luz.');
      return true;
    }
    const w = WEAPONS[id];
    if (!w) return false;
    if (p.owned.has(id)) {
      // Top up ammo at half price.
      const topUp = Math.floor(w.price / 2);
      if (p.cash < topUp) { g.audio.denied(); g.hud.say('Shopkeep', `Ammo top-up is $${topUp}.`); return false; }
      p.cash -= topUp;
      p.ammo[id] = (p.ammo[id] || 0) + Math.floor(w.ammo / 2);
      g.audio.pickup();
      return true;
    }
    if (p.cash < w.price) {
      g.audio.denied();
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
