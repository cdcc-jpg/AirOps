/**
 * AirOps Ontology Visualizer & Alignment Studio Module
 * Renders dual class hierarchy trees, pattern inspector, manual alignment drafter,
 * and an interactive Canvas node-relationship graph using Priory semiotics & ResizeObserver.
 */

import {
  readPrioryThemeTokens,
  withAlpha,
  renderBfoSigilHtml,
  renderEpistemicSigilHtml
} from './priory-semiotics.js?v=2.11.2';

let schemaData = null;
let activeAlignments = [];
let selectedAirOps = null;
let selectedBFO = null;
let activeInspectedNode = null;

// Graph state
let canvas = null;
let ctx = null;
let graphNodes = [];
let graphLinks = [];
let animFrameId = null;
let zoomLevel = 1.0;
let panOffset = { x: 0, y: 0 };
let isDraggingGraph = false;
let dragStart = { x: 0, y: 0 };
let graphResizeObserver = null;
let canvasCssWidth = 0;
let canvasCssHeight = 0;

export async function initOntologyVisualizer() {
  setupEventListeners();
  await refreshOntologyData();
}

export function openOntologyStudio() {
  const overlay = document.getElementById('ontology-studio-overlay');
  if (overlay) {
    overlay.classList.add('active');
    refreshOntologyData();
  }
}

export function closeOntologyStudio() {
  const overlay = document.getElementById('ontology-studio-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

async function refreshOntologyData() {
  try {
    const res = await fetch('/api/ontology/schema');
    schemaData = await res.json();
    activeAlignments = schemaData.alignments || [];

    renderAirOpsTree();
    renderBFOTree();
    renderAssertionsList();
    updateInspector();
    updateSidebarSummary();
  } catch (err) {
    console.error('Failed to load ontology schema data:', err);
  }
}

function setupEventListeners() {
  const btnClose = document.getElementById('btn-close-ontology-studio');
  if (btnClose) btnClose.addEventListener('click', closeOntologyStudio);

  const btnGraph = document.getElementById('btn-toggle-graph-mode');
  if (btnGraph) btnGraph.addEventListener('click', toggleGraphMode);

  const btnCloseGraph = document.getElementById('btn-close-graph');
  if (btnCloseGraph) btnCloseGraph.addEventListener('click', hideGraphMode);

  const btnResetGraph = document.getElementById('btn-reset-graph');
  if (btnResetGraph) btnResetGraph.addEventListener('click', resetGraphView);

  const searchAirOps = document.getElementById('search-airops');
  if (searchAirOps) {
    searchAirOps.addEventListener('input', (e) => filterTree('airops', e.target.value));
  }

  const searchBFO = document.getElementById('search-bfo');
  if (searchBFO) {
    searchBFO.addEventListener('input', (e) => filterTree('bfo', e.target.value));
  }

  const btnAdd = document.getElementById('btn-add-alignment');
  if (btnAdd) btnAdd.addEventListener('click', handleAddAlignment);

  const btnClear = document.getElementById('btn-clear-selection');
  if (btnClear) btnClear.addEventListener('click', clearPairSelection);

  const btnExport = document.getElementById('btn-export-alignments');
  if (btnExport) btnExport.addEventListener('click', exportAlignmentsTTL);
}

function updateSidebarSummary() {
  const panel = document.getElementById('panel-ontology');
  if (!panel || !schemaData) return;

  const airopsCount = schemaData.airops.classes.length;
  const bfoCount = schemaData.bfo.classes.length;
  const alignCount = activeAlignments.length;

  panel.innerHTML = `
    <div class="wb-sec-hdr">
      <span>Ontology Alignment Studio</span>
      <span class="tabular-nums">BFO 2020</span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">AirOps Classes</span>
      <span class="wb-prop-val">${airopsCount}</span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">BFO Top-Level</span>
      <span class="wb-prop-val">${bfoCount}</span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">Manual Alignments</span>
      <span class="wb-prop-val">${alignCount}</span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">Store File</span>
      <span class="wb-prop-val"><code>schemas/airsoft-bfo-alignments.ttl</code></span>
    </div>
    <div class="wb-block-pad">
      <button class="btn btn-primary" id="btn-open-studio-sidebar" style="width: 100%;">
        Launch Visual Studio Workbench
      </button>
    </div>
  `;

  const btnOpen = document.getElementById('btn-open-studio-sidebar');
  if (btnOpen) btnOpen.addEventListener('click', openOntologyStudio);
}

// ─── Hierarchy Tree Builder ─────────────────────────────────────

function buildClassHierarchy(classes) {
  const classMap = new Map();
  classes.forEach(c => classMap.set(c.prefixed, { ...c, children: [] }));

  const rootNodes = [];

  classMap.forEach(c => {
    let hasParentInSet = false;
    if (c.superClasses && c.superClasses.length > 0) {
      c.superClasses.forEach(sp => {
        if (classMap.has(sp)) {
          classMap.get(sp).children.push(c);
          hasParentInSet = true;
        }
      });
    }
    if (!hasParentInSet) {
      rootNodes.push(c);
    }
  });

  return rootNodes;
}

function renderAirOpsTree() {
  const container = document.getElementById('tree-airops');
  if (!container || !schemaData) return;

  const roots = buildClassHierarchy(schemaData.airops.classes);
  container.innerHTML = roots.map(node => renderTreeNodeHTML(node, 'airops', 0)).join('');
  attachTreeEvents(container, 'airops');
}

function renderBFOTree() {
  const container = document.getElementById('tree-bfo');
  if (!container || !schemaData) return;

  const roots = buildClassHierarchy(schemaData.bfo.classes);
  container.innerHTML = roots.map(node => renderTreeNodeHTML(node, 'bfo', 0)).join('');
  attachTreeEvents(container, 'bfo');
}

function renderTreeNodeHTML(node, ontologyType, depth = 0) {
  const hasChildren = node.children && node.children.length > 0;
  const isAirOpsSelected = selectedAirOps && selectedAirOps.prefixed === node.prefixed;
  const isBFOSelected = selectedBFO && selectedBFO.prefixed === node.prefixed;
  const isSelected = (ontologyType === 'airops' && isAirOpsSelected) || (ontologyType === 'bfo' && isBFOSelected);

  const alignment = activeAlignments.find(a => a.subject === node.prefixed || a.object === node.prefixed);
  const sigilHtml = renderBfoSigilHtml(node.uri || node.prefixed);

  return `
    <div class="tree-node-item" data-prefixed="${escapeHtml(node.prefixed)}" data-ontology="${ontologyType}">
      <div class="wb-tree-row ${isSelected ? 'is-active' : ''}" style="padding-left: ${8 + depth * 12}px;">
        <span class="tree-toggle ${hasChildren ? 'has-children' : 'empty'}">${hasChildren ? '-' : ' '}</span>
        ${sigilHtml}
        <span class="tree-node-label">${escapeHtml(node.label)}</span>
        <span class="wb-tree-count">${alignment ? 'Aligned' : escapeHtml(node.prefixed)}</span>
      </div>
      ${hasChildren ? `
        <div class="tree-node-children">
          ${node.children.map(child => renderTreeNodeHTML(child, ontologyType, depth + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function attachTreeEvents(container, ontologyType) {
  const rows = container.querySelectorAll('.wb-tree-row');
  rows.forEach(row => {
    const parentItem = row.closest('.tree-node-item');
    const prefixed = parentItem.getAttribute('data-prefixed');
    const toggle = row.querySelector('.tree-toggle');

    if (toggle && toggle.classList.contains('has-children')) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const children = parentItem.querySelector('.tree-node-children');
        if (children) {
          children.classList.toggle('collapsed');
          toggle.textContent = children.classList.contains('collapsed') ? '+' : '-';
        }
      });
    }

    row.addEventListener('click', () => {
      selectNode(prefixed, ontologyType);
    });
  });
}

function selectNode(prefixed, ontologyType) {
  const targetClass = schemaData[ontologyType].classes.find(c => c.prefixed === prefixed);
  if (!targetClass) return;

  activeInspectedNode = { ...targetClass, ontologyType };

  if (ontologyType === 'airops') {
    selectedAirOps = targetClass;
    const valEl = document.getElementById('val-airops-selected');
    if (valEl) {
      valEl.innerHTML = `<span class="badge-airops">${escapeHtml(targetClass.label)}</span> <code>${escapeHtml(targetClass.prefixed)}</code>`;
    }
    document.getElementById('box-airops-selected')?.classList.add('active');
  } else {
    selectedBFO = targetClass;
    const valEl = document.getElementById('val-bfo-selected');
    if (valEl) {
      valEl.innerHTML = `<span class="badge-bfo">${escapeHtml(targetClass.label)}</span> <code>${escapeHtml(targetClass.prefixed)}</code>`;
    }
    document.getElementById('box-bfo-selected')?.classList.add('active');
  }

  renderAirOpsTree();
  renderBFOTree();
  updateInspector();
}

function clearPairSelection() {
  selectedAirOps = null;
  selectedBFO = null;
  const airEl = document.getElementById('val-airops-selected');
  const bfoEl = document.getElementById('val-bfo-selected');
  if (airEl) airEl.textContent = 'Select a class from left tree';
  if (bfoEl) bfoEl.textContent = 'Select a class from right tree';
  document.getElementById('box-airops-selected')?.classList.remove('active');
  document.getElementById('box-bfo-selected')?.classList.remove('active');
  renderAirOpsTree();
  renderBFOTree();
}

function filterTree(ontologyType, query) {
  const container = document.getElementById(`tree-${ontologyType}`);
  if (!container) return;

  const items = container.querySelectorAll('.tree-node-item');
  const q = query.toLowerCase().trim();

  items.forEach(item => {
    const label = item.querySelector('.tree-node-label')?.textContent.toLowerCase() || '';
    const tag = (item.getAttribute('data-prefixed') || '').toLowerCase();
    const matches = label.includes(q) || tag.includes(q);

    if (q === '') {
      item.style.display = '';
    } else {
      item.style.display = matches ? '' : 'none';
      if (matches) {
        let parent = item.parentElement?.closest('.tree-node-item');
        while (parent) {
          parent.style.display = '';
          const children = parent.querySelector('.tree-node-children');
          if (children) children.classList.remove('collapsed');
          parent = parent.parentElement?.closest('.tree-node-item');
        }
      }
    }
  });
}

// ─── Inspector & Assertions ──────────────────────────────────────

function updateInspector() {
  const container = document.getElementById('inspector-content');
  if (!container) return;

  if (!activeInspectedNode) {
    container.innerHTML = `<div class="wb-prop-row"><span class="wb-prop-key">Selection</span><span class="wb-prop-val text-muted">None</span></div>`;
    return;
  }

  const node = activeInspectedNode;
  const isAirOps = node.ontologyType === 'airops';
  const relatedProps = (schemaData[node.ontologyType].properties || []).filter(
    p => p.domain === node.prefixed || p.range === node.prefixed
  );
  const alignmentsForNode = activeAlignments.filter(a => a.subject === node.prefixed || a.object === node.prefixed);

  container.innerHTML = `
    <div class="wb-sec-hdr">
      <span>${renderBfoSigilHtml(node.uri || node.prefixed)} ${escapeHtml(node.label)}</span>
      <span>${isAirOps ? 'AirOps Class' : 'BFO Class'}</span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">IRI</span>
      <span class="wb-prop-val" title="${escapeHtml(node.uri)}"><code>${escapeHtml(node.uri)}</code></span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">Definition</span>
      <span class="wb-prop-val" title="${escapeHtml(node.comment || '')}">${escapeHtml(node.comment || 'No comment defined')}</span>
    </div>
    <div class="wb-prop-row">
      <span class="wb-prop-key">Superclasses</span>
      <span class="wb-prop-val">
        ${(node.superClasses && node.superClasses.length > 0)
          ? node.superClasses.map(s => `<code>${escapeHtml(s)}</code>`).join(', ')
          : 'Root entity'}
      </span>
    </div>
    <div class="wb-sec-hdr">
      <span>Object Properties</span>
      <span class="tabular-nums">${relatedProps.length}</span>
    </div>
    ${relatedProps.length > 0
      ? relatedProps.map(p => `
        <div class="wb-prop-row">
          <span class="wb-prop-key"><code>${escapeHtml(p.prefixed)}</code></span>
          <span class="wb-prop-val"><code>${escapeHtml(p.domain || 'any')}</code> -> <code>${escapeHtml(p.range || 'any')}</code></span>
        </div>
      `).join('')
      : `<div class="wb-prop-row"><span class="wb-prop-key">Properties</span><span class="wb-prop-val text-muted">None linked</span></div>`}
    <div class="wb-sec-hdr">
      <span>Alignments</span>
      <span class="tabular-nums">${alignmentsForNode.length}</span>
    </div>
    ${alignmentsForNode.length > 0
      ? alignmentsForNode.map(a => `
        <div class="wb-epistemic-row">
          ${renderEpistemicSigilHtml('entailed', 'Asserted alignment')}
          <div><code>${escapeHtml(a.subject)}</code> ${escapeHtml(a.predicate)} <code>${escapeHtml(a.object)}</code></div>
        </div>
      `).join('')
      : `<div class="wb-prop-row"><span class="wb-prop-key">Alignments</span><span class="wb-prop-val text-muted">None configured</span></div>`}
  `;
}

function renderAssertionsList() {
  const container = document.getElementById('assertions-list');
  if (!container) return;

  if (activeAlignments.length === 0) {
    container.innerHTML = `<div class="wb-prop-row"><span class="wb-prop-key">Assertions</span><span class="wb-prop-val text-muted">None defined</span></div>`;
    return;
  }

  container.innerHTML = activeAlignments.map(a => `
    <div class="wb-epistemic-row">
      ${renderEpistemicSigilHtml('entailed', 'Asserted alignment')}
      <div><code>${escapeHtml(a.subject)}</code> ${escapeHtml(a.predicate)} <code>${escapeHtml(a.object)}</code></div>
    </div>
  `).join('');
}

async function handleAddAlignment() {
  if (!selectedAirOps || !selectedBFO) {
    alert('Select both an AirOps class and a BFO class before adding an alignment.');
    return;
  }

  const relation = document.getElementById('alignment-relation').value;

  const newAssertion = {
    subject: selectedAirOps.prefixed,
    subjectUri: selectedAirOps.uri,
    predicate: relation,
    predicateUri: relation === 'rdfs:subClassOf'
      ? 'http://www.w3.org/2000/01/rdf-schema#subClassOf'
      : relation === 'owl:equivalentClass'
      ? 'http://www.w3.org/2002/07/owl#equivalentClass'
      : 'http://www.w3.org/2002/07/owl#equivalentProperty',
    object: selectedBFO.prefixed,
    objectUri: selectedBFO.uri
  };

  try {
    const res = await fetch('/api/ontology/alignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alignments: [newAssertion] })
    });
    const data = await res.json();
    if (data.success) {
      activeAlignments.push(newAssertion);
      renderAssertionsList();
      renderAirOpsTree();
      renderBFOTree();
      updateInspector();
      updateSidebarSummary();
      clearPairSelection();
    }
  } catch (err) {
    console.error('Error adding alignment assertion:', err);
    alert('Failed to save alignment assertion.');
  }
}

async function exportAlignmentsTTL() {
  try {
    const res = await fetch('/api/export');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'airsoft-bfo-graph-export.ttl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Export failed:', err);
  }
}

// ─── Interactive Canvas Graph Visualizer ─────────────────────────

function toggleGraphMode() {
  const container = document.getElementById('graph-view-container');
  if (!container) return;

  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    initGraphCanvas();
  } else {
    container.classList.add('hidden');
    if (animFrameId) cancelAnimationFrame(animFrameId);
  }
}

function hideGraphMode() {
  const container = document.getElementById('graph-view-container');
  if (container) container.classList.add('hidden');
  if (animFrameId) cancelAnimationFrame(animFrameId);
}

function resetGraphView() {
  zoomLevel = 1.0;
  panOffset = { x: 0, y: 0 };
}

function initGraphCanvas() {
  canvas = document.getElementById('ontology-canvas-graph');
  if (!canvas) return;

  ctx = canvas.getContext('2d');
  resizeCanvas();

  if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
    if (graphResizeObserver) graphResizeObserver.disconnect();
    graphResizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      renderGraph();
    });
    graphResizeObserver.observe(canvas.parentElement);
  }

  window.addEventListener('resize', resizeCanvas);

  canvas.onmousedown = (e) => {
    isDraggingGraph = true;
    dragStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  canvas.onmousemove = (e) => {
    if (isDraggingGraph) {
      panOffset = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    }
  };

  canvas.onmouseup = () => { isDraggingGraph = false; };
  canvas.onmouseleave = () => { isDraggingGraph = false; };

  canvas.onwheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomLevel = Math.max(0.3, Math.min(3.0, zoomLevel * zoomFactor));
  };

  buildGraphNodes();
  startGraphSimulation();
}

function resizeCanvas() {
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvasCssWidth = rect.width;
  canvasCssHeight = Math.max(1, rect.height - 28);
  canvas.width = Math.floor(canvasCssWidth * dpr);
  canvas.height = Math.floor(canvasCssHeight * dpr);
  canvas.style.width = canvasCssWidth + 'px';
  canvas.style.height = canvasCssHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function buildGraphNodes() {
  if (!schemaData) return;

  graphNodes = [];
  graphLinks = [];

  const nodeMap = new Map();

  schemaData.airops.classes.forEach((c, idx) => {
    const node = {
      id: c.prefixed,
      label: c.label,
      type: 'airops',
      x: 200 + (idx % 5) * 80 + Math.random() * 40,
      y: 150 + Math.floor(idx / 5) * 80 + Math.random() * 40,
      vx: 0, vy: 0
    };
    graphNodes.push(node);
    nodeMap.set(c.prefixed, node);
  });

  schemaData.bfo.classes.forEach((c, idx) => {
    const node = {
      id: c.prefixed,
      label: c.label,
      type: 'bfo',
      x: 700 + (idx % 4) * 90 + Math.random() * 40,
      y: 150 + Math.floor(idx / 4) * 90 + Math.random() * 40,
      vx: 0, vy: 0
    };
    graphNodes.push(node);
    nodeMap.set(c.prefixed, node);
  });

  [...schemaData.airops.classes, ...schemaData.bfo.classes].forEach(c => {
    if (c.superClasses) {
      c.superClasses.forEach(sp => {
        if (nodeMap.has(c.prefixed) && nodeMap.has(sp)) {
          graphLinks.push({
            source: nodeMap.get(c.prefixed),
            target: nodeMap.get(sp),
            type: 'subClassOf'
          });
        }
      });
    }
  });

  activeAlignments.forEach(a => {
    if (nodeMap.has(a.subject) && nodeMap.has(a.object)) {
      graphLinks.push({
        source: nodeMap.get(a.subject),
        target: nodeMap.get(a.object),
        type: a.predicate
      });
    }
  });
}

function startGraphSimulation() {
  function step() {
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const n1 = graphNodes[i];
        const n2 = graphNodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 120) {
          const force = ((120 - dist) / dist) * 0.05;
          n1.vx -= dx * force;
          n1.vy -= dy * force;
          n2.vx += dx * force;
          n2.vy += dy * force;
        }
      }
    }

    graphLinks.forEach(link => {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 150) * 0.01;
      link.source.vx += dx * force;
      link.source.vy += dy * force;
      link.target.vx -= dx * force;
      link.target.vy -= dy * force;
    });

    graphNodes.forEach(n => {
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 0.85;
      n.vy *= 0.85;
    });

    renderGraph();
    animFrameId = requestAnimationFrame(step);
  }
  step();
}

function renderGraph() {
  if (!ctx || !canvas || canvasCssWidth <= 0 || canvasCssHeight <= 0) return;

  const tokens = readPrioryThemeTokens(document);
  ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
  ctx.fillStyle = tokens.bgCanvas;
  ctx.fillRect(0, 0, canvasCssWidth, canvasCssHeight);

  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);

  graphLinks.forEach(link => {
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.strokeStyle = link.type === 'subClassOf'
      ? withAlpha(tokens.borderStrong, 0.7)
      : tokens.accentOchre;
    ctx.lineWidth = link.type === 'subClassOf' ? 1 : 2;
    ctx.setLineDash(link.type !== 'subClassOf' ? [5, 5] : []);
    ctx.stroke();

    if (link.type !== 'subClassOf') {
      const midX = (link.source.x + link.target.x) / 2;
      const midY = (link.source.y + link.target.y) / 2;
      ctx.fillStyle = tokens.sigils.cont.fg;
      ctx.font = `500 11.5px ${tokens.fontSans}`;
      ctx.fillText(link.type, midX, midY);
    }
  });
  ctx.setLineDash([]);

  graphNodes.forEach(node => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.type === 'airops' ? 6 : 8, 0, Math.PI * 2);
    ctx.fillStyle = node.type === 'airops' ? tokens.sigils.gdc.fg : tokens.sigils.proc.fg;
    ctx.fill();

    ctx.fillStyle = tokens.textPrimary;
    ctx.font = `500 11.5px ${tokens.fontSans}`;
    ctx.fillText(node.label, node.x + 12, node.y + 4);
  });

  ctx.restore();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
