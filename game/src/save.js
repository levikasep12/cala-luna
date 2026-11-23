// CALA LUNA — save: localStorage persistence and the stats record.
// Cash, mission progress, garage, territory, crew and lifetime stats
// all survive a refresh. A save from an older build is ignored safely.

import { SAVE_KEY } from './config.js';

export class Save {
  // One backup slot: the last good save, kept beside the live one.
  static _bakKey() { return SAVE_KEY + ':bak'; }

  // Parse + sanity-check one stored blob. A save with impossible
  // numbers (NaN cash, a job index past the story) is corrupt, not a
  // save — it loads as nothing, and the backup gets its chance.
  static _parse(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      if (data.cash !== undefined && (!Number.isFinite(data.cash) || data.cash < 0)) return null;
      if (data.jobIndex !== undefined && (!Number.isInteger(data.jobIndex) || data.jobIndex < 0 || data.jobIndex > 8)) return null;
      return data;
    } catch {
      return null;
    }
  }

  static load() {
    try {
      const data = Save._parse(localStorage.getItem(SAVE_KEY));
      if (data) return data;
      // Primary corrupt or missing: fall back to the backup and
      // restore it as the live save, so the next load is clean.
      const bak = Save._parse(localStorage.getItem(Save._bakKey()));
      if (bak) {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(bak)); } catch { /* backup still stands */ }
        return bak;
      }
      return null;
    } catch {
      return null;
    }
  }

  static store(data) {
    try {
      // Keep the previous good save as the backup before overwriting:
      // a crash mid-write used to cost the whole campaign.
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev && Save._parse(prev)) {
        try { localStorage.setItem(Save._bakKey(), prev); } catch { /* backup is best-effort */ }
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, ...data }));
      return true;
    } catch {
      return false;
    }
  }

  static clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(Save._bakKey()); } catch { /* ignore */ }
  }

  // True when a save exists, without parsing it: the title screen uses
  // this to decide whether CONTINUE shows at all.
  static exists() {
    try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
  }

  static statsText(stats, extra) {
    const rows = [
      ['Cash earned', '$' + (stats.cashEarned || 0).toLocaleString()],
      ['Story jobs done', `${stats.missionsDone || 0} / 8`],
      ['Taxi fares', stats.fares || 0],
      ['Packages delivered', stats.packages || 0],
      ['Races won', stats.racesWon || 0],
      ['Stunt jumps', stats.stunts || 0],
      ['Cars stolen', stats.carsStolen || 0],
      ['Rivals taken down', stats.kills || 0],
      ['Distance driven', (stats.distanceKm || 0).toFixed(1) + ' km'],
      ['Times busted', stats.busted || 0],
      ['Times wasted', stats.wasted || 0],
      ['Play time', Save._fmtTime(stats.playSeconds || 0)],
    ];
    if (extra) rows.push(...extra);
    return rows.map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br>');
  }

  static _fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
}
