/**
 * AirOps — Canonical Priory Semiotics & Dynamic Theme Token Reader
 * Implements 12x12 inline BFO/Epistemic SVGs and getComputedStyle token resolution
 * for Canvas 2D and DOM components without hardcoded colors.
 */

export const PRIORY_SIGILS_SVG = {
  cont: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="3.5" fill="currentColor"/></svg>`,
  proc: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.6 2.75L6.1 6L2.6 9.25M6.4 2.75L9.9 6L6.4 9.25" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  role: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1.5L10.5 6L6 10.5L1.5 6Z" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  gdc: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 1.4L10.6 6L6 10.6L1.4 6Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><circle cx="6" cy="6" r="1.4" fill="currentColor"/></svg>`,
  qual: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4.1" stroke="currentColor" stroke-width="1.4"/><path d="M6 1.9A4.1 4.1 0 0 0 6 10.1Z" fill="currentColor"/></svg>`,
  ind: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2.1L9.9 6L6 9.9L2.1 6Z" fill="currentColor"/></svg>`,
  entailed: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 2.3V9.7M3 6H9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  synthesized: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 4.4C3.6 3.1 5.1 5.7 6.7 4.4C8.3 3.1 9.4 4.4 10 4.4M2 7.6C3.6 6.3 5.1 8.9 6.7 7.6C8.3 6.3 9.4 7.6 10 7.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`
};

export const PRIORY_UI_ICONS = {
  check: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6.3L4.9 8.7L9.5 3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cross: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  warn: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2.1L10.3 9.6H1.7L6 2.1Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M6 5V7.1M6 8.3V8.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  lock: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="2.5" y="5.2" width="7" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M4 5.2V3.8C4 2.7 4.9 1.8 6 1.8C7.1 1.8 8 2.7 8 3.8V5.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  unlock: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="2.5" y="5.2" width="7" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M4 5.2V3.8C4 2.7 4.9 1.8 6 1.8C6.9 1.8 7.6 2.3 7.9 3.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  play: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3.5 2.4L9.5 6L3.5 9.6V2.4Z" fill="currentColor"/></svg>`,
  pause: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3.5 2.5H5.2V9.5H3.5V2.5ZM6.8 2.5H8.5V9.5H6.8V2.5Z" fill="currentColor"/></svg>`,
  reset: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.6 5.2A3.7 3.7 0 1 1 3.3 8.3M2.5 2.6V5.3H5.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

export function resolveBfoSigilKind(iriOrCategory = '') {
  const s = String(iriOrCategory).toLowerCase();
  if (s.includes('0000031') || s.includes('iao') || s.includes('generically') || s.includes('information') || s === 'ice' || s === 'gdc' || s === 'skos' || s === 'cqb') return 'gdc';
  if (s.includes('0000015') || s.includes('0000003') || s.includes('occurrent') || s.includes('process') || s.includes('temporal') || s === 'proc' || s === 'elimination' || s === 'event') return 'proc';
  if (s.includes('0000017') || s.includes('0000023') || s.includes('0000016') || s.includes('0000034') || s.includes('role') || s.includes('realizable') || s.includes('disposition') || s.includes('function') || s === 'objective') return 'role';
  if (s.includes('0000019') || s.includes('quality') || s.includes('dataproperty') || s.includes('datatype') || s === 'qual' || s === 'violation') return 'qual';
  if (s.includes('namedindividual') || s.includes('individual') || s.includes('player') || s.includes('instance') || s === 'ind' || s === 'medic_revive') return 'ind';
  return 'cont';
}

export function renderBfoSigilHtml(iriOrCategory = '', extraClass = '', title = '') {
  const kind = resolveBfoSigilKind(iriOrCategory);
  const svg = PRIORY_SIGILS_SVG[kind] || PRIORY_SIGILS_SVG.cont;
  const titleAttr = title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : '';
  return `<span class="priory-sigil priory-sigil--${kind} ${extraClass}"${titleAttr} style="color:var(--sigil-${kind}-fg);display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;flex-shrink:0;">${svg}</span>`;
}

export function renderEpistemicSigilHtml(kind = 'entailed', title = '') {
  const svg = kind === 'synthesized' ? PRIORY_SIGILS_SVG.synthesized : PRIORY_SIGILS_SVG.entailed;
  const colorVar = kind === 'synthesized' ? 'var(--accent-ochre)' : 'var(--accent-entail)';
  const titleAttr = title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : '';
  return `<span class="priory-epistemic-marker" style="color:${colorVar};display:inline-flex;align-items:center;justify-content:center;width:16px;height:12px;flex-shrink:0;"${titleAttr}>${svg}</span>`;
}

export function readPrioryThemeTokens(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return {};
  const rootEl = (doc.body && doc.body.className && doc.body.className.includes('vscode-'))
    ? doc.body
    : doc.documentElement;
  const cs = doc.defaultView ? doc.defaultView.getComputedStyle(rootEl) : getComputedStyle(rootEl);
  const g = (v, fb = '') => (cs.getPropertyValue(v) || fb).trim();

  return {
    bgCanvas: g('--bg-canvas'),
    bgSurface1: g('--bg-surface-1'),
    bgSurface2: g('--bg-surface-2'),
    bgSurface3: g('--bg-surface-3'),
    borderSubtle: g('--border-subtle'),
    borderStrong: g('--border-strong'),
    textPrimary: g('--text-primary'),
    textSecondary: g('--text-secondary'),
    textMuted: g('--text-muted'),
    accentPrimary: g('--accent-primary'),
    accentPrimaryText: g('--accent-primary-text'),
    accentOchre: g('--accent-ochre'),
    accentEntail: g('--accent-entail'),
    statusClear: g('--status-clear'),
    statusWarn: g('--status-warn'),
    statusAvoid: g('--status-avoid'),
    teamAlpha: g('--team-alpha'),
    teamBravo: g('--team-bravo'),
    teamUnassigned: g('--team-unassigned'),
    graphDotColor: g('--graph-dot-color'),
    fontSans: g('--font-sans') || "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Text', system-ui, sans-serif",
    sigils: {
      cont: { fg: g('--sigil-cont-fg'), bg: g('--sigil-cont-bg'), bd: g('--sigil-cont-bd') },
      proc: { fg: g('--sigil-proc-fg'), bg: g('--sigil-proc-bg'), bd: g('--sigil-proc-bd') },
      role: { fg: g('--sigil-role-fg'), bg: g('--sigil-role-bg'), bd: g('--sigil-role-bd') },
      gdc:  { fg: g('--sigil-gdc-fg'),  bg: g('--sigil-gdc-bg'),  bd: g('--sigil-gdc-bd')  },
      qual: { fg: g('--sigil-qual-fg'), bg: g('--sigil-qual-bg'), bd: g('--sigil-qual-bd') },
      ind:  { fg: g('--sigil-ind-fg'),  bg: g('--sigil-ind-bg'),  bd: g('--sigil-ind-bd')  },
    },
  };
}

export function withAlpha(cssColor, alpha) {
  if (!cssColor) return `rgba(128, 128, 128, ${alpha})`;
  const c = cssColor.trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  }
  return c;
}

export function parseRgbTriplet(cssColor) {
  if (!cssColor) return '128, 128, 128';
  const c = cssColor.trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `${r}, ${g}, ${b}`;
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `${m[1]}, ${m[2]}, ${m[3]}`;
  return '128, 128, 128';
}
