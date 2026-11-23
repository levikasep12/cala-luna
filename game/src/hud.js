// CALA LUNA — hud: every DOM readout plus the live minimap.
// Cash, clock, district, wanted stars, health/armor/stamina, the heat
// bar, objective, speed, weapon, crew status, dialogue, banners,
// mission cards and the busted card. The minimap is a canvas painted
// in layers: districts, water, streets, landmarks, stunts, the
// waypoint, traffic, police, enemies, and Luz's arrow on top.
// The element ids live in one table, grouped by what they show, so the
// constructor is a loop instead of a wall of lookups.

import { WORLD, DISTRICTS, WEAPONS, STUNTS } from './config.js';

const ELEMENTS = {
  frame: ['hud', 'damage-vignette'],
  topLeft: ['cash-value', 'clock-district', 'medkit-count'],
  topRight: ['wanted-stars', 'health-fill', 'armor-fill', 'stamina-fill', 'heat-bar', 'heat-fill'],
  objective: ['objective-label', 'objective-text', 'hud-objective'],
  bottomRight: ['speed-value', 'speed-unit', 'vehicle-name'],
  weapon: ['hud-weapon', 'weapon-name', 'ammo-value'],
  crew: ['crew-status'],
  dialogue: ['dialogue-bar', 'dialogue-speaker', 'dialogue-text'],
  overlays: ['banner', 'hud-hint'],
  missionCard: ['mission-card', 'mission-card-title', 'mission-card-name', 'mission-card-reward', 'mission-card-sub'],
  bustedCard: ['busted-card', 'busted-title', 'busted-sub'],
};

// Landmark colours, so the map reads at a glance: home is green, the
// gun shop orange, the garage blue, the rest gold.
const LANDMARK_COLORS = { safehouse: '#7ee787', gunshop: '#ff9f43', garage: '#79c0ff' };
const MAP_SIZE = 220;

export class Hud {
  constructor() {
    this.el = {};
    for (const ids of Object.values(ELEMENTS)) {
      for (const id of ids) this.el[id] = document.getElementById(id);
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
    this._refreshReadouts(game);
    this._refreshTimers(dt);
    this._drawMinimap(game);
  }

  // The text and bar readouts: cash, clock, stars, vitals, speed,
  // weapon, crew. Everything that changes with the game state.
  _refreshReadouts(game) {
    const p = game.player;
    const el = this.el;
    el['cash-value'].textContent = '$' + p.cash.toLocaleString();
    const d = game.city.districtAt(p.pos.x, p.pos.z);
    el['clock-district'].textContent = `${game.weather.clockString()} · ${d.name}`;
    const stars = game.police.stars;
    el['wanted-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    el['wanted-stars'].classList.toggle('hot', stars >= 3);
    el['health-fill'].style.width = `${p.health}%`;
    el['armor-fill'].style.width = `${p.armor}%`;
    el['stamina-fill'].style.width = `${p.stamina}%`;
    // Medkits in the pouch, and the low-health vignette: under 35 HP
    // the screen edges bleed red, pulsing, until Luz patches up.
    el['medkit-count'].textContent = p.medkits > 0 ? `✚ ${p.medkits} MEDKIT${p.medkits > 1 ? 'S' : ''} [5]` : '';
    el['damage-vignette'].style.opacity = p.health < 35
      ? String(0.35 + Math.sin(game.time * 5) * 0.15) : '0';
    // Heat cooldown: while Luz is hidden, the bar fills toward losing
    // a star (6 + 2s per star). Hidden while she is seen.
    const cooling = stars > 0 && game.police.cooldown > 0;
    el['heat-bar'].style.display = cooling ? 'block' : 'none';
    if (cooling) {
      const need = 6 + stars * 2;
      el['heat-fill'].style.width = `${Math.min(100, (game.police.cooldown / need) * 100)}%`;
    }
    el['speed-value'].textContent = Math.round(p.speedKmh);
    el['speed-unit'].textContent = p.inCar ? 'KM/H' : 'ON FOOT';
    el['vehicle-name'].textContent = p.inCar ? p.car.spec.name : d.name + ' — ' + game.territory.statusText();
    el['weapon-name'].textContent = p.weapon.toUpperCase();
    el['ammo-value'].textContent = p.weapon === 'fists' ? '∞' : String(p.ammo[p.weapon] || 0);
    // Low ammo turns the weapon readout red below a quarter of a full mag.
    const spec = WEAPONS[p.weapon];
    const lowAmmo = p.weapon !== 'fists' && spec && (p.ammo[p.weapon] || 0) < spec.ammo * 0.25;
    el['hud-weapon'].classList.toggle('low', !!lowAmmo);
    el['crew-status'].textContent = game.crew.statusText();
  }

  // The timed overlays: dialogue, banner, mission card, hint. Each
  // hides itself when its clock runs out.
  _refreshTimers(dt) {
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
  }

  // The minimap, painted layer by layer onto the canvas. The context
  // object carries the drawing context and the world-to-canvas mapping.
  _drawMinimap(game) {
    const S = MAP_SIZE;
    const half = WORLD.halfSize;
    const m = {
      g: this.mm,
      S,
      px: (x) => ((x + half) / (half * 2)) * S,
      pz: (z) => ((z + half) / (half * 2)) * S,
    };
    m.g.clearRect(0, 0, S, S);
    m.g.fillStyle = '#10151f';
    m.g.fillRect(0, 0, S, S);
    this._mapDistricts(m, game);
    this._mapWater(m);
    this._mapStreets(m, game);
    this._mapLandmarks(m, game);
    this._mapStunts(m);
    this._mapWaypoint(m, game);
    this._mapUnits(m, game);
    this._mapPlayer(m, game);
    m.g.fillStyle = '#fff';
    m.g.font = 'bold 10px sans-serif';
    m.g.fillText('N', S / 2 - 3, 12);
  }

  // Territory tint per district: held ground glows gold.
  _mapDistricts(m, game) {
    for (const d of DISTRICTS) {
      m.g.fillStyle = game.territory.holds(d.id) ? 'rgba(255,209,102,0.25)' : 'rgba(255,255,255,0.04)';
      m.g.fillRect(m.px(d.x0), m.pz(d.z0), m.px(d.x1) - m.px(d.x0), m.pz(d.z1) - m.pz(d.z0));
    }
  }

  _mapWater(m) {
    m.g.fillStyle = '#2e7f9e';
    m.g.fillRect(0, m.pz(WORLD.waterZ - 10), m.S, m.S - m.pz(WORLD.waterZ - 10));
    m.g.fillStyle = '#e6d3a3';
    m.g.fillRect(0, m.pz(WORLD.beachZ), m.S, m.pz(WORLD.waterZ - 10) - m.pz(WORLD.beachZ));
  }

  _mapStreets(m, game) {
    m.g.strokeStyle = '#5a6270';
    m.g.lineWidth = 2;
    for (const s of game.city.streetXs) {
      m.g.beginPath(); m.g.moveTo(m.px(s), 0); m.g.lineTo(m.px(s), m.S); m.g.stroke();
      m.g.beginPath(); m.g.moveTo(0, m.pz(s)); m.g.lineTo(m.S, m.pz(s)); m.g.stroke();
    }
  }

  _mapLandmarks(m, game) {
    for (const [id, lm] of Object.entries(game.city.landmarks)) {
      m.g.fillStyle = LANDMARK_COLORS[id] || '#ffd166';
      m.g.fillRect(m.px(lm.x) - 2, m.pz(lm.z) - 2, 4, 4);
    }
  }

  // Stunt ramps (orange triangles).
  _mapStunts(m) {
    m.g.fillStyle = '#d8b13a';
    for (const s of STUNTS) {
      const sx = m.px(s.ramp[0]), sy = m.pz(s.ramp[1]);
      m.g.beginPath();
      m.g.moveTo(sx, sy - 4); m.g.lineTo(sx + 4, sy + 3); m.g.lineTo(sx - 4, sy + 3); m.g.closePath();
      m.g.fill();
    }
  }

  // Waypoint (pulsing, so it reads at a glance).
  _mapWaypoint(m, game) {
    const wp = game.missions.waypoint() || game.sidejobs.waypoint();
    if (!wp) return;
    m.g.fillStyle = '#ffd166';
    m.g.beginPath();
    m.g.arc(m.px(wp.x), m.pz(wp.z), 5 + Math.sin(game.time * 4) * 1.5, 0, Math.PI * 2);
    m.g.fill();
    m.g.strokeStyle = '#fff';
    m.g.lineWidth = 1.5;
    m.g.stroke();
  }

  // Traffic (yellow), police (blue/red), helicopter (red), enemies (red).
  _mapUnits(m, game) {
    m.g.fillStyle = '#f2c230';
    for (const c of game.traffic.all()) m.g.fillRect(m.px(c.pos.x) - 1.5, m.pz(c.pos.z) - 1.5, 3, 3);
    for (const u of game.police.allUnits()) {
      m.g.fillStyle = u.type === 'swat' ? '#ff5a4e' : '#2a6aff';
      m.g.beginPath(); m.g.arc(m.px(u.pos.x), m.pz(u.pos.z), 3, 0, Math.PI * 2); m.g.fill();
    }
    if (game.police.heli) {
      m.g.fillStyle = '#ff5a4e';
      m.g.beginPath(); m.g.arc(m.px(game.police.heli.group.position.x), m.pz(game.police.heli.group.position.z), 4, 0, Math.PI * 2); m.g.fill();
    }
    m.g.fillStyle = '#ff3020';
    for (const e of game.combat.enemies) {
      if (!e.dead) m.g.fillRect(m.px(e.pos.x) - 2, m.pz(e.pos.z) - 2, 4, 4);
    }
  }

  // Player arrow. Canvas rotate() is clockwise and the arrow is drawn
  // pointing up, so heading 0 (+x, east) needs a quarter turn right.
  _mapPlayer(m, game) {
    const p = game.player;
    m.g.save();
    m.g.translate(m.px(p.pos.x), m.pz(p.pos.z));
    m.g.rotate(Math.PI / 2 - p.heading);
    m.g.fillStyle = '#ffffff';
    m.g.beginPath();
    m.g.moveTo(0, -8); m.g.lineTo(5, 6); m.g.lineTo(-5, 6); m.g.closePath();
    m.g.fill();
    m.g.strokeStyle = '#000';
    m.g.lineWidth = 1;
    m.g.stroke();
    m.g.restore();
  }
}
