/**
 * AirOps — Game Builder
 * Game setup wizard with ontology-driven team balancing,
 * schedule generation, and composition analysis.
 */

const ROLE_COLORS = {
  Commander: '#ff6600',
  Sniper: '#aa66ff',
  Support: '#00ccff',
  Rifleman: '#00ff88',
  Breacher: '#ff3366',
  Medic: '#ffaa00',
};

const GEAR_COLORS = {
  'Spring Action': '#aa66ff',
  'Green Gas': '#ff6600',
  'Electric (LiPo)': '#00ccff',
  'HPA (High Pressure Air)': '#ff3366',
  'Unknown': '#555555',
};

export class GameBuilder {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Render the team composition comparison bars.
   */
  renderTeamComposition() {
    const alphaRoles = this.engine.getRoleDistribution('alpha');
    const bravoRoles = this.engine.getRoleDistribution('bravo');
    const alphaCount = this.engine.getPlayersByTeam('alpha').length;
    const bravoCount = this.engine.getPlayersByTeam('bravo').length;

    const allRoles = [...new Set([...Object.keys(alphaRoles), ...Object.keys(bravoRoles)])];
    allRoles.sort();

    const alphaBar = allRoles.map(role => {
      const count = alphaRoles[role] || 0;
      const pct = (count / alphaCount * 100).toFixed(0);
      const color = ROLE_COLORS[role] || '#555';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${role}: ${count}">${count > 1 ? role.substring(0, 3).toUpperCase() : ''}</div>`;
    }).join('');

    const bravoBar = allRoles.map(role => {
      const count = bravoRoles[role] || 0;
      const pct = (count / bravoCount * 100).toFixed(0);
      const color = ROLE_COLORS[role] || '#555';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${role}: ${count}">${count > 1 ? role.substring(0, 3).toUpperCase() : ''}</div>`;
    }).join('');

    const legend = allRoles.map(role => {
      const color = ROLE_COLORS[role] || '#555';
      return `<div class="comp-legend-item"><div class="dot" style="background: ${color};"></div>${role}</div>`;
    }).join('');

    return `
      <div class="team-composition">
        <div style="font-size: 0.7rem; font-weight: 600; color: var(--team-alpha); margin-bottom: 4px;">
          ALPHA FORCE (${alphaCount})
        </div>
        <div class="comp-bar">${alphaBar}</div>

        <div style="font-size: 0.7rem; font-weight: 600; color: var(--team-bravo); margin-bottom: 4px; margin-top: 12px;">
          BRAVO COMPANY (${bravoCount})
        </div>
        <div class="comp-bar">${bravoBar}</div>

        <div class="comp-legend" style="margin-top: 12px;">${legend}</div>
      </div>
    `;
  }

  /**
   * Render gear type distribution comparison.
   */
  renderGearDistribution() {
    const alphaGear = this.engine.getGearTypeDistribution('alpha');
    const bravoGear = this.engine.getGearTypeDistribution('bravo');
    const alphaCount = this.engine.getPlayersByTeam('alpha').length;
    const bravoCount = this.engine.getPlayersByTeam('bravo').length;

    const allGear = [...new Set([...Object.keys(alphaGear), ...Object.keys(bravoGear)])];

    const alphaBar = allGear.map(gear => {
      const count = alphaGear[gear] || 0;
      const pct = (count / alphaCount * 100).toFixed(0);
      const color = GEAR_COLORS[gear] || '#555';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${gear}: ${count}">${count > 1 ? count : ''}</div>`;
    }).join('');

    const bravoBar = allGear.map(gear => {
      const count = bravoGear[gear] || 0;
      const pct = (count / bravoCount * 100).toFixed(0);
      const color = GEAR_COLORS[gear] || '#555';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${gear}: ${count}">${count > 1 ? count : ''}</div>`;
    }).join('');

    const legend = allGear.map(gear => {
      const color = GEAR_COLORS[gear] || '#555';
      const label = gear.length > 15 ? gear.substring(0, 12) + '…' : gear;
      return `<div class="comp-legend-item"><div class="dot" style="background: ${color};"></div>${label}</div>`;
    }).join('');

    return `
      <div class="team-composition">
        <div style="font-size: 0.7rem; font-weight: 600; color: var(--team-alpha); margin-bottom: 4px;">ALPHA</div>
        <div class="comp-bar">${alphaBar}</div>
        <div style="font-size: 0.7rem; font-weight: 600; color: var(--team-bravo); margin-bottom: 4px; margin-top: 12px;">BRAVO</div>
        <div class="comp-bar">${bravoBar}</div>
        <div class="comp-legend" style="margin-top: 12px;">${legend}</div>
      </div>
    `;
  }

  /**
   * Render the balance score card.
   */
  renderBalanceScore() {
    const score = this.engine.getTeamBalanceScore();
    const avgA = this.engine.getAverageJoules('alpha').toFixed(2);
    const avgB = this.engine.getAverageJoules('bravo').toFixed(2);

    const ratingColor = score.rating === 'Good' ? 'var(--status-pass)' : 'var(--status-warn)';

    return `
      <div class="card" style="border-color: ${ratingColor}33;">
        <div class="card-header">
          <div class="card-title">⚖️ Balance Analysis</div>
          <div class="status-badge ${score.rating === 'Good' ? 'cleared' : 'flagged'}">${score.rating}</div>
        </div>
        <div class="detail-row">
          <span class="label">Size difference</span>
          <span class="value">${score.sizeDiff}</span>
        </div>
        <div class="detail-row">
          <span class="label">Role imbalance</span>
          <span class="value">${score.roleDiff}</span>
        </div>
        <div class="detail-row">
          <span class="label">Avg. Joules (Alpha)</span>
          <span class="value" style="color: var(--team-alpha)">${avgA}J</span>
        </div>
        <div class="detail-row">
          <span class="label">Avg. Joules (Bravo)</span>
          <span class="value" style="color: var(--team-bravo)">${avgB}J</span>
        </div>
        <div class="detail-row">
          <span class="label">Power gap</span>
          <span class="value">${score.powerDiff}J</span>
        </div>
      </div>
    `;
  }

  /**
   * Render the game schedule timeline.
   */
  renderSchedule() {
    const session = this.engine.gameSession;
    if (!session) return '';

    return session.phases.map((phase, i) => `
      <div class="schedule-phase ${phase.status}">
        <div class="phase-time">${phase.startTime}</div>
        <div class="phase-name">${phase.name}</div>
        <div class="phase-duration">${phase.duration} min</div>
      </div>
    `).join('');
  }

  /**
   * Render the game mode info card.
   */
  renderGameMode() {
    const session = this.engine.gameSession;
    if (!session) return '';

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🎯 ${session.mode}</div>
          <div class="status-badge cleared">ACTIVE</div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5;">
          ${session.modeDescription}
        </div>
        <div class="detail-row mt-md">
          <span class="label">Field</span>
          <span class="value" style="font-family: var(--font-body);">${session.field}</span>
        </div>
        <div class="detail-row">
          <span class="label">Type</span>
          <span class="value" style="font-family: var(--font-body);">${session.fieldType}</span>
        </div>
        <div class="detail-row">
          <span class="label">Players</span>
          <span class="value">${session.playerCount}</span>
        </div>
        <div class="detail-row">
          <span class="label">Date</span>
          <span class="value">${session.date}</span>
        </div>
      </div>
    `;
  }
}
