/**
 * AirOps v2.11 — Matchmaking & Gameday Optimizer
 * Delegated to the Python semantic RDF microservice.
 */

export class MatchmakingEngine {
  constructor(engine, intelEngine) {
    this.engine = engine;
    this.intel = intelEngine;
  }

  /**
   * Evaluates the day setup conditions and suggests the optimal game parameters.
   */
  async optimizeGameday(weather, marshallCount, enrolledPlayersCount) {
    try {
      const res = await fetch('/api/matchmake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather, marshallCount, enrolledPlayersCount })
      });
      const data = await res.json();
      return {
        weather,
        marshallCount,
        enrolledPlayersCount,
        marshallRatio: enrolledPlayersCount > 0 ? (marshallCount / enrolledPlayersCount).toFixed(3) : '0.000',
        suggestedMode: data.suggestedMode,
        modeReason: data.modeReason,
        warnings: data.warnings
      };
    } catch (e) {
      console.error("Matchmake API failed, falling back to local simulation:", e);
      return this._localOptimize(weather, marshallCount, enrolledPlayersCount);
    }
  }

  /**
   * Balanced Matchmaking: delegates to python backend to mutate RDF graph rosters.
   */
  async generateTeams(checkedInPlayers, weather, marshallCount) {
    try {
      const res = await fetch('/api/matchmake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather, marshallCount })
      });
      const data = await res.json();
      return data;
    } catch (e) {
      console.error("Matchmake generateTeams failed:", e);
      return null;
    }
  }

  _localOptimize(weather, marshallCount, enrolledPlayersCount) {
    const warnings = [];
    let suggestedMode = 'Full Site Domination';
    let modeReason = 'Optimal conditions.';
    if (weather === 'Rainy' || weather === 'Wet') {
      suggestedMode = 'Village Assault (CQB)';
      modeReason = 'Chalk quarry floor is slippery.';
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
}
