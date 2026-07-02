/**
 * AirOps v2.1 — Matchmaking & Gameday Optimizer
 * Leverages ontology rules to suggest optimal game modes based on weather constraints
 * and balances players into Band (yellow) and Non-Band (grey) teams.
 */

export class MatchmakingEngine {
  constructor(engine, intelEngine) {
    this.engine = engine;
    this.intel = intelEngine;
  }

  /**
   * Evaluates the day setup conditions and suggests the optimal game parameters.
   */
  optimizeGameday(weather, marshallCount, enrolledPlayersCount) {
    const warnings = [];
    let suggestedMode = 'Full Site Domination';
    let modeReason = '';

    // Marshall-to-player safety ratio check (Silo 2 / SHACL integrity)
    if (enrolledPlayersCount > 0) {
      const ratio = marshallCount / enrolledPlayersCount;
      if (ratio < 0.05) { // less than 1 marshall per 20 players
        warnings.push(`SAFETY WARNING: Low marshall ratio (1:${Math.round(1/ratio)}). Suggest adding at least ${Math.ceil(enrolledPlayersCount * 0.06) - marshallCount} more marshall(s).`);
      } else if (ratio < 0.07) { // between 1:15 and 1:20
        warnings.push(`Operational Notice: Safety ratio is adequate but tight. Keep snipers on designated ridges.`);
      }
    }

    // Weather constraint optimization
    switch (weather.toLowerCase()) {
      case 'rainy':
      case 'wet':
        suggestedMode = 'Village Assault (CQB)';
        modeReason = 'Chalk quarry floor is highly slippery. Wooden village structures provide shelter and safe footing.';
        warnings.push('Weather Advisory: Wet ground conditions. Suggest closing access to the Quarry Cliffs sector.');
        break;
      case 'windy':
        suggestedMode = 'Attack & Defend Firebase';
        modeReason = 'HESCO compound provides windbreakers. Close-combat focus reduces BB wind-drift inaccuracy.';
        warnings.push('Tactical Advisory: High winds detected. Sniper engagement from the Ridge will be severely drift-affected.');
        break;
      case 'dry':
      default:
        suggestedMode = 'Full Site Domination';
        modeReason = 'Optimal conditions. All quarry, forest, and compound sectors are fully operational.';
        break;
    }

    return {
      weather,
      marshallCount,
      enrolledPlayersCount,
      marshallRatio: enrolledPlayersCount > 0 ? (marshallCount / enrolledPlayersCount).toFixed(3) : '0.000',
      suggestedMode,
      modeReason,
      warnings
    };
  }

  /**
   * Balanced Matchmaking: splits players into Band and Non-Band.
   * Minimizes the Team Threat Score (TTS) discrepancy.
   */
  generateTeams(checkedInPlayers) {
    // Filter out banned/out players
    const pool = checkedInPlayers.filter(p => p.compliance !== 'BANNED' && p.status !== 'OUT');

    // Sort by role threat weight and chrono muzzle energy descending
    // This allows greedy distribution of highest-power players first
    const roleWeights = { 'Commander': 1.5, 'Sniper': 1.4, 'Support': 1.3, 'Breacher': 1.1, 'Medic': 1.0, 'Rifleman': 1.0 };
    pool.sort((a, b) => {
      const weightA = (roleWeights[a.role] || 1) * (a.chrono?.joules || 1);
      const weightB = (roleWeights[b.role] || 1) * (b.chrono?.joules || 1);
      return weightB - weightA;
    });

    const teamNonBand = [];
    const teamBand = [];

    // Greedy partition
    for (const player of pool) {
      // Calculate current cumulative threat estimate for both teams
      const threatNonBand = this._calculateCumulativeThreat(teamNonBand);
      const threatBand = this._calculateCumulativeThreat(teamBand);

      // Assign to the team with lower threat, keeping sizes within 1
      if (teamNonBand.length < teamBand.length) {
        teamNonBand.push(player);
      } else if (teamBand.length < teamNonBand.length) {
        teamBand.push(player);
      } else {
        // Equal size, assign to the lower threat team
        if (threatNonBand <= threatBand) {
          teamNonBand.push(player);
        } else {
          teamBand.push(player);
        }
      }
    }

    return {
      nonband: teamNonBand,
      band: teamBand,
      totalAssigned: pool.length
    };
  }

  /**
   * Helper to estimate player threat score for greedy partitioning.
   */
  _calculateCumulativeThreat(teamPlayers) {
    if (teamPlayers.length === 0) return 0;
    const avgJ = teamPlayers.reduce((s, p) => s + (p.chrono?.joules || 0), 0) / teamPlayers.length;
    const sniperCount = teamPlayers.filter(p => p.role === 'Sniper' || p.role === 'Support').length;
    return (avgJ * 10) + (sniperCount * 2) + teamPlayers.length;
  }
}
