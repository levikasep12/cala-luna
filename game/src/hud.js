// CALA LUNA — hud: every DOM readout plus the live minimap.
// Cash, clock, district, wanted stars, health/armor, objective, speed,
// weapon, crew status, dialogue, banners, mission cards and the pause
// stats. The minimap is a canvas: streets, player, waypoint, police,
// traffic and territory colours.

import { WORLD, DISTRICTS } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'cash-value', 'clock-district', 'wanted-stars', 'health-fill', 'armor-fill',
      'objective-label', 'objective-text', 'hud-objective', 'speed-value', 'speed-unit', 'vehicle-name',
      'weapon-name', 'ammo-value', 'crew-status', 'dialogue-bar', 'dialogue-speaker', 'dialogue-text',
      'banner', 'hud-hint', 'mission-card', 'mission-card-title', 'mission-card-name', 'mission-card-reward',
      'mission-card-sub', 'busted-card', 'busted-title', 'busted-sub']) {
      this.el[id] = document.getElementById(id);
    }
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.dialogueTimer = 0;
    this.bannerTimer = 0;
    this.cardTimer = 0;
    this.hintTimer = 0;
    this.objective = '';
  }

  show() { this.el['hud'].classList.remove('hidden'); }
  hide() { this.el['hud'].classList.add('hidden'); }

  setObjective(text, timer = null) {
    this.objective = text;
    this.el['objective-text'].textContent = text;
    this.el['hud-objective'].classList.remove('hidden');
  }

  clearObjective() {
    this.objective = '';
    this.el['hud-objective'].classList.add('hidden');
  }

  setHint(text, seconds = 4) {
    this.el['hud-hint'].textContent = text;
    this.hintTimer = seconds;
  }

  say(speaker, text, seconds = 5) {
    this.el['dialogue-speaker'].textContent = speaker + ':';
    this.el['dialogue-text'].textContent = text;
    this.el['dialogue-bar'].classList.remove('hidden');
    this.dialogueTimer = seconds;
  }

  showBanner(text, seconds = 2.4) {
    this.el['banner'].textContent = text;
    this.bannerTimer = seconds;
  }

  showMissionCard(title, reward, sub, seconds = 4) {
    this.el['mission-card-title'].textContent = title;
    this.el['mission-card-name'].textContent = '';
    this.el['mission-card-reward'].textContent = reward > 0 ? `+$${reward.toLocaleString()}` : '';
    this.el['mission-card-sub'].textContent = sub || '';
    this.el['mission-card'].classList.remove('hidden');
    this.cardTimer = seconds;
  }

  hideMissionCard() { this.el['mission-card'].classList.add('hidden'); }

  showBusted(title, sub) {
    this.el['busted-title'].textContent = title;
    this.el['busted-sub'].textContent = sub;
    this.el['busted-card'].classList.remove('hidden');
  }

  hideBusted() { this.el['busted-card'].classList.add('hidden'); }

  update(dt, game) {
    const p = game.player;
    this.el['cash-value'].textContent = '$' + p.cash.toLocaleString();
    const d = game.city.districtAt(p.pos.x, p.pos.z);
    this.el['clock-district'].textContent = `${game.weather.clockString()} · ${d.name}`;
    const stars = game.police.stars;
    this.el['wanted-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.el['wanted-stars'].classList.toggle('hot', stars >= 3);
    this.el['health-fill'].style.width = `${p.health}%`;
    this.el['armor-fill'].style.width = `${p.armor}%`;
    this.el['speed-value'].textContent = Math.round(p.speedKmh);
    this.el['speed-unit'].textContent = p.inCar ? 'KM/H' : 'ON FOOT';
    this.el['vehicle-name'].textContent = p.inCar ? p.car.spec.name : d.name + ' — ' + game.territory.statusText();
    this.el['weapon-name'].textContent = p.weapon.toUpperCase();
    this.el['ammo-value'].textContent = p.weapon === 'fists' ? '∞' : String(p.ammo[p.weapon] || 0);
    this.el['crew-status'].textContent = game.crew.statusText();
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.el['dialogue-bar'].classList.add('hidden');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el['banner'].textContent = '';
    }
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.hideMissionCard();
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el['hud-hint'].textContent = '';
    }
    this._drawMinimap(game);
  }

  _drawMinimap(game) {
    const g = this.mm;
    const S = 220;
    const half = WORLD.halfSize;
    const px = (x) => ((x + half) / (half * 2)) * S;
    const pz = (z) => ((z + half) / (half * 2)) * S;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#10151f';
    g.fillRect(0, 0, S, S);
    // Territory tint per district.
    for (const d of DISTRICTS) {
      g.fillStyle = game.territory.holds(d.id) ? 'rgba(255,209,102,0.25)' : 'rgba(255,255,255,0.04)';
      g.fillRect(px(d.x0), pz(d.z0), px(d.x1) - px(d.x0), pz(d.z1) - pz(d.z0));
    }
    // Water + beach.
    g.fillStyle = '#2e7f9e';
    g.fillRect(0, pz(WORLD.waterZ - 10), S, S - pz(WORLD.waterZ - 10));
    g.fillStyle = '#e6d3a3';
    g.fillRect(0, pz(WORLD.beachZ), S, pz(WORLD.waterZ - 10) - pz(WORLD.beachZ));
    // Streets.
    g.strokeStyle = '#5a6270';
    g.lineWidth = 2;
    for (const s of game.city.streetXs) {
      g.beginPath(); g.moveTo(px(s), 0); g.lineTo(px(s), S); g.stroke();
      g.beginPath(); g.moveTo(0, pz(s)); g.lineTo(S, pz(s)); g.stroke();
    }
    // Landmarks.
    g.fillStyle = '#ffd166';
    for (const lm of Object.values(game.city.landmarks)) {
      g.fillRect(px(lm.x) - 2, pz(lm.z) - 2, 4, 4);
    }
    // Waypoint.
    const wp = game.missions.waypoint() || game.sidejobs.waypoint();
    if (wp) {
      g.fillStyle = '#ffd166';
      g.beginPath();
      g.arc(px(wp.x), pz(wp.z), 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    }
    // Traffic (yellow), police (blue/red).
    g.fillStyle = '#f2c230';
    for (const c of game.traffic.all()) g.fillRect(px(c.pos.x) - 1.5, pz(c.pos.z) - 1.5, 3, 3);
    for (const u of game.police.allUnits()) {
      g.fillStyle = u.type === 'swat' ? '#ff5a4e' : '#2a6aff';
      g.beginPath(); g.arc(px(u.pos.x), pz(u.pos.z), 3, 0, Math.PI * 2); g.fill();
    }
    if (game.police.heli) {
      g.fillStyle = '#ff5a4e';
      g.beginPath(); g.arc(px(game.police.heli.group.position.x), pz(game.police.heli.group.position.z), 4, 0, Math.PI * 2); g.fill();
    }
    // Enemies (red).
    g.fillStyle = '#ff3020';
    for (const e of game.combat.enemies) {
      if (!e.dead) g.fillRect(px(e.pos.x) - 2, pz(e.pos.z) - 2, 4, 4);
    }
    // Player arrow.
    const p = game.player;
    g.save();
    g.translate(px(p.pos.x), pz(p.pos.z));
    g.rotate(Math.atan2(p.pos.z, p.pos.x) * 0 + (p.heading + Math.PI / 2) * -1 + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
    // North marker.
    g.fillStyle = '#fff';
    g.font = 'bold 10px sans-serif';
    g.fillText('N', S / 2 - 3, 12);
  }
}
