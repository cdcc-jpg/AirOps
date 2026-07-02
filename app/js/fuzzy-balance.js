/**
 * AirOps v2 — Fuzzy Ontology-Based Team Balancing Engine
 * Computes Team Threat Score (TTS) across weighted factors:
 *   - Gear Power Score (chrono output)
 *   - Role Composition (tactical diversity)
 *   - Map-Zone Affinity (positional advantage)
 *   - Violation History (discipline factor)
 *   - Kill Performance (combat effectiveness)
 */

export class FuzzyBalanceEngine {
  constructor(engine, intelEngine) {
    this.engine = engine;
    this.intel = intelEngine;

    // Fuzzy weight factors (sum to 1.0)
    this.weights = {
      gearPower:   0.25,
      roleComp:    0.20,
      zoneAffinity: 0.15,
      discipline:  0.15,
      killPerf:    0.25,
    };
  }

  // ─── Factor Computations ──────────────────────────────────

  /**
   * Gear Power Score: average joules normalised to [0, 1].
   * Higher joules = higher threat.
   */
  _gearPowerFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const avgJ = teamPlayers.reduce((s, p) => s + (p.chrono?.joules || 0), 0) / teamPlayers.length;
    // Normalise: 0J = 0, 2.32J (max bolt-action) = 1
    return Math.min(avgJ / 2.32, 1.0);
  }

  /**
   * Role Composition: how tactically diverse is the team?
   * More role variety = higher score.
   */
  _roleCompFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const roles = new Set(teamPlayers.map(p => p.role));
    const idealRoles = 6; // Rifleman, Sniper, Support, Breacher, Medic, Commander
    return Math.min(roles.size / idealRoles, 1.0);
  }

  /**
   * Zone Affinity: how well-positioned is the team?
   * Players in elevated/fortified positions score higher.
   */
  _zoneAffinityFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const zones = this.engine.getZones();
    let score = 0;

    for (const p of teamPlayers) {
      for (const z of zones) {
        const b = z.bounds;
        if (p.position.x >= b.x && p.position.x <= b.x + b.w &&
            p.position.y >= b.y && p.position.y <= b.y + b.h) {
          // Weight zones by tactical value
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

  /**
   * Discipline: fewer violations = higher score.
   */
  _disciplineFactor(teamPlayers) {
    if (teamPlayers.length === 0) return 1;
    const violations = this.engine.gameEvents.filter(
      e => e.type === 'violation' && teamPlayers.some(p => p.id === e.playerId)
    );
    // Each violation reduces score by 0.1, minimum 0
    return Math.max(1 - (violations.length * 0.1), 0);
  }

  /**
   * Kill Performance: team K/D ratio normalised.
   */
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
    // Normalise: KD 0 = 0, KD 3+ = 1
    return Math.min(kd / 3, 1.0);
  }

  // ─── Team Threat Score ────────────────────────────────────

  computeTTS(teamId) {
    const players = this.engine.players.filter(p => p.team === teamId && p.isAlive);

    const factors = {
      gearPower:    this._gearPowerFactor(players),
      roleComp:     this._roleCompFactor(players),
      zoneAffinity: this._zoneAffinityFactor(players),
      discipline:   this._disciplineFactor(players),
      killPerf:     this._killPerfFactor(players),
    };

    // Weighted sum
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

  /**
   * Full balance report comparing both teams.
   */
  getBalanceReport() {
    const alpha = this.computeTTS('alpha');
    const bravo = this.computeTTS('bravo');

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

  // ─── HTML Renderer ────────────────────────────────────────

  renderBalanceHTML() {
    const report = this.getBalanceReport();
    const factorLabels = {
      gearPower: '🔫 Gear Power',
      roleComp: '🎖️ Roles',
      zoneAffinity: '📍 Position',
      discipline: '⚖️ Discipline',
      killPerf: '💀 Combat',
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
        <div class="balance-summary">
          <div class="balance-team">
            <div class="bt-name" style="color: var(--team-alpha)">Alpha</div>
            <div class="bt-tts">${report.alpha.tts}</div>
          </div>
          <div class="balance-verdict">
            <div class="bv-diff">${report.diff}</div>
            <div class="bv-rating ${report.ratingClass}">${report.rating}</div>
          </div>
          <div class="balance-team">
            <div class="bt-name" style="color: var(--team-bravo)">Bravo</div>
            <div class="bt-tts">${report.bravo.tts}</div>
          </div>
        </div>

        <div class="balance-detail">
          <div class="bd-col">
            <div class="bd-title" style="color: var(--team-alpha)">Alpha Factors</div>
            ${renderFactorBars(report.alpha.factors, 'var(--team-alpha)')}
          </div>
          <div class="bd-col">
            <div class="bd-title" style="color: var(--team-bravo)">Bravo Factors</div>
            ${renderFactorBars(report.bravo.factors, 'var(--team-bravo)')}
          </div>
        </div>
      </div>
    `;
  }
}
