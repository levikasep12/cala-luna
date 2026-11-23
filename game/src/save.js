// CALA LUNA — save: localStorage persistence and the stats record.
// Cash, mission progress, garage, territory, crew and lifetime stats
// all survive a refresh. A save from an older build is ignored safely.

import { SAVE_KEY } from './config.js';

export class Save {
  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  static store(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, ...data }));
      return true;
    } catch {
      return false;
    }
  }

  static clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
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
