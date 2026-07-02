/**
 * AirOps — Main Application Controller
 * Orchestrates all modules, handles routing between sidebar panels,
 * manages the live feed, and coordinates interactions.
 */

import { OntologyEngine } from './ontology-engine.js';
import { TacticalMap } from './tactical-map.js';
import { ChronoFeed } from './chrono-feed.js';
import { GameBuilder } from './game-builder.js';

class AirOpsApp {
  constructor() {
    this.engine = null;
    this.map = null;
    this.chronoFeed = null;
    this.gameBuilder = null;

    this._activeTab = 'players';
    this._chronoFilter = 'all';
    this._feedFilter = 'all';
    this._searchQuery = '';
    this._feedEventIndex = 0;
    this._feedInterval = null;
  }

  async init() {
    this._showLoading('Initializing ontology engine...', 10);

    // Load data
    this.engine = new OntologyEngine();
    await this.engine.load();
    this._showLoading('Building knowledge graph...', 40);

    // Init modules
    this.chronoFeed = new ChronoFeed(this.engine);
    this.gameBuilder = new GameBuilder(this.engine);
    this._showLoading('Rendering tactical map...', 60);

    // Init map
    const canvas = document.getElementById('tactical-map');
    this.map = new TacticalMap(canvas, this.engine);
    this._showLoading('Loading field layout...', 80);

    // Set up map callbacks
    this.map.onZoneHover = (zone, mousePos) => this._onZoneHover(zone, mousePos);
    this.map.onZoneClick = (zone) => this._onZoneClick(zone);
    this.map.onPlayerClick = (player) => this._showPlayerDetail(player);

    // Start map rendering
    this.map.start();
    this._showLoading('Systems online.', 100);

    // Set up UI
    this._setupTabs();
    this._setupMapControls();
    this._setupFeedFilters();
    this._renderActivePanel();
    this._renderGamePhase();
    this._renderScoreDisplay();
    this._startLiveFeed();

    // Hide loading after a brief delay
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
      case 'builder': this._renderBuilderPanel(); break;
      case 'aar': this._renderAARPanel(); break;
    }
  }

  // ─── Players Panel ─────────────────────────────────────────

  _renderPlayersPanel() {
    const panel = document.getElementById('panel-players');
    const players = this.engine.searchPlayers(this._searchQuery);

    const alphaPlayers = players.filter(p => p.team === 'alpha');
    const bravoPlayers = players.filter(p => p.team === 'bravo');

    panel.innerHTML = `
      <input type="text" class="search-box" id="player-search"
             placeholder="Search players, callsigns, gear..."
             value="${this._searchQuery}">

      <div class="filter-chips">
        <button class="filter-chip ${this._searchQuery === '' ? 'active' : ''}" data-filter="">All</button>
        <button class="filter-chip" data-filter="Sniper">Sniper</button>
        <button class="filter-chip" data-filter="Support">Support</button>
        <button class="filter-chip" data-filter="Breacher">Breacher</button>
        <button class="filter-chip" data-filter="Medic">Medic</button>
        <button class="filter-chip" data-filter="Commander">Cmdr</button>
      </div>

      <div class="gb-section-title" style="color: var(--team-alpha);">
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

    // Search handler
    const searchBox = document.getElementById('player-search');
    searchBox.addEventListener('input', (e) => {
      this._searchQuery = e.target.value;
      this._renderPlayersPanel();
    });

    // Filter chips
    panel.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._searchQuery = chip.dataset.filter;
        this._renderPlayersPanel();
      });
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

    return `
      <div class="player-card" data-player-id="${player.id}">
        <div class="player-avatar ${teamClass}">${initial}</div>
        <div class="player-info">
          <div class="player-name">${player.callsign}</div>
          <div class="player-meta">
            <span class="player-role">${player.role}</span>
            <span>·</span>
            <span>${player.gear.primary.name.substring(0, 20)}</span>
          </div>
        </div>
        <div class="status-badge ${statusClass}">${player.compliance === 'CLEARED' ? '✓' : player.compliance === 'FLAGGED' ? '!' : '✗'}</div>
      </div>
    `;
  }

  // ─── Player Detail Modal ───────────────────────────────────

  _showPlayerDetail(player) {
    const overlay = document.getElementById('player-detail-overlay');
    const detail = document.getElementById('player-detail');

    // Highlight on map
    this.map.selectPlayer(player.id);

    const teamClass = player.team === 'alpha' ? 'alpha' : 'bravo';
    const teamColor = player.team === 'alpha' ? 'var(--team-alpha)' : 'var(--team-bravo)';
    const statusClass = player.compliance === 'CLEARED' ? 'cleared' :
                        player.compliance === 'FLAGGED' ? 'flagged' : 'banned';

    // Violations
    const violationHTML = this.chronoFeed.renderViolationReport(player);

    // Repair history
    const repairs = player.repairs || [];
    const repairHTML = repairs.length === 0
      ? '<div style="font-size: 0.75rem; color: var(--text-muted);">No repair records</div>'
      : repairs.slice(0, 3).map(r => `
          <div style="padding: 6px 8px; background: var(--bg-card); border-radius: 6px; margin-bottom: 4px; font-size: 0.7rem;">
            <div style="font-weight: 600;">${r.repairId} — ${r.date}</div>
            <div style="color: var(--text-secondary); margin-top: 2px;">${r.diagnosis.substring(0, 80)}…</div>
            <div style="color: var(--accent-cyan); margin-top: 2px;">${r.partsInstalled}</div>
          </div>
        `).join('');

    detail.innerHTML = `
      <div class="detail-header">
        <div class="detail-avatar ${teamClass}" style="border-color: ${teamColor}; background: ${teamColor}22; color: ${teamColor};">
          ${player.name.charAt(0)}
        </div>
        <div>
          <div class="detail-name">${player.name}</div>
          <div class="detail-callsign">${player.callsign}</div>
          <div style="margin-top: 4px;">
            <span class="status-badge ${statusClass}">${player.compliance}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Identity</div>
        <div class="detail-row"><span class="label">Player ID</span><span class="value">${player.id}</span></div>
        <div class="detail-row"><span class="label">Team</span><span class="value" style="color: ${teamColor}">${player.teamName}</span></div>
        <div class="detail-row"><span class="label">Role</span><span class="value" style="font-family: var(--font-body);">${player.role}</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Primary Weapon</div>
        <div class="detail-row"><span class="label">Replica</span><span class="value" style="font-family: var(--font-body);">${player.gear.primary.name}</span></div>
        <div class="detail-row"><span class="label">Brand</span><span class="value" style="font-family: var(--font-body);">${player.gear.primary.brand}</span></div>
        <div class="detail-row"><span class="label">Power Source</span><span class="value" style="font-family: var(--font-body);">${player.gear.primary.powerSource}</span></div>
        <div class="detail-row"><span class="label">SKU</span><span class="value">${player.gear.primary.sku}</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Chrono Results</div>
        <div class="detail-row"><span class="label">Velocity</span><span class="value">${player.chrono.fps} fps</span></div>
        <div class="detail-row"><span class="label">Muzzle Energy</span><span class="value">${player.chrono.joules} J</span></div>
        <div class="detail-row"><span class="label">BB Weight</span><span class="value">${player.chrono.bbWeight}g</span></div>
        <div class="detail-row"><span class="label">Status</span><span class="value" style="color: ${player.compliance === 'CLEARED' ? 'var(--status-pass)' : player.compliance === 'FLAGGED' ? 'var(--status-warn)' : 'var(--status-fail)'};">${player.chrono.status}</span></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">SHACL Compliance Validation</div>
        ${violationHTML}
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Repair History (Silo 3)</div>
        ${repairHTML}
      </div>

      <button class="btn btn-secondary" style="width: 100%; margin-top: 8px;" id="close-detail">Close</button>
    `;

    overlay.classList.add('visible');

    document.getElementById('close-detail').addEventListener('click', () => {
      overlay.classList.remove('visible');
      this.map.clearSelection();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
        this.map.clearSelection();
      }
    });
  }

  // ─── Chrono Panel ──────────────────────────────────────────

  _renderChronoPanel() {
    const panel = document.getElementById('panel-chrono');

    panel.innerHTML = `
      ${this.chronoFeed.renderStats()}

      <div class="filter-chips mb-md">
        <button class="feed-filter ${this._chronoFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
        <button class="feed-filter ${this._chronoFilter === 'violations' ? 'active' : ''}" data-filter="violations">Violations</button>
        <button class="feed-filter ${this._chronoFilter === 'passed' ? 'active' : ''}" data-filter="passed">Passed</button>
      </div>

      <div id="chrono-list">
        ${this.chronoFeed.renderEventList(this._chronoFilter)}
      </div>
    `;

    // Filter handlers
    panel.querySelectorAll('.feed-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this._chronoFilter = btn.dataset.filter;
        this._renderChronoPanel();
      });
    });

    // Event click handlers
    panel.querySelectorAll('.chrono-event').forEach(ev => {
      ev.addEventListener('click', () => {
        const player = this.engine.getPlayer(ev.dataset.playerId);
        if (player) this._showPlayerDetail(player);
      });
    });
  }

  // ─── Game Builder Panel ────────────────────────────────────

  _renderBuilderPanel() {
    const panel = document.getElementById('panel-builder');

    panel.innerHTML = `
      ${this.gameBuilder.renderGameMode()}

      <div class="gb-section">
        <div class="gb-section-title">Role Composition</div>
        ${this.gameBuilder.renderTeamComposition()}
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Gear Distribution</div>
        ${this.gameBuilder.renderGearDistribution()}
      </div>

      ${this.gameBuilder.renderBalanceScore()}

      <div class="gb-section">
        <div class="gb-section-title">Game Day Schedule</div>
        <div class="schedule-timeline">
          ${this.gameBuilder.renderSchedule()}
        </div>
      </div>
    `;
  }

  // ─── AAR Panel ─────────────────────────────────────────────

  _renderAARPanel() {
    const panel = document.getElementById('panel-aar');
    const events = this.engine.gameEvents;

    const eliminations = events.filter(e => e.type === 'elimination');
    const captures = events.filter(e => e.type === 'objective_capture');
    const violations = events.filter(e => e.type === 'violation');
    const revives = events.filter(e => e.type === 'medic_revive');

    // Kill leaderboard
    const killCounts = {};
    for (const e of eliminations) {
      killCounts[e.attackerCallsign] = (killCounts[e.attackerCallsign] || 0) + 1;
    }
    const topKillers = Object.entries(killCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    panel.innerHTML = `
      <div class="section-header">
        <h2>After-Action Review</h2>
      </div>

      <div class="aar-stat-grid">
        <div class="aar-stat">
          <div class="stat-value text-red">${eliminations.length}</div>
          <div class="stat-label">Eliminations</div>
        </div>
        <div class="aar-stat">
          <div class="stat-value text-amber">${captures.length}</div>
          <div class="stat-label">Captures</div>
        </div>
        <div class="aar-stat">
          <div class="stat-value text-green">${revives.length}</div>
          <div class="stat-label">Revives</div>
        </div>
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Top Eliminations</div>
        ${topKillers.map(([callsign, count], i) => `
          <div class="detail-row">
            <span class="label">${i + 1}. ${callsign}</span>
            <span class="value text-red">${count}</span>
          </div>
        `).join('')}
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Violations (${violations.length})</div>
        ${violations.map(v => `
          <div class="aar-event">
            <div class="aar-time">${new Date(v.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="aar-icon">⚠️</div>
            <div class="aar-desc">
              <span class="highlight">${v.playerCallsign}</span> —
              <span class="text-amber">${v.violationType.replace(/_/g, ' ')}</span>
              in ${v.zone.replace(/_/g, ' ')} →
              <span class="${v.action === 'EJECTED' ? 'text-red' : 'text-amber'}">${v.action}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="gb-section">
        <div class="gb-section-title">Full Game Timeline</div>
        ${events.slice(0, 20).map(e => this._renderAAREvent(e)).join('')}
        ${events.length > 20 ? `<div style="font-size: 0.7rem; color: var(--text-muted); padding: 8px 0;">... and ${events.length - 20} more events</div>` : ''}
      </div>
    `;
  }

  _renderAAREvent(event) {
    const time = new Date(event.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    let icon, desc;
    switch (event.type) {
      case 'elimination':
        icon = '💀';
        desc = `<span class="team-${event.attackerTeam}">${event.attackerCallsign}</span> eliminated <span class="team-${event.targetTeam}">${event.targetCallsign}</span> in ${event.zone.replace(/_/g, ' ')}`;
        break;
      case 'objective_capture':
        icon = '🏴';
        desc = `<span class="team-${event.team}">${event.team.toUpperCase()}</span> captured <span class="highlight">${event.zone.replace(/_/g, ' ')}</span>`;
        break;
      case 'medic_revive':
        icon = '💚';
        desc = `<span class="team-${event.team}">${event.medicCallsign}</span> revived <span class="team-${event.team}">${event.revivedCallsign}</span>`;
        break;
      case 'violation':
        icon = '⚠️';
        desc = `<span class="warn">${event.playerCallsign}</span>: ${event.violationType.replace(/_/g, ' ')} → <span class="${event.action === 'EJECTED' ? 'danger' : 'warn'}">${event.action}</span>`;
        break;
      default:
        icon = '•';
        desc = JSON.stringify(event);
    }

    return `
      <div class="aar-event">
        <div class="aar-time">${time}</div>
        <div class="aar-icon">${icon}</div>
        <div class="aar-desc">${desc}</div>
      </div>
    `;
  }

  // ─── Map UI ────────────────────────────────────────────────

  _renderGamePhase() {
    const session = this.engine.gameSession;
    if (!session) return;

    const currentPhase = session.phases[session.currentPhase];
    const badge = document.getElementById('game-phase-badge');
    if (badge) {
      badge.innerHTML = `
        <div class="dot"></div>
        <span>${currentPhase.name}</span>
        <span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.7rem;">${currentPhase.startTime}</span>
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

    // Keep tooltip on screen
    if (x + 260 > rect.width) x = mousePos.x - 270;
    if (y + 200 > rect.height) y = mousePos.y - 210;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('visible');
  }

  _onZoneClick(zone) {
    // Could open a zone detail panel in the future
  }

  // ─── Live Feed ─────────────────────────────────────────────

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

  _startLiveFeed() {
    this._renderFeedEntries();

    // Simulate live events by revealing them one at a time
    this._feedEventIndex = 0;
    this._feedInterval = setInterval(() => {
      this._feedEventIndex++;
      if (this._feedEventIndex >= this.engine.gameEvents.length) {
        this._feedEventIndex = 0;
      }
      this._renderFeedEntries();
    }, 4000);
  }

  _renderFeedEntries() {
    const container = document.getElementById('feed-entries');
    if (!container) return;

    let events = [...this.engine.gameEvents];

    // Filter
    if (this._feedFilter !== 'all') {
      events = events.filter(e => e.type === this._feedFilter);
    }

    // Show up to feedEventIndex
    const visible = events.slice(0, Math.min(this._feedEventIndex + 1, events.length));
    visible.reverse(); // newest first

    container.innerHTML = visible.slice(0, 15).map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
          text = `<span class="warn">${e.playerCallsign}</span>: <span class="danger">${e.violationType.replace(/_/g, ' ')}</span> → ${e.action}`;
          break;
        default:
          icon = '•';
          text = 'Unknown event';
      }

      return `
        <div class="feed-entry">
          <div class="feed-time">${time}</div>
          <div class="feed-icon">${icon}</div>
          <div class="feed-text">${text}</div>
        </div>
      `;
    }).join('');

    // Auto-scroll to top
    container.scrollTop = 0;
  }
}

// ─── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const app = new AirOpsApp();
  app.init().catch(err => {
    console.error('AirOps init failed:', err);
    document.querySelector('.loading-text').textContent = 'Error: ' + err.message;
  });
});
