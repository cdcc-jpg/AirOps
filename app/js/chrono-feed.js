/**
 * AirOps — Chrono Compliance Feed
 * Real-time chrono event dashboard with SHACL-like validation,
 * compliance cards, and violation detection.
 */

export class ChronoFeed {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Render the chrono dashboard stats panel.
   */
  renderStats() {
    const summary = this.engine.getChronoSummary();

    return `
      <div class="chrono-stats">
        <div class="chrono-stat pass">
          <div class="stat-value">${summary.pass}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="chrono-stat info">
          <div class="stat-value">${summary.passDmr}</div>
          <div class="stat-label">DMR Rules</div>
        </div>
        <div class="chrono-stat warn">
          <div class="stat-value">${summary.failMin}</div>
          <div class="stat-label">Low Power</div>
        </div>
        <div class="chrono-stat fail">
          <div class="stat-value">${summary.jouleCreep}</div>
          <div class="stat-label">Joule Creep</div>
        </div>
      </div>
    `;
  }

  /**
   * Render the chrono event list.
   */
  renderEventList(filter = 'all') {
    let players = [...this.engine.players];

    // Sort: violations first, then by FPS descending
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
    let dotClass, resultText, resultColor;

    switch (chrono.status) {
      case 'PASS':
        dotClass = 'pass';
        resultText = 'PASS';
        resultColor = 'var(--status-pass)';
        break;
      case 'PASS_DMR_RULES':
        dotClass = 'pass';
        resultText = 'DMR';
        resultColor = 'var(--status-info)';
        break;
      case 'FAILED_MIN_PERFORMANCE':
        dotClass = 'warn';
        resultText = 'LOW';
        resultColor = 'var(--status-warn)';
        break;
      case 'JOULE_CREEP_DETECTED':
        dotClass = 'fail';
        resultText = 'CREEP';
        resultColor = 'var(--status-fail)';
        break;
      default:
        dotClass = 'pass';
        resultText = chrono.status;
        resultColor = 'var(--text-muted)';
    }

    return `
      <div class="chrono-event" data-player-id="${player.id}">
        <div class="chrono-status-dot ${dotClass}"></div>
        <div class="chrono-player">${player.callsign.split('-')[0]}</div>
        <div class="chrono-reading">${chrono.fps}fps · ${chrono.joules}J · ${chrono.bbWeight}g</div>
        <div class="chrono-result" style="color: ${resultColor}">${resultText}</div>
      </div>
    `;
  }

  /**
   * Render detailed SHACL-like violation report for a player.
   */
  renderViolationReport(player) {
    const zones = this.engine.getZones();
    const violations = [];

    // Check against all zone types
    for (const zone of zones) {
      const zoneViolations = this.engine.validateCompliance(player, zone);
      for (const v of zoneViolations) {
        violations.push({ ...v, zone: zone.name });
      }
    }

    // Deduplicate by type
    const seen = new Set();
    const unique = violations.filter(v => {
      const key = v.type;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      return '<div class="text-green" style="font-size: 0.75rem;">✓ No violations detected</div>';
    }

    return unique.map(v => `
      <div style="padding: 6px 8px; background: ${v.severity === 'critical' ? 'var(--accent-red-dim)' : 'var(--accent-amber-dim)'}; border-radius: 6px; margin-bottom: 4px; font-size: 0.7rem;">
        <span style="color: ${v.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-amber)'}; font-weight: 700;">⚠ ${v.type}</span>
        <div style="color: var(--text-secondary); margin-top: 2px;">${v.message}</div>
      </div>
    `).join('');
  }
}
