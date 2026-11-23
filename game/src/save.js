// CALA LUNA — save: localStorage persistence and the stats record.
// Cash, mission progress, garage, territory, crew and lifetime stats
// all survive a refresh. A save from an older build is ignored safely.
// One backup slot holds the last good save beside the live one, so a
// crash mid-write never costs the whole campaign: load falls back to
// the backup and restores it as the live save.

import { SAVE_KEY } from './config.js';

const SAVE_VERSION = 1;
const MAX_JOB_INDEX = 8; // the story has 8 jobs; past that is corrupt

export class Save {
  // One backup slot: the last good save, kept beside the live one.
  static _bakKey() { return SAVE_KEY + ':bak'; }

  // localStorage reads and writes, each guarded: a thrown quota or a
  // blocked store reads as nothing, never as a crash.
  static _read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  static _write(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  static _remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  // Parse + sanity-check one stored blob. A save with impossible
  // numbers (NaN cash, a job index past the story) is corrupt, not a
  // save — it loads as nothing, and the backup gets its chance.
  static _parse(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null;
      if (data.cash !== undefined && (!Number.isFinite(data.cash) || data.cash < 0)) return null;
      if (data.jobIndex !== undefined && (!Number.isInteger(data.jobIndex) || data.jobIndex < 0 || data.jobIndex > MAX_JOB_INDEX)) return null;
      return data;
    } catch {
      return null;
    }
  }

  static load() {
    const data = Save._parse(Save._read(SAVE_KEY));
    if (data) return data;
    // Primary corrupt or missing: fall back to the backup and restore
    // it as the live save, so the next load is clean.
    const bak = Save._parse(Save._read(Save._bakKey()));
    if (bak) {
      Save._write(SAVE_KEY, JSON.stringify(bak));
      return bak;
    }
    return null;
  }

  static store(data) {
    // Keep the previous good save as the backup before overwriting:
    // a crash mid-write used to cost the whole campaign.
    const prev = Save._read(SAVE_KEY);
    if (prev && Save._parse(prev)) Save._write(Save._bakKey(), prev);
    return Save._write(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, ...data }));
  }

  static clear() {
    Save._remove(SAVE_KEY);
    Save._remove(Save._bakKey());
  }

  // True when a save exists, without parsing it: the title screen uses
  // this to decide whether CONTINUE shows at all.
  static exists() {
    return Save._read(SAVE_KEY) !== null;
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
