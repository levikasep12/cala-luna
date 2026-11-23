// CALA LUNA — sidejobs: the work that pays between story jobs.
// Taxi fares, package runs, street races and stunt jumps. Each is a
// small loop the player can start from anywhere, for cash and stats.

import { RACES, STUNTS } from './config.js';

export class SideJobs {
  constructor(game) {
    this.game = game;
    this.taxi = null;   // {pickup, dropoff, fare, state}
    this.package = null;
    this.race = null;   // {def, checkpoint, timer}
    this.stuntCooldown = 0;
  }

  // Back to a new game: no fare, no package, no race.
  reset() {
    this.taxi = null;
    this.package = null;
    this.race = null;
    this.stuntCooldown = 0;
  }

  startTaxi() {
    if (this.taxi) return false;
    const g = this.game;
    const px = Math.round((Math.random() * 10 - 5)) * 60;
    const pz = Math.round((Math.random() * 10 - 5)) * 60;
    const dx = Math.round((Math.random() * 10 - 5)) * 60;
    const dz = Math.round((Math.random() * 10 - 5)) * 60;
    const fare = 120 + Math.round(Math.hypot(dx - px, dz - pz) / 10) * 15;
    this.taxi = { pickup: [px, pz], dropoff: [dx, dz], fare, state: 'pickup', t0: 0 };
    g.hud.setObjective(`Taxi fare: pick up in ${g.city.districtAt(px, pz).name} — $${fare}`);
    g.hud.say('Dispatcher', 'Fare waiting. Pick them up and drive smooth — tips for fast drops.');
    return true;
  }

  startPackage() {
    if (this.package) return false;
    const g = this.game;
    const dx = Math.round((Math.random() * 10 - 5)) * 60;
    const dz = Math.round((Math.random() * 10 - 5)) * 60;
    // Longer runs pay more: $250 base plus $50 per city block of distance.
    const dist = Math.hypot(dx - g.player.pos.x, dz - g.player.pos.z);
    const reward = 250 + Math.round(dist / 60) * 50;
    this.package = { dropoff: [dx, dz], reward, timer: 100 };
    g.hud.setObjective(`Package run: deliver to ${g.city.districtAt(dx, dz).name} in 100s — $${reward}`);
    return true;
  }

  startRace(id) {
    const def = RACES.find((r) => r.id === id);
    if (!def || this.race) return false;
    const g = this.game;
    if (g.player.cash < def.entry) {
      g.hud.say('Luz', `The ${def.name} costs $${def.entry} to enter. I don't have it.`);
      return false;
    }
    g.player.cash -= def.entry;
    this.race = { def, checkpoint: 0, timer: 0 };
    g.audio.countdown();
    g.hud.setObjective(`${def.name}: hit checkpoint 1 of ${def.checkpoints.length}`);
    g.hud.showBanner(def.name.toUpperCase());
    return true;
  }

  update(dt, player) {
    const g = this.game;
    if (this.stuntCooldown > 0) this.stuntCooldown -= dt;

    if (this.taxi) {
      const t = this.taxi;
      const target = t.state === 'pickup' ? t.pickup : t.dropoff;
      const d = Math.hypot(player.pos.x - target[0], player.pos.z - target[1]);
      if (d < 9) {
        if (t.state === 'pickup') {
          t.state = 'dropoff';
          t.t0 = g.time; // the tip clock starts when the fare gets in
          g.hud.setObjective(`Taxi fare: drop off in ${g.city.districtAt(t.dropoff[0], t.dropoff[1]).name} — $${t.fare}`);
          g.hud.say('Passenger', 'The Marina, please. And step on it — I tip for speed.');
        } else {
          // Fast drop, big tip: under 60 seconds pays +50% on the fare.
          const tip = (g.time - t.t0) < 60 ? Math.round(t.fare * 0.5) : 0;
          player.cash += t.fare + tip;
          g.stats.fares++;
          g.audio.cash();
          g.hud.say('Passenger', tip > 0 ? `Perfect — and fast. $${tip} tip on top.` : 'Perfect. Keep the change, Luz.');
          this.taxi = null;
          g.hud.clearObjective();
        }
      }
    }

    if (this.package) {
      const p = this.package;
      p.timer -= dt;
      if (p.timer <= 0) {
        this.package = null;
        g.hud.say('Dispatcher', 'Package run expired. The client found someone else.');
        g.hud.clearObjective();
      } else {
        const d = Math.hypot(player.pos.x - p.dropoff[0], player.pos.z - p.dropoff[1]);
        if (d < 9) {
          player.cash += p.reward;
          g.stats.packages++;
          g.audio.cash();
          g.hud.say('Dispatcher', `Delivered clean. $${p.reward} on its way.`);
          this.package = null;
          g.hud.clearObjective();
        }
      }
    }

    if (this.race) {
      const r = this.race;
      r.timer += dt;
      const cp = r.def.checkpoints[r.checkpoint];
      const d = Math.hypot(player.pos.x - cp[0], player.pos.z - cp[1]);
      if (d < 14) {
        r.checkpoint++;
        g.audio.pickup();
        if (r.checkpoint >= r.def.checkpoints.length) {
          const bonus = Math.max(0, 600 - Math.round(r.timer)) * 2;
          const prize = r.def.prize + bonus;
          player.cash += prize;
          g.stats.racesWon++;
          g.audio.missionPass();
          g.hud.showMissionCard(`${r.def.name} — WON`, prize, `Time ${r.timer.toFixed(1)}s`);
          this.race = null;
          g.hud.clearObjective();
        } else {
          g.hud.setObjective(`${r.def.name}: checkpoint ${r.checkpoint + 1} of ${r.def.checkpoints.length}`);
        }
      }
    }

    // Stunt jumps: airtime over a ramp pays out.
    if (player.inCar && this.stuntCooldown <= 0) {
      for (const s of STUNTS) {
        const d = Math.hypot(player.pos.x - s.ramp[0], player.pos.z - s.ramp[1]);
        if (d < 6 && player.car.speedKmh > 80) {
          this.stuntCooldown = 10;
          // Faster air pays more: $300 at 80 km/h up to $1,000 flat-out.
          const reward = Math.min(1000, 300 + Math.round((player.car.speedKmh - 80) * 5));
          player.cash += reward;
          g.stats.stunts++;
          g.audio.missionPass();
          g.hud.showBanner('STUNT JUMP!');
          g.hud.say('Luz', `${s.name} — clean air. $${reward}.`);
          break;
        }
      }
    }
  }

  waypoint() {
    if (this.taxi) return { x: this.taxi.state === 'pickup' ? this.taxi.pickup[0] : this.taxi.dropoff[0], z: this.taxi.state === 'pickup' ? this.taxi.pickup[1] : this.taxi.dropoff[1] };
    if (this.package) return { x: this.package.dropoff[0], z: this.package.dropoff[1] };
    if (this.race) {
      const cp = this.race.def.checkpoints[this.race.checkpoint];
      return { x: cp[0], z: cp[1] };
    }
    return null;
  }
}
