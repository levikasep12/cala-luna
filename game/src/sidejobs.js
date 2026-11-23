// CALA LUNA — sidejobs: the work that pays between story jobs.
// Taxi fares, package runs, street races and stunt jumps. Each is a
// small loop the player can start from anywhere, for cash and stats.

import { RACES, STUNTS, TAXI, STUNT } from './config.js';

export class SideJobs {
  constructor(game) {
    this.game = game;
    this.taxi = null;   // {pickup, dropoff, fare, state, vip, timer, t0}
    this.package = null;
    this.race = null;   // {def, checkpoint, timer}
    this.stuntCooldown = 0;
  }

  // A random point on the street grid (60-unit steps, inside the city).
  _randomStreetPoint() {
    return [Math.round((Math.random() * 10 - 5)) * 60, Math.round((Math.random() * 10 - 5)) * 60];
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
    const [px, pz] = this._randomStreetPoint();
    // The dropoff must be a real drive away: the old code could roll
    // pickup == dropoff, and the fare completed itself the frame the
    // passenger got in.
    let dx, dz;
    do { [dx, dz] = this._randomStreetPoint(); } while (Math.hypot(dx - px, dz - pz) < 120);
    let fare = 120 + Math.round(Math.hypot(dx - px, dz - pz) / 10) * 15;
    // VIP fare: double money, but the passenger is on a clock — run
    // out of time after pickup and they walk away, fare lost.
    const vip = Math.random() < TAXI.vipChance;
    if (vip) fare *= TAXI.vipMultiplier;
    this.taxi = { pickup: [px, pz], dropoff: [dx, dz], fare, state: 'pickup', t0: 0, vip, timer: TAXI.vipTimeLimit };
    g.hud.setObjective(`${vip ? 'VIP fare' : 'Taxi fare'}: pick up in ${g.city.districtAt(px, pz).name} — $${fare}${vip ? ` in ${TAXI.vipTimeLimit}s` : ''}`);
    g.hud.say('Dispatcher', vip
      ? 'VIP fare — double money, but they are on a clock. Drive like it matters.'
      : 'Fare waiting. Pick them up and drive smooth — tips for fast drops.');
    return true;
  }

  startPackage() {
    if (this.package) return false;
    const g = this.game;
    // Same re-roll as the taxi: a dropoff under the player's feet used
    // to complete the run the instant it started.
    let dx, dz, dist;
    do {
      [dx, dz] = this._randomStreetPoint();
      dist = Math.hypot(dx - g.player.pos.x, dz - g.player.pos.z);
    } while (dist < 60);
    // Longer runs pay more: $250 base plus $50 per city block of distance.
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
      // The VIP clock runs from pickup: late means no fare at all.
      if (t.vip && t.state === 'dropoff') {
        t.timer -= dt;
        g.hud.setObjective(`VIP fare: drop off in ${g.city.districtAt(t.dropoff[0], t.dropoff[1]).name} — $${t.fare} — ${Math.ceil(t.timer)}s`);
        if (t.timer <= 0) {
          this.taxi = null;
          g.hud.say('Passenger', "Too slow. I'll find another cab.");
          g.hud.clearObjective();
        }
      }
      if (!this.taxi) return;
      const target = t.state === 'pickup' ? t.pickup : t.dropoff;
      const d = Math.hypot(player.pos.x - target[0], player.pos.z - target[1]);
      if (d < 9) {
        if (t.state === 'pickup') {
          t.state = 'dropoff';
          t.t0 = g.time; // the tip clock starts when the fare gets in
          g.hud.setObjective(`${t.vip ? 'VIP fare' : 'Taxi fare'}: drop off in ${g.city.districtAt(t.dropoff[0], t.dropoff[1]).name} — $${t.fare}`);
          g.hud.say('Passenger', t.vip ? "The Marina. I'm late — double fare if you fly." : 'The Marina, please. And step on it — I tip for speed.');
        } else {
          // Fast drop, big tip: inside the window pays the tip rate.
          const tip = (g.time - t.t0) < TAXI.tipWindowSec ? Math.round(t.fare * TAXI.tipRate) : 0;
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
        if (d < 6 && player.car.speedKmh > STUNT.minSpeedKmh) {
          this.stuntCooldown = STUNT.cooldownSec;
          // Faster air pays more: base at the minimum speed, capped.
          const reward = Math.min(STUNT.maxReward, STUNT.baseReward + Math.round((player.car.speedKmh - STUNT.minSpeedKmh) * STUNT.perKmh));
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
