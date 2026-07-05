/**
 * AirOps v2.1 — Main Application Controller
 * High-density tactical control panel workflow:
 *   Phase 1: Gameday Setup & Weather Suggestions
 *   Phase 2: Roster Sign-In & Chrono Registration (Pre-team)
 *   Phase 3: Active Game Operations & Matchmaking Analytics
 */

import { OntologyEngine } from './ontology-engine.js?v=2.11.1';
import { TacticalMap } from './tactical-map.js?v=2.11.1';
import { ChronoFeed } from './chrono-feed.js?v=2.11.1';
import { IntelEngine } from './intel.js?v=2.11.1';
import { PenaltyEngine } from './penalty-engine.js?v=2.11.1';
import { FuzzyBalanceEngine } from './fuzzy-balance.js?v=2.11.1';
import { MatchmakingEngine } from './matchmaking.js?v=2.11.1';

class AirOpsApp {
  constructor() {
    this.engine = null;
    this.map = null;
    this.chronoFeed = null;
    this.intel = null;
    this.penalty = null;
    this.balance = null;
    this.matchmaker = null;

    this._activeTab = 'setup'; // Defaults to setup
    this._searchQuery = '';
    
    // Gameday State
    this._setupLocked = false;
    this._gamedayConditions = {
      weather: 'Dry',
      marshallCount: 3,
      expectedPlayers: 40
    };
    
    // Game Timer State
    this._timerInterval = null;
    this._timerSeconds = 45 * 60; 
    this._timerRunning = false;

    // Filters for Query tab
    this._queryFilters = {
      team: 'all',
      role: 'all',
      compliance: 'all',
      powerSource: 'all',
      text: ''
    };
  }

  async init() {
    this._showLoading('Initializing ontology engine...', 15);

    // Load data
    this.engine = new OntologyEngine();
    await this.engine.load();
    this._showLoading('Building intelligence graphs...', 40);

    // Unassign all players by default on load to start with a sign-in pool
    for (const p of this.engine.players) {
      p.team = 'unassigned';
      p.teamName = 'Unassigned';
      p.teamColor = '#888888';
    }

    // Init engines
    this.chronoFeed = new ChronoFeed(this.engine);
    this.intel = new IntelEngine(this.engine);
    this.penalty = new PenaltyEngine(this.engine);
    this.balance = new FuzzyBalanceEngine(this.engine, this.intel);
    this.matchmaker = new MatchmakingEngine(this.engine, this.intel);
    this._optimizedGameday = { weather: 'Dry', marshallCount: 3, enrolledPlayersCount: 0, marshallRatio: '0.000', suggestedMode: 'Full Site Domination', modeReason: 'Initializing...', warnings: [] };
    await this._updateMatchmakingSuggestions();
    this._showLoading('Rendering tactical control map...', 70);

    // Init map
    const canvas = document.getElementById('tactical-map');
    this.map = new TacticalMap(canvas, this.engine);
    this._showLoading('Control panel online.', 100);

    // Set up map callbacks
    this.map.onZoneHover = (zone, mousePos) => this._onZoneHover(zone, mousePos);
    this.map.onZoneClick = (zone) => this._onZoneClick(zone);
    this.map.onPlayerClick = (player) => this._showPlayerDetail(player);

    // Start map rendering
    this.map.start();

    // Set up UI
    this._setupTabs();
    this._setupMapControls();
    this._setupFeedFilters();
    this._setupTimer();
    this._updateUI();

    // Hide loading screen
    setTimeout(() => {
      document.getElementById('loading-screen').classList.add('hidden');
    }, 600);
  }

  // ─── Loading Screen ────────────────────────────────────────

  _showLoading(text, percent) {
    const bar = document.querySelector('.loading-bar-fill');
    const label = document.querySelector('.loading-text');
    if (bar) bar.style.width = percent + '%';
    if (label) label.textContent = text;
  }

  async _updateMatchmakingSuggestions() {
    this._optimizedGameday = await this.matchmaker.optimizeGameday(
      this._gamedayConditions.weather,
      this._gamedayConditions.marshallCount,
      this.engine.players.length
    );
  }

  // ─── Central UI Refresh ────────────────────────────────────

  _updateUI() {
    this._renderActivePanel();
    this._renderGamePhase();
    this._renderScoreDisplay();
    this._renderFeedEntries();
    this.map._render();
  }

  _rebuildEngines() {
    this.engine._buildIndexes();
    this.intel = new IntelEngine(this.engine);
    this.penalty = new PenaltyEngine(this.engine);
    this.balance = new FuzzyBalanceEngine(this.engine, this.intel);
    this.matchmaker = new MatchmakingEngine(this.engine, this.intel);
  }

  // ─── Tab Navigation ────────────────────────────────────────

  _setupTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._updateUI();
      });
    });
  }

  _renderActivePanel() {
    const panels = document.querySelectorAll('.sidebar-panel');
    panels.forEach(p => p.classList.remove('active'));

    const activePanel = document.getElementById(`panel-${this._activeTab}`);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    switch (this._activeTab) {
      case 'setup': this._renderSetupPanel(); break;
      case 'signin': this._renderSignInPanel(); break;
      case 'gameview': this._renderGameviewPanel(); break;
      case 'queries': this._renderQueriesPanel(); break;
    }
  }

  // ─── Phase 1: Setup Panel ──────────────────────────────────

  _renderSetupPanel() {
    const panel = document.getElementById('panel-setup');
    if (!panel) return;

    // Run matchmaking optimizer
    const opt = this._optimizedGameday || {
      weather: 'Dry',
      marshallCount: 3,
      enrolledPlayersCount: 0,
      marshallRatio: '0.000',
      suggestedMode: 'Full Site Domination',
      modeReason: 'Connecting to semantic server...',
      warnings: []
    };

    const warnings = opt.warnings || [];

    panel.innerHTML = `
      <div class="gb-section" style="margin-top: 0;">
        <div class="gb-section-title">1. Site Conditions Setup</div>
        <div class="chrono-form">
          <div class="form-group">
            <label for="se-weather">Weather Condition</label>
            <select id="se-weather" ${this._setupLocked ? 'disabled' : ''}>
              <option value="Dry" ${opt.weather === 'Dry' ? 'selected' : ''}>Dry (Optimal)</option>
              <option value="Wet" ${opt.weather === 'Wet' ? 'selected' : ''}>Wet / Slippery</option>
              <option value="Rainy" ${opt.weather === 'Rainy' ? 'selected' : ''}>Rainy (Chalk Hazards)</option>
              <option value="Windy" ${opt.weather === 'Windy' ? 'selected' : ''}>High Wind / Drift</option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="form-group">
              <label for="se-marshalls">Marshalls Enrolled</label>
              <input type="number" id="se-marshalls" min="1" max="20" value="${opt.marshallCount}" ${this._setupLocked ? 'disabled' : ''}>
            </div>
            <div class="form-group">
              <label>Players Enrolled</label>
              <div style="background: var(--bg-tertiary); border: 1px solid var(--border-primary); padding: 5px; font-size: 0.75rem; border-radius: var(--radius-sm); font-family: var(--font-mono); text-align: center;">
                ${opt.enrolledPlayersCount || 0}
              </div>
            </div>
          </div>
          ${this._setupLocked 
            ? `<button class="btn btn-secondary" id="btn-unlock-setup" style="width: 100%; margin-top: 6px;">🔓 Edit Setup</button>`
            : `<button class="btn btn-primary" id="btn-lock-setup" style="width: 100%; margin-top: 6px;">🔒 Lock Conditions</button>`
          }
        </div>
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Ontology Decision Engine</div>
        <div style="background: var(--bg-card); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-primary); font-size: 0.75rem; line-height: 1.4;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span class="label">Suggested Game Mode:</span>
            <span class="value" style="color: var(--accent-cyan); font-weight: bold;">${opt.suggestedMode || 'Full Site Domination'}</span>
          </div>
          <div style="color: var(--text-secondary); margin-bottom: 8px; font-size: 0.7rem; font-style: italic;">
            Reason: ${opt.modeReason || ''}
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span class="label">Marshall Safety Ratio:</span>
            <span class="value" style="font-family: var(--font-mono);">${opt.marshallRatio || '0.000'} (1:${Math.round(opt.enrolledPlayersCount / opt.marshallCount) || 0})</span>
          </div>
        </div>
      </div>

      ${warnings.length > 0 ? `
        <div class="gb-section">
          <div class="gb-section-title" style="color: var(--status-fail);">⚠️ Warnings & Constraints</div>
          <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
            ${warnings.map(w => `
              <div style="padding: 6px 8px; background: rgba(231,76,60,0.06); border: 1px solid rgba(231,76,60,0.15); border-radius: 4px; color: var(--accent-red); font-size: 0.65rem;">
                ${w}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Hook listeners
    const setupLock = document.getElementById('btn-lock-setup');
    setupLock?.addEventListener('click', async () => {
      this._setupLocked = true;
      this._gamedayConditions.weather = document.getElementById('se-weather').value;
      this._gamedayConditions.marshallCount = parseInt(document.getElementById('se-marshalls').value);
      await this._updateMatchmakingSuggestions();
      this._updateUI();
      // Auto transition to Sign-in
      document.querySelector('.sidebar-tab[data-tab="signin"]').click();
    });

    const setupUnlock = document.getElementById('btn-unlock-setup');
    setupUnlock?.addEventListener('click', () => {
      this._setupLocked = false;
      this._renderSetupPanel();
    });
  }

  // ─── Phase 2: Sign-In Panel ────────────────────────────────

  _renderSignInPanel() {
    const panel = document.getElementById('panel-signin');
    if (!panel) return;

    const unassigned = this.engine.players.filter(p => p.team === 'unassigned' && p.compliance !== 'BANNED');
    const checkedIn = this.engine.players.filter(p => p.team !== 'unassigned' && p.compliance !== 'BANNED');
    const banned = this.engine.players.filter(p => p.compliance === 'BANNED');

    panel.innerHTML = `
      <div class="checkin-section">
        <button class="btn btn-secondary checkin-toggle" id="btn-toggle-checkin" style="width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center;">
          <span>📝 Register Arriving Player</span>
          <span id="checkin-chevron">▼</span>
        </button>
        <div class="checkin-form-container hidden" id="checkin-form-panel">
          <form id="checkin-form" class="checkin-form">
            <div class="form-group">
              <label for="ci-name">Full Name</label>
              <input type="text" id="ci-name" required placeholder="John Doe">
            </div>
            <div class="form-group">
              <label for="ci-callsign">Callsign</label>
              <input type="text" id="ci-callsign" required placeholder="Ghost">
            </div>
            <div class="form-group">
              <label for="ci-role">Tactical Role</label>
              <select id="ci-role">
                <option value="Rifleman">Rifleman</option>
                <option value="Sniper">Sniper</option>
                <option value="Support">Support</option>
                <option value="Breacher">Breacher</option>
                <option value="Medic">Medic</option>
              </select>
            </div>
            <div class="form-group">
              <label for="ci-replica">Primary Replica Model</label>
              <input type="text" id="ci-replica" required placeholder=" Tokyo Marui VSR-10">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label for="ci-brand">Brand</label>
                <input type="text" id="ci-brand" placeholder="Tokyo Marui">
              </div>
              <div class="form-group">
                <label for="ci-power">Power Source</label>
                <select id="ci-power">
                  <option value="Electric (LiPo)">Electric (LiPo)</option>
                  <option value="Green Gas">Green Gas</option>
                  <option value="HPA (High Pressure Air)">HPA</option>
                  <option value="Spring Action">Spring Action</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div class="form-group">
                <label for="ci-fps">FPS (w/0.2g)</label>
                <input type="number" id="ci-fps" required min="0" max="600" value="330">
              </div>
              <div class="form-group">
                <label for="ci-joules">Joules</label>
                <input type="number" id="ci-joules" step="0.01" required min="0" max="4" value="1.0">
              </div>
              <div class="form-group">
                <label for="ci-bb">BB Weight</label>
                <input type="number" id="ci-bb" step="0.01" required value="0.2">
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Log Chrono & Check-in</button>
          </form>
        </div>
      </div>

      <!-- Matchmaker Optimizer trigger -->
      <div style="margin-bottom: var(--space-md);">
        <button class="btn btn-primary" id="btn-run-matchmaking" style="width: 100%; height: 36px; font-weight: bold; border-color: var(--accent-amber); text-shadow: none;">
          ⚡ Auto-Balance & Suggest Teams
        </button>
      </div>

      <!-- Chrono pools -->
      <div class="gb-section-title" style="margin-top: 8px; color: var(--text-heading);">
        Checked-In / Unassigned Pool · ${unassigned.length}
      </div>
      <div id="unassigned-pool" style="max-height: 250px; overflow-y: auto; margin-bottom: 12px;">
        ${unassigned.map(p => this._renderSignRosterCard(p)).join('')}
      </div>

      ${checkedIn.length > 0 ? `
        <div class="gb-section-title" style="color: var(--accent-green);">
          Assigned Roster · ${checkedIn.length}
        </div>
        <div id="assigned-pool" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">
          ${checkedIn.map(p => this._renderSignRosterCard(p)).join('')}
        </div>
      ` : ''}

      ${banned.length > 0 ? `
        <div class="gb-section-title" style="color: var(--status-fail);">
          Banned / Non-Compliant · ${banned.length}
        </div>
        <div id="banned-pool" style="max-height: 150px; overflow-y: auto;">
          ${banned.map(p => this._renderSignRosterCard(p)).join('')}
        </div>
      ` : ''}
    `;

    // Hook collapsible form
    const toggleBtn = document.getElementById('btn-toggle-checkin');
    const formPanel = document.getElementById('checkin-form-panel');
    const chevron = document.getElementById('checkin-chevron');
    toggleBtn?.addEventListener('click', () => {
      const isHidden = formPanel.classList.toggle('hidden');
      chevron.textContent = isHidden ? '▼' : '▲';
    });

    // Check-in submit handler
    const form = document.getElementById('checkin-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handlePlayerCheckIn();
    });

    // Trigger matchmaking balance
    const matchBtn = document.getElementById('btn-run-matchmaking');
    matchBtn?.addEventListener('click', () => {
      this._handleMatchmakingTrigger();
    });

    // Roster clicks to details
    panel.querySelectorAll('.player-card').forEach(card => {
      card.addEventListener('click', () => {
        const player = this.engine.getPlayer(card.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  _renderSignRosterCard(player) {
    const statusClass = player.compliance === 'CLEARED' ? 'cleared' :
                        player.compliance === 'FLAGGED' ? 'flagged' : 'banned';
    const initial = player.name.charAt(0);
    const tier = player.chrono?.tier || 'AEG';

    // Show team if assigned
    const teamLabel = player.team === 'unassigned' 
      ? '<span style="color: var(--text-muted);">Unassigned</span>' 
      : `<span style="color: ${player.teamColor}; font-weight: 600;">${player.teamName}</span>`;

    return `
      <div class="player-card" data-player-id="${player.id}">
        <div class="player-avatar" style="background: rgba(255,255,255,0.04); border-color: var(--border-primary); color: var(--text-secondary);">${initial}</div>
        <div class="player-info">
          <div class="player-name">${player.callsign} <span class="card-tier-label" style="font-size: 0.65rem; padding: 1px 4px; border-radius: 4px; background: rgba(255,255,255,0.06);">${tier}</span></div>
          <div class="player-meta">
            <span>${player.role}</span>
            <span>·</span>
            <span>${teamLabel}</span>
          </div>
        </div>
        <div class="status-badge ${statusClass}">${player.compliance === 'CLEARED' ? '✓' : player.compliance === 'FLAGGED' ? '!' : '✗'}</div>
      </div>
    `;
  }

  async _handlePlayerCheckIn() {
    const name = document.getElementById('ci-name').value;
    const callsignName = document.getElementById('ci-callsign').value;
    const role = document.getElementById('ci-role').value;
    const replicaName = document.getElementById('ci-replica').value;
    const brand = document.getElementById('ci-brand').value || 'Unknown';
    const powerSource = document.getElementById('ci-power').value;
    const fps = parseInt(document.getElementById('ci-fps').value);
    const joules = parseFloat(document.getElementById('ci-joules').value);
    const bbWeight = parseFloat(document.getElementById('ci-bb').value);

    const nextId = `P_${this.engine.players.length + 1}`;
    const callsign = `${callsignName}-${this.engine.players.length + 1}`;

    // Determine tier & rules
    let tier = 'AEG';
    if (replicaName.toLowerCase().includes('vsr') || replicaName.toLowerCase().includes('sniper') || role === 'Sniper') {
      tier = 'Bolt-Action';
    } else if (replicaName.toLowerCase().includes('dmr') || role === 'Sniper' && fps > 350) {
      tier = 'DMR';
    }

    const tierLimits = this.engine.chronoTiers[tier];
    let status = 'PASS';
    let compliance = 'CLEARED';

    if (fps > tierLimits.maxFps || joules > tierLimits.maxJoules) {
      status = 'FAIL_OVER_POWER';
      compliance = 'BANNED';
    } else if (joules < 0.3) {
      status = 'FAIL_MIN_PERFORMANCE';
      compliance = 'FLAGGED';
    }

    const newPlayer = {
      id: nextId,
      name,
      callsign,
      team: 'unassigned', // Pre-team pool
      teamName: 'Unassigned',
      teamColor: '#888888',
      role,
      status: compliance === 'BANNED' ? 'OUT' : 'ACTIVE',
      gear: {
        primary: {
          name: replicaName,
          sku: `SKU-${Math.floor(Math.random()*90000) + 10000}`,
          brand,
          powerSource,
          gearboxType: 'V2 Hybrid',
        },
        eyeProtection: true,
      },
      chrono: {
        fps,
        joules,
        bbWeight,
        status,
        tier,
        med: tierLimits.med,
        fireMode: tierLimits.fireMode
      },
      compliance,
      repairs: [],
      position: null, // No positioning until spatial check
      isAlive: compliance !== 'BANNED',
      warnings: [],
      stats: { kills: 0, deaths: 0, assists: 0, objectiveCaptures: 0, revives: 0 }
    };

    // Log the chrono event
    const newChronoLog = {
      logId: `Log_${Date.now()}`,
      playerId: nextId,
      replica: replicaName,
      fps,
      joules,
      bbWeight,
      status,
      marshallNote: 'Chrono pool check-in registration.',
      marshallAction: compliance === 'BANNED' ? 'EJECTED' : 'CLEARED'
    };

    await this.engine.addPlayer(newPlayer);
    this.engine.chronoEvents.unshift(newChronoLog);

    this._rebuildEngines();
    this._updateUI();

    alert(`Sign-in logged. Callsign: ${callsign} assigned to unassigned pool.`);
  }

  async _handleMatchmakingTrigger() {
    const eligible = this.engine.players.filter(p => p.compliance !== 'BANNED' && p.status !== 'OUT');
    if (eligible.length === 0) {
      alert("No checked-in, eligible players in the pool!");
      return;
    }

    // Run partition matchmaking on Python RDF backend
    const rosters = await this.matchmaker.generateTeams(
      eligible,
      this._gamedayConditions.weather,
      this._gamedayConditions.marshallCount
    );

    if (!rosters) {
      alert("Matchmaking execution failed on Python RDF backend!");
      return;
    }

    // Apply assignments to local player profiles
    for (const p of this.engine.players) {
      if (rosters.nonband.includes(p.id)) {
        p.team = 'nonband';
        p.teamName = 'Non-Band';
        p.teamColor = '#888888';
      } else if (rosters.band.includes(p.id)) {
        p.team = 'band';
        p.teamName = 'Band';
        p.teamColor = '#f1c40f';
      } else {
        p.team = 'unassigned';
        p.teamName = 'Unassigned';
        p.teamColor = '#888888';
      }
    }

    this._rebuildEngines();
    this._updateUI();

    alert(`Matchmaking successfully processed. Assigned ${rosters.nonband.length} to Non-Band (Grey) and ${rosters.band.length} to Band (Yellow). Transitioning to Gameview.`);
    
    // Switch to Phase 3 tab
    document.querySelector('.sidebar-tab[data-tab="gameview"]').click();
  }

  // ─── Phase 3: Gameview Operations Panel ────────────────────

  _renderGameviewPanel() {
    const panel = document.getElementById('panel-gameview');
    if (!panel) return;

    // Check if team assignment has run
    const assignedCount = this.engine.players.filter(p => p.team !== 'unassigned').length;
    if (assignedCount === 0) {
      panel.innerHTML = `
        <div style="text-align: center; padding: 32px var(--space-md); color: var(--text-secondary);">
          <div style="font-size: 2.5rem; margin-bottom: var(--space-md);">⏱️</div>
          <div style="font-weight: bold; margin-bottom: 6px;">Gameview Offline</div>
          <div style="font-size: 0.75rem;">Rosters have not been assigned. Complete Gameday Setup (Phase 1) and Run Matchmaking (Phase 2) to launch active Gameview monitoring.</div>
        </div>
      `;
      return;
    }

    const nonband = this.engine.players.filter(p => p.team === 'nonband');
    const band = this.engine.players.filter(p => p.team === 'band');
    const elapsedMins = Math.floor(this._timerSeconds / 60);
    const elapsedSecs = this._timerSeconds % 60;
    const timerStr = `${elapsedMins.toString().padStart(2, '0')}:${elapsedSecs.toString().padStart(2, '0')}`;

    // Threat balances
    const report = this.balance.getBalanceReport();

    panel.innerHTML = `
      <!-- Timer -->
      <div class="timer-card mb-md">
        <div class="timer-display" style="font-family: var(--font-mono); font-size: 2.2rem; font-weight: 800; text-align: center; color: var(--accent-green); text-shadow: 0 0 10px rgba(0, 255, 136, 0.2);">
          ${timerStr}
        </div>
        <div class="timer-controls" style="display: flex; gap: 8px; justify-content: center; margin-top: 6px;">
          <button class="btn btn-primary" id="btn-timer-toggle" style="padding: 4px 12px; font-size: 0.75rem;">
            ${this._timerRunning ? '⏸ Pause' : '▶ Start'}
          </button>
          <button class="btn btn-secondary" id="btn-timer-reset" style="padding: 4px 12px; font-size: 0.75rem;">
            ⟳ Reset
          </button>
        </div>
      </div>

      <!-- Before/After Game balance telemetry stats -->
      <div class="gb-section" style="margin-top: 0;">
        <div class="gb-section-title">Team Telemetry Balance</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem;">
          <div style="background: var(--bg-card); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--border-primary);">
            <div style="font-weight: bold; color: var(--text-primary); border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px; margin-bottom: 4px;">Non-Band</div>
            <div class="detail-row"><span class="label">Count:</span><span class="value">${nonband.length}</span></div>
            <div class="detail-row"><span class="label">Avg Joule:</span><span class="value">${this.engine.getAverageJoules('nonband').toFixed(2)}J</span></div>
            <div class="detail-row"><span class="label">Snipers:</span><span class="value">${nonband.filter(p => p.role === 'Sniper').length}</span></div>
          </div>
          <div style="background: var(--bg-card); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--border-primary);">
            <div style="font-weight: bold; color: var(--accent-amber); border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px; margin-bottom: 4px;">Band (Yellow)</div>
            <div class="detail-row"><span class="label">Count:</span><span class="value">${band.length}</span></div>
            <div class="detail-row"><span class="label">Avg Joule:</span><span class="value">${this.engine.getAverageJoules('band').toFixed(2)}J</span></div>
            <div class="detail-row"><span class="label">Snipers:</span><span class="value">${band.filter(p => p.role === 'Sniper').length}</span></div>
          </div>
        </div>
      </div>

      <!-- Threat calculations -->
      <div class="gb-section">
        <div class="gb-section-title">Team Threat Score (TTS)</div>
        ${this.balance.renderBalanceHTML()}
      </div>

      <!-- Quick Actions forms -->
      <div class="logger-container" style="margin-top: 12px;">
        <!-- Record elimination -->
        <button class="btn btn-secondary checkin-toggle" id="toggle-kill-form" style="width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span>💀 Record Elimination</span>
          <span id="kill-chevron">▼</span>
        </button>
        <div class="checkin-form-container hidden" id="kill-form-panel" style="margin-bottom: 12px;">
          <form id="kill-form" class="chrono-form">
            <div class="form-group">
              <label for="k-attacker">Attacker (Shooter)</label>
              <select id="k-attacker" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Attacker --</option>
                ${this.engine.players.filter(p => p.isAlive && p.team !== 'unassigned').map(p => `<option value="${p.id}">${p.callsign} (${p.teamName})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="k-target">Target (Hit Player)</label>
              <select id="k-target" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Target --</option>
                ${this.engine.players.filter(p => p.isAlive && p.team !== 'unassigned').map(p => `<option value="${p.id}">${p.callsign} (${p.teamName})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="k-zone">Zone of Engagement</label>
              <select id="k-zone" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Zone --</option>
                ${this.engine.getZones().map(z => `<option value="${z.id}">${z.name}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px;">Confirm Elimination</button>
          </form>
        </div>

        <!-- Log infraction -->
        <button class="btn btn-secondary checkin-toggle" id="toggle-violation-form" style="width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span>⚠️ Log Rule Violation</span>
          <span id="violation-chevron">▼</span>
        </button>
        <div class="checkin-form-container hidden" id="violation-form-panel" style="margin-bottom: 12px;">
          <form id="violation-form" class="chrono-form">
            <div class="form-group">
              <label for="v-player">Offending Player</label>
              <select id="v-player" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Player --</option>
                ${this.engine.players.map(p => `<option value="${p.id}">${p.callsign} (${p.teamName})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="v-type">Violation Type</label>
              <select id="v-type" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Infraction --</option>
                ${Object.entries(this.penalty.violationTypes).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label} (Max Warnings: ${v.maxWarnings})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="v-zone">Incident Zone</label>
              <select id="v-zone" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Zone --</option>
                ${this.engine.getZones().map(z => `<option value="${z.id}">${z.name}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px;">Submit Incident Record</button>
          </form>
        </div>
      </div>

      <!-- Incident log -->
      <div class="gb-section" style="margin-top: 8px;">
        <div class="gb-section-title">Incidents & Violations Feed</div>
        ${this.penalty.renderIncidentLogHTML(10)}
      </div>
    `;

    // Collapsible logger toggles
    document.getElementById('toggle-kill-form')?.addEventListener('click', () => {
      const pnl = document.getElementById('kill-form-panel');
      const chv = document.getElementById('kill-chevron');
      const isHidden = pnl.classList.toggle('hidden');
      chv.textContent = isHidden ? '▼' : '▲';
    });

    document.getElementById('toggle-violation-form')?.addEventListener('click', () => {
      const pnl = document.getElementById('violation-form-panel');
      const chv = document.getElementById('violation-chevron');
      const isHidden = pnl.classList.toggle('hidden');
      chv.textContent = isHidden ? '▼' : '▲';
    });

    // Form submits
    document.getElementById('kill-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleKillSubmission();
    });

    document.getElementById('violation-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleViolationSubmission();
    });

    // Hook timer controls
    const toggleTimer = document.getElementById('btn-timer-toggle');
    toggleTimer?.addEventListener('click', () => {
      this._timerRunning = !this._timerRunning;
      toggleTimer.textContent = this._timerRunning ? '⏸ Pause' : '▶ Start';
    });

    document.getElementById('btn-timer-reset')?.addEventListener('click', () => {
      this._timerRunning = false;
      this._timerSeconds = 45 * 60;
      this._renderGameviewPanel();
    });

    // Row click inside incidents
    panel.querySelectorAll('.incident-row').forEach(row => {
      row.addEventListener('click', () => {
        const player = this.engine.getPlayer(row.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  _setupTimer() {
    this._timerInterval = setInterval(() => {
      if (this._timerRunning && this._timerSeconds > 0) {
        this._timerSeconds--;
        if (this._activeTab === 'gameview') {
          const displayEl = document.querySelector('.timer-display');
          if (displayEl) {
            const mins = Math.floor(this._timerSeconds / 60);
            const secs = this._timerSeconds % 60;
            displayEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          }
        }
      }
    }, 1000);
  }

  async _handleKillSubmission() {
    const attackerId = document.getElementById('k-attacker').value;
    const targetId = document.getElementById('k-target').value;
    const zoneId = document.getElementById('k-zone').value;

    const attacker = this.engine.getPlayer(attackerId);
    const target = this.engine.getPlayer(targetId);

    if (!attacker || !target) return;
    if (attacker.team === target.team) {
      alert("Friendly fire is ignored!");
      return;
    }

    attacker.stats.kills++;
    target.stats.deaths++;

    target.status = 'ELIMINATED';
    target.isAlive = false;

    // Append to events (reflecting in memory store)
    await this.engine.addGameEvent({
      type: 'elimination',
      timestamp: new Date().toISOString(),
      attackerId: attacker.id,
      attackerCallsign: attacker.callsign,
      attackerTeam: attacker.team,
      targetId: target.id,
      targetCallsign: target.callsign,
      targetTeam: target.team,
      zone: zoneId,
      weapon: attacker.gear.primary.name
    });

    // Update score
    if (attacker.team === 'nonband') {
      this.engine.gameSession.score.nonband += 5;
    } else {
      this.engine.gameSession.score.band += 5;
    }

    this._rebuildEngines();
    this._updateUI();

    alert(`Logged: ${attacker.callsign} eliminated ${target.callsign}.`);
  }

  async _handleViolationSubmission() {
    const playerId = document.getElementById('v-player').value;
    const vtype = document.getElementById('v-type').value;
    const zoneId = document.getElementById('v-zone').value;

    const player = this.engine.getPlayer(playerId);
    if (!player) return;

    const action = this.penalty.computeAction(playerId, vtype);
    const warnings = this.penalty.getPlayerWarnings(playerId);
    const existingCount = warnings.find(w => w.type === vtype)?.count || 0;

    player.warnings.push({ type: vtype, count: existingCount + 1 });

    if (action === 'EJECTED' || action === 'BANNED_FOR_DAY') {
      await this.engine.updatePlayerCompliance(player.id, 'BANNED');
    } else if (action !== 'WARNING') {
      await this.engine.updatePlayerCompliance(player.id, 'FLAGGED');
      await this.engine.updatePlayerStatus(player.id, 'RESPAWNING');
    }

    await this.engine.addGameEvent({
      type: 'violation',
      timestamp: new Date().toISOString(),
      playerId: player.id,
      playerCallsign: player.callsign,
      team: player.team,
      violationType: vtype,
      warningNumber: existingCount + 1,
      maxWarnings: this.penalty.violationTypes[vtype]?.maxWarnings ?? 2,
      zone: zoneId,
      action: action
    });

    this._rebuildEngines();
    this._updateUI();

    alert(`Logged violation warning for ${player.callsign} (${action}).`);
  }

  // ─── Queries Panel ──────────────────────────────────────────

  _renderQueriesPanel() {
    const panel = document.getElementById('panel-queries');
    if (!panel) return;

    const defaultQuery = `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?player ?callsign ?joules ?compliance
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:callsign ?callsign ;
          asoft:complianceStatus ?compliance ;
          asoft:usesGear ?replica .
  ?replica asoft:hasPowerLimit ?joules .
}
ORDER BY DESC(?joules)
LIMIT 8`;

    panel.innerHTML = `
      <div class="gb-section" style="margin-top: 0;">
        <div class="gb-section-title">SPARQL Editor (Python rdflib)</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
          <textarea id="sparql-query-input" class="search-box" style="font-family: var(--font-mono); font-size: 0.7rem; height: 160px; width: 100%; resize: vertical; line-height: 1.3; background: #12161a; padding: 8px; border-color: var(--border-primary);" spellcheck="false">${defaultQuery}</textarea>
          <button class="btn btn-primary" id="btn-run-sparql" style="width: 100%; margin-top: 6px;">⚡ Execute SPARQL Query</button>
        </div>
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Execution Console Output</div>
        <div id="sparql-status" style="font-size: 0.65rem; color: var(--text-secondary); margin-bottom: 6px; font-family: var(--font-mono);">Ready. Enter SELECT query.</div>
        <div id="sparql-results-container" style="max-height: 250px; overflow-y: auto; overflow-x: auto; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-primary); font-size: 0.65rem;">
          <div style="padding: 12px; color: var(--text-muted); text-align: center;">No query results loaded.</div>
        </div>
      </div>
    `;

    // Hook execute button
    document.getElementById('btn-run-sparql')?.addEventListener('click', async () => {
      const qInput = document.getElementById('sparql-query-input').value;
      const statusEl = document.getElementById('sparql-status');
      const resultsContainer = document.getElementById('sparql-results-container');
      
      statusEl.textContent = 'Executing query over Python RDF Graph...';
      statusEl.style.color = 'var(--accent-cyan)';
      
      const startTime = performance.now();
      try {
        const res = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: qInput })
        });
        const data = await res.json();
        const duration = (performance.now() - startTime).toFixed(1);

        if (data.error) {
          statusEl.textContent = `Error: ${data.error}`;
          statusEl.style.color = 'var(--accent-red)';
          resultsContainer.innerHTML = `<div style="padding: 12px; color: var(--accent-red); font-family: var(--font-mono); font-size: 0.65rem; white-space: pre-wrap;">${data.error}</div>`;
          return;
        }

        statusEl.textContent = `Completed in ${duration}ms · Returned ${data.results.length} rows`;
        statusEl.style.color = 'var(--accent-green)';

        if (data.results.length === 0) {
          resultsContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">Empty result set.</div>';
          return;
        }

        // Render table
        let tableHTML = `<table style="width: 100%; border-collapse: collapse; text-align: left; font-family: var(--font-mono); font-size: 0.62rem;">`;
        tableHTML += `<thead style="background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-primary);"><tr>`;
        for (const v of data.vars) {
          tableHTML += `<th style="padding: 6px; font-weight: bold; color: var(--text-heading); border-right: 1px solid rgba(255,255,255,0.05);">${v}</th>`;
        }
        tableHTML += `</tr></thead><tbody>`;

        for (const row of data.results) {
          tableHTML += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.02); hover: background-color: var(--bg-hover);">`;
          for (const v of data.vars) {
            let val = row[v] || "";
            // Truncate URIs to make output clean
            if (val.includes('#')) val = val.split('#')[1];
            tableHTML += `<td style="padding: 6px; border-right: 1px solid rgba(255,255,255,0.05); white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis;" title="${row[v]}">${val}</td>`;
          }
          tableHTML += `</tr>`;
        }
        tableHTML += `</tbody></table>`;
        resultsContainer.innerHTML = tableHTML;
      } catch (err) {
        statusEl.textContent = `Fatal: ${err.message}`;
        statusEl.style.color = 'var(--accent-red)';
        resultsContainer.innerHTML = `<div style="padding: 12px; color: var(--accent-red); font-family: var(--font-mono);">${err.message}</div>`;
      }
    });
  }

  // ─── Player Detail Overlay Modal ────────────────────────────

  _showPlayerDetail(player) {
    const overlay = document.getElementById('player-detail-overlay');
    const detail = document.getElementById('player-detail');
    if (!overlay || !detail) return;

    this.map.selectPlayer(player.id);

    const teamColor = player.team === 'nonband' ? '#888888' : player.team === 'band' ? '#f1c40f' : 'var(--text-secondary)';
    const teamClass = player.team === 'nonband' ? 'nonband' : player.team === 'band' ? 'band' : 'unassigned';
    const statusClass = player.compliance === 'CLEARED' ? 'cleared' :
                        player.compliance === 'FLAGGED' ? 'flagged' : 'banned';

    const stats = this.intel.getPlayerStats(player.id);
    const pWarnings = this.penalty.getPlayerWarnings(player.id);
    
    const warningHTML = pWarnings.length === 0
      ? '<div style="font-size: 0.75rem; color: var(--text-muted);">No active warnings issued</div>'
      : pWarnings.map(w => `
          <div style="padding: 6px 8px; background: rgba(241, 196, 15, 0.06); border: 1px solid rgba(241, 196, 15, 0.15); border-radius: 6px; margin-bottom: 4px; font-size: 0.7rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-weight: 700; color: var(--accent-amber);">${w.icon} ${w.label}</span>
              <div style="color: var(--text-secondary); margin-top: 1px; font-size: 0.65rem;">Escalation action: ${w.escalationAction.replace(/_/g, ' ')}</div>
            </div>
            <span style="font-family: var(--font-mono); font-weight: bold;">${w.count} / ${w.maxWarnings}</span>
          </div>
        `).join('');

    const repairs = player.repairs || [];
    const repairHTML = repairs.length === 0
      ? '<div style="font-size: 0.75rem; color: var(--text-muted);">No repair logs in Silo 3</div>'
      : repairs.slice(0, 2).map(r => `
          <div style="padding: 6px 8px; background: var(--bg-card); border-radius: 6px; margin-bottom: 4px; font-size: 0.7rem;">
            <div style="font-weight: 600; display: flex; justify-content: space-between;">
              <span>${r.repairId}</span>
              <span style="color: var(--accent-cyan); font-size: 0.65rem;">${r.date}</span>
            </div>
            <div style="color: var(--text-secondary); margin-top: 2px;">${r.diagnosis}</div>
          </div>
        `).join('');

    detail.innerHTML = `
      <div class="detail-header">
        <div class="detail-avatar" style="border-color: ${teamColor}; background: ${teamColor}1a; color: ${teamColor}; font-weight: bold;">
          ${player.name.charAt(0)}
        </div>
        <div>
          <div class="detail-name">${player.name}</div>
          <div class="detail-callsign">${player.callsign} <span style="font-size: 0.7rem; font-weight: normal; color: var(--text-muted);">(${player.id})</span></div>
          <div style="margin-top: 4px; display: flex; gap: 4px;">
            <span class="status-badge ${statusClass}">${player.compliance}</span>
            <span class="status-badge" style="background: rgba(255,255,255,0.04); color: var(--text-heading);">${player.status}</span>
          </div>
        </div>
      </div>

      <!-- Marshall Control Actions -->
      <div class="detail-section" style="background: rgba(231, 76, 60, 0.03); border: 1px solid rgba(231,76,60,0.15); border-radius: var(--radius-md); padding: 8px;">
        <div class="detail-section-title" style="color: var(--accent-red); margin-bottom: 6px; font-size: 0.75rem;">🛡️ Marshall Live Control Console</div>
        
        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
          <select id="modal-status" class="search-box" style="flex: 1; padding: 4px; font-size: 0.75rem; height: 26px;">
            <option value="ACTIVE" ${player.status === 'ACTIVE' ? 'selected' : ''}>Status: ACTIVE</option>
            <option value="ELIMINATED" ${player.status === 'ELIMINATED' ? 'selected' : ''}>Status: ELIMINATED</option>
            <option value="RESPAWNING" ${player.status === 'RESPAWNING' ? 'selected' : ''}>Status: RESPAWNING</option>
            <option value="OUT" ${player.status === 'OUT' ? 'selected' : ''}>Status: OUT (BANNED)</option>
          </select>
          <button class="btn btn-primary" id="modal-btn-status" style="padding: 2px 8px; font-size: 0.7rem; height: 26px;">Apply</button>
        </div>

        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
          <select id="modal-team" class="search-box" style="flex: 1; padding: 4px; font-size: 0.75rem; height: 26px;">
            <option value="unassigned" ${player.team === 'unassigned' ? 'selected' : ''}>Team: Unassigned</option>
            <option value="nonband" ${player.team === 'nonband' ? 'selected' : ''}>Team: Non-Band (Grey)</option>
            <option value="band" ${player.team === 'band' ? 'selected' : ''}>Team: Band (Yellow)</option>
          </select>
          <button class="btn btn-secondary" id="modal-btn-team" style="padding: 2px 8px; font-size: 0.7rem; height: 26px;">Team</button>
        </div>

        <div style="display: flex; gap: 6px;">
          <select id="modal-violation" class="search-box" style="flex: 1; padding: 4px; font-size: 0.75rem; height: 26px;">
            <option value="" disabled selected>-- Log Infraction --</option>
            <option value="BLIND_FIRE">Blind Fire</option>
            <option value="OVERSHOOT">Overshooting</option>
            <option value="DEAD_MAN_WALKING">Dead Man Walk/Talk</option>
            <option value="MED_VIOLATION">MED Infraction</option>
            <option value="EYE_PRO_REMOVED">Eye Pro Off</option>
            <option value="AGGRESSION">Aggression / Fight</option>
          </select>
          <button class="btn btn-secondary" id="modal-btn-violation" style="padding: 2px 8px; font-size: 0.7rem; height: 26px;">Log</button>
        </div>
      </div>

      <!-- Chrono validation update inside modal -->
      <div class="detail-section" style="background: rgba(46, 204, 113, 0.02); border: 1px solid rgba(46, 204, 113, 0.15); border-radius: var(--radius-md); padding: 8px;">
        <div class="detail-section-title" style="color: var(--accent-green); margin-bottom: 6px; font-size: 0.75rem;">⏱️ Re-Chrono Validation Check</div>
        <div style="display: flex; gap: 4px;">
          <input type="number" id="modal-fps" class="search-box" style="flex: 1; height: 26px; font-size: 0.75rem; padding: 4px;" placeholder="FPS" value="${player.chrono.fps}">
          <input type="number" id="modal-joules" step="0.01" class="search-box" style="flex: 1; height: 26px; font-size: 0.75rem; padding: 4px;" placeholder="Joules" value="${player.chrono.joules}">
          <button class="btn btn-primary" id="modal-btn-chrono" style="padding: 2px 8px; font-size: 0.7rem; height: 26px;">Chrono</button>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Replica Details</div>
        <div class="detail-row"><span class="label">Replica</span><span class="value" style="font-family: var(--font-body);">${player.gear.primary.name}</span></div>
        <div class="detail-row"><span class="label">Chrono Power</span><span class="value" style="font-family: var(--font-mono); font-weight: bold; color: var(--accent-cyan);">${player.chrono.fps} FPS · ${player.chrono.joules} J (${player.chrono.bbWeight}g)</span></div>
        <div class="detail-row"><span class="label">Tier / MED</span><span class="value" style="font-family: var(--font-mono);">${player.chrono.tier} / ${player.chrono.med}m MED</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Telemetry Stats</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; text-align: center; margin-bottom: 4px;">
          <div style="background: var(--bg-card); padding: 4px; border-radius: 4px;">
            <div style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: bold; color: var(--accent-green);">${stats.kills}</div>
            <div style="font-size: 0.55rem; color: var(--text-secondary);">Kills</div>
          </div>
          <div style="background: var(--bg-card); padding: 4px; border-radius: 4px;">
            <div style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: bold; color: var(--accent-red);">${stats.deaths}</div>
            <div style="font-size: 0.55rem; color: var(--text-secondary);">Deaths</div>
          </div>
          <div style="background: var(--bg-card); padding: 4px; border-radius: 4px;">
            <div style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: bold; color: var(--accent-cyan);">${stats.kd.toFixed(2)}</div>
            <div style="font-size: 0.55rem; color: var(--text-secondary);">K/D</div>
          </div>
          <div style="background: var(--bg-card); padding: 4px; border-radius: 4px;">
            <div style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: bold; color: var(--accent-purple);">${stats.objectiveCaptures}</div>
            <div style="font-size: 0.55rem; color: var(--text-secondary);">Caps</div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Active Warnings</div>
        ${warningHTML}
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Tech Repair Log (Silo 3)</div>
        ${repairHTML}
      </div>

      <button class="btn btn-secondary" style="width: 100%; margin-top: 12px;" id="close-detail">Close Console View</button>
    `;

    overlay.classList.add('visible');

    const closeModal = () => {
      overlay.classList.remove('visible');
      this.map.clearSelection();
    };

    document.getElementById('close-detail')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Control callbacks
    document.getElementById('modal-btn-status')?.addEventListener('click', async () => {
      const s = document.getElementById('modal-status').value;
      await this.engine.updatePlayerStatus(player.id, s);
      this._rebuildEngines();
      this._updateUI();
      this._showPlayerDetail(player);
    });

    document.getElementById('modal-btn-team')?.addEventListener('click', async () => {
      const t = document.getElementById('modal-team').value;
      await this.engine.assignPlayerTeam(player.id, t);
      this._rebuildEngines();
      this._updateUI();
      this._showPlayerDetail(player);
    });

    document.getElementById('modal-btn-chrono')?.addEventListener('click', async () => {
      const fps = parseInt(document.getElementById('modal-fps').value);
      const joules = parseFloat(document.getElementById('modal-joules').value);
      await this.engine.updatePlayerChrono(player.id, fps, joules, player.chrono.bbWeight);
      this._rebuildEngines();
      this._updateUI();
      this._showPlayerDetail(player);
    });

    document.getElementById('modal-btn-violation')?.addEventListener('click', async () => {
      const vtype = document.getElementById('modal-violation').value;
      if (!vtype) return;

      const action = this.penalty.computeAction(player.id, vtype);
      const warnings = this.penalty.getPlayerWarnings(player.id);
      const count = warnings.find(w => w.type === vtype)?.count || 0;

      player.warnings.push({ type: vtype, count: count + 1 });

      if (action === 'EJECTED' || action === 'BANNED_FOR_DAY') {
        await this.engine.updatePlayerCompliance(player.id, 'BANNED');
      } else if (action !== 'WARNING') {
        await this.engine.updatePlayerCompliance(player.id, 'FLAGGED');
        await this.engine.updatePlayerStatus(player.id, 'RESPAWNING');
      }

      await this.engine.addGameEvent({
        type: 'violation',
        timestamp: new Date().toISOString(),
        playerId: player.id,
        playerCallsign: player.callsign,
        team: player.team,
        violationType: vtype,
        warningNumber: count + 1,
        maxWarnings: this.penalty.violationTypes[vtype]?.maxWarnings ?? 2,
        zone: 'safe_zone',
        action: action
      });

      this._rebuildEngines();
      this._updateUI();
      this._showPlayerDetail(player);
    });
  }

  // ─── Header Game Phase & Score Overlays ─────────────────────

  _renderGamePhase() {
    const badge = document.getElementById('game-phase-badge');
    if (badge) {
      let phaseLabel = 'Setup';
      if (this._activeTab === 'setup') phaseLabel = 'Phase 1: Gameday Setup';
      else if (this._activeTab === 'signin') phaseLabel = 'Phase 2: Chrono Sign-In Pool';
      else if (this._activeTab === 'gameview') phaseLabel = 'Phase 3: Active Gameday Operations';

      badge.innerHTML = `
        <div class="dot" style="background: var(--accent-cyan);"></div>
        <span>${phaseLabel}</span>
      `;
    }
  }

  _renderScoreDisplay() {
    const session = this.engine.gameSession;
    if (!session) return;

    const scoreEl = document.getElementById('score-display');
    if (scoreEl) {
      scoreEl.innerHTML = `
        <div class="score-team">
          <div class="team-dot" style="background: #888888;"></div>
          <div>
            <div class="team-name" style="color: #a3a3a3;">Non-Band</div>
            <div class="team-score text-green">${session.score.nonband || 0}</div>
          </div>
        </div>
        <div class="score-divider"></div>
        <div class="score-team">
          <div>
            <div class="team-name" style="color: var(--accent-amber);">Band</div>
            <div class="team-score text-blue">${session.score.band || 0}</div>
          </div>
          <div class="team-dot" style="background: var(--accent-amber);"></div>
        </div>
      `;
    }
  }

  _setupMapControls() {
    document.getElementById('btn-heatmap')?.addEventListener('click', (e) => {
      this.map.toggleHeatmap();
      e.currentTarget.classList.toggle('active');
    });

    document.getElementById('btn-labels')?.addEventListener('click', (e) => {
      this.map.toggleLabels();
      e.currentTarget.classList.toggle('active');
    });

    document.getElementById('btn-players')?.addEventListener('click', (e) => {
      this.map.togglePlayers();
      e.currentTarget.classList.toggle('active');
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.map.resetView();
    });
  }

  _onZoneHover(zone, mousePos) {
    const tooltip = document.getElementById('zone-tooltip');
    if (!zone || !mousePos) {
      tooltip.classList.remove('visible');
      return;
    }

    const playersInZone = this.engine.getPlayersInZone(zone.id);

    tooltip.innerHTML = `
      <h4>${zone.icon} ${zone.name}</h4>
      <div class="zone-stat">
        <span class="label">Type</span>
        <span class="value">${zone.type}</span>
      </div>
      <div class="zone-stat">
        <span class="label">Max Joules</span>
        <span class="value">${zone.maxJoules > 0 ? zone.maxJoules + 'J' : 'N/A'}</span>
      </div>
      <div class="zone-stat">
        <span class="label">Max Players</span>
        <span class="value">${zone.maxPlayers}</span>
      </div>
      <div class="zone-stat">
        <span class="label">Current Players</span>
        <span class="value">${playersInZone.length}</span>
      </div>
    `;

    const mapArea = document.getElementById('map-area');
    const rect = mapArea.getBoundingClientRect();
    let x = mousePos.x + 16;
    let y = mousePos.y + 16;

    if (x + 260 > rect.width) x = mousePos.x - 270;
    if (y + 200 > rect.height) y = mousePos.y - 210;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('visible');
  }

  _onZoneClick(zone) {
    // Spatial zoom click handler
  }

  _setupFeedFilters() {
    document.querySelectorAll('#live-feed .feed-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#live-feed .feed-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._feedFilter = btn.dataset.filter;
        this._renderFeedEntries();
      });
    });
  }

  _renderFeedEntries() {
    const container = document.getElementById('feed-entries');
    if (!container) return;

    let events = [...this.engine.gameEvents];

    if (this._feedFilter !== 'all') {
      events = events.filter(e => e.type === this._feedFilter);
    }

    const visible = [...events].reverse().slice(0, 30);

    container.innerHTML = visible.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      let icon, text;
      switch (e.type) {
        case 'elimination':
          icon = '💀';
          const attackerTeamClass = e.attackerTeam === 'nonband' ? 'nonband' : 'band';
          const targetTeamClass = e.targetTeam === 'nonband' ? 'nonband' : 'band';
          text = `<span class="highlight team-${attackerTeamClass}">${e.attackerCallsign}</span> eliminated <span class="highlight team-${targetTeamClass}">${e.targetCallsign}</span> <span class="text-muted">in ${e.zone.replace(/_/g, ' ')}</span>`;
          break;
        case 'objective_capture':
          icon = '🏴';
          const teamLabel = e.team === 'nonband' ? 'NON-BAND' : 'BAND';
          text = `<span class="highlight team-${e.team}">${teamLabel}</span> captured <span class="highlight">${e.zone.replace(/_/g, ' ')}</span>`;
          break;
        case 'medic_revive':
          icon = '💚';
          text = `<span class="highlight team-${e.team}">${e.medicCallsign}</span> revived teammate <span class="highlight team-${e.team}">${e.revivedCallsign}</span>`;
          break;
        case 'violation':
          icon = '⚠️';
          const actionClass = e.action === 'EJECTED' || e.action === 'BANNED_FOR_DAY' ? 'danger' : 'warn';
          text = `<span class="warn">${e.playerCallsign}</span>: <span class="danger">${e.violationType.replace(/_/g, ' ')}</span> → <span class="${actionClass}">${e.action.replace(/_/g, ' ')}</span>`;
          break;
        default:
          icon = '•';
          text = 'Operational log entry recorded';
      }

      return `
        <div class="feed-entry">
          <div class="feed-time">${time}</div>
          <div class="feed-icon">${icon}</div>
          <div class="feed-text">${text}</div>
        </div>
      `;
    }).join('');

    container.scrollTop = 0;
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  const app = new AirOpsApp();
  app.init().catch(err => {
    console.error('AirOps init failed:', err);
    const label = document.querySelector('.loading-text');
    if (label) label.textContent = 'Error: ' + err.message;
  });
});
