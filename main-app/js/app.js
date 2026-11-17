/**
 * AirOps v2.11 — Main Application Controller
 * High-density tactical workbench workflow:
 *   Phase 1: Gameday Setup & Weather Suggestions
 *   Phase 2: Roster Sign-In & Chrono Registration
 *   Phase 3: Active Game Operations & Matchmaking Analytics
 */

import { OntologyEngine } from './ontology-engine.js?v=2.11.2';
import { TacticalMap } from './tactical-map.js?v=2.11.2';
import { ChronoFeed } from './chrono-feed.js?v=2.11.2';
import { IntelEngine } from './intel.js?v=2.11.2';
import { PenaltyEngine } from './penalty-engine.js?v=2.11.2';
import { FuzzyBalanceEngine } from './fuzzy-balance.js?v=2.11.2';
import { MatchmakingEngine } from './matchmaking.js?v=2.11.2';
import { initOntologyVisualizer, openOntologyStudio } from './ontology-visualizer.js?v=2.11.2';
import { PRIORY_UI_ICONS, renderBfoSigilHtml, renderEpistemicSigilHtml } from './priory-semiotics.js?v=2.11.2';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class AirOpsApp {
  constructor() {
    this.engine = null;
    this.map = null;
    this.chronoFeed = null;
    this.intel = null;
    this.penalty = null;
    this.balance = null;
    this.matchmaker = null;

    this._activeTab = 'setup';
    this._feedFilter = 'all';
    this._selectedZone = null;
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

    this._shaclSummary = 'SHACL Ready';
  }

  async init() {
    this._showLoading('Initializing ontology engine...', 15);

    this.engine = new OntologyEngine();
    await this.engine.load();
    this._showLoading('Building intelligence graphs...', 40);

    for (const p of this.engine.players) {
      p.team = 'unassigned';
      p.teamName = 'Unassigned';
      p.teamColor = 'var(--team-unassigned)';
    }

    this.chronoFeed = new ChronoFeed(this.engine);
    this.intel = new IntelEngine(this.engine);
    this.penalty = new PenaltyEngine(this.engine);
    this.balance = new FuzzyBalanceEngine(this.engine, this.intel);
    this.matchmaker = new MatchmakingEngine(this.engine, this.intel);
    this._optimizedGameday = {
      weather: 'Dry',
      marshallCount: 3,
      enrolledPlayersCount: this.engine.players.length,
      marshallRatio: '0.000',
      suggestedMode: 'Full Site Domination',
      modeReason: 'Initializing...',
      warnings: []
    };
    await this._updateMatchmakingSuggestions();
    this._showLoading('Rendering tactical control map...', 70);

    const canvas = document.getElementById('tactical-map');
    this.map = new TacticalMap(canvas, this.engine);
    this._showLoading('Control panel online.', 100);

    this.map.onZoneHover = (zone, mousePos) => this._onZoneHover(zone, mousePos);
    this.map.onZoneClick = (zone) => this._onZoneClick(zone);
    this.map.onPlayerClick = (player) => this._showPlayerDetail(player);

    this.map.start();

    this._setupTabs();
    this._setupMapControls();
    this._setupFeedFilters();
    this._setupTimer();
    initOntologyVisualizer();
    this._updateUI();

    setTimeout(() => {
      document.getElementById('loading-screen')?.classList.add('hidden');
    }, 350);
  }

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

  _updateUI() {
    this._renderActivePanel();
    this._renderGamePhase();
    this._renderScoreDisplay();
    this._renderFeedEntries();
    this._renderZoneInspector(this._selectedZone);
    this._renderStatusBar();
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

    const mapArea = document.getElementById('map-area');
    const liveFeed = document.getElementById('live-feed');
    const advisorView = document.getElementById('replica-advisor-view');

    if (this._activeTab === 'advisor') {
      if (mapArea) mapArea.style.display = 'none';
      if (liveFeed) liveFeed.style.display = 'none';
      if (advisorView) advisorView.style.display = 'flex';
    } else {
      if (mapArea) mapArea.style.display = 'flex';
      if (liveFeed) liveFeed.style.display = 'flex';
      if (advisorView) advisorView.style.display = 'none';
      if (this.map) {
        this.map._resize();
        this.map._render();
      }
    }

    switch (this._activeTab) {
      case 'setup': this._renderSetupPanel(); break;
      case 'signin': this._renderSignInPanel(); break;
      case 'gameview': this._renderGameviewPanel(); break;
      case 'queries': this._renderQueriesPanel(); break;
      case 'ontology': openOntologyStudio(); break;
    }
  }

  // ─── Phase 1: Setup Panel ──────────────────────────────────

  _renderSetupPanel() {
    const panel = document.getElementById('panel-setup');
    if (!panel) return;

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
    const ratioDenom = opt.marshallCount > 0 ? Math.round((opt.enrolledPlayersCount || 0) / opt.marshallCount) : 0;

    panel.innerHTML = `
      <div class="wb-sec-hdr">
        <span>1. Site Conditions Setup</span>
        <span class="tabular-nums">${this._setupLocked ? 'LOCKED' : 'EDIT'}</span>
      </div>
      <div class="wb-block-pad">
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
          <div class="form-group">
            <label for="se-marshalls">Marshalls Enrolled</label>
            <input type="number" id="se-marshalls" min="1" max="20" value="${opt.marshallCount}" ${this._setupLocked ? 'disabled' : ''}>
          </div>
          ${this._setupLocked
            ? `<button type="button" class="btn btn-secondary" id="btn-unlock-setup" style="width: 100%;">${PRIORY_UI_ICONS.unlock} Edit Setup</button>`
            : `<button type="button" class="btn btn-primary" id="btn-lock-setup" style="width: 100%;">${PRIORY_UI_ICONS.lock} Lock Conditions</button>`
          }
        </div>
      </div>

      <div class="wb-sec-hdr">
        <span>Ontology Decision Engine</span>
        <span class="tabular-nums">SPARQL</span>
      </div>
      <div class="wb-prop-row">
        <span class="wb-prop-key">Enrolled Players</span>
        <span class="wb-prop-val">${opt.enrolledPlayersCount || 0}</span>
      </div>
      <div class="wb-prop-row">
        <span class="wb-prop-key">Suggested Mode</span>
        <span class="wb-prop-val text-cyan" title="${escapeHtml(opt.suggestedMode || 'Full Site Domination')}">${escapeHtml(opt.suggestedMode || 'Full Site Domination')}</span>
      </div>
      <div class="wb-prop-row">
        <span class="wb-prop-key">Marshall Ratio</span>
        <span class="wb-prop-val">${opt.marshallRatio || '0.000'} (1:${ratioDenom})</span>
      </div>
      <div class="wb-epistemic-row">
        ${renderEpistemicSigilHtml('entailed', 'Entailed site recommendation')}
        <span class="text-muted">${escapeHtml(opt.modeReason || '')}</span>
      </div>

      ${warnings.length > 0 ? `
        <div class="wb-sec-hdr">
          <span class="text-red">Warnings &amp; Constraints</span>
          <span class="tabular-nums">${warnings.length}</span>
        </div>
        ${warnings.map(w => `
          <div class="wb-epistemic-row">
            ${renderEpistemicSigilHtml('entailed', 'Safety constraint')}
            <span class="text-red">${escapeHtml(w)}</span>
          </div>
        `).join('')}
      ` : ''}
    `;

    document.getElementById('btn-lock-setup')?.addEventListener('click', async () => {
      this._setupLocked = true;
      this._gamedayConditions.weather = document.getElementById('se-weather').value;
      this._gamedayConditions.marshallCount = parseInt(document.getElementById('se-marshalls').value, 10);
      await this._updateMatchmakingSuggestions();
      this._updateUI();
      document.querySelector('.sidebar-tab[data-tab="signin"]')?.click();
    });

    document.getElementById('btn-unlock-setup')?.addEventListener('click', () => {
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
        <button type="button" class="checkin-toggle" id="btn-toggle-checkin">
          <span>Register Arriving Player</span>
          <span id="checkin-chevron">+</span>
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
              <input type="text" id="ci-replica" required placeholder="Tokyo Marui VSR-10">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
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
                <label for="ci-fps">FPS (0.2g)</label>
                <input type="number" id="ci-fps" required min="0" max="600" value="330">
              </div>
              <div class="form-group">
                <label for="ci-joules">Joules</label>
                <input type="number" id="ci-joules" step="0.01" required min="0" max="4" value="1.0">
              </div>
              <div class="form-group">
                <label for="ci-bb">BB (g)</label>
                <input type="number" id="ci-bb" step="0.01" required value="0.2">
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px;">Log Chrono &amp; Check-In</button>
          </form>
        </div>
      </div>

      <div class="wb-block-pad" style="border-bottom: 1px solid var(--border-subtle);">
        <button type="button" class="btn btn-primary" id="btn-run-matchmaking" style="width: 100%;">
          Auto-Balance &amp; Suggest Teams
        </button>
      </div>

      <div class="wb-sec-hdr">
        <span>Unassigned Pool</span>
        <span class="tabular-nums">${unassigned.length}</span>
      </div>
      <div id="unassigned-pool" style="max-height: 220px; overflow-y: auto;">
        ${unassigned.map(p => this._renderSignRosterCard(p)).join('')}
      </div>

      ${checkedIn.length > 0 ? `
        <div class="wb-sec-hdr">
          <span class="text-green">Assigned Roster</span>
          <span class="tabular-nums">${checkedIn.length}</span>
        </div>
        <div id="assigned-pool" style="max-height: 200px; overflow-y: auto;">
          ${checkedIn.map(p => this._renderSignRosterCard(p)).join('')}
        </div>
      ` : ''}

      ${banned.length > 0 ? `
        <div class="wb-sec-hdr">
          <span class="text-red">Banned / Non-Compliant</span>
          <span class="tabular-nums">${banned.length}</span>
        </div>
        <div id="banned-pool" style="max-height: 150px; overflow-y: auto;">
          ${banned.map(p => this._renderSignRosterCard(p)).join('')}
        </div>
      ` : ''}
    `;

    const toggleBtn = document.getElementById('btn-toggle-checkin');
    const formPanel = document.getElementById('checkin-form-panel');
    const chevron = document.getElementById('checkin-chevron');
    toggleBtn?.addEventListener('click', () => {
      const isHidden = formPanel.classList.toggle('hidden');
      if (chevron) chevron.textContent = isHidden ? '+' : '-';
    });

    document.getElementById('checkin-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handlePlayerCheckIn();
    });

    document.getElementById('btn-run-matchmaking')?.addEventListener('click', () => {
      this._handleMatchmakingTrigger();
    });

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
    const tier = player.chrono?.tier || 'AEG';
    const statusLabel = player.compliance === 'CLEARED' ? 'OK' : player.compliance === 'FLAGGED' ? 'WARN' : 'OUT';
    const isSelected = this.map?.selectedPlayer?.id === player.id;

    return `
      <div class="player-card ${isSelected ? 'selected' : ''}" data-player-id="${player.id}" title="${escapeHtml(player.callsign)} · ${escapeHtml(player.role)} · ${escapeHtml(tier)}">
        ${renderBfoSigilHtml('ind')}
        <div class="player-info">
          <span class="player-name">${escapeHtml(player.callsign)}</span>
          <span class="player-meta">${escapeHtml(tier)} · ${escapeHtml(player.teamName)}</span>
        </div>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
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
    const fps = parseInt(document.getElementById('ci-fps').value, 10);
    const joules = parseFloat(document.getElementById('ci-joules').value);
    const bbWeight = parseFloat(document.getElementById('ci-bb').value);

    const nextId = `P_${this.engine.players.length + 1}`;
    const callsign = `${callsignName}-${this.engine.players.length + 1}`;

    let tier = 'AEG';
    if (replicaName.toLowerCase().includes('vsr') || replicaName.toLowerCase().includes('sniper') || role === 'Sniper') {
      tier = 'Bolt-Action';
    } else if (replicaName.toLowerCase().includes('dmr') || (role === 'Sniper' && fps > 350)) {
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
      team: 'unassigned',
      teamName: 'Unassigned',
      teamColor: 'var(--team-unassigned)',
      role,
      status: compliance === 'BANNED' ? 'OUT' : 'ACTIVE',
      gear: {
        primary: {
          name: replicaName,
          sku: `SKU-${Math.floor(Math.random() * 90000) + 10000}`,
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
      position: null,
      isAlive: compliance !== 'BANNED',
      warnings: [],
      stats: { kills: 0, deaths: 0, assists: 0, objectiveCaptures: 0, revives: 0 }
    };

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
  }

  async _handleMatchmakingTrigger() {
    const eligible = this.engine.players.filter(p => p.compliance !== 'BANNED' && p.status !== 'OUT');
    if (eligible.length === 0) {
      alert('No checked-in, eligible players in the pool.');
      return;
    }

    const rosters = await this.matchmaker.generateTeams(
      eligible,
      this._gamedayConditions.weather,
      this._gamedayConditions.marshallCount
    );

    if (!rosters) {
      alert('Matchmaking execution failed on Python RDF backend.');
      return;
    }

    for (const p of this.engine.players) {
      if (rosters.nonband.includes(p.id)) {
        p.team = 'nonband';
        p.teamName = 'Non-Band';
        p.teamColor = 'var(--team-nonband)';
      } else if (rosters.band.includes(p.id)) {
        p.team = 'band';
        p.teamName = 'Band';
        p.teamColor = 'var(--team-band)';
      } else {
        p.team = 'unassigned';
        p.teamName = 'Unassigned';
        p.teamColor = 'var(--team-unassigned)';
      }
    }

    this._rebuildEngines();
    this._updateUI();
    document.querySelector('.sidebar-tab[data-tab="gameview"]')?.click();
  }

  // ─── Phase 3: Gameview Operations Panel ────────────────────

  _renderGameviewPanel() {
    const panel = document.getElementById('panel-gameview');
    if (!panel) return;

    const assignedCount = this.engine.players.filter(p => p.team !== 'unassigned').length;
    if (assignedCount === 0) {
      panel.innerHTML = `
        <div class="wb-sec-hdr"><span>Gameview Operations</span><span>OFFLINE</span></div>
        <div class="wb-epistemic-row">
          ${renderEpistemicSigilHtml('entailed', 'Roster assignment prerequisite')}
          <span class="text-muted">Complete Setup (Phase 1) and Auto-Balance Matchmaking (Phase 2) to populate active teams.</span>
        </div>
      `;
      return;
    }

    const nonband = this.engine.players.filter(p => p.team === 'nonband');
    const band = this.engine.players.filter(p => p.team === 'band');
    const elapsedMins = Math.floor(this._timerSeconds / 60);
    const elapsedSecs = this._timerSeconds % 60;
    const timerStr = `${elapsedMins.toString().padStart(2, '0')}:${elapsedSecs.toString().padStart(2, '0')}`;

    panel.innerHTML = `
      <div class="wb-sec-hdr"><span>Session Clock</span><span class="tabular-nums">${this._timerRunning ? 'LIVE' : 'PAUSED'}</span></div>
      <div class="timer-card">
        <div class="timer-display">${timerStr}</div>
        <div class="timer-controls">
          <button type="button" class="btn btn-primary" id="btn-timer-toggle">
            ${this._timerRunning ? `${PRIORY_UI_ICONS.pause} Pause` : `${PRIORY_UI_ICONS.play} Start`}
          </button>
          <button type="button" class="btn btn-secondary" id="btn-timer-reset">
            ${PRIORY_UI_ICONS.reset} Reset
          </button>
        </div>
      </div>

      <div class="wb-sec-hdr"><span>Team Telemetry Balance</span><span class="tabular-nums">${assignedCount}</span></div>
      <table class="wb-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th class="num">Non-Band</th>
            <th class="num">Band</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Players</td>
            <td class="num">${nonband.length}</td>
            <td class="num">${band.length}</td>
          </tr>
          <tr>
            <td>Avg Joules</td>
            <td class="num">${this.engine.getAverageJoules('nonband').toFixed(2)}J</td>
            <td class="num">${this.engine.getAverageJoules('band').toFixed(2)}J</td>
          </tr>
          <tr>
            <td>Snipers</td>
            <td class="num">${nonband.filter(p => p.role === 'Sniper').length}</td>
            <td class="num">${band.filter(p => p.role === 'Sniper').length}</td>
          </tr>
        </tbody>
      </table>

      <div class="wb-sec-hdr"><span>Team Threat Score (TTS)</span><span>Fuzzy</span></div>
      ${this.balance.renderBalanceHTML()}

      <div class="checkin-section">
        <button type="button" class="checkin-toggle" id="toggle-kill-form">
          <span>Record Elimination</span>
          <span id="kill-chevron">+</span>
        </button>
        <div class="checkin-form-container hidden" id="kill-form-panel">
          <form id="kill-form" class="chrono-form">
            <div class="form-group">
              <label for="k-attacker">Attacker</label>
              <select id="k-attacker" required>
                <option value="" disabled selected>-- Select Attacker --</option>
                ${this.engine.players.filter(p => p.isAlive && p.team !== 'unassigned').map(p => `<option value="${p.id}">${escapeHtml(p.callsign)} (${escapeHtml(p.teamName)})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="k-target">Target</label>
              <select id="k-target" required>
                <option value="" disabled selected>-- Select Target --</option>
                ${this.engine.players.filter(p => p.isAlive && p.team !== 'unassigned').map(p => `<option value="${p.id}">${escapeHtml(p.callsign)} (${escapeHtml(p.teamName)})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="k-zone">Zone</label>
              <select id="k-zone" required>
                <option value="" disabled selected>-- Select Zone --</option>
                ${this.engine.getZones().map(z => `<option value="${z.id}">${escapeHtml(z.name)}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Confirm Elimination</button>
          </form>
        </div>

        <button type="button" class="checkin-toggle" id="toggle-violation-form">
          <span>Log Rule Violation</span>
          <span id="violation-chevron">+</span>
        </button>
        <div class="checkin-form-container hidden" id="violation-form-panel">
          <form id="violation-form" class="chrono-form">
            <div class="form-group">
              <label for="v-player">Offending Player</label>
              <select id="v-player" required>
                <option value="" disabled selected>-- Select Player --</option>
                ${this.engine.players.map(p => `<option value="${p.id}">${escapeHtml(p.callsign)} (${escapeHtml(p.teamName)})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="v-type">Violation Type</label>
              <select id="v-type" required>
                <option value="" disabled selected>-- Select Infraction --</option>
                ${Object.entries(this.penalty.violationTypes).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)} (Max: ${v.maxWarnings})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="v-zone">Incident Zone</label>
              <select id="v-zone" required>
                <option value="" disabled selected>-- Select Zone --</option>
                ${this.engine.getZones().map(z => `<option value="${z.id}">${escapeHtml(z.name)}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Submit Incident Record</button>
          </form>
        </div>
      </div>

      <div class="wb-sec-hdr"><span>Incidents &amp; Violations</span><span class="tabular-nums">${this.penalty.getIncidentLog().length}</span></div>
      ${this.penalty.renderIncidentLogHTML(10)}
    `;

    document.getElementById('toggle-kill-form')?.addEventListener('click', () => {
      const pnl = document.getElementById('kill-form-panel');
      const chv = document.getElementById('kill-chevron');
      const isHidden = pnl.classList.toggle('hidden');
      if (chv) chv.textContent = isHidden ? '+' : '-';
    });

    document.getElementById('toggle-violation-form')?.addEventListener('click', () => {
      const pnl = document.getElementById('violation-form-panel');
      const chv = document.getElementById('violation-chevron');
      const isHidden = pnl.classList.toggle('hidden');
      if (chv) chv.textContent = isHidden ? '+' : '-';
    });

    document.getElementById('kill-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleKillSubmission();
    });

    document.getElementById('violation-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleViolationSubmission();
    });

    const toggleTimer = document.getElementById('btn-timer-toggle');
    toggleTimer?.addEventListener('click', () => {
      this._timerRunning = !this._timerRunning;
      toggleTimer.innerHTML = this._timerRunning ? `${PRIORY_UI_ICONS.pause} Pause` : `${PRIORY_UI_ICONS.play} Start`;
    });

    document.getElementById('btn-timer-reset')?.addEventListener('click', () => {
      this._timerRunning = false;
      this._timerSeconds = 45 * 60;
      this._renderGameviewPanel();
    });

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
      alert('Friendly fire is ignored.');
      return;
    }

    attacker.stats.kills++;
    target.stats.deaths++;
    target.status = 'ELIMINATED';
    target.isAlive = false;

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

    if (attacker.team === 'nonband') {
      this.engine.gameSession.score.nonband += 5;
    } else {
      this.engine.gameSession.score.band += 5;
    }

    this._rebuildEngines();
    this._updateUI();
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
      <div class="wb-sec-hdr">
        <span>SPARQL Editor</span>
        <span>rdflib</span>
      </div>
      <div class="wb-block-pad" style="border-bottom: 1px solid var(--border-subtle);">
        <textarea id="sparql-query-input" class="search-box" spellcheck="false">${escapeHtml(defaultQuery)}</textarea>
        <button type="button" class="btn btn-primary" id="btn-run-sparql" style="width: 100%; margin-top: 6px;">Execute SPARQL Query</button>
      </div>

      <div class="wb-sec-hdr">
        <span>Execution Output</span>
        <span id="sparql-status" class="tabular-nums">Ready</span>
      </div>
      <div id="sparql-results-container" style="max-height: 280px; overflow: auto;">
        <div class="wb-prop-row"><span class="wb-prop-key">Results</span><span class="wb-prop-val text-muted">None loaded</span></div>
      </div>
    `;

    document.getElementById('btn-run-sparql')?.addEventListener('click', async () => {
      const qInput = document.getElementById('sparql-query-input').value;
      const statusEl = document.getElementById('sparql-status');
      const resultsContainer = document.getElementById('sparql-results-container');

      statusEl.textContent = 'Running...';
      statusEl.style.color = 'var(--accent-primary)';

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
          statusEl.textContent = 'Error';
          statusEl.style.color = 'var(--status-avoid)';
          resultsContainer.innerHTML = `<pre style="padding:8px;color:var(--status-avoid);white-space:pre-wrap;"><code>${escapeHtml(data.error)}</code></pre>`;
          return;
        }

        statusEl.textContent = `${duration}ms · ${data.results.length} rows`;
        statusEl.style.color = 'var(--status-clear)';

        if (data.results.length === 0) {
          resultsContainer.innerHTML = `<div class="wb-prop-row"><span class="wb-prop-key">Results</span><span class="wb-prop-val text-muted">Empty result set</span></div>`;
          return;
        }

        let tableHTML = `<table class="wb-table"><thead><tr>`;
        for (const v of data.vars) {
          tableHTML += `<th>${escapeHtml(v)}</th>`;
        }
        tableHTML += `</tr></thead><tbody>`;

        for (const row of data.results) {
          tableHTML += `<tr>`;
          for (const v of data.vars) {
            const rawVal = row[v] || '';
            let val = rawVal;
            if (val.includes('#')) val = val.split('#')[1];
            const isNum = val !== '' && !Number.isNaN(Number(val));
            tableHTML += `<td class="${isNum ? 'num' : ''}" title="${escapeHtml(rawVal)}">${isNum ? escapeHtml(val) : `<code>${escapeHtml(val)}</code>`}</td>`;
          }
          tableHTML += `</tr>`;
        }
        tableHTML += `</tbody></table>`;
        resultsContainer.innerHTML = tableHTML;
      } catch (err) {
        statusEl.textContent = 'Failed';
        statusEl.style.color = 'var(--status-avoid)';
        resultsContainer.innerHTML = `<pre style="padding:8px;color:var(--status-avoid);"><code>${escapeHtml(err.message)}</code></pre>`;
      }
    });
  }

  // ─── Docked Right Inspector: Player Detail & Zone Telemetry ──

  _showPlayerDetail(player) {
    const overlay = document.getElementById('player-detail-overlay');
    const detail = document.getElementById('player-detail');
    if (!overlay || !detail) return;

    document.getElementById('app')?.classList.remove('wb-no-right');
    const titleEl = document.getElementById('inspector-pane-title');
    const metaEl = document.getElementById('inspector-pane-meta');
    if (titleEl) titleEl.textContent = 'Inspector · Player';
    if (metaEl) metaEl.textContent = player.id;

    this.map.selectPlayer(player.id);

    const statusClass = player.compliance === 'CLEARED' ? 'cleared' :
                        player.compliance === 'FLAGGED' ? 'flagged' : 'banned';

    const stats = this.intel.getPlayerStats(player.id);
    const pWarnings = this.penalty.getPlayerWarnings(player.id);
    const repairs = player.repairs || [];

    const warningHTML = pWarnings.length === 0
      ? `<div class="wb-prop-row"><span class="wb-prop-key">Warnings</span><span class="wb-prop-val text-muted">None issued</span></div>`
      : pWarnings.map(w => `
          <div class="wb-prop-row" title="${escapeHtml(w.escalationAction.replace(/_/g, ' '))}">
            <span class="wb-prop-key text-amber">${escapeHtml(w.label)}</span>
            <span class="wb-prop-val">${w.count} / ${w.maxWarnings} (${escapeHtml(w.escalationAction.replace(/_/g, ' '))})</span>
          </div>
        `).join('');

    const repairHTML = repairs.length === 0
      ? `<div class="wb-prop-row"><span class="wb-prop-key">Silo 3 Log</span><span class="wb-prop-val text-muted">No repairs</span></div>`
      : repairs.slice(0, 3).map(r => `
          <div class="wb-prop-row" title="${escapeHtml(r.diagnosis)}">
            <span class="wb-prop-key"><code>${escapeHtml(r.repairId)}</code> (${escapeHtml(r.date)})</span>
            <span class="wb-prop-val">${escapeHtml(r.diagnosis)}</span>
          </div>
        `).join('');

    detail.innerHTML = `
      <div class="detail-header">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          ${renderBfoSigilHtml('ind')}
          <div style="min-width:0;">
            <div class="detail-name">${escapeHtml(player.name)}</div>
            <div class="detail-callsign">${escapeHtml(player.callsign)} · <code>${escapeHtml(player.id)}</code></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="status-badge ${statusClass}">${escapeHtml(player.compliance)}</span>
          <button type="button" class="wb-icon-btn" id="close-detail" title="Clear player selection" aria-label="Clear player selection">&times;</button>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Replica &amp; Chrono</div>
        <div class="detail-row"><span class="label">Status</span><span class="value">${escapeHtml(player.status)}</span></div>
        <div class="detail-row"><span class="label">Team</span><span class="value team-${escapeHtml(player.team)}">${escapeHtml(player.teamName)}</span></div>
        <div class="detail-row"><span class="label">Role</span><span class="value">${escapeHtml(player.role)}</span></div>
        <div class="detail-row"><span class="label">Replica</span><span class="value" title="${escapeHtml(player.gear.primary.name)}">${escapeHtml(player.gear.primary.name)}</span></div>
        <div class="detail-row"><span class="label">Chrono Power</span><span class="value text-cyan">${player.chrono.fps} FPS · ${player.chrono.joules} J (${player.chrono.bbWeight}g)</span></div>
        <div class="detail-row"><span class="label">Tier / MED</span><span class="value">${escapeHtml(player.chrono.tier)} · ${player.chrono.med}m</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Telemetry Stats</div>
        <table class="wb-table">
          <thead>
            <tr>
              <th class="num">Kills</th>
              <th class="num">Deaths</th>
              <th class="num">K/D</th>
              <th class="num">Caps</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num text-green">${stats.kills}</td>
              <td class="num text-red">${stats.deaths}</td>
              <td class="num text-cyan">${stats.kd.toFixed(2)}</td>
              <td class="num">${stats.objectiveCaptures}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Marshall Live Control Console</div>
        <div class="wb-block-pad">
          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <select id="modal-status" style="flex: 1;">
              <option value="ACTIVE" ${player.status === 'ACTIVE' ? 'selected' : ''}>Status: ACTIVE</option>
              <option value="ELIMINATED" ${player.status === 'ELIMINATED' ? 'selected' : ''}>Status: ELIMINATED</option>
              <option value="RESPAWNING" ${player.status === 'RESPAWNING' ? 'selected' : ''}>Status: RESPAWNING</option>
              <option value="OUT" ${player.status === 'OUT' ? 'selected' : ''}>Status: OUT (BANNED)</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="modal-btn-status">Apply</button>
          </div>

          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <select id="modal-team" style="flex: 1;">
              <option value="unassigned" ${player.team === 'unassigned' ? 'selected' : ''}>Team: Unassigned</option>
              <option value="nonband" ${player.team === 'nonband' ? 'selected' : ''}>Team: Non-Band</option>
              <option value="band" ${player.team === 'band' ? 'selected' : ''}>Team: Band</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="modal-btn-team">Team</button>
          </div>

          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <select id="modal-violation" style="flex: 1;">
              <option value="" disabled selected>-- Log Infraction --</option>
              <option value="BLIND_FIRE">Blind Fire</option>
              <option value="OVERSHOOT">Overshooting</option>
              <option value="DEAD_MAN_WALKING">Dead Man Walk/Talk</option>
              <option value="MED_VIOLATION">MED Infraction</option>
              <option value="EYE_PRO_REMOVED">Eye Pro Off</option>
              <option value="AGGRESSION">Aggression / Fight</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="modal-btn-violation">Log</button>
          </div>

          <div style="display: flex; gap: 4px;">
            <input type="number" id="modal-fps" style="flex: 1;" placeholder="FPS" value="${player.chrono.fps}">
            <input type="number" id="modal-joules" step="0.01" style="flex: 1;" placeholder="Joules" value="${player.chrono.joules}">
            <button type="button" class="btn btn-primary btn-sm" id="modal-btn-chrono">Chrono</button>
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
    `;

    overlay.classList.add('visible');
    this._renderStatusBar(player);

    const closeModal = () => {
      overlay.classList.remove('visible');
      this.map.clearSelection();
      if (titleEl) titleEl.textContent = 'Inspector';
      if (metaEl) metaEl.textContent = 'Field & Telemetry';
      this._renderStatusBar();
    };

    document.getElementById('close-detail')?.addEventListener('click', closeModal);

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
      const fps = parseInt(document.getElementById('modal-fps').value, 10);
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

  _renderZoneInspector(zone) {
    const container = document.getElementById('zone-inspector');
    if (!container || !this.engine) return;

    const comp = this.engine.getComplianceBreakdown();
    const field = this.engine.fieldLayout?.field;
    const zones = this.engine.getZones();

    if (zone) {
      const playersInZone = this.engine.getPlayersInZone(zone.id);
      container.innerHTML = `
        <div class="wb-sec-hdr">
          <span style="display:flex;align-items:center;gap:5px;">${renderBfoSigilHtml(zone.type)} ${escapeHtml(zone.name)}</span>
          <span class="tabular-nums">${escapeHtml(zone.type)}</span>
        </div>
        <div class="wb-prop-row"><span class="wb-prop-key">Zone ID</span><span class="wb-prop-val"><code>${escapeHtml(zone.id)}</code></span></div>
        <div class="wb-prop-row"><span class="wb-prop-key">Max Joules</span><span class="wb-prop-val">${zone.maxJoules > 0 ? `${zone.maxJoules}J` : 'No Firing'}</span></div>
        <div class="wb-prop-row"><span class="wb-prop-key">Capacity</span><span class="wb-prop-val">${playersInZone.length} / ${zone.maxPlayers}</span></div>
        <div class="wb-sec-hdr"><span>Zone Rules</span><span class="tabular-nums">${(zone.rules || []).length}</span></div>
        ${(zone.rules || []).map(r => `
          <div class="wb-epistemic-row">
            ${renderEpistemicSigilHtml('entailed', 'Field rule')}
            <span>${escapeHtml(r)}</span>
          </div>
        `).join('')}
      `;
    } else {
      container.innerHTML = `
        <div class="wb-sec-hdr">
          <span>Field Overview</span>
          <span class="tabular-nums">${zones.length} Zones</span>
        </div>
        <div class="wb-prop-row"><span class="wb-prop-key">Venue</span><span class="wb-prop-val" title="${escapeHtml(field?.name || '')}">${escapeHtml(field?.name || 'Humber Quarry')}</span></div>
        <div class="wb-prop-row"><span class="wb-prop-key">Cleared</span><span class="wb-prop-val text-green">${comp.CLEARED}</span></div>
        <div class="wb-prop-row"><span class="wb-prop-key">Flagged</span><span class="wb-prop-val text-amber">${comp.FLAGGED}</span></div>
        <div class="wb-prop-row"><span class="wb-prop-key">Banned</span><span class="wb-prop-val text-red">${comp.BANNED}</span></div>
        <div class="wb-sec-hdr"><span>Chrono Compliance</span><span class="tabular-nums">${this.engine.players.length}</span></div>
        ${this.chronoFeed ? this.chronoFeed.renderStats() : ''}
        <div class="wb-sec-hdr"><span>Zones</span><span class="tabular-nums">${zones.length}</span></div>
        ${zones.map(z => `
          <div class="wb-tree-row zone-select-row" data-zone-id="${escapeHtml(z.id)}">
            ${renderBfoSigilHtml(z.type)}
            <span>${escapeHtml(z.name)}</span>
            <span class="wb-tree-count">${z.maxJoules > 0 ? `${z.maxJoules}J` : 'Safe'}</span>
          </div>
        `).join('')}
      `;

      container.querySelectorAll('.zone-select-row').forEach(row => {
        row.addEventListener('click', () => {
          const z = this.engine.getZoneById(row.dataset.zoneId);
          if (z) {
            this._selectedZone = z;
            if (this.map) {
              this.map.selectedZone = z;
              this.map._render();
            }
            this._renderZoneInspector(z);
          }
        });
      });
    }
  }

  // ─── Toolbar Phase, Score & Status Bar ──────────────────────

  _renderGamePhase() {
    const badge = document.getElementById('game-phase-badge');
    const topReadout = document.getElementById('top-phase-readout');
    let phaseLabel = 'Phase 1: Gameday Setup';
    if (this._activeTab === 'signin') phaseLabel = 'Phase 2: Chrono Sign-In Pool';
    else if (this._activeTab === 'gameview') phaseLabel = 'Phase 3: Active Gameday';
    else if (this._activeTab === 'queries') phaseLabel = 'SPARQL Query Workbench';
    else if (this._activeTab === 'advisor') phaseLabel = 'Replica Selection Advisor';

    if (badge) {
      badge.innerHTML = `<span class="dot"></span><span>${phaseLabel}</span>`;
    }
    if (topReadout) {
      topReadout.textContent = phaseLabel;
    }
  }

  _renderScoreDisplay() {
    const session = this.engine.gameSession;
    if (!session) return;

    const scoreEl = document.getElementById('score-display');
    if (scoreEl) {
      scoreEl.innerHTML = `
        <div class="score-team">
          <span class="team-dot" style="background: var(--team-nonband);"></span>
          <span class="team-name">Non-Band</span>
          <span class="team-score text-green">${session.score.nonband || 0}</span>
        </div>
        <div class="score-divider"></div>
        <div class="score-team">
          <span class="team-dot" style="background: var(--team-band);"></span>
          <span class="team-name">Band</span>
          <span class="team-score text-amber">${session.score.band || 0}</span>
        </div>
      `;
    }
  }

  _renderStatusBar(activePlayer = null) {
    const comp = this.engine.getComplianceBreakdown();
    const modeEl = document.getElementById('sb-mode');
    const rosterEl = document.getElementById('sb-roster');
    const compEl = document.getElementById('sb-compliance');
    const selEl = document.getElementById('sb-selection');
    const shaclEl = document.getElementById('sb-shacl');

    if (modeEl) modeEl.textContent = `Mode: ${this._activeTab}`;
    if (rosterEl) rosterEl.textContent = `Roster: ${this.engine.players.length} players`;
    if (compEl) compEl.textContent = `Cleared: ${comp.CLEARED} · Flagged: ${comp.FLAGGED} · Banned: ${comp.BANNED}`;
    if (selEl) {
      const player = activePlayer || this.map?.selectedPlayer;
      selEl.textContent = player
        ? `Selected: ${player.callsign} (${player.id})`
        : this._selectedZone
          ? `Zone: ${this._selectedZone.name}`
          : 'Field: Humber Quarry';
    }
    if (shaclEl) shaclEl.textContent = this._shaclSummary;
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
    if (!tooltip) return;

    if (!zone || !mousePos) {
      tooltip.classList.remove('visible');
      return;
    }

    const playersInZone = this.engine.getPlayersInZone(zone.id);

    tooltip.innerHTML = `
      <h4>${renderBfoSigilHtml(zone.type)} ${escapeHtml(zone.name)}</h4>
      <div class="zone-stat">
        <span class="label">Type</span>
        <span class="value">${escapeHtml(zone.type)}</span>
      </div>
      <div class="zone-stat">
        <span class="label">Max Joules</span>
        <span class="value">${zone.maxJoules > 0 ? `${zone.maxJoules}J` : 'N/A'}</span>
      </div>
      <div class="zone-stat">
        <span class="label">Occupancy</span>
        <span class="value">${playersInZone.length} / ${zone.maxPlayers}</span>
      </div>
    `;

    const wrap = document.getElementById('map-canvas-wrap') || document.getElementById('map-area');
    const rect = wrap.getBoundingClientRect();
    let x = mousePos.x + 14;
    let y = mousePos.y + 14;

    if (x + 220 > rect.width) x = Math.max(8, mousePos.x - 220);
    if (y + 130 > rect.height) y = Math.max(8, mousePos.y - 130);

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('visible');
  }

  _onZoneClick(zone) {
    this._selectedZone = zone;
    this._renderZoneInspector(zone);
    this._renderStatusBar();
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

      let iconHtml = renderBfoSigilHtml('proc');
      let text = 'Operational log entry recorded';

      switch (e.type) {
        case 'elimination': {
          iconHtml = renderBfoSigilHtml('proc', '', 'Elimination');
          const attackerTeamClass = e.attackerTeam === 'nonband' ? 'nonband' : 'band';
          const targetTeamClass = e.targetTeam === 'nonband' ? 'nonband' : 'band';
          text = `<span class="highlight team-${attackerTeamClass}">${escapeHtml(e.attackerCallsign)}</span> eliminated <span class="highlight team-${targetTeamClass}">${escapeHtml(e.targetCallsign)}</span> <span class="text-muted">in ${escapeHtml(e.zone.replace(/_/g, ' '))}</span>`;
          break;
        }
        case 'objective_capture': {
          iconHtml = renderBfoSigilHtml('role', '', 'Objective Capture');
          const teamLabel = e.team === 'nonband' ? 'NON-BAND' : 'BAND';
          text = `<span class="highlight team-${escapeHtml(e.team)}">${teamLabel}</span> captured <span class="highlight">${escapeHtml(e.zone.replace(/_/g, ' '))}</span>`;
          break;
        }
        case 'medic_revive': {
          iconHtml = renderBfoSigilHtml('ind', '', 'Medic Revive');
          text = `<span class="highlight team-${escapeHtml(e.team)}">${escapeHtml(e.medicCallsign)}</span> revived <span class="highlight team-${escapeHtml(e.team)}">${escapeHtml(e.revivedCallsign)}</span>`;
          break;
        }
        case 'violation': {
          iconHtml = renderBfoSigilHtml('qual', '', 'Rule Violation');
          const actionClass = e.action === 'EJECTED' || e.action === 'BANNED_FOR_DAY' ? 'danger' : 'warn';
          text = `<span class="warn">${escapeHtml(e.playerCallsign)}</span>: <span class="danger">${escapeHtml(e.violationType.replace(/_/g, ' '))}</span> -> <span class="${actionClass}">${escapeHtml(e.action.replace(/_/g, ' '))}</span>`;
          break;
        }
      }

      return `
        <div class="feed-entry">
          <div class="feed-time">${time}</div>
          <div class="feed-icon">${iconHtml}</div>
          <div class="feed-text">${text}</div>
        </div>
      `;
    }).join('');

    container.scrollTop = 0;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new AirOpsApp();
  app.init().catch(err => {
    console.error('AirOps init failed:', err);
    const label = document.querySelector('.loading-text');
    if (label) label.textContent = 'Error: ' + err.message;
  });
});
