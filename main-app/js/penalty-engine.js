/**
 * AirOps v2 — Graduated Penalty Engine
 * Models leniency thresholds per violation type, tracks warnings
 * across the game day, and computes escalation automatically.
 * Mirrors the ViolationType/WarningRecord SHACL constraints.
 */

import { renderBfoSigilHtml } from './priory-semiotics.js?v=2.11.2';

export class PenaltyEngine {
  constructor(engine) {
    this.engine = engine;

    // Violation definitions (mirrors ontology individuals)
    this.violationTypes = {
      'BLIND_FIRE':       { label: 'Blind Fire', maxWarnings: 2, escalation: 'TEMP_BAN_30MIN', severity: 'moderate', code: 'BF' },
      'OVERSHOOT':        { label: 'Overshooting', maxWarnings: 2, escalation: 'TEMP_BAN_30MIN', severity: 'moderate', code: 'OS' },
      'DEAD_MAN_WALKING': { label: 'Dead Man Walking/Talking', maxWarnings: 3, escalation: 'TEMP_BAN_15MIN', severity: 'low', code: 'DM' },
      'MED_VIOLATION':    { label: 'MED Violation', maxWarnings: 1, escalation: 'WEAPON_CONFISCATED', severity: 'high', code: 'MD' },
      'EYE_PRO_REMOVED':  { label: 'Eye Protection Removed', maxWarnings: 2, escalation: 'EJECTED', severity: 'critical', code: 'EP' },
      'JOULE_CREEP':      { label: 'Joule Creep Detected', maxWarnings: 1, escalation: 'BANNED_FOR_DAY', severity: 'critical', code: 'JC' },
      'AGGRESSION':       { label: 'Physical Contact/Aggression', maxWarnings: 0, escalation: 'EJECTED', severity: 'critical', code: 'AG' },
      'PYRO_MISUSE':      { label: 'Pyrotechnic Misuse', maxWarnings: 0, escalation: 'EJECTED', severity: 'critical', code: 'PM' },
    };

    this._warningIndex = new Map();
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
        code: vDef.code || 'IN',
      });
    }

    return results;
  }

  computeAction(playerId, violationType) {
    const vDef = this.violationTypes[violationType];
    if (!vDef) return 'WARNING';
    if (vDef.maxWarnings === 0) return vDef.escalation;

    const warnings = this._warningIndex.get(playerId) || {};
    const current = warnings[violationType] || 0;
    if (current >= vDef.maxWarnings) {
      return vDef.escalation;
    }
    return 'WARNING';
  }

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

  getIncidentLog() {
    return [...this._incidentLog].reverse();
  }

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

  renderIncidentLogHTML(limit = 15) {
    const incidents = this.getIncidentLog().slice(0, limit);

    if (incidents.length === 0) {
      return `<div class="wb-prop-row"><span class="wb-prop-key">Incidents</span><span class="wb-prop-val text-muted">None recorded</span></div>`;
    }

    return incidents.map(inc => {
      const time = new Date(inc.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      });
      const vDef = this.violationTypes[inc.type] || {};
      const severityClass = vDef.severity === 'critical' ? 'danger' :
                            vDef.severity === 'high' ? 'warn' : 'info';
      const actionBadge = inc.action === 'WARNING'
        ? `<span class="action-badge warning tabular-nums">Warn ${inc.warningNumber}/${inc.maxWarnings}</span>`
        : `<span class="action-badge ${severityClass}">${inc.action.replace(/_/g, ' ')}</span>`;

      return `
        <div class="incident-row" data-player-id="${inc.playerId}">
          <div class="inc-time">${time}</div>
          <div class="inc-icon">${renderBfoSigilHtml('qual', '', vDef.label || inc.type)}</div>
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
      <table class="wb-table">
        <tbody>
          <tr><td>Total Incidents</td><td class="num">${s.total}</td></tr>
          <tr><td>Warnings</td><td class="num text-amber">${s.warnings}</td></tr>
          <tr><td>Escalated</td><td class="num text-red">${s.escalated}</td></tr>
          <tr><td>Ejected</td><td class="num text-red">${s.ejections}</td></tr>
        </tbody>
      </table>
    `;
  }
}
