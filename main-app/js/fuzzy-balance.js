/**
 * AirOps v2 — Fuzzy Ontology-Based Team Balancing Engine
 * Computes Team Threat Score (TTS) across weighted factors.
 */

export class FuzzyBalanceEngine {
  constructor(engine, intelEngine) {
    this.engine = engine;
    this.intel = intelEngine;

    this.weights = {
      gearPower:    0.25,
      roleComp:     0.20,
      zoneAffinity: 0.15,
      discipline:   0.15,
      killPerf:     0.25,
    };
  }

  _gearPowerFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const avgJ = teamPlayers.reduce((s, p) => s + (p.chrono?.joules || 0), 0) / teamPlayers.length;
    return Math.min(avgJ / 2.32, 1.0);
  }

  _roleCompFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const roles = new Set(teamPlayers.map(p => p.role));
    return Math.min(roles.size / 6, 1.0);
  }

  _zoneAffinityFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const zones = this.engine.getZones();
    let score = 0;

    for (const p of teamPlayers) {
      if (!p.position || p.position.x == null || p.position.y == null) continue;
      for (const z of zones) {
        const b = z.bounds;
        if (p.position.x >= b.x && p.position.x <= b.x + b.w &&
            p.position.y >= b.y && p.position.y <= b.y + b.h) {
          if (z.type === 'elevated') score += 1.5;
          else if (z.type === 'fortification') score += 1.3;
          else if (z.type === 'cqb') score += 1.0;
          else if (z.type === 'outdoor') score += 0.8;
          else score += 0.5;
          break;
        }
      }
    }

    return Math.min(score / (teamPlayers.length * 1.5), 1.0);
  }

  _disciplineFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 1;
    const violations = this.engine.gameEvents.filter(
      e => e.type === 'violation' && teamPlayers.some(p => p.id === e.playerId)
    );
    return Math.max(1 - (violations.length * 0.1), 0);
  }

  _killPerfFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    let totalKills = 0;
    let totalDeaths = 0;

    for (const p of teamPlayers) {
      const stats = this.intel.getPlayerStats(p.id);
      totalKills += stats.kills;
      totalDeaths += stats.deaths;
    }

    const kd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
    return Math.min(kd / 3, 1.0);
  }

  computeTTS(teamId) {
    const players = this.engine.players.filter(p => p.team === teamId && p.isAlive);

    const factors = {
      gearPower:    this._gearPowerFactor(players),
      roleComp:     this._roleCompFactor(players),
      zoneAffinity: this._zoneAffinityFactor(players),
      discipline:   this._disciplineFactor(players),
      killPerf:     this._killPerfFactor(players),
    };

    let tts = 0;
    for (const [key, weight] of Object.entries(this.weights)) {
      tts += factors[key] * weight;
    }

    return {
      teamId,
      tts: Math.round(tts * 100) / 100,
      factors,
      playerCount: players.length,
    };
  }

  getBalanceReport() {
    const alpha = this.computeTTS('nonband');
    const bravo = this.computeTTS('band');

    const diff = Math.abs(alpha.tts - bravo.tts);
    let rating, ratingClass;

    if (diff < 0.05) {
      rating = 'Excellent';
      ratingClass = 'pass';
    } else if (diff < 0.12) {
      rating = 'Good';
      ratingClass = 'pass';
    } else if (diff < 0.20) {
      rating = 'Moderate';
      ratingClass = 'warn';
    } else {
      rating = 'Needs Rebalance';
      ratingClass = 'fail';
    }

    return { alpha, bravo, diff: Math.round(diff * 100) / 100, rating, ratingClass };
  }

  renderBalanceHTML() {
    const report = this.getBalanceReport();
    const factorLabels = {
      gearPower: 'Gear Power',
      roleComp: 'Roles',
      zoneAffinity: 'Position',
      discipline: 'Discipline',
      killPerf: 'Combat',
    };

    const renderFactorBars = (factors, color) => {
      return Object.entries(factors).map(([key, val]) => {
        const pct = Math.round(val * 100);
        return `
          <div class="balance-factor-row">
            <span class="bf-label">${factorLabels[key] || key}</span>
            <div class="bf-bar-bg">
              <div class="bf-bar" style="width: ${pct}%; background: ${color};"></div>
            </div>
            <span class="bf-val">${pct}%</span>
          </div>
        `;
      }).join('');
    };

    return `
      <div class="balance-report">
        <div class="wb-prop-row">
          <span class="wb-prop-key">Non-Band TTS</span>
          <span class="wb-prop-val">${report.alpha.tts.toFixed(2)}</span>
        </div>
        <div class="wb-prop-row">
          <span class="wb-prop-key">Band TTS</span>
          <span class="wb-prop-val">${report.bravo.tts.toFixed(2)}</span>
        </div>
        <div class="wb-prop-row">
          <span class="wb-prop-key">Delta / Verdict</span>
          <span class="wb-prop-val">${report.diff.toFixed(2)} · <span class="bv-rating ${report.ratingClass}">${report.rating}</span></span>
        </div>
        <div class="wb-sec-hdr"><span>Non-Band Factors</span></div>
        ${renderFactorBars(report.alpha.factors, 'var(--accent-primary)')}
        <div class="wb-sec-hdr"><span>Band Factors</span></div>
        ${renderFactorBars(report.bravo.factors, 'var(--team-bravo)')}
      </div>
    `;
  }
}
