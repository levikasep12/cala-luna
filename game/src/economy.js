// CALA LUNA — economy: cash, the gun shop and ammo.
// Walk into Iron & Oak to buy weapons, ammo and armor. Prices are in
// config; the shop is a simple proximity menu driven by number keys.
// The shelf is one table: each row knows its key, its label, its price,
// when it reads as bought-out, and buying is one handler per kind —
// armor, medkits, the ammo crate, and weapons (buy once, top up after).

import { WEAPONS, SHOPS, SHOP, PLAYER } from './config.js';

// The shelf, in menu order. Labels and suffixes read the player, so the
// menu always shows the live state: what she owns, what she wears, how
// full the medkit pouch is.
const SHELF = [
  { key: '1', id: 'pistol', label: () => 'Pistol + 60 ammo', price: () => WEAPONS.pistol.price, suffix: (p) => p.owned.has('pistol') ? ' (owned)' : '' },
  { key: '2', id: 'shotgun', label: () => 'Shotgun + 24 ammo', price: () => WEAPONS.shotgun.price, suffix: (p) => p.owned.has('shotgun') ? ' (owned)' : '' },
  { key: '3', id: 'rifle', label: () => 'Rifle + 100 ammo', price: () => WEAPONS.rifle.price, suffix: (p) => p.owned.has('rifle') ? ' (owned)' : '' },
  { key: '4', id: 'armor', label: () => 'Full armor', price: () => SHOP.armorPrice, suffix: (p) => p.armor >= 100 ? ' (plated)' : '' },
  { key: '5', id: 'medkit', label: (p) => `Medkit +${SHOP.medkitHeal} HP (pouch ${p.medkits}/${PLAYER.maxMedkits})`, price: () => SHOP.medkitPrice, suffix: (p) => p.medkits >= PLAYER.maxMedkits ? ' (pouch full)' : '' },
  { key: '6', id: 'crate', label: () => 'Ammo crate — refill every owned weapon', price: () => SHOP.ammoCratePrice, suffix: () => '' },
];

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
    for (const item of SHELF) {
      lines.push(`[${item.key}] ${item.label(p)} — $${item.price()}${item.suffix(p)}`);
    }
    return lines.join('\n');
  }

  buy(id) {
    if (id === 'armor') return this._buyArmor();
    if (id === 'medkit') return this._buyMedkit();
    if (id === 'crate') return this._buyCrate();
    return this._buyWeapon(id);
  }

  // A refused sale: two low buzzes and the shopkeep's reason.
  _deny(msg) {
    this.game.audio.denied();
    this.game.hud.say('Shopkeep', msg);
    return false;
  }

  // A completed sale: the till sound and the shopkeep's send-off.
  _paid(msg) {
    this.game.audio.pickup();
    this.game.hud.say('Shopkeep', msg);
    return true;
  }

  _buyArmor() {
    const p = this.game.player;
    if (p.cash < SHOP.armorPrice) return this._deny(`Armor is $${SHOP.armorPrice}. Come back with the cash.`);
    if (p.armor >= 100) return this._deny("You're already plated up.");
    p.cash -= SHOP.armorPrice;
    p.armor = 100;
    return this._paid('Full plates. Walk tall, Luz.');
  }

  // Medkits go into the pouch, not straight into Luz: she buys them
  // healthy and spends them mid-job (key 5). The old code healed on
  // the spot, so a kit bought at full health was money thrown away.
  _buyMedkit() {
    const p = this.game.player;
    if (p.medkits >= PLAYER.maxMedkits) return this._deny('Your pouch is full — three kits, no more.');
    if (p.cash < SHOP.medkitPrice) return this._deny(`Medkit is $${SHOP.medkitPrice}.`);
    p.cash -= SHOP.medkitPrice;
    p.medkits++;
    return this._paid('Bandages and bravado. Press 5 when you need it.');
  }

  // One crate refills every owned weapon to a full mag: cheaper than
  // topping each up separately, so it pays once Luz owns two guns.
  _buyCrate() {
    const p = this.game.player;
    if (p.cash < SHOP.ammoCratePrice) return this._deny(`The crate is $${SHOP.ammoCratePrice}.`);
    p.cash -= SHOP.ammoCratePrice;
    for (const wid of p.owned) {
      if (wid !== 'fists' && WEAPONS[wid]) p.ammo[wid] = WEAPONS[wid].ammo;
    }
    return this._paid('Every mag topped off. Go loud, Luz.');
  }

  _buyWeapon(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    const p = this.game.player;
    if (p.owned.has(id)) return this._topUp(id, w);
    if (p.cash < w.price) return this._deny(`The ${w.name} is $${w.price}. No credit, no exceptions.`);
    p.cash -= w.price;
    p.owned.add(id);
    p.ammo[id] = w.ammo;
    p.setWeapon(id);
    return this._paid(`${w.name}, fresh out of the case. Don't bring it back dirty.`);
  }

  // Top up ammo at half price — no send-off line, just the till.
  _topUp(id, w) {
    const p = this.game.player;
    const topUp = Math.floor(w.price / 2);
    if (p.cash < topUp) return this._deny(`Ammo top-up is $${topUp}.`);
    p.cash -= topUp;
    p.ammo[id] = (p.ammo[id] || 0) + Math.floor(w.ammo / 2);
    this.game.audio.pickup();
    return true;
  }
}
