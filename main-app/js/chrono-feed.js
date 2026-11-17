/**
 * AirOps v2 — Chrono Compliance Feed
 * Updated for Humber Airsoft 3-tier system (AEG / DMR / Bolt-Action).
 */

import { renderEpistemicSigilHtml } from './priory-semiotics.js?v=2.11.2';

export class ChronoFeed {
  constructor(engine) {
    this.engine = engine;
  }

  renderStats() {
    const summary = this.engine.getChronoSummary();
    const tiers = summary.tierCounts || {};

    return `
      <table class="wb-table">
        <thead>
          <tr>
            <th>Compliance</th>
            <th class="num">Count</th>
            <th>Tier</th>
            <th class="num">Units</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Passed</td>
            <td class="num text-green">${summary.pass}</td>
            <td>AEG (&lt;=350fps)</td>
            <td class="num">${tiers['AEG'] || 0}</td>
          </tr>
          <tr>
            <td>Low Power</td>
            <td class="num text-amber">${summary.failMin}</td>
            <td>DMR (&lt;=450fps)</td>
            <td class="num">${tiers['DMR'] || 0}</td>
          </tr>
          <tr>
            <td>Failed / Creep</td>
            <td class="num text-red">${summary.failOver + summary.jouleCreep}</td>
            <td>Bolt (&lt;=500fps)</td>
            <td class="num">${tiers['Bolt-Action'] || 0}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  renderEventList(filter = 'all') {
    let players = [...this.engine.players];

    players.sort((a, b) => {
      const order = { BANNED: 0, FLAGGED: 1, CLEARED: 2 };
      const diff = (order[a.compliance] ?? 3) - (order[b.compliance] ?? 3);
      if (diff !== 0) return diff;
      return b.chrono.fps - a.chrono.fps;
    });

    if (filter === 'violations') {
      players = players.filter(p => p.compliance !== 'CLEARED');
    } else if (filter === 'passed') {
      players = players.filter(p => p.compliance === 'CLEARED');
    }

    return players.map(p => this._renderChronoEvent(p)).join('');
  }

  _renderChronoEvent(player) {
    const chrono = player.chrono;
    const tier = chrono.tier || 'AEG';
    let resultText, resultColor;

    switch (chrono.status) {
      case 'PASS':
        resultText = 'PASS';
        resultColor = 'var(--status-clear)';
        break;
      case 'FAIL_OVER_POWER':
        resultText = 'OVER';
        resultColor = 'var(--status-avoid)';
        break;
      case 'FAIL_MIN_PERFORMANCE':
      case 'FAILED_MIN_PERFORMANCE':
        resultText = 'LOW';
        resultColor = 'var(--status-warn)';
        break;
      case 'JOULE_CREEP_DETECTED':
        resultText = 'CREEP';
        resultColor = 'var(--status-avoid)';
        break;
      default:
        resultText = chrono.status || 'OK';
        resultColor = 'var(--text-muted)';
    }

    const medText = chrono.med > 0 ? ` · ${chrono.med}m` : '';
    const tierShort = tier === 'Bolt-Action' ? 'BOLT' : tier;

    return `
      <div class="wb-tree-row" data-player-id="${player.id}">
        <span class="text-muted tabular-nums">${tierShort}</span>
        <span>${player.callsign.split('-')[0]}</span>
        <span class="wb-tree-count">${chrono.fps}fps · ${chrono.joules}J${medText} · <span style="color:${resultColor}">${resultText}</span></span>
      </div>
    `;
  }

  renderViolationReport(player) {
    const zones = this.engine.getZones();
    const violations = [];

    for (const zone of zones) {
      const zoneViolations = this.engine.validateCompliance(player, zone);
      for (const v of zoneViolations) {
        violations.push({ ...v, zone: zone.name });
      }
    }

    const seen = new Set();
    const unique = violations.filter(v => {
      if (seen.has(v.type)) return false;
      seen.add(v.type);
      return true;
    });

    if (unique.length === 0) {
      return `
        <div class="wb-epistemic-row">
          ${renderEpistemicSigilHtml('entailed', 'SHACL compliant')}
          <span class="text-green">No violations detected — compliant with Humber 3-tier rules</span>
        </div>
      `;
    }

    return unique.map(v => `
      <div class="wb-epistemic-row">
        ${renderEpistemicSigilHtml('entailed', 'SHACL violation')}
        <div>
          <div style="color: ${v.severity === 'critical' ? 'var(--status-avoid)' : 'var(--status-warn)'}; font-weight: 500;">${v.type}</div>
          <div class="text-muted">${v.message}</div>
        </div>
      </div>
    `).join('');
  }
}
