/**
 * AirOps — Game Builder
 * Game setup wizard with ontology-driven team balancing,
 * schedule generation, and composition analysis.
 */

const ROLE_COLORS = {
  Commander: 'var(--sigil-cont-fg)',
  Sniper: 'var(--sigil-role-fg)',
  Support: 'var(--sigil-gdc-fg)',
  Rifleman: 'var(--sigil-ind-fg)',
  Breacher: 'var(--sigil-qual-fg)',
  Medic: 'var(--sigil-proc-fg)',
};

const GEAR_COLORS = {
  'Spring Action': 'var(--sigil-role-fg)',
  'Green Gas': 'var(--sigil-cont-fg)',
  'Electric (LiPo)': 'var(--sigil-gdc-fg)',
  'HPA (High Pressure Air)': 'var(--sigil-qual-fg)',
  'Unknown': 'var(--text-muted)',
};

export class GameBuilder {
  constructor(engine) {
    this.engine = engine;
  }

  renderTeamComposition() {
    const alphaRoles = this.engine.getRoleDistribution('nonband');
    const bravoRoles = this.engine.getRoleDistribution('band');
    const alphaCount = this.engine.getPlayersByTeam('nonband').length || 1;
    const bravoCount = this.engine.getPlayersByTeam('band').length || 1;

    const allRoles = [...new Set([...Object.keys(alphaRoles), ...Object.keys(bravoRoles)])];
    allRoles.sort();

    const alphaBar = allRoles.map(role => {
      const count = alphaRoles[role] || 0;
      const pct = Math.round((count / alphaCount) * 100);
      const color = ROLE_COLORS[role] || 'var(--text-muted)';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${role}: ${count}">${count > 1 ? role.substring(0, 3).toUpperCase() : ''}</div>`;
    }).join('');

    const bravoBar = allRoles.map(role => {
      const count = bravoRoles[role] || 0;
      const pct = Math.round((count / bravoCount) * 100);
      const color = ROLE_COLORS[role] || 'var(--text-muted)';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${role}: ${count}">${count > 1 ? role.substring(0, 3).toUpperCase() : ''}</div>`;
    }).join('');

    return `
      <div class="wb-sec-hdr"><span>Non-Band Composition</span><span class="tabular-nums">${this.engine.getPlayersByTeam('nonband').length}</span></div>
      <div class="comp-bar">${alphaBar}</div>
      <div class="wb-sec-hdr"><span>Band Composition</span><span class="tabular-nums">${this.engine.getPlayersByTeam('band').length}</span></div>
      <div class="comp-bar">${bravoBar}</div>
    `;
  }

  renderGearDistribution() {
    const alphaGear = this.engine.getGearTypeDistribution('nonband');
    const bravoGear = this.engine.getGearTypeDistribution('band');
    const alphaCount = this.engine.getPlayersByTeam('nonband').length || 1;
    const bravoCount = this.engine.getPlayersByTeam('band').length || 1;

    const allGear = [...new Set([...Object.keys(alphaGear), ...Object.keys(bravoGear)])];

    const alphaBar = allGear.map(gear => {
      const count = alphaGear[gear] || 0;
      const pct = Math.round((count / alphaCount) * 100);
      const color = GEAR_COLORS[gear] || 'var(--text-muted)';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${gear}: ${count}">${count > 1 ? count : ''}</div>`;
    }).join('');

    const bravoBar = allGear.map(gear => {
      const count = bravoGear[gear] || 0;
      const pct = Math.round((count / bravoCount) * 100);
      const color = GEAR_COLORS[gear] || 'var(--text-muted)';
      return `<div class="comp-segment" style="width: ${pct}%; background: ${color};" title="${gear}: ${count}">${count > 1 ? count : ''}</div>`;
    }).join('');

    return `
      <div class="wb-sec-hdr"><span>Non-Band Propulsion</span></div>
      <div class="comp-bar">${alphaBar}</div>
      <div class="wb-sec-hdr"><span>Band Propulsion</span></div>
      <div class="comp-bar">${bravoBar}</div>
    `;
  }

  renderBalanceScore() {
    const score = this.engine.getTeamBalanceScore();
    const avgA = this.engine.getAverageJoules('nonband').toFixed(2);
    const avgB = this.engine.getAverageJoules('band').toFixed(2);

    return `
      <div class="wb-sec-hdr">
        <span>Balance Analysis</span>
        <span class="status-badge ${score.rating === 'Good' ? 'cleared' : 'flagged'}">${score.rating}</span>
      </div>
      <div class="wb-prop-row"><span class="wb-prop-key">Size difference</span><span class="wb-prop-val">${score.sizeDiff}</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Role imbalance</span><span class="wb-prop-val">${score.roleDiff}</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Avg. Joules (Non-Band)</span><span class="wb-prop-val">${avgA}J</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Avg. Joules (Band)</span><span class="wb-prop-val">${avgB}J</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Power gap</span><span class="wb-prop-val">${score.powerDiff}J</span></div>
    `;
  }

  renderSchedule() {
    const session = this.engine.gameSession;
    if (!session) return '';

    return session.phases.map(phase => `
      <div class="wb-prop-row">
        <span class="wb-prop-key">${phase.startTime} · ${phase.name}</span>
        <span class="wb-prop-val">${phase.duration} min (${phase.status})</span>
      </div>
    `).join('');
  }

  renderGameMode() {
    const session = this.engine.gameSession;
    if (!session) return '';

    return `
      <div class="wb-sec-hdr">
        <span>${session.mode}</span>
        <span class="status-badge cleared">ACTIVE</span>
      </div>
      <div class="wb-prop-row"><span class="wb-prop-key">Field</span><span class="wb-prop-val" title="${session.field}">${session.field}</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Type</span><span class="wb-prop-val">${session.fieldType}</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Players</span><span class="wb-prop-val">${session.playerCount}</span></div>
      <div class="wb-prop-row"><span class="wb-prop-key">Date</span><span class="wb-prop-val">${session.date}</span></div>
    `;
  }
}
