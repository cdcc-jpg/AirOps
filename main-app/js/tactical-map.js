/**
 * AirOps — Tactical Map Renderer
 * Canvas-based tactical map with ResizeObserver, devicePixelRatio scaling,
 * and dynamic Priory theme token resolution via getComputedStyle.
 */

import { readPrioryThemeTokens, withAlpha, parseRgbTriplet } from './priory-semiotics.js?v=2.11.2';

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
    this.selectedZone = null;
    this.showHeatmap = false;
    this.showZoneLabels = true;
    this.showPlayerMarkers = true;
    this.showPaths = true;

    // Interaction state
    this._isDragging = false;
    this._lastMouse = { x: 0, y: 0 };
    this._mousePos = { x: 0, y: 0 };
    this._canvasWidth = 0;
    this._canvasHeight = 0;
    this._baseScale = 1;
    this._offsetX = 0;
    this._offsetY = 0;

    // Callbacks
    this.onZoneHover = null;
    this.onZoneClick = null;
    this.onPlayerClick = null;

    this._bindEvents();
    this._resize();

    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this._resizeObserver = new ResizeObserver(() => {
        this._resize();
        this._render();
      });
      this._resizeObserver.observe(this.canvas.parentElement);
    }

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
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._canvasWidth = rect.width;
    this._canvasHeight = rect.height;

    const fieldW = this.layout.field.width;
    const fieldH = this.layout.field.height;
    const scaleX = Math.max(0.1, (this._canvasWidth - 32) / fieldW);
    const scaleY = Math.max(0.1, (this._canvasHeight - 32) / fieldH);
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
    } else if (hoveredZone && this.onZoneHover) {
      this.onZoneHover(hoveredZone, this._mousePos);
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

  _onMouseUp() {
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

    const mx = this._mousePos.x;
    const my = this._mousePos.y;
    this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
    this.panY = my - (my - this.panY) * (newZoom / this.zoom);

    this.zoom = newZoom;
    this._render();
  }

  _onClick() {
    const mapPos = this._toMap(this._mousePos.x, this._mousePos.y);
    const s = this._baseScale * this.zoom;
    const hitRadius = 12 / s;

    for (const player of this.engine.players) {
      if (!player.position || player.position.x == null || player.position.y == null) continue;
      const dx = mapPos.x - player.position.x;
      const dy = mapPos.y - player.position.y;
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        this.selectedPlayer = player;
        if (this.onPlayerClick) this.onPlayerClick(player);
        this._render();
        return;
      }
    }

    if (this.hoveredZone) {
      this.selectedZone = this.hoveredZone;
      if (this.onZoneClick) this.onZoneClick(this.hoveredZone);
      this._render();
    }
  }

  // ─── Rendering ─────────────────────────────────────────────

  start() {
    this._render();
  }

  stop() {
    // Static event-driven rendering
  }

  _zoneSemanticColor(zone, tokens) {
    switch (zone.type) {
      case 'fortification': return tokens.statusWarn;
      case 'cqb': return tokens.sigils.role.fg;
      case 'outdoor': return tokens.statusClear;
      case 'elevated': return tokens.accentOchre;
      case 'nogo': return tokens.statusAvoid;
      case 'safe': return tokens.accentPrimary;
      case 'path': return tokens.borderStrong;
      default: return tokens.textMuted;
    }
  }

  _render() {
    if (this._canvasWidth <= 0 || this._canvasHeight <= 0) return;

    const ctx = this.ctx;
    const w = this._canvasWidth;
    const h = this._canvasHeight;
    const tokens = readPrioryThemeTokens(document);

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = tokens.bgCanvas;
    ctx.fillRect(0, 0, w, h);

    this._drawGrid(tokens);
    this._drawFieldBoundary(tokens);

    for (const zone of this.layout.zones) {
      this._drawZone(zone, tokens);
    }

    if (this.showPaths) {
      this._drawPaths(tokens);
    }

    this._drawTerrain(tokens);

    if (this.showHeatmap) {
      this._drawHeatmap(tokens);
    }

    this._drawObjectives(tokens);

    if (this.showPlayerMarkers) {
      this._drawPlayers(tokens);
    }

    if (this.showZoneLabels) {
      this._drawZoneLabels(tokens);
    }

    if (this.selectedZone) {
      this._drawZoneHighlight(this.selectedZone, tokens, false);
    }

    if (this.hoveredZone) {
      this._drawZoneHighlight(this.hoveredZone, tokens, true);
    }
  }

  _drawGrid(tokens) {
    const ctx = this.ctx;
    const gs = this.layout.field.gridSize;
    const fw = this.layout.field.width;
    const fh = this.layout.field.height;

    ctx.strokeStyle = withAlpha(tokens.borderSubtle, 0.55);
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

  _drawFieldBoundary(tokens) {
    const ctx = this.ctx;
    const tl = this._toScreen(0, 0);
    const br = this._toScreen(this.layout.field.width, this.layout.field.height);

    ctx.strokeStyle = tokens.borderStrong;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
  }

  _drawZone(zone, tokens) {
    const ctx = this.ctx;
    const b = zone.bounds;
    const tl = this._toScreen(b.x, b.y);
    const br = this._toScreen(b.x + b.w, b.y + b.h);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    const baseColor = this._zoneSemanticColor(zone, tokens);
    const alpha = Math.min(0.16, Math.max(0.06, zone.opacity || 0.1));

    ctx.fillStyle = withAlpha(baseColor, alpha);
    ctx.fillRect(tl.x, tl.y, w, h);

    ctx.strokeStyle = withAlpha(baseColor, 0.65);
    ctx.lineWidth = zone.type === 'indoor' || zone.type === 'objective' || zone.type === 'cqb' ? 1.5 : 1;

    if (zone.type === 'spawn' || zone.type === 'safe') {
      ctx.setLineDash([5, 3]);
    } else if (zone.type === 'objective') {
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([4, 2]);
    }

    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.setLineDash([]);
  }

  _drawZoneHighlight(zone, tokens, isHover) {
    const ctx = this.ctx;
    const b = zone.bounds;
    const tl = this._toScreen(b.x, b.y);
    const br = this._toScreen(b.x + b.w, b.y + b.h);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    const strokeColor = isHover ? tokens.accentPrimary : this._zoneSemanticColor(zone, tokens);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, w, h);
  }

  _drawPaths(tokens) {
    const ctx = this.ctx;
    if (!this.layout.paths) return;

    for (const path of this.layout.paths) {
      if (path.points.length < 2) continue;

      ctx.strokeStyle = withAlpha(tokens.textMuted, 0.32);
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

  _drawTerrain(tokens) {
    const ctx = this.ctx;
    if (!this.layout.terrain) return;

    for (const feature of this.layout.terrain) {
      if (feature.type === 'trees') {
        for (const [x, y] of feature.positions) {
          const p = this._toScreen(x, y);
          const s = 5 * this.zoom;

          ctx.fillStyle = withAlpha(tokens.statusClear, 0.25);
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = withAlpha(tokens.statusClear, 0.55);
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      } else if (feature.type === 'rocks') {
        for (const [x, y] of feature.positions) {
          const p = this._toScreen(x, y);
          const s = 4 * this.zoom;

          ctx.fillStyle = withAlpha(tokens.textMuted, 0.25);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, s * 1.2, s * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = withAlpha(tokens.borderStrong, 0.6);
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      } else if (feature.type === 'water') {
        const points = feature.path;
        if (points.length < 3) continue;

        ctx.fillStyle = withAlpha(tokens.accentPrimary, 0.16);
        ctx.strokeStyle = withAlpha(tokens.accentPrimary, 0.45);
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

  _drawObjectives(tokens) {
    const ctx = this.ctx;
    const objectives = this.engine.gameSession?.objectives || [];

    for (const obj of objectives) {
      const p = this._toScreen(obj.x, obj.y);
      const r = 8 * this.zoom;

      const objColor = obj.holder === 'nonband'
        ? tokens.teamAlpha
        : obj.holder === 'band'
          ? tokens.teamBravo
          : tokens.accentOchre;

      ctx.strokeStyle = withAlpha(objColor, 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = objColor;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r * 0.72, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r * 0.72, p.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = tokens.bgSurface1;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = tokens.textPrimary;
      ctx.font = `500 ${Math.max(11.5, 11.5 * this.zoom)}px ${tokens.fontSans}`;
      ctx.textAlign = 'center';
      ctx.fillText(obj.name, p.x, p.y - r - 6);
    }
  }

  _drawPlayers(tokens) {
    const ctx = this.ctx;

    for (const player of this.engine.players) {
      if (!player.position || player.position.x == null || player.position.y == null) continue;
      const p = this._toScreen(player.position.x, player.position.y);
      const r = 5.5 * this.zoom;
      const isSelected = this.selectedPlayer?.id === player.id;

      const color = player.team === 'band'
        ? tokens.teamBravo
        : player.team === 'nonband'
          ? tokens.accentPrimary
          : tokens.textMuted;

      if (!player.isAlive) {
        ctx.fillStyle = withAlpha(tokens.statusAvoid, 0.24);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = tokens.statusAvoid;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.5, p.y - r * 0.5);
        ctx.lineTo(p.x + r * 0.5, p.y + r * 0.5);
        ctx.moveTo(p.x + r * 0.5, p.y - r * 0.5);
        ctx.lineTo(p.x - r * 0.5, p.y + r * 0.5);
        ctx.stroke();
        continue;
      }

      if (isSelected) {
        ctx.strokeStyle = tokens.textPrimary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = withAlpha(color, 0.16);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = tokens.bgCanvas;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (player.compliance === 'FLAGGED') {
        ctx.fillStyle = tokens.statusWarn;
        ctx.fillRect(p.x + r - 2, p.y - r - 2, 5, 5);
      }
    }
  }

  _drawZoneLabels(tokens) {
    const ctx = this.ctx;

    for (const zone of this.layout.zones) {
      const b = zone.bounds;
      const center = this._toScreen(b.x + b.w / 2, b.y + b.h / 2);

      ctx.fillStyle = tokens.textSecondary;
      ctx.font = `500 ${Math.max(11.5, 11.5 * this.zoom)}px ${tokens.fontSans}`;
      ctx.textAlign = 'center';
      ctx.fillText(zone.name, center.x, center.y);

      if (zone.maxJoules > 0 && zone.type !== 'safe') {
        ctx.fillStyle = tokens.textMuted;
        ctx.font = `400 11.5px ${tokens.fontSans}`;
        ctx.fillText(`<=${zone.maxJoules}J`, center.x, center.y + 14);
      }
    }
  }

  _drawHeatmap(tokens) {
    const ctx = this.ctx;

    for (const player of this.engine.players) {
      if (!player.isAlive) continue;
      if (!player.position || player.position.x == null || player.position.y == null) continue;
      const p = this._toScreen(player.position.x, player.position.y);
      const r = 40 * this.zoom;

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const baseColor = player.team === 'band' ? tokens.teamBravo : tokens.accentPrimary;
      const rgb = parseRgbTriplet(baseColor);
      gradient.addColorStop(0, `rgba(${rgb}, 0.22)`);
      gradient.addColorStop(0.5, `rgba(${rgb}, 0.07)`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);

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
