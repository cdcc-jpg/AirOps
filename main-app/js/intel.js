/**
 * AirOps v2 — Intelligence Layer
 * Kill/death stats, leaderboards, weapon performance, per-player analytics.
 */

import { renderBfoSigilHtml } from './priory-semiotics.js?v=2.11.2';

export class IntelEngine {
  constructor(engine) {
    this.engine = engine;
    this._killIndex = new Map();
    this._deathIndex = new Map();
    this._buildIndexes();
  }

  _buildIndexes() {
    const elims = this.engine.gameEvents.filter(e => e.type === 'elimination');
    for (const e of elims) {
      if (!this._killIndex.has(e.attackerId)) this._killIndex.set(e.attackerId, []);
      this._killIndex.get(e.attackerId).push(e);

      if (!this._deathIndex.has(e.targetId)) this._deathIndex.set(e.targetId, []);
      this._deathIndex.get(e.targetId).push(e);
    }
  }

  getPlayerStats(playerId) {
    const kills = this._killIndex.get(playerId) || [];
    const deaths = this._deathIndex.get(playerId) || [];
    const player = this.engine.getPlayer(playerId);

    const weaponCounts = {};
    for (const k of kills) {
      weaponCounts[k.weapon] = (weaponCounts[k.weapon] || 0) + 1;
    }
    const favWeapon = Object.entries(weaponCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const nemesisCounts = {};
    for (const d of deaths) {
      nemesisCounts[d.attackerCallsign] = (nemesisCounts[d.attackerCallsign] || 0) + 1;
    }
    const nemesis = Object.entries(nemesisCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

    const zoneCounts = {};
    for (const k of kills) {
      zoneCounts[k.zone] = (zoneCounts[k.zone] || 0) + 1;
    }
    const bestZone = Object.entries(zoneCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, ' ') || 'N/A';

    return {
      playerId,
      callsign: player?.callsign || playerId,
      kills: kills.length,
      deaths: deaths.length,
      kd: deaths.length > 0 ? Math.round((kills.length / deaths.length) * 100) / 100 : kills.length,
      assists: player?.stats?.assists || 0,
      objectiveCaptures: player?.stats?.objectiveCaptures || 0,
      revives: player?.stats?.revives || 0,
      favWeapon,
      nemesis,
      bestZone,
    };
  }

  getLeaderboard(metric = 'kills', limit = 10) {
    const stats = this.engine.players.map(p => this.getPlayerStats(p.id));

    switch (metric) {
      case 'kills':
        stats.sort((a, b) => b.kills - a.kills);
        break;
      case 'kd':
        stats.sort((a, b) => b.kd - a.kd);
        break;
      case 'objectives':
        stats.sort((a, b) => b.objectiveCaptures - a.objectiveCaptures);
        break;
      case 'revives':
        stats.sort((a, b) => b.revives - a.revives);
        break;
      default:
        stats.sort((a, b) => b.kills - a.kills);
    }

    return stats.slice(0, limit);
  }

  getKillFeed(limit = 15) {
    return this.engine.gameEvents
      .filter(e => e.type === 'elimination')
      .slice(-limit)
      .reverse();
  }

  getWeaponStats() {
    const elims = this.engine.gameEvents.filter(e => e.type === 'elimination');
    const weaponMap = {};

    for (const e of elims) {
      if (!weaponMap[e.weapon]) {
        weaponMap[e.weapon] = { name: e.weapon, kills: 0, users: new Set() };
      }
      weaponMap[e.weapon].kills++;
      weaponMap[e.weapon].users.add(e.attackerId);
    }

    return Object.values(weaponMap)
      .map(w => ({ name: w.name, kills: w.kills, users: w.users.size }))
      .sort((a, b) => b.kills - a.kills);
  }

  getZoneActivity() {
    const elims = this.engine.gameEvents.filter(e => e.type === 'elimination');
    const zoneMap = {};

    for (const e of elims) {
      zoneMap[e.zone] = (zoneMap[e.zone] || 0) + 1;
    }

    return Object.entries(zoneMap)
      .map(([zone, count]) => ({ zone: zone.replace(/_/g, ' '), count }))
      .sort((a, b) => b.count - a.count);
  }

  getTeamStats(teamId) {
    const teamPlayers = this.engine.players.filter(p => p.team === teamId);
    const stats = teamPlayers.map(p => this.getPlayerStats(p.id));

    return {
      totalKills: stats.reduce((s, p) => s + p.kills, 0),
      totalDeaths: stats.reduce((s, p) => s + p.deaths, 0),
      avgKD: stats.length > 0
        ? Math.round(stats.reduce((s, p) => s + p.kd, 0) / stats.length * 100) / 100
        : 0,
      topFragger: stats.sort((a, b) => b.kills - a.kills)[0] || null,
      playerCount: teamPlayers.length,
      activeCount: teamPlayers.filter(p => p.status === 'ACTIVE').length,
    };
  }

  renderLeaderboardHTML(metric = 'kills') {
    const board = this.getLeaderboard(metric, 10);
    const labels = { kills: 'Kills', kd: 'K/D', objectives: 'OBJ', revives: 'Revives' };

    return `
      <table class="wb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th class="num">${labels[metric] || 'Score'}</th>
          </tr>
        </thead>
        <tbody>
          ${board.map((p, i) => {
            const player = this.engine.getPlayer(p.playerId);
            const teamClass = player?.team || 'nonband';
            const val = metric === 'kd' ? p.kd.toFixed(2) : p[metric] ?? p.kills;
            return `
              <tr data-player-id="${p.playerId}">
                <td class="tabular-nums">${i + 1}</td>
                <td class="team-${teamClass}">${p.callsign}</td>
                <td class="num">${val}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderKillFeedHTML() {
    const feed = this.getKillFeed(10);

    if (feed.length === 0) {
      return `<div class="wb-prop-row"><span class="wb-prop-key">Kill Feed</span><span class="wb-prop-val text-muted">No eliminations</span></div>`;
    }

    return feed.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      });
      return `
        <div class="feed-entry">
          <span class="feed-time">${time}</span>
          <span class="feed-icon">${renderBfoSigilHtml('proc', '', 'Elimination')}</span>
          <span class="feed-text">
            <span class="highlight team-${e.attackerTeam}">${e.attackerCallsign}</span> ->
            <span class="highlight team-${e.targetTeam}">${e.targetCallsign}</span>
            <span class="text-muted">(${e.zone.replace(/_/g, ' ')})</span>
          </span>
        </div>
      `;
    }).join('');
  }

  renderWeaponStatsHTML() {
    const weapons = this.getWeaponStats().slice(0, 8);

    if (weapons.length === 0) {
      return `<div class="wb-prop-row"><span class="wb-prop-key">Weapons</span><span class="wb-prop-val text-muted">No data</span></div>`;
    }

    const maxKills = weapons[0]?.kills || 1;

    return weapons.map(w => {
      const pct = Math.round((w.kills / maxKills) * 100);
      return `
        <div class="balance-factor-row">
          <span class="bf-label" title="${w.name}">${w.name.substring(0, 18)}</span>
          <div class="bf-bar-bg">
            <div class="bf-bar" style="width: ${pct}%; background: var(--accent-primary);"></div>
          </div>
          <span class="bf-val">${w.kills}</span>
        </div>
      `;
    }).join('');
  }
}
