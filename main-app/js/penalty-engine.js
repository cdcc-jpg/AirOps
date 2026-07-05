/**
 * AirOps v2 — Graduated Penalty Engine
 * Models leniency thresholds per violation type, tracks warnings
 * across the game day, and computes escalation automatically.
 * Mirrors the ViolationType/WarningRecord SHACL constraints.
 */

export class PenaltyEngine {
  constructor(engine) {
    this.engine = engine;

    // Violation definitions (mirrors ontology individuals)
    this.violationTypes = {
      'BLIND_FIRE':       { label: 'Blind Fire', maxWarnings: 2, escalation: 'TEMP_BAN_30MIN', severity: 'moderate', icon: '🔫' },
      'OVERSHOOT':        { label: 'Overshooting', maxWarnings: 2, escalation: 'TEMP_BAN_30MIN', severity: 'moderate', icon: '💥' },
      'DEAD_MAN_WALKING': { label: 'Dead Man Walking/Talking', maxWarnings: 3, escalation: 'TEMP_BAN_15MIN', severity: 'low', icon: '🚶' },
      'MED_VIOLATION':    { label: 'MED Violation', maxWarnings: 1, escalation: 'WEAPON_CONFISCATED', severity: 'high', icon: '📏' },
      'EYE_PRO_REMOVED':  { label: 'Eye Protection Removed', maxWarnings: 2, escalation: 'EJECTED', severity: 'critical', icon: '👓' },
      'JOULE_CREEP':      { label: 'Joule Creep Detected', maxWarnings: 1, escalation: 'BANNED_FOR_DAY', severity: 'critical', icon: '⚡' },
      'AGGRESSION':       { label: 'Physical Contact/Aggression', maxWarnings: 0, escalation: 'EJECTED', severity: 'critical', icon: '🤛' },
      'PYRO_MISUSE':      { label: 'Pyrotechnic Misuse', maxWarnings: 0, escalation: 'EJECTED', severity: 'critical', icon: '💣' },
    };

    // Build per-player warning index from game events
    this._warningIndex = new Map(); // playerId -> { type -> count }
    this._incidentLog = [];
    this._buildWarningIndex();
  }

  _buildWarningIndex() {
    const violations = this.engine.gameEvents.filter(e => e.type === 'violation');

    for (const v of violations) {
      if (!this._warningIndex.has(v.playerId)) {
        this._warningIndex.set(v.playerId, {});
      }
      const playerWarnings = this._warningIndex.get(v.playerId);
      playerWarnings[v.violationType] = (playerWarnings[v.violationType] || 0) + 1;

      this._incidentLog.push({
        timestamp: v.timestamp,
        playerId: v.playerId,
        callsign: v.playerCallsign,
        team: v.team,
        type: v.violationType,
        warningNumber: playerWarnings[v.violationType],
        maxWarnings: this.violationTypes[v.violationType]?.maxWarnings ?? 3,
        action: v.action,
        zone: v.zone,
      });
    }
  }

  // ─── Query Methods ─────────────────────────────────────────

  /**
   * Get total warnings for a player across all violation types.
   */
  getPlayerWarnings(playerId) {
    const warnings = this._warningIndex.get(playerId) || {};
    const results = [];

    for (const [type, count] of Object.entries(warnings)) {
      const vDef = this.violationTypes[type] || {};
      results.push({
        type,
        label: vDef.label || type,
        count,
        maxWarnings: vDef.maxWarnings ?? 3,
        isEscalated: count > (vDef.maxWarnings ?? 3),
        escalationAction: vDef.escalation || 'UNKNOWN',
        severity: vDef.severity || 'low',
        icon: vDef.icon || '⚠️',
      });
    }

    return results;
  }

  /**
   * Compute the action for a new violation (without actually recording it).
   */
  computeAction(playerId, violationType) {
    const vDef = this.violationTypes[violationType];
    if (!vDef) return 'WARNING';

    // Zero-tolerance violations
    if (vDef.maxWarnings === 0) return vDef.escalation;

    const warnings = this._warningIndex.get(playerId) || {};
    const current = warnings[violationType] || 0;

    if (current >= vDef.maxWarnings) {
      return vDef.escalation;
    }

    return 'WARNING';
  }

  /**
   * Get all players with active escalation status.
   */
  getEscalatedPlayers() {
    const results = [];

    for (const [playerId, warnings] of this._warningIndex) {
      const player = this.engine.getPlayer(playerId);
      if (!player) continue;

      for (const [type, count] of Object.entries(warnings)) {
        const vDef = this.violationTypes[type];
        if (vDef && count > vDef.maxWarnings) {
          results.push({
            playerId,
            callsign: player.callsign,
            team: player.team,
            violationType: type,
            label: vDef.label,
            count,
            action: vDef.escalation,
          });
        }
      }
    }

    return results;
  }

  /**
   * Full incident log (sorted by time, newest first).
   */
  getIncidentLog() {
    return [...this._incidentLog].reverse();
  }

  /**
   * Summary statistics for the penalty dashboard.
   */
  getSummary() {
    const total = this._incidentLog.length;
    const warnings = this._incidentLog.filter(i => i.action === 'WARNING').length;
    const escalated = this._incidentLog.filter(i => i.action !== 'WARNING').length;
    const ejections = this._incidentLog.filter(i =>
      i.action === 'EJECTED' || i.action === 'BANNED_FOR_DAY'
    ).length;
    const uniquePlayers = new Set(this._incidentLog.map(i => i.playerId)).size;

    return { total, warnings, escalated, ejections, uniquePlayers };
  }

  // ─── HTML Renderers ────────────────────────────────────────

  renderIncidentLogHTML(limit = 15) {
    const incidents = this.getIncidentLog().slice(0, limit);

    if (incidents.length === 0) {
      return '<div class="no-data">No incidents recorded</div>';
    }

    return incidents.map(inc => {
      const time = new Date(inc.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      });
      const vDef = this.violationTypes[inc.type] || {};
      const severityClass = vDef.severity === 'critical' ? 'danger' :
                            vDef.severity === 'high' ? 'warn' : 'info';
      const actionBadge = inc.action === 'WARNING'
        ? `<span class="action-badge warning">⚠ Warning ${inc.warningNumber}/${inc.maxWarnings}</span>`
        : `<span class="action-badge ${severityClass}">${inc.action.replace(/_/g, ' ')}</span>`;

      return `
        <div class="incident-row" data-player-id="${inc.playerId}">
          <div class="inc-time">${time}</div>
          <div class="inc-icon">${vDef.icon || '⚠️'}</div>
          <div class="inc-detail">
            <span class="team-${inc.team}">${inc.callsign}</span>
            <span class="inc-type">${vDef.label || inc.type}</span>
            <span class="inc-zone">${inc.zone?.replace(/_/g, ' ') || ''}</span>
          </div>
          <div class="inc-action">${actionBadge}</div>
        </div>
      `;
    }).join('');
  }

  renderSummaryHTML() {
    const s = this.getSummary();

    return `
      <div class="penalty-stats">
        <div class="penalty-stat">
          <div class="stat-value">${s.total}</div>
          <div class="stat-label">Total Incidents</div>
        </div>
        <div class="penalty-stat warn">
          <div class="stat-value">${s.warnings}</div>
          <div class="stat-label">Warnings</div>
        </div>
        <div class="penalty-stat danger">
          <div class="stat-value">${s.escalated}</div>
          <div class="stat-label">Escalated</div>
        </div>
        <div class="penalty-stat critical">
          <div class="stat-value">${s.ejections}</div>
          <div class="stat-label">Ejected</div>
        </div>
      </div>
    `;
  }
}
