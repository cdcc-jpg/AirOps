/**
 * AirOps — Tactical Map Renderer
 * Canvas-based tactical map with zones, player markers, objectives,
 * terrain features, and interactive overlays.
 */

export class TacticalMap {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.layout = engine.fieldLayout;

    // Map state
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.hoveredZone = null;
    this.selectedPlayer = null;
    this.showHeatmap = false;
    this.showZoneLabels = true;
    this.showPlayerMarkers = true;
    this.showPaths = true;

    // Interaction state
    this._isDragging = false;
    this._lastMouse = { x: 0, y: 0 };
    this._mousePos = { x: 0, y: 0 };
    this._animFrame = null;

    // Animation
    this._time = 0;
    this._playerPulse = new Map();

    // Callbacks
    this.onZoneHover = null;
    this.onZoneClick = null;
    this.onPlayerClick = null;

    this._bindEvents();
    this._resize();

    window.addEventListener('resize', () => {
      this._resize();
      this._render();
    });
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this._onMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    this._canvasWidth = rect.width;
    this._canvasHeight = rect.height;

    // Calculate scale to fit map
    const fieldW = this.layout.field.width;
    const fieldH = this.layout.field.height;
    const scaleX = (this._canvasWidth - 40) / fieldW;
    const scaleY = (this._canvasHeight - 40) / fieldH;
    this._baseScale = Math.min(scaleX, scaleY);
    this._offsetX = (this._canvasWidth - fieldW * this._baseScale) / 2;
    this._offsetY = (this._canvasHeight - fieldH * this._baseScale) / 2;
  }

  // ─── Coordinate transforms ─────────────────────────────────

  _toScreen(x, y) {
    const s = this._baseScale * this.zoom;
    return {
      x: x * s + this._offsetX + this.panX,
      y: y * s + this._offsetY + this.panY,
    };
  }

  _toMap(screenX, screenY) {
    const s = this._baseScale * this.zoom;
    return {
      x: (screenX - this._offsetX - this.panX) / s,
      y: (screenY - this._offsetY - this.panY) / s,
    };
  }

  // ─── Event handlers ────────────────────────────────────────

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (this._isDragging) {
      this.panX += (e.clientX - this._lastMouse.x);
      this.panY += (e.clientY - this._lastMouse.y);
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this._render();
      return;
    }

    // Check zone hover
    const mapPos = this._toMap(this._mousePos.x, this._mousePos.y);
    let hoveredZone = null;

    const zones = this.layout.zones;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      const b = z.bounds;
      if (mapPos.x >= b.x && mapPos.x <= b.x + b.w &&
          mapPos.y >= b.y && mapPos.y <= b.y + b.h) {
        hoveredZone = z;
        break;
      }
    }

    if (hoveredZone !== this.hoveredZone) {
      this.hoveredZone = hoveredZone;
      this.canvas.style.cursor = hoveredZone ? 'pointer' : 'crosshair';
      if (this.onZoneHover) this.onZoneHover(hoveredZone, this._mousePos);
      this._render();
    }
  }

  _onMouseDown(e) {
    if (e.button === 0) {
      this._isDragging = true;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
      this._render();
    }
  }

  _onMouseUp(e) {
    this._isDragging = false;
    this.canvas.style.cursor = this.hoveredZone ? 'pointer' : 'crosshair';
    this._render();
  }

  _onMouseLeave() {
    this._isDragging = false;
    this.hoveredZone = null;
    if (this.onZoneHover) this.onZoneHover(null, null);
    this._render();
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.max(0.5, Math.min(3, this.zoom * delta));

    // Zoom toward cursor
    const mx = this._mousePos.x;
    const my = this._mousePos.y;
    this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
    this.panY = my - (my - this.panY) * (newZoom / this.zoom);

    this.zoom = newZoom;
    this._render();
  }

  _onClick(e) {
    if (this.hoveredZone && this.onZoneClick) {
      this.onZoneClick(this.hoveredZone);
    }

    // Check player click
    const mapPos = this._toMap(this._mousePos.x, this._mousePos.y);
    const s = this._baseScale * this.zoom;
    const hitRadius = 12 / s;

    for (const player of this.engine.players) {
      const dx = mapPos.x - player.position.x;
      const dy = mapPos.y - player.position.y;
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        this.selectedPlayer = player;
        if (this.onPlayerClick) this.onPlayerClick(player);
        this._render();
        return;
      }
    }
  }

  // ─── Rendering ─────────────────────────────────────────────

  start() {
    this._render();
  }

  stop() {
    // No-op (animations disabled)
  }

  _render() {
    const ctx = this.ctx;
    const w = this._canvasWidth;
    const h = this._canvasHeight;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, w, h);

    // Grid
    this._drawGrid();

    // Field boundary
    this._drawFieldBoundary();

    // Zones
    for (const zone of this.layout.zones) {
      this._drawZone(zone);
    }

    // Paths
    if (this.showPaths) {
      this._drawPaths();
    }

    // Terrain
    this._drawTerrain();

    // Heatmap overlay
    if (this.showHeatmap) {
      this._drawHeatmap();
    }

    // Objectives
    this._drawObjectives();

    // Player markers
    if (this.showPlayerMarkers) {
      this._drawPlayers();
    }

    // Zone labels
    if (this.showZoneLabels) {
      this._drawZoneLabels();
    }

    // Hovered zone highlight
    if (this.hoveredZone) {
      this._drawZoneHighlight(this.hoveredZone);
    }
  }

  _drawGrid() {
    const ctx = this.ctx;
    const gs = this.layout.field.gridSize;
    const fw = this.layout.field.width;
    const fh = this.layout.field.height;

    ctx.strokeStyle = 'rgba(0, 255, 136, 0.04)';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= fw; x += gs) {
      const p1 = this._toScreen(x, 0);
      const p2 = this._toScreen(x, fh);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let y = 0; y <= fh; y += gs) {
      const p1 = this._toScreen(0, y);
      const p2 = this._toScreen(fw, y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  _drawFieldBoundary() {
    const ctx = this.ctx;
    const tl = this._toScreen(0, 0);
    const br = this._toScreen(this.layout.field.width, this.layout.field.height);

    ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
  }

  _drawZone(zone) {
    const ctx = this.ctx;
    const b = zone.bounds;
    const tl = this._toScreen(b.x, b.y);
    const br = this._toScreen(b.x + b.w, b.y + b.h);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    // Fill
    ctx.fillStyle = zone.color + Math.round(zone.opacity * 255).toString(16).padStart(2, '0');
    ctx.fillRect(tl.x, tl.y, w, h);

    // Border
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = zone.type === 'indoor' || zone.type === 'objective' ? 2 : 1;

    if (zone.type === 'spawn' || zone.type === 'safe') {
      ctx.setLineDash([6, 3]);
    } else if (zone.type === 'objective') {
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([4, 2]);
    }

    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.setLineDash([]);
  }

  _drawZoneHighlight(zone) {
    const ctx = this.ctx;
    const b = zone.bounds;
    const tl = this._toScreen(b.x, b.y);
    const br = this._toScreen(b.x + b.w, b.y + b.h);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    // Glow effect
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = zone.borderColor;
    ctx.shadowBlur = 12;
    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.shadowBlur = 0;
  }

  _drawPaths() {
    const ctx = this.ctx;
    if (!this.layout.paths) return;

    for (const path of this.layout.paths) {
      if (path.points.length < 2) continue;

      ctx.strokeStyle = 'rgba(160, 140, 100, 0.2)';
      ctx.lineWidth = path.width || 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      const p0 = this._toScreen(path.points[0][0], path.points[0][1]);
      ctx.moveTo(p0.x, p0.y);

      for (let i = 1; i < path.points.length; i++) {
        const p = this._toScreen(path.points[i][0], path.points[i][1]);
        ctx.lineTo(p.x, p.y);
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawTerrain() {
    const ctx = this.ctx;
    if (!this.layout.terrain) return;

    for (const feature of this.layout.terrain) {
      if (feature.type === 'trees') {
        for (const [x, y] of feature.positions) {
          const p = this._toScreen(x, y);
          const s = 6 * this.zoom;

          // Tree shadow
          ctx.fillStyle = 'rgba(30, 70, 20, 0.3)';
          ctx.beginPath();
          ctx.arc(p.x + 1, p.y + 1, s, 0, Math.PI * 2);
          ctx.fill();

          // Tree
          ctx.fillStyle = 'rgba(50, 120, 40, 0.5)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(70, 150, 50, 0.4)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      } else if (feature.type === 'rocks') {
        for (const [x, y] of feature.positions) {
          const p = this._toScreen(x, y);
          const s = 4 * this.zoom;

          ctx.fillStyle = 'rgba(100, 90, 80, 0.4)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, s * 1.2, s * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(140, 130, 110, 0.3)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      } else if (feature.type === 'water') {
        const points = feature.path;
        if (points.length < 3) continue;

        ctx.fillStyle = 'rgba(30, 60, 120, 0.25)';
        ctx.strokeStyle = 'rgba(60, 100, 180, 0.3)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        const p0 = this._toScreen(points[0][0], points[0][1]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < points.length; i++) {
          const p = this._toScreen(points[i][0], points[i][1]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  _drawObjectives() {
    const ctx = this.ctx;
    const objectives = this.engine.gameSession?.objectives || [];

    for (const obj of objectives) {
      const p = this._toScreen(obj.x, obj.y);
      const r = 10 * this.zoom;

      // Static outline ring
      const pulseR = r + 4;
      let ringColor;
      if (obj.holder === 'alpha') ringColor = 'rgba(0, 255, 136, 0.3)';
      else if (obj.holder === 'bravo') ringColor = 'rgba(68, 136, 255, 0.3)';
      else ringColor = 'rgba(255, 170, 0, 0.3)';

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // Diamond shape
      ctx.fillStyle = obj.holder === 'alpha' ? '#00ff88' :
                      obj.holder === 'bravo' ? '#4488ff' : '#ffaa00';

      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r * 0.7, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r * 0.7, p.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(8, 10 * this.zoom)}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(obj.name, p.x, p.y - r - 6);
    }
  }

  _drawPlayers() {
    const ctx = this.ctx;

    for (const player of this.engine.players) {
      const p = this._toScreen(player.position.x, player.position.y);
      const r = 5 * this.zoom;
      const isSelected = this.selectedPlayer?.id === player.id;

      // Team color
      const color = player.team === 'alpha' ? '#00ff88' : '#4488ff';
      const dimColor = player.team === 'alpha' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(68, 136, 255, 0.15)';

      // Dead/banned players
      if (!player.isAlive) {
        ctx.fillStyle = 'rgba(255, 51, 102, 0.3)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        // X mark
        ctx.strokeStyle = 'rgba(255, 51, 102, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.5, p.y - r * 0.5);
        ctx.lineTo(p.x + r * 0.5, p.y + r * 0.5);
        ctx.moveTo(p.x + r * 0.5, p.y - r * 0.5);
        ctx.lineTo(p.x - r * 0.5, p.y + r * 0.5);
        ctx.stroke();
        continue;
      }

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Outer glow
      ctx.fillStyle = dimColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
      ctx.fill();

      // Main dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Role icon (center dot)
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.max(6, 7 * this.zoom)}px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const roleInitial = player.role === 'Commander' ? '★' :
                           player.role === 'Sniper' ? '◎' :
                           player.role === 'Medic' ? '+' :
                           player.role === 'Support' ? '▪' :
                           player.role === 'Breacher' ? '▸' : '•';
      ctx.fillText(roleInitial, p.x, p.y);

      // Compliance indicator
      if (player.compliance === 'FLAGGED') {
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(p.x + r, p.y - r, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.textBaseline = 'alphabetic';
  }

  _drawZoneLabels() {
    const ctx = this.ctx;

    for (const zone of this.layout.zones) {
      const b = zone.bounds;
      const center = this._toScreen(b.x + b.w / 2, b.y + b.h / 2);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = `600 ${Math.max(7, 9 * this.zoom)}px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(zone.name, center.x, center.y);

      // Joule limit indicator
      if (zone.maxJoules > 0 && zone.type !== 'safe') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = `500 ${Math.max(6, 7 * this.zoom)}px 'JetBrains Mono', monospace`;
        ctx.fillText(`≤${zone.maxJoules}J`, center.x, center.y + 12 * this.zoom);
      }
    }
  }

  _drawHeatmap() {
    const ctx = this.ctx;
    const s = this._baseScale * this.zoom;

    for (const player of this.engine.players) {
      if (!player.isAlive) continue;
      const p = this._toScreen(player.position.x, player.position.y);
      const r = 40 * this.zoom;

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const color = player.team === 'alpha' ? '0, 255, 136' : '68, 136, 255';
      gradient.addColorStop(0, `rgba(${color}, 0.25)`);
      gradient.addColorStop(0.5, `rgba(${color}, 0.08)`);
      gradient.addColorStop(1, `rgba(${color}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── Public API ────────────────────────────────────────────

  toggleHeatmap() {
    this.showHeatmap = !this.showHeatmap;
    this._render();
  }

  toggleLabels() {
    this.showZoneLabels = !this.showZoneLabels;
    this._render();
  }

  togglePlayers() {
    this.showPlayerMarkers = !this.showPlayerMarkers;
    this._render();
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._render();
  }

  selectPlayer(playerId) {
    this.selectedPlayer = this.engine.getPlayer(playerId);
    this._render();
  }

  clearSelection() {
    this.selectedPlayer = null;
    this._render();
  }
}
