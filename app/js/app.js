/**
 * AirOps v2 — Main Application Controller
 * Orchestrates all modules, handles routing between sidebar panels,
 * manages the operations forms, and coordinates interactions.
 */

import { OntologyEngine } from './ontology-engine.js?v=2';
import { TacticalMap } from './tactical-map.js?v=2';
import { ChronoFeed } from './chrono-feed.js?v=2';
import { IntelEngine } from './intel.js?v=2';
import { PenaltyEngine } from './penalty-engine.js?v=2';
import { FuzzyBalanceEngine } from './fuzzy-balance.js?v=2';

class AirOpsApp {
  constructor() {
    this.engine = null;
    this.map = null;
    this.chronoFeed = null;
    this.intel = null;
    this.penalty = null;
    this.balance = null;

    this._activeTab = 'players';
    this._chronoFilter = 'all';
    this._feedFilter = 'all';
    this._searchQuery = '';
    
    // Sub-tab selection for Intel
    this._intelSubTab = 'leaderboard';
    this._leaderboardMetric = 'kills';

    // Game Timer State
    this._timerInterval = null;
    this._timerSeconds = 45 * 60; // 45 mins active game
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

    // Init engines
    this.chronoFeed = new ChronoFeed(this.engine);
    this.intel = new IntelEngine(this.engine);
    this.penalty = new PenaltyEngine(this.engine);
    this.balance = new FuzzyBalanceEngine(this.engine, this.intel);
    this._showLoading('Rendering tactical map...', 70);

    // Init map
    const canvas = document.getElementById('tactical-map');
    this.map = new TacticalMap(canvas, this.engine);
    this._showLoading('Systems online.', 100);

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
  }

  // ─── Tab Navigation ────────────────────────────────────────

  _setupTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._renderActivePanel();
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
      case 'players': this._renderPlayersPanel(); break;
      case 'chrono': this._renderChronoPanel(); break;
      case 'intel': this._renderIntelPanel(); break;
      case 'ops': this._renderOpsPanel(); break;
      case 'queries': this._renderQueriesPanel(); break;
    }
  }

  // ─── Players Panel (Check-In & Status Board) ───────────────

  _renderPlayersPanel() {
    const panel = document.getElementById('panel-players');
    if (!panel) return;

    const stats = this.engine.getStatusBreakdown();
    const players = this.engine.searchPlayers(this._searchQuery);

    const alphaPlayers = players.filter(p => p.team === 'alpha');
    const bravoPlayers = players.filter(p => p.team === 'bravo');

    panel.innerHTML = `
      <!-- Status board summary -->
      <div class="status-board">
        <div class="sb-item active">
          <div class="sb-val">${stats.ACTIVE}</div>
          <div class="sb-lbl">Active</div>
        </div>
        <div class="sb-item eliminated">
          <div class="sb-val">${stats.ELIMINATED}</div>
          <div class="sb-lbl">Dead</div>
        </div>
        <div class="sb-item respawn">
          <div class="sb-val">${stats.RESPAWNING}</div>
          <div class="sb-lbl">Respawn</div>
        </div>
        <div class="sb-item out">
          <div class="sb-val">${stats.OUT}</div>
          <div class="sb-lbl">Out</div>
        </div>
      </div>

      <!-- Quick Check-in accordion toggle -->
      <div class="checkin-section">
        <button class="btn btn-secondary checkin-toggle" id="btn-toggle-checkin" style="width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center;">
          <span>📝 Player Check-In Form</span>
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
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group">
                <label for="ci-team">Team Assignment</label>
                <select id="ci-team">
                  <option value="alpha">Alpha Force</option>
                  <option value="bravo">Bravo Company</option>
                </select>
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
            </div>
            <div class="form-group">
              <label for="ci-replica">Primary Replica Model</label>
              <input type="text" id="ci-replica" required placeholder="Tokyo Marui VSR-10 / Specna Arms M4">
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
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Register & Check-in</button>
          </form>
        </div>
      </div>

      <!-- Player Search -->
      <div style="position: relative; margin-top: 12px;">
        <input type="text" class="search-box" id="player-search"
               placeholder="Search players, callsigns, gear, roles..."
               value="${this._searchQuery}">
      </div>

      <div class="gb-section-title" style="color: var(--team-alpha); margin-top: 12px;">
        Alpha Force · ${alphaPlayers.length}
      </div>
      <div id="alpha-players">
        ${alphaPlayers.map(p => this._renderPlayerCard(p)).join('')}
      </div>

      <div class="gb-section-title" style="margin-top: 16px; color: var(--team-bravo);">
        Bravo Company · ${bravoPlayers.length}
      </div>
      <div id="bravo-players">
        ${bravoPlayers.map(p => this._renderPlayerCard(p)).join('')}
      </div>
    `;

    // Collapsible Check-in form handler
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

    // Search handler
    const searchBox = document.getElementById('player-search');
    searchBox?.addEventListener('input', (e) => {
      this._searchQuery = e.target.value;
      this._renderPlayersPanel();
    });

    // Player card clicks
    panel.querySelectorAll('.player-card').forEach(card => {
      card.addEventListener('click', () => {
        const player = this.engine.getPlayer(card.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  _renderPlayerCard(player) {
    const statusClass = player.compliance === 'CLEARED' ? 'cleared' :
                        player.compliance === 'FLAGGED' ? 'flagged' : 'banned';
    const teamClass = player.team === 'alpha' ? 'alpha' : 'bravo';
    const initial = player.name.charAt(0);
    const tier = player.chrono?.tier || 'AEG';

    // Status label color
    let statusLabel = player.status;
    let labelColor = 'var(--text-secondary)';
    if (player.status === 'ELIMINATED') {
      statusLabel = 'DEAD';
      labelColor = 'var(--accent-red)';
    } else if (player.status === 'RESPAWNING') {
      statusLabel = 'RESPAWN';
      labelColor = 'var(--accent-amber)';
    } else if (player.status === 'ACTIVE') {
      labelColor = 'var(--accent-green)';
    }

    return `
      <div class="player-card" data-player-id="${player.id}">
        <div class="player-avatar ${teamClass}">${initial}</div>
        <div class="player-info">
          <div class="player-name">${player.callsign} <span class="card-tier-label" style="font-size: 0.65rem; padding: 1px 4px; border-radius: 4px; background: rgba(255,255,255,0.06); margin-left: 4px;">${tier}</span></div>
          <div class="player-meta">
            <span class="player-role">${player.role}</span>
            <span>·</span>
            <span style="color: ${labelColor}; font-weight: 600; font-size: 0.7rem;">${statusLabel}</span>
          </div>
        </div>
        <div class="status-badge ${statusClass}">${player.compliance === 'CLEARED' ? '✓' : player.compliance === 'FLAGGED' ? '!' : '✗'}</div>
      </div>
    `;
  }

  _handlePlayerCheckIn() {
    const name = document.getElementById('ci-name').value;
    const callsignName = document.getElementById('ci-callsign').value;
    const team = document.getElementById('ci-team').value;
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

    // Default position near spawn
    const spawnZone = this.engine.getZoneById(team === 'alpha' ? 'woodland_north' : 'woodland_east');
    const bounds = spawnZone?.bounds || { x: 100, y: 100, w: 100, h: 100 };
    const pos_x = bounds.x + Math.floor(Math.random() * bounds.w);
    const pos_y = bounds.y + Math.floor(Math.random() * bounds.h);

    const newPlayer = {
      id: nextId,
      name,
      callsign,
      team,
      teamName: team === 'alpha' ? 'Alpha Force' : 'Bravo Company',
      teamColor: team === 'alpha' ? '#00ff88' : '#4488ff',
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
      position: { x: pos_x, y: pos_y },
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
      marshallNote: 'Initial check-in chrono check.',
      marshallAction: compliance === 'BANNED' ? 'EJECTED' : 'CLEARED'
    };

    this.engine.players.push(newPlayer);
    this.engine.chronoEvents.unshift(newChronoLog);

    // Event entry for check-in
    this.engine.gameEvents.push({
      type: 'violation',
      timestamp: new Date().toISOString(),
      playerId: nextId,
      playerCallsign: callsign,
      team,
      violationType: 'JOULE_CREEP',
      action: compliance === 'BANNED' ? 'EJECTED' : 'CHECKED_IN',
      zone: 'safe_zone'
    });

    this._rebuildEngines();
    this._updateUI();

    // Flash success notification
    alert(`Successfully checked in ${callsign} on ${newPlayer.teamName}!`);
  }

  // ─── Chrono Station Tab ───────────────────────────────────

  _renderChronoPanel() {
    const panel = document.getElementById('panel-chrono');
    if (!panel) return;

    // Filter out banned/out players for dropdown
    const activePlayers = this.engine.players.filter(p => p.compliance !== 'BANNED');

    panel.innerHTML = `
      <div class="chrono-form-container mb-md">
        <div class="gb-section-title" style="margin-top: 0;">⏱️ Log Chrono Reading</div>
        <form id="chrono-form" class="chrono-form">
          <div class="form-group">
            <label for="ch-player">Select Player</label>
            <select id="ch-player" style="width: 100%;" required>
              <option value="" disabled selected>-- Select Checked-In Player --</option>
              ${activePlayers.map(p => `
                <option value="${p.id}">${p.callsign} (${p.role} · ${p.teamName})</option>
              `).join('')}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <div class="form-group">
              <label for="ch-fps">Measured FPS</label>
              <input type="number" id="ch-fps" required min="0" max="600" placeholder="330">
            </div>
            <div class="form-group">
              <label for="ch-joules">Measured Joules</label>
              <input type="number" id="ch-joules" step="0.01" required min="0" max="4" placeholder="1.15">
            </div>
            <div class="form-group">
              <label for="ch-bb">BB Weight (g)</label>
              <input type="number" id="ch-bb" step="0.01" required value="0.20">
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 6px;">Submit Chrono Reading</button>
        </form>
      </div>

      ${this.chronoFeed.renderStats()}

      <div class="filter-chips mb-md" style="margin-top: 12px;">
        <button class="feed-filter ${this._chronoFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
        <button class="feed-filter ${this._chronoFilter === 'violations' ? 'active' : ''}" data-filter="violations">Violations</button>
        <button class="feed-filter ${this._chronoFilter === 'passed' ? 'active' : ''}" data-filter="passed">Passed</button>
      </div>

      <div id="chrono-list">
        ${this.chronoFeed.renderEventList(this._chronoFilter)}
      </div>
    `;

    // Hook forms
    const chronoForm = document.getElementById('chrono-form');
    chronoForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleChronoSubmission();
    });

    // Hook chips
    panel.querySelectorAll('.feed-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this._chronoFilter = btn.dataset.filter;
        this._renderChronoPanel();
      });
    });

    // Hook logs click
    panel.querySelectorAll('.chrono-event').forEach(ev => {
      ev.addEventListener('click', () => {
        const player = this.engine.getPlayer(ev.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  _handleChronoSubmission() {
    const playerId = document.getElementById('ch-player').value;
    const fps = parseInt(document.getElementById('ch-fps').value);
    const joules = parseFloat(document.getElementById('ch-joules').value);
    const bbWeight = parseFloat(document.getElementById('ch-bb').value);

    const player = this.engine.getPlayer(playerId);
    if (!player) return;

    const tier = player.chrono?.tier || 'AEG';
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

    // Update player chrono properties
    player.chrono.fps = fps;
    player.chrono.joules = joules;
    player.chrono.bbWeight = bbWeight;
    player.chrono.status = status;
    player.compliance = compliance;

    if (compliance === 'BANNED') {
      player.status = 'OUT';
      player.isAlive = false;
    }

    // Create log record
    const newLog = {
      logId: `Log_${Date.now()}`,
      playerId,
      replica: player.gear.primary.name,
      fps,
      joules,
      bbWeight,
      status,
      marshallNote: `Re-chrono check at station. Tier: ${tier}.`,
      marshallAction: compliance === 'BANNED' ? 'EJECTED' : 'CLEARED'
    };

    this.engine.chronoEvents.unshift(newLog);

    // If violated, log violation incident
    if (compliance !== 'CLEARED') {
      const vtype = compliance === 'BANNED' ? 'JOULE_CREEP' : 'MED_VIOLATION';
      this.engine.gameEvents.push({
        type: 'violation',
        timestamp: new Date().toISOString(),
        playerId,
        playerCallsign: player.callsign,
        team: player.team,
        violationType: vtype,
        warningNumber: 1,
        maxWarnings: 1,
        zone: 'safe_zone',
        action: compliance === 'BANNED' ? 'EJECTED' : 'WARNING'
      });
    }

    this._rebuildEngines();
    this._updateUI();

    alert(`Log added. Status: ${status} (Compliance: ${compliance}) for ${player.callsign}.`);
  }

  // ─── Intel Tab (Leaderboards & Balance) ────────────────────

  _renderIntelPanel() {
    const panel = document.getElementById('panel-intel');
    if (!panel) return;

    panel.innerHTML = `
      <!-- subtabs navigation -->
      <div class="filter-chips mb-md" style="margin-top: 0;">
        <button class="feed-filter ${this._intelSubTab === 'leaderboard' ? 'active' : ''}" data-sub="leaderboard">Ranks</button>
        <button class="feed-filter ${this._intelSubTab === 'weapons' ? 'active' : ''}" data-sub="weapons">Weapons</button>
        <button class="feed-filter ${this._intelSubTab === 'balance' ? 'active' : ''}" data-sub="balance">Threat Balance</button>
      </div>

      <div class="intel-sub-content">
        ${this._renderIntelSubContent()}
      </div>
    `;

    // Subtab listeners
    panel.querySelectorAll('.feed-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this._intelSubTab = btn.dataset.sub;
        this._renderIntelPanel();
      });
    });

    // leaderboards metric listeners (if leaderboard active)
    panel.querySelectorAll('.lb-metric-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._leaderboardMetric = btn.dataset.metric;
        this._renderIntelPanel();
      });
    });

    // click on leaderboard row to open player modal
    panel.querySelectorAll('.lb-row').forEach(row => {
      row.addEventListener('click', () => {
        const player = this.engine.getPlayer(row.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  _renderIntelSubContent() {
    if (this._intelSubTab === 'leaderboard') {
      const metrics = ['kills', 'kd', 'objectives', 'revives'];
      const mLabels = { kills: 'Kills', kd: 'K/D Ratio', objectives: 'Objective Captures', revives: 'Revives' };
      return `
        <div class="lb-metrics-container" style="display: flex; gap: 4px; margin-bottom: 8px; justify-content: space-between;">
          ${metrics.map(m => `
            <button class="btn btn-secondary lb-metric-btn ${this._leaderboardMetric === m ? 'active' : ''}" 
                    data-metric="${m}" style="flex: 1; padding: 4px 2px; font-size: 0.7rem;">
              ${m.toUpperCase()}
            </button>
          `).join('')}
        </div>
        <div class="gb-section-title">${mLabels[this._leaderboardMetric]} Leaderboard</div>
        ${this.intel.renderLeaderboardHTML(this._leaderboardMetric)}
      `;
    } else if (this._intelSubTab === 'weapons') {
      return `
        <div class="gb-section-title">Replica Kill Distribution</div>
        ${this.intel.renderWeaponStatsHTML()}
      `;
    } else if (this._intelSubTab === 'balance') {
      return `
        <div class="gb-section-title">Team Threat Score (Fuzzy Logic)</div>
        ${this.balance.renderBalanceHTML()}
      `;
    }
  }

  // ─── Operations Tab (Timer, Kill Log, Incident Logger) ──────

  _renderOpsPanel() {
    const panel = document.getElementById('panel-ops');
    if (!panel) return;

    // Active players list
    const activePlayers = this.engine.players.filter(p => p.isAlive && p.compliance === 'CLEARED');
    const allPlayers = this.engine.players;
    const zones = this.engine.getZones();
    const vtypes = Object.entries(this.penalty.violationTypes);

    // Timer display
    const mins = Math.floor(this._timerSeconds / 60);
    const secs = this._timerSeconds % 60;
    const timerStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    panel.innerHTML = `
      <!-- Active Timer UI -->
      <div class="timer-card mb-md">
        <div class="timer-display" style="font-family: var(--font-mono); font-size: 2.2rem; font-weight: 800; text-align: center; color: var(--accent-green); text-shadow: 0 0 10px rgba(0, 255, 136, 0.3);">
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

      <!-- Quick Logger sections -->
      <div class="logger-container">
        <!-- 1. Kill Logger Form -->
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
                ${activePlayers.map(p => `<option value="${p.id}">${p.callsign} (${p.teamName})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="k-target">Target (Hit Player)</label>
              <select id="k-target" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Target --</option>
                ${activePlayers.map(p => `<option value="${p.id}">${p.callsign} (${p.teamName})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="k-zone">Zone of Engagement</label>
              <select id="k-zone" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Zone --</option>
                ${zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px;">Confirm Elimination</button>
          </form>
        </div>

        <!-- 2. Incident Logger Form -->
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
                ${allPlayers.map(p => `<option value="${p.id}">${p.callsign} (${p.teamName})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="v-type">Violation Type</label>
              <select id="v-type" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Infraction --</option>
                ${vtypes.map(([k, v]) => `<option value="${k}">${v.icon} ${v.label} (Max Warnings: ${v.maxWarnings})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="v-zone">Incident Zone</label>
              <select id="v-zone" style="width: 100%;" required>
                <option value="" disabled selected>-- Select Zone --</option>
                ${zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px;">Submit Incident Record</button>
          </form>
        </div>
      </div>

      <!-- Incident log feed -->
      <div class="gb-section" style="margin-top: 8px;">
        <div class="gb-section-title">Incidents & Penalty Log</div>
        ${this.penalty.renderIncidentLogHTML(12)}
      </div>
    `;

    // Collapsible handlers
    document.getElementById('toggle-kill-form')?.addEventListener('click', () => {
      const panelEl = document.getElementById('kill-form-panel');
      const chevEl = document.getElementById('kill-chevron');
      const isHidden = panelEl.classList.toggle('hidden');
      chevEl.textContent = isHidden ? '▼' : '▲';
    });

    document.getElementById('toggle-violation-form')?.addEventListener('click', () => {
      const panelEl = document.getElementById('violation-form-panel');
      const chevEl = document.getElementById('violation-chevron');
      const isHidden = panelEl.classList.toggle('hidden');
      chevEl.textContent = isHidden ? '▼' : '▲';
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

    // Row clicks inside incident list
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
        
        // Only render the timer element if we are on the ops tab
        if (this._activeTab === 'ops') {
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

  _handleKillSubmission() {
    const attackerId = document.getElementById('k-attacker').value;
    const targetId = document.getElementById('k-target').value;
    const zoneId = document.getElementById('k-zone').value;

    const attacker = this.engine.getPlayer(attackerId);
    const target = this.engine.getPlayer(targetId);

    if (!attacker || !target) return;
    if (attacker.team === target.team) {
      alert("Friendly fire eliminations are ignored on this tactical console!");
      return;
    }

    // Record stats
    attacker.stats.kills++;
    target.stats.deaths++;

    // Eliminate target
    target.status = 'ELIMINATED';
    target.isAlive = false;

    // Log elimination event
    this.engine.gameEvents.push({
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

    // Update game scores slightly
    if (attacker.team === 'alpha') {
      this.engine.gameSession.score.alpha += 5;
    } else {
      this.engine.gameSession.score.bravo += 5;
    }

    this._rebuildEngines();
    this._updateUI();

    alert(`Logged: ${attacker.callsign} eliminated ${target.callsign} in the ${zoneId.replace(/_/g, ' ')}.`);
  }

  _handleViolationSubmission() {
    const playerId = document.getElementById('v-player').value;
    const vtype = document.getElementById('v-type').value;
    const zoneId = document.getElementById('v-zone').value;

    const player = this.engine.getPlayer(playerId);
    if (!player) return;

    const action = this.penalty.computeAction(playerId, vtype);
    const warnings = this.penalty.getPlayerWarnings(playerId);
    const existingCount = warnings.find(w => w.type === vtype)?.count || 0;

    // Apply sanction
    player.warnings.push({ type: vtype, count: existingCount + 1 });

    if (action === 'EJECTED' || action === 'BANNED_FOR_DAY') {
      player.compliance = 'BANNED';
      player.status = 'OUT';
      player.isAlive = false;
    } else if (action !== 'WARNING') {
      // Temp bans
      player.compliance = 'FLAGGED';
      player.status = 'RESPAWNING'; // In penalty box
    }

    // Append event
    this.engine.gameEvents.push({
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

    alert(`Logged Violation: ${player.callsign} was issued ${action} for ${vtype.replace(/_/g, ' ')}.`);
  }

  // ─── Queries Panel ──────────────────────────────────────────

  _renderQueriesPanel() {
    const panel = document.getElementById('panel-queries');
    if (!panel) return;

    // Query matched players
    const players = this.engine.players.filter(p => {
      const f = this._queryFilters;
      if (f.team !== 'all' && p.team !== f.team) return false;
      if (f.role !== 'all' && p.role !== f.role) return false;
      if (f.compliance !== 'all' && p.compliance !== f.compliance) return false;
      if (f.powerSource !== 'all' && p.gear.primary.powerSource !== f.powerSource) return false;
      if (f.text) {
        const t = f.text.toLowerCase();
        const matchesText = p.name.toLowerCase().includes(t) ||
                            p.callsign.toLowerCase().includes(t) ||
                            p.id.toLowerCase().includes(t) ||
                            p.gear.primary.name.toLowerCase().includes(t) ||
                            (p.chrono?.tier || '').toLowerCase().includes(t);
        if (!matchesText) return false;
      }
      return true;
    });

    panel.innerHTML = `
      <div class="gb-section" style="margin-top: 0;">
        <div class="gb-section-title">Query Filters</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
          <input type="text" class="search-box" id="query-text" placeholder="Search keyword or tier..." value="${this._queryFilters.text}">
          
          <div class="detail-row" style="padding: 2px 0;">
            <span class="label">Team</span>
            <select class="search-box" id="query-team" style="width: 150px; padding: 4px;">
              <option value="all" ${this._queryFilters.team === 'all' ? 'selected' : ''}>All Teams</option>
              <option value="alpha" ${this._queryFilters.team === 'alpha' ? 'selected' : ''}>Alpha Force</option>
              <option value="bravo" ${this._queryFilters.team === 'bravo' ? 'selected' : ''}>Bravo Company</option>
            </select>
          </div>

          <div class="detail-row" style="padding: 2px 0;">
            <span class="label">Tactical Role</span>
            <select class="search-box" id="query-role" style="width: 150px; padding: 4px;">
              <option value="all" ${this._queryFilters.role === 'all' ? 'selected' : ''}>All Roles</option>
              <option value="Rifleman" ${this._queryFilters.role === 'Rifleman' ? 'selected' : ''}>Rifleman</option>
              <option value="Sniper" ${this._queryFilters.role === 'Sniper' ? 'selected' : ''}>Sniper</option>
              <option value="Support" ${this._queryFilters.role === 'Support' ? 'selected' : ''}>Support</option>
              <option value="Breacher" ${this._queryFilters.role === 'Breacher' ? 'selected' : ''}>Breacher</option>
              <option value="Medic" ${this._queryFilters.role === 'Medic' ? 'selected' : ''}>Medic</option>
              <option value="Commander" ${this._queryFilters.role === 'Commander' ? 'selected' : ''}>Commander</option>
            </select>
          </div>

          <div class="detail-row" style="padding: 2px 0;">
            <span class="label">Compliance</span>
            <select class="search-box" id="query-compliance" style="width: 150px; padding: 4px;">
              <option value="all" ${this._queryFilters.compliance === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="CLEARED" ${this._queryFilters.compliance === 'CLEARED' ? 'selected' : ''}>Cleared</option>
              <option value="FLAGGED" ${this._queryFilters.compliance === 'FLAGGED' ? 'selected' : ''}>Flagged</option>
              <option value="BANNED" ${this._queryFilters.compliance === 'BANNED' ? 'selected' : ''}>Banned</option>
            </select>
          </div>

          <div class="detail-row" style="padding: 2px 0;">
            <span class="label">Power Source</span>
            <select class="search-box" id="query-power" style="width: 150px; padding: 4px;">
              <option value="all" ${this._queryFilters.powerSource === 'all' ? 'selected' : ''}>All Sources</option>
              <option value="Electric (LiPo)" ${this._queryFilters.powerSource === 'Electric (LiPo)' ? 'selected' : ''}>Electric (LiPo)</option>
              <option value="Green Gas" ${this._queryFilters.powerSource === 'Green Gas' ? 'selected' : ''}>Green Gas</option>
              <option value="HPA (High Pressure Air)" ${this._queryFilters.powerSource === 'HPA (High Pressure Air)' ? 'selected' : ''}>HPA</option>
              <option value="Spring Action" ${this._queryFilters.powerSource === 'Spring Action' ? 'selected' : ''}>Spring Action</option>
            </select>
          </div>
        </div>
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Query Results (${players.length} matched)</div>
        <div id="query-results-list" style="max-height: 400px; overflow-y: auto;">
          ${players.length === 0 ? '<div style="font-size: 0.75rem; color: var(--text-muted); padding: 8px;">No matching records found.</div>' : players.map(p => this._renderPlayerCard(p)).join('')}
        </div>
      </div>
    `;

    // Wire filters
    panel.querySelector('#query-text').addEventListener('input', (e) => {
      this._queryFilters.text = e.target.value;
      this._renderQueriesPanel();
    });
    panel.querySelector('#query-team').addEventListener('change', (e) => {
      this._queryFilters.team = e.target.value;
      this._renderQueriesPanel();
    });
    panel.querySelector('#query-role').addEventListener('change', (e) => {
      this._queryFilters.role = e.target.value;
      this._renderQueriesPanel();
    });
    panel.querySelector('#query-compliance').addEventListener('change', (e) => {
      this._queryFilters.compliance = e.target.value;
      this._renderQueriesPanel();
    });
    panel.querySelector('#query-power').addEventListener('change', (e) => {
      this._queryFilters.powerSource = e.target.value;
      this._renderQueriesPanel();
    });

    // Wire card clicks
    panel.querySelectorAll('.player-card').forEach(card => {
      card.addEventListener('click', () => {
        const player = this.engine.getPlayer(card.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  // ─── Player Detail Overlay Modal ────────────────────────────

  _showPlayerDetail(player) {
    const overlay = document.getElementById('player-detail-overlay');
    const detail = document.getElementById('player-detail');
    if (!overlay || !detail) return;

    // Highlight map
    this.map.selectPlayer(player.id);

    const teamColor = player.team === 'alpha' ? 'var(--team-alpha)' : 'var(--team-bravo)';
    const teamClass = player.team === 'alpha' ? 'alpha' : 'bravo';
    const statusClass = player.compliance === 'CLEARED' ? 'cleared' :
                        player.compliance === 'FLAGGED' ? 'flagged' : 'banned';

    // Intel & Stats
    const stats = this.intel.getPlayerStats(player.id);

    // Active Warnings Log
    const pWarnings = this.penalty.getPlayerWarnings(player.id);
    const warningHTML = pWarnings.length === 0
      ? '<div style="font-size: 0.75rem; color: var(--text-muted);">No active warnings issued</div>'
      : pWarnings.map(w => `
          <div style="padding: 6px 8px; background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.2); border-radius: 6px; margin-bottom: 4px; font-size: 0.7rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-weight: 700; color: var(--accent-amber);">${w.icon} ${w.label}</span>
              <div style="color: var(--text-secondary); margin-top: 1px; font-size: 0.65rem;">Escalation action: ${w.escalationAction.replace(/_/g, ' ')}</div>
            </div>
            <span style="font-family: var(--font-mono); font-weight: bold; font-size: 0.75rem;">${w.count} / ${w.maxWarnings}</span>
          </div>
        `).join('');

    // Repair history
    const repairs = player.repairs || [];
    const repairHTML = repairs.length === 0
      ? '<div style="font-size: 0.75rem; color: var(--text-muted);">No tech repair records in Silo 3</div>'
      : repairs.slice(0, 3).map(r => `
          <div style="padding: 6px 8px; background: var(--bg-card); border-radius: 6px; margin-bottom: 4px; font-size: 0.7rem;">
            <div style="font-weight: 600; display: flex; justify-content: space-between;">
              <span>${r.repairId}</span>
              <span style="color: var(--accent-cyan); font-size: 0.65rem;">${r.date}</span>
            </div>
            <div style="color: var(--text-secondary); margin-top: 2px;">${r.diagnosis}</div>
            <div style="color: var(--accent-green); margin-top: 2px; font-size: 0.65rem;">Parts: ${r.partsInstalled}</div>
          </div>
        `).join('');

    detail.innerHTML = `
      <div class="detail-header">
        <div class="detail-avatar ${teamClass}" style="border-color: ${teamColor}; background: ${teamColor}22; color: ${teamColor}; font-weight: bold;">
          ${player.name.charAt(0)}
        </div>
        <div>
          <div class="detail-name">${player.name}</div>
          <div class="detail-callsign">${player.callsign} <span style="font-size: 0.7rem; font-weight: normal; color: var(--text-muted);">(${player.id})</span></div>
          <div style="margin-top: 4px; display: flex; gap: 4px;">
            <span class="status-badge ${statusClass}">${player.compliance}</span>
            <span class="status-badge" style="background: rgba(255,255,255,0.06); color: var(--text-heading); border: 1px solid var(--border-primary);">${player.status}</span>
          </div>
        </div>
      </div>

      <!-- Marshall Quick Actions Section inside modal -->
      <div class="detail-section" style="background: rgba(255, 51, 102, 0.04); border: 1px solid rgba(255, 51, 102, 0.15); border-radius: var(--radius-md); padding: 8px;">
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

        <div style="display: flex; gap: 6px;">
          <select id="modal-violation" class="search-box" style="flex: 1; padding: 4px; font-size: 0.75rem; height: 26px;">
            <option value="" disabled selected>-- Log Infraction --</option>
            <option value="BLIND_FIRE">Blind Fire</option>
            <option value="OVERSHOOT">Overshooting</option>
            <option value="DEAD_MAN_WALKING">Dead Man Walk/Talk</option>
            <option value="MED_VIOLATION">MED Infraction</option>
            <option value="EYE_PRO_REMOVED">Eye Pro Off</option>
            <option value="AGGRESSION">Physical Contact</option>
          </select>
          <button class="btn btn-secondary" id="modal-btn-violation" style="padding: 2px 8px; font-size: 0.7rem; height: 26px;">Issue</button>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Replica Details</div>
        <div class="detail-row"><span class="label">Replica</span><span class="value" style="font-family: var(--font-body);">${player.gear.primary.name}</span></div>
        <div class="detail-row"><span class="label">Tier / Med</span><span class="value" style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: bold; color: var(--accent-cyan);">${player.chrono.tier} (${player.chrono.med}m MED)</span></div>
        <div class="detail-row"><span class="label">Power Source</span><span class="value">${player.gear.primary.powerSource}</span></div>
        <div class="detail-row"><span class="label">FPS / Joules</span><span class="value" style="font-family: var(--font-mono);">${player.chrono.fps} FPS · ${player.chrono.joules} J (${player.chrono.bbWeight}g)</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Player Battle Stats</div>
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
        <div class="detail-row"><span class="label">Fav Weapon</span><span class="value" style="font-size: 0.7rem; font-family: var(--font-body);">${stats.favWeapon}</span></div>
        <div class="detail-row"><span class="label">Nemesis</span><span class="value" style="font-size: 0.7rem;">${stats.nemesis}</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Graduated Safety Warnings</div>
        ${warningHTML}
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Tech Repair Log (Silo 3)</div>
        ${repairHTML}
      </div>

      <button class="btn btn-secondary" style="width: 100%; margin-top: 12px;" id="close-detail">Close Console View</button>
    `;

    overlay.classList.add('visible');

    // Close listeners
    const closeModal = () => {
      overlay.classList.remove('visible');
      this.map.clearSelection();
    };

    document.getElementById('close-detail')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Quick Actions buttons
    document.getElementById('modal-btn-status')?.addEventListener('click', () => {
      const newStatus = document.getElementById('modal-status').value;
      player.status = newStatus;
      player.isAlive = newStatus === 'ACTIVE' || newStatus === 'RESPAWNING';
      if (newStatus === 'OUT') player.compliance = 'BANNED';

      this._rebuildEngines();
      this._updateUI();
      // Re-open detail modal to show update
      this._showPlayerDetail(player);
    });

    document.getElementById('modal-btn-violation')?.addEventListener('click', () => {
      const vtype = document.getElementById('modal-violation').value;
      if (!vtype) {
        alert("Please select a violation infraction!");
        return;
      }

      const action = this.penalty.computeAction(player.id, vtype);
      const warnings = this.penalty.getPlayerWarnings(player.id);
      const existingCount = warnings.find(w => w.type === vtype)?.count || 0;

      // Apply warn/ban
      player.warnings.push({ type: vtype, count: existingCount + 1 });

      if (action === 'EJECTED' || action === 'BANNED_FOR_DAY') {
        player.compliance = 'BANNED';
        player.status = 'OUT';
        player.isAlive = false;
      } else if (action !== 'WARNING') {
        player.compliance = 'FLAGGED';
        player.status = 'RESPAWNING';
      }

      this.engine.gameEvents.push({
        type: 'violation',
        timestamp: new Date().toISOString(),
        playerId: player.id,
        playerCallsign: player.callsign,
        team: player.team,
        violationType: vtype,
        warningNumber: existingCount + 1,
        maxWarnings: this.penalty.violationTypes[vtype]?.maxWarnings ?? 2,
        zone: 'safe_zone',
        action: action
      });

      this._rebuildEngines();
      this._updateUI();
      this._showPlayerDetail(player);
    });
  }

  // ─── Game Phase Overlay info ────────────────────────────────

  _renderGamePhase() {
    const session = this.engine.gameSession;
    if (!session) return;

    const currentPhase = session.phases[session.currentPhase];
    const badge = document.getElementById('game-phase-badge');
    if (badge) {
      badge.innerHTML = `
        <div class="dot"></div>
        <span>${currentPhase.name}</span>
        <span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem;">${currentPhase.startTime}</span>
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
          <div class="team-dot" style="background: var(--team-alpha);"></div>
          <div>
            <div class="team-name" style="color: var(--team-alpha);">Alpha</div>
            <div class="team-score text-green">${session.score.alpha}</div>
          </div>
        </div>
        <div class="score-divider"></div>
        <div class="score-team">
          <div>
            <div class="team-name" style="color: var(--team-bravo);">Bravo</div>
            <div class="team-score text-blue">${session.score.bravo}</div>
          </div>
          <div class="team-dot" style="background: var(--team-bravo);"></div>
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
      ${zone.rules.length > 0 ? `
        <ul class="zone-rules">
          ${zone.rules.map(r => `<li>${r}</li>`).join('')}
        </ul>
      ` : ''}
    `;

    // Position tooltip
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
    // Zoom map onto zone bounds for a detailed overview
  }

  // ─── Live Feed Filters ──────────────────────────────────────

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
          text = `<span class="highlight team-${e.attackerTeam}">${e.attackerCallsign}</span> eliminated <span class="highlight team-${e.targetTeam}">${e.targetCallsign}</span> <span class="text-muted">in ${e.zone.replace(/_/g, ' ')}</span>`;
          break;
        case 'objective_capture':
          icon = '🏴';
          text = `<span class="highlight team-${e.team}">${e.team.toUpperCase()}</span> captured <span class="highlight">${e.zone.replace(/_/g, ' ')}</span>`;
          break;
        case 'medic_revive':
          icon = '💚';
          text = `<span class="highlight team-${e.team}">${e.medicCallsign}</span> revived <span class="highlight team-${e.team}">${e.revivedCallsign}</span>`;
          break;
        case 'violation':
          icon = '⚠️';
          const actionClass = e.action === 'EJECTED' || e.action === 'BANNED_FOR_DAY' ? 'danger' : 'warn';
          text = `<span class="warn">${e.playerCallsign}</span>: <span class="danger">${e.violationType.replace(/_/g, ' ')}</span> → <span class="${actionClass}">${e.action.replace(/_/g, ' ')}</span>`;
          break;
        default:
          icon = '•';
          text = 'System event logged';
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

// ─── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const app = new AirOpsApp();
  app.init().catch(err => {
    console.error('AirOps init failed:', err);
    const label = document.querySelector('.loading-text');
    if (label) label.textContent = 'Error: ' + err.message;
  });
});
