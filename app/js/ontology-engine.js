/**
 * AirOps — Ontology Engine
 * Client-side data layer that loads the unified dataset and exposes
 * query methods mirroring the power of SPARQL over the ontology graph.
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

  getChronoForPlayer(playerId) {
    return this._chronoByPlayer.get(playerId) || [];
  }

  getRepairsForPlayer(playerId) {
    return this._repairsByPlayer.get(playerId) || [];
  }

  /**
   * SHACL-like validation: check if a player's chrono data
   * violates field rules.
   */
  validateCompliance(player, zone) {
    const violations = [];
    const chrono = player.chrono;
    const maxJ = zone?.maxJoules ?? 1.2;

    // Power limit check (AirsoftReplicaShape)
    if (chrono.joules > maxJ) {
      violations.push({
        type: 'POWER_VIOLATION',
        message: `Power Limit VIOLATION: ${chrono.joules}J exceeds ${maxJ}J maximum for ${zone?.name || 'this zone'}.`,
        severity: 'critical',
      });
    }

    // FPS max check
    if (chrono.fps > 500) {
      violations.push({
        type: 'FPS_VIOLATION',
        message: `Velocity VIOLATION: ${chrono.fps} FPS exceeds extreme safety limit (500 FPS).`,
        severity: 'critical',
      });
    }

    // Joule creep detection
    if (chrono.status === 'JOULE_CREEP_DETECTED') {
      violations.push({
        type: 'JOULE_CREEP',
        message: `Joule creep detected on ${player.gear.primary.name}. Gear confiscated.`,
        severity: 'critical',
      });
    }

    // Min performance check
    if (chrono.status === 'FAILED_MIN_PERFORMANCE') {
      violations.push({
        type: 'MIN_PERFORMANCE',
        message: `Minimum performance failure: ${chrono.joules}J / ${chrono.fps} FPS.`,
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
   * Considers role distribution, gear types, and average power.
   */
  getTeamBalanceScore() {
    const alpha = this.getPlayersByTeam('alpha');
    const bravo = this.getPlayersByTeam('bravo');

    // Size balance
    const sizeDiff = Math.abs(alpha.length - bravo.length);

    // Role balance
    const rolesA = this.getRoleDistribution('alpha');
    const rolesB = this.getRoleDistribution('bravo');
    const allRoles = new Set([...Object.keys(rolesA), ...Object.keys(rolesB)]);
    let roleDiff = 0;
    for (const role of allRoles) {
      roleDiff += Math.abs((rolesA[role] || 0) - (rolesB[role] || 0));
    }

    // Power balance
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
   * Get players currently in a specific zone (based on position).
   */
  getPlayersInZone(zoneId) {
    const zone = this.getZoneById(zoneId);
    if (!zone) return [];

    const b = zone.bounds;
    return this.players.filter(p => {
      const pos = p.position;
      return pos.x >= b.x && pos.x <= b.x + b.w &&
             pos.y >= b.y && pos.y <= b.y + b.h;
    });
  }

  /**
   * Get chrono violation summary for dashboard.
   */
  getChronoSummary() {
    let pass = 0, passDmr = 0, failMin = 0, jouleCreep = 0;
    for (const p of this.players) {
      switch (p.chrono.status) {
        case 'PASS': pass++; break;
        case 'PASS_DMR_RULES': passDmr++; break;
        case 'FAILED_MIN_PERFORMANCE': failMin++; break;
        case 'JOULE_CREEP_DETECTED': jouleCreep++; break;
      }
    }
    return { pass, passDmr, failMin, jouleCreep, total: this.players.length };
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
      p.gear.primary.name.toLowerCase().includes(q)
    );
  }
}
