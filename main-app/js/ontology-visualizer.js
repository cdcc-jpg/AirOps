/**
 * AirOps Ontology Visualizer & Alignment Studio Module
 * Renders dual class hierarchy trees, pattern inspector, manual alignment drafter,
 * and an interactive Canvas node-relationship graph for AirOps & BFO ontologies.
 */

let schemaData = null;
let activeAlignments = [];
let selectedAirOps = null;
let selectedBFO = null;
let activeInspectedNode = null;

// Graph state
let isGraphMode = false;
let canvas = null;
let ctx = null;
let graphNodes = [];
let graphLinks = [];
let animFrameId = null;
let zoomLevel = 1.0;
let panOffset = { x: 0, y: 0 };
let isDraggingGraph = false;
let dragStart = { x: 0, y: 0 };

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
  // Close studio buttons
  const btnClose = document.getElementById('btn-close-ontology-studio');
  if (btnClose) btnClose.addEventListener('click', closeOntologyStudio);

  // Toggle graph view
  const btnGraph = document.getElementById('btn-toggle-graph-mode');
  if (btnGraph) btnGraph.addEventListener('click', toggleGraphMode);

  const btnCloseGraph = document.getElementById('btn-close-graph');
  if (btnCloseGraph) btnCloseGraph.addEventListener('click', hideGraphMode);

  const btnResetGraph = document.getElementById('btn-reset-graph');
  if (btnResetGraph) btnResetGraph.addEventListener('click', resetGraphView);

  // Search filters
  const searchAirOps = document.getElementById('search-airops');
  if (searchAirOps) {
    searchAirOps.addEventListener('input', (e) => filterTree('airops', e.target.value));
  }

  const searchBFO = document.getElementById('search-bfo');
  if (searchBFO) {
    searchBFO.addEventListener('input', (e) => filterTree('bfo', e.target.value));
  }

  // Alignment actions
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
    <div class="panel-section">
      <h3>🧬 Ontology Alignment Studio</h3>
      <p class="panel-desc">Visual pattern mapping between AirOps and BFO 2020 Upper Ontology.</p>
    </div>

    <div class="stat-card-group" style="display: flex; gap: 8px; margin-bottom: 16px;">
      <div class="stat-box" style="flex: 1; background: rgba(0,255,204,0.05); border: 1px solid rgba(0,255,204,0.2); padding: 8px; border-radius: 6px; text-align: center;">
        <div style="font-size: 1.4rem; font-weight: bold; color: #00ffcc;">${airopsCount}</div>
        <div style="font-size: 0.75rem; color: #8a9ba8;">AirOps Classes</div>
      </div>
      <div class="stat-box" style="flex: 1; background: rgba(0,170,255,0.05); border: 1px solid rgba(0,170,255,0.2); padding: 8px; border-radius: 6px; text-align: center;">
        <div style="font-size: 1.4rem; font-weight: bold; color: #00aaff;">${bfoCount}</div>
        <div style="font-size: 0.75rem; color: #8a9ba8;">BFO Top-Level</div>
      </div>
    </div>

    <div style="background: rgba(255,215,0,0.05); border: 1px solid rgba(255,215,0,0.2); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #ffd700; font-weight: bold;">Manual Alignments</span>
        <span style="background: #ffd700; color: #000; padding: 2px 8px; border-radius: 10px; font-weight: bold; font-size: 0.8rem;">${alignCount}</span>
      </div>
      <p style="font-size: 0.8rem; color: #a0aec0; margin-top: 6px;">Saved in <code>schemas/airsoft-bfo-alignments.ttl</code></p>
    </div>

    <button class="btn-primary" id="btn-open-studio-sidebar" style="width: 100%; margin-top: 10px;">
      ⚡ Launch Visual Studio Workbench
    </button>
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
  container.innerHTML = roots.map(node => renderTreeNodeHTML(node, 'airops')).join('');
  attachTreeEvents(container, 'airops');
}

function renderBFOTree() {
  const container = document.getElementById('tree-bfo');
  if (!container || !schemaData) return;

  const roots = buildClassHierarchy(schemaData.bfo.classes);
  container.innerHTML = roots.map(node => renderTreeNodeHTML(node, 'bfo')).join('');
  attachTreeEvents(container, 'bfo');
}

function renderTreeNodeHTML(node, ontologyType) {
  const hasChildren = node.children && node.children.length > 0;
  const isAirOpsSelected = selectedAirOps && selectedAirOps.prefixed === node.prefixed;
  const isBFOSelected = selectedBFO && selectedBFO.prefixed === node.prefixed;
  const isSelected = (ontologyType === 'airops' && isAirOpsSelected) || (ontologyType === 'bfo' && isBFOSelected);

  // Check if node has alignments
  const alignment = activeAlignments.find(a => a.subject === node.prefixed || a.object === node.prefixed);

  return `
    <div class="tree-node-item" data-prefixed="${node.prefixed}" data-ontology="${ontologyType}">
      <div class="tree-node-row ${isSelected ? 'selected' : ''}">
        <span class="tree-toggle ${hasChildren ? 'has-children' : 'empty'}">${hasChildren ? '▼' : '•'}</span>
        <span class="tree-node-label">${escapeHtml(node.label)}</span>
        <span class="tree-node-tag">${escapeHtml(node.prefixed)}</span>
        ${alignment ? `<span class="alignment-pill" title="Aligned with ${alignment.object === node.prefixed ? alignment.subject : alignment.object}">⚡ Aligned</span>` : ''}
      </div>
      ${hasChildren ? `
        <div class="tree-node-children">
          ${node.children.map(child => renderTreeNodeHTML(child, ontologyType)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function attachTreeEvents(container, ontologyType) {
  const rows = container.querySelectorAll('.tree-node-row');
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
          toggle.textContent = children.classList.contains('collapsed') ? '▶' : '▼';
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
    document.getElementById('val-airops-selected').innerHTML = `
      <span class="badge-airops">${escapeHtml(targetClass.label)}</span>
      <small>(${targetClass.prefixed})</small>
    `;
    document.getElementById('box-airops-selected').classList.add('active');
  } else {
    selectedBFO = targetClass;
    document.getElementById('val-bfo-selected').innerHTML = `
      <span class="badge-bfo">${escapeHtml(targetClass.label)}</span>
      <small>(${targetClass.prefixed})</small>
    `;
    document.getElementById('box-bfo-selected').classList.add('active');
  }

  // Highlight in trees
  renderAirOpsTree();
  renderBFOTree();

  // Update Inspector Panel
  updateInspector();
}

function clearPairSelection() {
  selectedAirOps = null;
  selectedBFO = null;
  document.getElementById('val-airops-selected').textContent = 'Select a class from left tree';
  document.getElementById('val-bfo-selected').textContent = 'Select a class from right tree';
  document.getElementById('box-airops-selected').classList.remove('active');
  document.getElementById('box-bfo-selected').classList.remove('active');
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
    const tag = item.getAttribute('data-prefixed').toLowerCase();
    const matches = label.includes(q) || tag.includes(q);

    if (q === '') {
      item.style.display = '';
    } else {
      item.style.display = matches ? '' : 'none';
      if (matches) {
        let parent = item.parentElement.closest('.tree-node-item');
        while (parent) {
          parent.style.display = '';
          const children = parent.querySelector('.tree-node-children');
          if (children) children.classList.remove('collapsed');
          parent = parent.parentElement.closest('.tree-node-item');
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
    container.innerHTML = `<div class="empty-state">Click any class node in either tree to inspect its pattern properties, SHACL rules, and domain/range relationships.</div>`;
    return;
  }

  const node = activeInspectedNode;
  const isAirOps = node.ontologyType === 'airops';

  // Find related properties
  const relatedProps = (schemaData[node.ontologyType].properties || []).filter(
    p => p.domain === node.prefixed || p.range === node.prefixed
  );

  // Find existing alignments for this node
  const alignmentsForNode = activeAlignments.filter(a => a.subject === node.prefixed || a.object === node.prefixed);

  container.innerHTML = `
    <div class="inspector-detail">
      <div class="inspector-header">
        <span class="inspector-badge ${isAirOps ? 'airops-tag' : 'bfo-tag'}">${isAirOps ? 'AirOps Domain Class' : 'BFO Upper Class'}</span>
        <h3>${escapeHtml(node.label)}</h3>
        <code>${escapeHtml(node.uri)}</code>
      </div>

      <div class="inspector-section">
        <strong>Description / Definition:</strong>
        <p>${escapeHtml(node.comment || 'No formal comment description provided in schema.')}</p>
      </div>

      <div class="inspector-section">
        <strong>Superclasses (rdfs:subClassOf):</strong>
        <div>
          ${(node.superClasses && node.superClasses.length > 0)
            ? node.superClasses.map(s => `<span class="chip">${escapeHtml(s)}</span>`).join(' ')
            : '<em>Root top-level entity (no explicit superclass in schema)</em>'}
        </div>
      </div>

      <div class="inspector-section">
        <strong>Object Properties & Relationships:</strong>
        ${relatedProps.length > 0 ? `
          <ul class="prop-list">
            ${relatedProps.map(p => `
              <li>
                <strong>${escapeHtml(p.prefixed)}</strong>
                <small>(domain: <code>${escapeHtml(p.domain || 'any')}</code> ➔ range: <code>${escapeHtml(p.range || 'any')}</code>)</small>
              </li>
            `).join('')}
          </ul>
        ` : '<em>No specific object properties linked as domain/range for this class.</em>'}
      </div>

      <div class="inspector-section">
        <strong>Active Manual Alignments:</strong>
        ${alignmentsForNode.length > 0 ? `
          <div class="active-align-box">
            ${alignmentsForNode.map(a => `
              <div class="align-item">
                <span>${escapeHtml(a.subject)}</span>
                <strong style="color:#ffd700;">${escapeHtml(a.predicate)}</strong>
                <span>${escapeHtml(a.object)}</span>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:#8a9ba8; font-size:0.85rem;">No alignments configured yet for this class.</p>'}
      </div>
    </div>
  `;
}

function renderAssertionsList() {
  const container = document.getElementById('assertions-list');
  if (!container) return;

  if (activeAlignments.length === 0) {
    container.innerHTML = `<div class="empty-state">No manual alignments defined yet. Select an AirOps class and a BFO class above to add your first mapping assertion.</div>`;
    return;
  }

  container.innerHTML = activeAlignments.map((a, idx) => `
    <div class="assertion-row">
      <div class="assertion-subj">${escapeHtml(a.subject)}</div>
      <div class="assertion-pred">${escapeHtml(a.predicate)}</div>
      <div class="assertion-obj">${escapeHtml(a.object)}</div>
    </div>
  `).join('');
}

async function handleAddAlignment() {
  if (!selectedAirOps || !selectedBFO) {
    alert('Please select both an AirOps class and a BFO top-level class from the trees before adding an alignment.');
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

  window.addEventListener('resize', resizeCanvas);

  // Canvas Mouse Interaction
  canvas.onmousedown = (e) => {
    isDraggingGraph = true;
    dragStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  canvas.onmousemove = (e) => {
    if (isDraggingGraph) {
      panOffset = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    }
  };

  canvas.onmouseup = () => isDraggingGraph = false;
  canvas.onmouseleave = () => isDraggingGraph = false;

  canvas.onwheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomLevel = Math.max(0.3, Math.min(3.0, zoomLevel * zoomFactor));
  };

  buildGraphNodes();
  startGraphSimulation();
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight - 45;
}

function buildGraphNodes() {
  if (!schemaData) return;

  graphNodes = [];
  graphLinks = [];

  const nodeMap = new Map();

  // Add AirOps nodes
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

  // Add BFO nodes
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

  // Add subClassOf links
  [...schemaData.airops.classes, ...schemaData.bfo.classes].forEach(c => {
    if (c.superClasses) {
      c.superClasses.forEach(sp => {
        if (nodeMap.has(c.prefixed) && nodeMap.has(sp)) {
          graphLinks.push({
            source: nodeMap.get(c.prefixed),
            target: nodeMap.get(sp),
            type: 'subClassOf',
            color: 'rgba(255, 255, 255, 0.2)'
          });
        }
      });
    }
  });

  // Add alignment links
  activeAlignments.forEach(a => {
    if (nodeMap.has(a.subject) && nodeMap.has(a.object)) {
      graphLinks.push({
        source: nodeMap.get(a.subject),
        target: nodeMap.get(a.object),
        type: a.predicate,
        color: '#ffd700'
      });
    }
  });
}

function startGraphSimulation() {
  function step() {
    // Simple force layout physics
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const n1 = graphNodes[i];
        const n2 = graphNodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 120) {
          const force = (120 - dist) / dist * 0.05;
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
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(panOffset.x, panOffset.y);
  ctx.scale(zoomLevel, zoomLevel);

  // Draw links
  graphLinks.forEach(link => {
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.strokeStyle = link.color;
    ctx.lineWidth = link.type === 'subClassOf' ? 1 : 2.5;
    if (link.type !== 'subClassOf') ctx.setLineDash([5, 5]);
    else ctx.setLineDash([]);
    ctx.stroke();

    // Link label for alignments
    if (link.type !== 'subClassOf') {
      const midX = (link.source.x + link.target.x) / 2;
      const midY = (link.source.y + link.target.y) / 2;
      ctx.fillStyle = '#ffd700';
      ctx.font = '10px sans-serif';
      ctx.fillText(link.type, midX, midY);
    }
  });

  // Draw nodes
  graphNodes.forEach(node => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.type === 'airops' ? 8 : 10, 0, Math.PI * 2);
    ctx.fillStyle = node.type === 'airops' ? '#00ffcc' : '#00aaff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = node.type === 'airops' ? '#00ffcc' : '#00aaff';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Node label
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.fillText(node.label, node.x + 12, node.y + 4);
  });

  ctx.restore();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
