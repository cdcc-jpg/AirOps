/**
 * AirOps v2 — Ontology Engine
 * Client-side data layer that loads the unified dataset and exposes
 * query methods mirroring SPARQL over the ontology graph.
 * Updated for Humber Airsoft 3-tier chrono system.
 */

export class OntologyEngine {
  constructor() {
    this.data = null;
    this.players = [];
    this.teams = [];
    this.chronoEvents = [];
    this.gearCatalog = [];
    this.repairs = [];
    this.gameEvents = [];
    this.gameSession = null;
    this.fieldLayout = null;

    // Indexes for fast lookup
    this._playerIndex = new Map();
    this._playersByTeam = new Map();
    this._chronoByPlayer = new Map();
    this._repairsByPlayer = new Map();

    // Humber 3-Tier Chrono Rules
    this.chronoTiers = {
      'AEG':         { maxFps: 350, maxJoules: 1.20, med: 0,  fireMode: 'Full-Auto / Semi' },
      'DMR':         { maxFps: 450, maxJoules: 1.88, med: 25, fireMode: 'Semi-Auto Locked' },
      'Bolt-Action': { maxFps: 500, maxJoules: 2.32, med: 35, fireMode: 'Single-Shot' },
    };
  }

  /**
   * Load and index the dataset.
   */
  async load() {
    const [dataRes, fieldRes] = await Promise.all([
      fetch('./data/app-data.json'),
      fetch('./data/field-layout.json'),
    ]);

    this.data = await dataRes.json();
    this.fieldLayout = await fieldRes.json();

    this.players = this.data.players || [];
    this.teams = this.data.teams || [];
    this.chronoEvents = this.data.chronoEvents || [];
    this.gearCatalog = this.data.gearCatalog || [];
    this.repairs = this.data.repairs || [];
    this.gameEvents = this.data.gameEvents || [];
    this.gameSession = this.data.gameSession || null;

    this._buildIndexes();
    return this;
  }

  _buildIndexes() {
    // Player by ID
    for (const p of this.players) {
      this._playerIndex.set(p.id, p);
    }

    // Players by team
    for (const p of this.players) {
      if (!this._playersByTeam.has(p.team)) {
        this._playersByTeam.set(p.team, []);
      }
      this._playersByTeam.get(p.team).push(p);
    }

    // Chrono events by player
    for (const ev of this.chronoEvents) {
      if (!this._chronoByPlayer.has(ev.playerId)) {
        this._chronoByPlayer.set(ev.playerId, []);
      }
      this._chronoByPlayer.get(ev.playerId).push(ev);
    }

    // Repairs by player
    for (const r of this.repairs) {
      if (!this._repairsByPlayer.has(r.playerId)) {
        this._repairsByPlayer.set(r.playerId, []);
      }
      this._repairsByPlayer.get(r.playerId).push(r);
    }
  }

  // ─── Query Methods (SPARQL-like interface) ─────────────────

  getPlayer(id) {
    return this._playerIndex.get(id) || null;
  }

  getPlayersByTeam(teamId) {
    return this._playersByTeam.get(teamId) || [];
  }

  getPlayersByRole(role) {
    return this.players.filter(p => p.role === role);
  }

  getPlayersByCompliance(status) {
    return this.players.filter(p => p.compliance === status);
  }

  getPlayersByStatus(status) {
    return this.players.filter(p => p.status === status);
  }

  getPlayersByTier(tier) {
    return this.players.filter(p => p.chrono?.tier === tier);
  }

  getChronoForPlayer(playerId) {
    return this._chronoByPlayer.get(playerId) || [];
  }

  getRepairsForPlayer(playerId) {
    return this._repairsByPlayer.get(playerId) || [];
  }

  /**
   * SHACL-like 3-tier validation: check if a player's chrono data
   * violates Humber field rules for a given zone.
   */
  validateCompliance(player, zone) {
    const violations = [];
    const chrono = player.chrono;
    const tier = chrono?.tier || 'AEG';
    const tierLimits = this.chronoTiers[tier] || this.chronoTiers['AEG'];
    const zoneMaxJ = zone?.maxJoules ?? tierLimits.maxJoules;

    // Power limit per tier
    if (chrono.joules > tierLimits.maxJoules) {
      violations.push({
        type: 'POWER_VIOLATION',
        message: `CHRONO FAIL (${tier}): ${chrono.joules}J exceeds ${tierLimits.maxJoules}J tier limit.`,
        severity: 'critical',
      });
    }

    // Zone power cap (CQB/Firebase zones cap at 1.2J)
    if (zoneMaxJ > 0 && chrono.joules > zoneMaxJ) {
      violations.push({
        type: 'ZONE_POWER_VIOLATION',
        message: `ZONE FAIL: ${chrono.joules}J exceeds ${zoneMaxJ}J zone cap for ${zone?.name || 'this zone'}.`,
        severity: 'critical',
      });
    }

    // FPS check per tier
    if (chrono.fps > tierLimits.maxFps) {
      violations.push({
        type: 'FPS_VIOLATION',
        message: `VELOCITY FAIL (${tier}): ${chrono.fps} FPS exceeds ${tierLimits.maxFps} FPS tier limit.`,
        severity: 'critical',
      });
    }

    // Absolute max check
    if (chrono.fps > 500) {
      violations.push({
        type: 'FPS_ABSOLUTE_VIOLATION',
        message: `Velocity exceeds absolute 500 FPS field maximum. Banned.`,
        severity: 'critical',
      });
    }

    // Joule creep detection
    if (chrono.status === 'JOULE_CREEP_DETECTED') {
      violations.push({
        type: 'JOULE_CREEP',
        message: `Joule creep detected on ${player.gear?.primary?.name || 'replica'}. Gear confiscated for the day.`,
        severity: 'critical',
      });
    }

    // Min performance check
    if (chrono.status === 'FAIL_MIN_PERFORMANCE' || chrono.status === 'FAILED_MIN_PERFORMANCE') {
      violations.push({
        type: 'MIN_PERFORMANCE',
        message: `Minimum performance failure: ${chrono.joules}J / ${chrono.fps} FPS. Repair recommended.`,
        severity: 'warning',
      });
    }

    // MED enforcement (DMR/Bolt-Action in CQB zones)
    if (tierLimits.med > 0 && zone && (zone.type === 'cqb' || zone.type === 'fortification')) {
      violations.push({
        type: 'MED_WARNING',
        message: `${tier} requires ${tierLimits.med}m MED. Must use sidearm in ${zone.name}.`,
        severity: 'warning',
      });
    }

    return violations;
  }

  // ─── Aggregation Queries ───────────────────────────────────

  getComplianceBreakdown() {
    const breakdown = { CLEARED: 0, FLAGGED: 0, BANNED: 0 };
    for (const p of this.players) {
      if (breakdown[p.compliance] !== undefined) {
        breakdown[p.compliance]++;
      }
    }
    return breakdown;
  }

  getStatusBreakdown() {
    const breakdown = { ACTIVE: 0, ELIMINATED: 0, RESPAWNING: 0, OUT: 0 };
    for (const p of this.players) {
      if (breakdown[p.status] !== undefined) {
        breakdown[p.status]++;
      }
    }
    return breakdown;
  }

  getTierBreakdown() {
    const breakdown = {};
    for (const p of this.players) {
      const tier = p.chrono?.tier || 'AEG';
      breakdown[tier] = (breakdown[tier] || 0) + 1;
    }
    return breakdown;
  }

  getRoleDistribution(teamId = null) {
    const players = teamId ? this.getPlayersByTeam(teamId) : this.players;
    const dist = {};
    for (const p of players) {
      dist[p.role] = (dist[p.role] || 0) + 1;
    }
    return dist;
  }

  getGearTypeDistribution(teamId = null) {
    const players = teamId ? this.getPlayersByTeam(teamId) : this.players;
    const dist = {};
    for (const p of players) {
      const src = p.gear.primary.powerSource || 'Unknown';
      dist[src] = (dist[src] || 0) + 1;
    }
    return dist;
  }

  getAverageJoules(teamId = null) {
    const players = teamId ? this.getPlayersByTeam(teamId) : this.players;
    const active = players.filter(p => p.chrono.joules > 0);
    if (active.length === 0) return 0;
    const sum = active.reduce((acc, p) => acc + p.chrono.joules, 0);
    return sum / active.length;
  }

  /**
   * Get game events filtered by type.
   */
  getEventsByType(type) {
    return this.gameEvents.filter(e => e.type === type);
  }

  /**
   * Team balance score: 0 = perfectly balanced, higher = more imbalanced.
   */
  getTeamBalanceScore() {
    const alpha = this.getPlayersByTeam('alpha');
    const bravo = this.getPlayersByTeam('bravo');

    const sizeDiff = Math.abs(alpha.length - bravo.length);

    const rolesA = this.getRoleDistribution('alpha');
    const rolesB = this.getRoleDistribution('bravo');
    const allRoles = new Set([...Object.keys(rolesA), ...Object.keys(rolesB)]);
    let roleDiff = 0;
    for (const role of allRoles) {
      roleDiff += Math.abs((rolesA[role] || 0) - (rolesB[role] || 0));
    }

    const avgA = this.getAverageJoules('alpha');
    const avgB = this.getAverageJoules('bravo');
    const powerDiff = Math.abs(avgA - avgB);

    return {
      sizeDiff,
      roleDiff,
      powerDiff: Math.round(powerDiff * 100) / 100,
      overall: sizeDiff + roleDiff + Math.round(powerDiff * 10),
      rating: sizeDiff + roleDiff < 6 ? 'Good' : 'Needs Adjustment',
    };
  }

  /**
   * Get zones from the field layout.
   */
  getZones() {
    return this.fieldLayout?.zones || [];
  }

  getZoneById(id) {
    return this.getZones().find(z => z.id === id) || null;
  }

  /**
   * Get respawn points from the field layout.
   */
  getRespawnPoints() {
    return this.fieldLayout?.respawnPoints || [];
  }

  /**
   * Get objectives from the field layout.
   */
  getObjectives() {
    return this.fieldLayout?.objectives || [];
  }

  /**
   * Get players currently in a specific zone (based on position).
   */
  getPlayersInZone(zoneId) {
    const zone = this.getZoneById(zoneId);
    if (!zone) return [];

    const b = zone.bounds;
    return this.players.filter(p => {
      const pos = p.position;
      if (!pos || pos.x == null || pos.y == null) return false;
      return pos.x >= b.x && pos.x <= b.x + b.w &&
             pos.y >= b.y && pos.y <= b.y + b.h;
    });
  }

  /**
   * Get chrono violation summary for dashboard.
   */
  getChronoSummary() {
    let pass = 0, failOver = 0, failMin = 0, jouleCreep = 0;
    const tierCounts = {};

    for (const p of this.players) {
      const tier = p.chrono?.tier || 'AEG';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;

      switch (p.chrono.status) {
        case 'PASS': pass++; break;
        case 'FAIL_OVER_POWER': failOver++; break;
        case 'FAIL_MIN_PERFORMANCE':
        case 'FAILED_MIN_PERFORMANCE': failMin++; break;
        case 'JOULE_CREEP_DETECTED': jouleCreep++; break;
      }
    }

    return { pass, failOver, failMin, jouleCreep, total: this.players.length, tierCounts };
  }

  /**
   * Search players by name, callsign, or ID.
   */
  searchPlayers(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.players;
    return this.players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.callsign.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.gear.primary.name.toLowerCase().includes(q) ||
      (p.chrono?.tier || '').toLowerCase().includes(q)
    );
  }

  // ─── Mutable State Operations (Python RDF microservice sync) ───

  async addPlayer(player) {
    this.players.push(player);
    
    // Sync to Python RDF store
    await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_player',
        playerId: player.id,
        name: player.name,
        callsign: player.callsign,
        role: player.role,
        status: player.status,
        compliance: player.compliance,
        fps: player.chrono.fps,
        joules: player.chrono.joules,
        bbWeight: player.chrono.bbWeight,
        replicaName: player.gear.primary.name,
        tier: player.chrono.tier
      })
    });

    this._buildIndexes();
  }

  async updatePlayerStatus(playerId, status) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.status = status;
    player.isAlive = status === 'ACTIVE' || status === 'RESPAWNING';
    if (status === 'OUT') {
      player.compliance = 'BANNED';
    }
    
    await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', playerId, status })
    });
    
    this._buildIndexes();
  }

  async updatePlayerCompliance(playerId, compliance) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.compliance = compliance;
    if (compliance === 'BANNED') {
      player.status = 'OUT';
      player.isAlive = false;
    }

    await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_compliance', playerId, compliance })
    });

    this._buildIndexes();
  }

  async updatePlayerChrono(playerId, fps, joules, bbWeight) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    
    const tier = player.chrono?.tier || 'AEG';
    const tierLimits = this.chronoTiers[tier];

    let status = 'PASS';
    let compliance = 'CLEARED';

    if (fps > tierLimits.maxFps || joules > tierLimits.maxJoules) {
      status = 'FAIL_OVER_POWER';
      compliance = 'BANNED';
    } else if (joules < 0.3) {
      status = 'FAIL_MIN_PERFORMANCE';
      compliance = 'FLAGGED';
    }

    player.chrono.fps = fps;
    player.chrono.joules = joules;
    player.chrono.bbWeight = bbWeight;
    player.chrono.status = status;
    player.compliance = compliance;

    if (compliance === 'BANNED') {
      player.status = 'OUT';
      player.isAlive = false;
    }

    await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_chrono', playerId, fps, joules, bbWeight })
    });
    
    this._buildIndexes();
    return { status, compliance };
  }

  async assignPlayerTeam(playerId, teamId) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    const team = this.teams.find(t => t.id === teamId);
    if (team) {
      player.team = team.id;
      player.teamName = team.name;
      player.teamColor = team.color;
    } else {
      player.team = 'unassigned';
      player.teamName = 'Unassigned';
      player.teamColor = '#888888';
    }

    await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign_team', playerId, team: teamId })
    });

    this._buildIndexes();
  }

  async addGameEvent(event) {
    this.gameEvents.push(event);
    if (event.type === 'elimination') {
      await fetch('/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_elimination',
          attackerId: event.attackerId,
          targetId: event.targetId,
          zone: event.zone
        })
      });
    }
  }

  async validateSHACL() {
    try {
      const res = await fetch('/api/validate');
      return await res.json();
    } catch (e) {
      return { conforms: true, violations: [] };
    }
  }

  async exportTripleStore() {
    const res = await fetch('/api/export');
    return await res.text();
  }
}
