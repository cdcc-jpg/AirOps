/**
 * AirOps v2.11 — Replica Selection Advisor Application Logic
 * Operationalizes airsoft-replica-selector-app.ttl & SKOS controlled vocabulary
 */

(function () {
  'use strict';

  let advisorData = { fields: [], replicas: [], tacticalRoles: [] };
  let selectedField = null;

  document.addEventListener('DOMContentLoaded', () => {
    initReplicaAdvisor();
  });

  async function initReplicaAdvisor() {
    try {
      const res = await fetch('/api/replica-advisor/options');
      if (res.ok) {
        advisorData = await res.json();
      }
    } catch (err) {
      console.warn('Could not load advisor data from API, using fallback data:', err);
    }

    renderAdvisorTab();
    bindEvents();
    if (advisorData.fields && advisorData.fields.length > 0) {
      selectFieldPreset(advisorData.fields[0].id);
    }
  }

  function renderAdvisorTab() {
    const container = document.getElementById('replica-advisor-view');
    if (!container) return;

    container.innerHTML = `
      <div class="advisor-container">
        <!-- ═══ Header ═══ -->
        <header class="advisor-header">
          <div class="advisor-title">
            <span class="icon">🎯</span>
            <div>
              <h2>Replica Selection Advisor</h2>
              <p class="subtitle">Ontology & SKOS Powered Tactical Suitability Engine (airsoft-replica-selector-app.ttl)</p>
            </div>
          </div>
          <div class="advisor-schema-badge">
            <span class="owl-tag">owl:Ontology</span>
            <span>airsoft-replica-selector-app</span>
          </div>
        </header>

        <div class="advisor-grid">
          <!-- ═══ Left Panel: Controls & Constraints ═══ -->
          <section class="advisor-sidebar-card">
            <h3>1. Target Field & Site Rules</h3>

            <div class="form-group">
              <label for="field-preset-select">Select Field Preset:</label>
              <select id="field-preset-select" class="advisor-select">
                ${advisorData.fields.map(f => `<option value="${f.id}">${f.name} (${f.type})</option>`).join('')}
                <option value="custom">Custom Site Rules...</option>
              </select>
            </div>

            <div class="field-desc-box" id="field-desc-box">
              Select a field above to inspect constraints.
            </div>

            <div class="form-section-title">Site Constraints (FieldConstraintProfile)</div>

            <div class="form-group">
              <div class="slider-header">
                <label>Max Muzzle Energy (Joules):</label>
                <span class="slider-val" id="val-max-joules">1.14 J</span>
              </div>
              <input type="range" id="input-max-joules" min="0.5" max="3.0" step="0.05" value="1.14" class="advisor-slider">
              <div class="slider-subtext" id="fps-equivalent">≈ 350 FPS with 0.20g BB</div>
            </div>

            <div class="form-group">
              <div class="slider-header">
                <label>Max CQB Length (mm):</label>
                <span class="slider-val" id="val-max-length">800 mm</span>
              </div>
              <input type="range" id="input-max-length" min="400" max="1400" step="25" value="800" class="advisor-slider">
            </div>

            <div class="form-group">
              <div class="slider-header">
                <label>Min Engagement Distance (MED):</label>
                <span class="slider-val" id="val-med">0 m</span>
              </div>
              <input type="range" id="input-med" min="0" max="30" step="5" value="0" class="advisor-slider">
            </div>

            <div class="checkbox-grid">
              <label class="advisor-checkbox">
                <input type="checkbox" id="chk-semi-only" checked>
                <span>Semi-Auto Only Rule</span>
              </label>
              <label class="advisor-checkbox">
                <input type="checkbox" id="chk-bio-bb">
                <span>100% Bio BB Mandate</span>
              </label>
              <label class="advisor-checkbox">
                <input type="checkbox" id="chk-tracer" checked>
                <span>Illuminated Tracer Required</span>
              </label>
            </div>

            <div class="form-section-title">2. Tactical Role & Environment</div>

            <div class="form-group">
              <label>Requested Role:</label>
              <div class="role-btn-grid" id="role-btn-grid">
                ${(advisorData.tacticalRoles || []).map((r, i) => `
                  <button class="role-btn ${i === 0 ? 'active' : ''}" data-role-id="${r.id}" data-skos="${r.skosConcept}">
                    ${r.label}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <div class="slider-header">
                <label>Ambient Temperature (°C):</label>
                <span class="slider-val" id="val-temp">18 °C</span>
              </div>
              <input type="range" id="input-temp" min="-5" max="35" step="1" value="18" class="advisor-slider">
              <div class="cold-warning-msg" id="cold-warning" style="display:none;">
                ⚠️ Sub-10°C cold weather detected: Gas GBBR replicas risk severe cool-down.
              </div>
            </div>

            <button id="btn-evaluate" class="btn-primary-evaluate">
              <span>⚡</span> Run Suitability Assessment
            </button>
          </section>

          <!-- ═══ Right Panel: Assessment Results ═══ -->
          <section class="advisor-results-card">
            <div class="results-header">
              <div>
                <h3>3. Candidate Suitability Ranking</h3>
                <span class="results-count-badge" id="results-count-badge">Showing candidate replicas</span>
              </div>
              <div class="skos-filter-legend">
                <span class="badge status-optimal">Optimal</span>
                <span class="badge status-permissible">Permissible</span>
                <span class="badge status-suboptimal">Suboptimal</span>
                <span class="badge status-noncompliant">Non-Compliant</span>
              </div>
            </div>

            <!-- 🔍 Search & Filter Toolbar directly inside Section 3 -->
            <div class="results-filter-toolbar">
              <div class="results-search-box">
                <input type="text" id="results-search-input" class="advisor-search-input" placeholder="🔍 Search candidate replicas by name, model, brand, SKOS tag..." autocomplete="off">
                <button id="results-search-clear" class="btn-clear-search" style="display:none;">&times;</button>
              </div>
              <div class="results-filter-dropdowns">
                <select id="results-filter-propulsion" class="advisor-filter-select">
                  <option value="ALL">All Propulsion</option>
                  <option value="AEG">Electric (AEG)</option>
                  <option value="GBBR">Gas Blowback (GBB)</option>
                  <option value="Spring">Spring Bolt-Action</option>
                  <option value="HPA">HPA Rig</option>
                </select>
                <select id="results-filter-weapon" class="advisor-filter-select">
                  <option value="ALL">All Weapon Types</option>
                  <option value="Assault">Assault Rifle</option>
                  <option value="CQB">SMG / CQB</option>
                  <option value="SniperRifle">Sniper Rifle</option>
                  <option value="DMR">DMR Marksman</option>
                  <option value="SupportLMG">Light Machine Gun</option>
                  <option value="Sidearm">Pistol / Sidearm</option>
                </select>
                <select id="results-filter-brand" class="advisor-filter-select">
                  <option value="ALL">All Brands</option>
                  ${Array.from(new Set((advisorData.replicas || []).map(r => r.brand))).sort().map(b => `<option value="${b}">${b}</option>`).join('')}
                </select>
                <select id="results-filter-status" class="advisor-filter-select">
                  <option value="ALL">All Match Tiers</option>
                  <option value="Optimal Match">Optimal Match Only</option>
                  <option value="Permissible Match">Permissible Match Only</option>
                  <option value="Suboptimal Match">Suboptimal Match Only</option>
                  <option value="Non-Compliant Match">Non-Compliant Only</option>
                </select>
              </div>
            </div>

            <div id="results-grid" class="results-grid">
              <div class="loading-spinner">Evaluating replicas against ontology rules...</div>
            </div>
          </section>
        </div>
      </div>

      <!-- SKOS Concept Inspector Modal -->
      <div id="skos-modal" class="skos-modal-overlay" style="display:none;">
        <div class="skos-modal-content">
          <button class="skos-modal-close" id="skos-modal-close">&times;</button>
          <div class="skos-modal-header">
            <span class="skos-modal-tag">skos:Concept</span>
            <h3 id="skos-modal-title">Concept Label</h3>
          </div>
          <div class="skos-modal-body">
            <p><strong>IRI:</strong> <code id="skos-modal-uri">https://github.com/cdcc-jpg/ontologies/airsoft-skos#Concept</code></p>
            <p><strong>Notation:</strong> <span id="skos-modal-notation" class="badge-notation">Notation</span></p>
            <p><strong>Definition:</strong></p>
            <div id="skos-modal-def" class="skos-def-box">Definition text...</div>
            <div id="skos-modal-alt" class="skos-alt-box"></div>
            <p><strong>SKOS Scope Note:</strong></p>
            <div id="skos-modal-scope" class="skos-scope-box"></div>
          </div>
        </div>
      </div>
    `;
  }

  let latestEvaluatedResults = [];

  function bindEvents() {
    const presetSelect = document.getElementById('field-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        selectFieldPreset(e.target.value);
      });
    }

    const inputJoules = document.getElementById('input-max-joules');
    if (inputJoules) {
      inputJoules.addEventListener('input', (e) => {
        const j = parseFloat(e.target.value);
        document.getElementById('val-max-joules').innerText = `${j.toFixed(2)} J`;
        const fps = Math.round(Math.sqrt((j * 2) / 0.0002) * 3.28084);
        document.getElementById('fps-equivalent').innerText = `≈ ${fps} FPS with 0.20g BB`;
        triggerEvaluate();
      });
    }

    const inputLength = document.getElementById('input-max-length');
    if (inputLength) {
      inputLength.addEventListener('input', (e) => {
        document.getElementById('val-max-length').innerText = `${e.target.value} mm`;
        triggerEvaluate();
      });
    }

    const inputMed = document.getElementById('input-med');
    if (inputMed) {
      inputMed.addEventListener('input', (e) => {
        document.getElementById('val-med').innerText = `${e.target.value} m`;
        triggerEvaluate();
      });
    }

    const inputTemp = document.getElementById('input-temp');
    if (inputTemp) {
      inputTemp.addEventListener('input', (e) => {
        const temp = parseInt(e.target.value, 10);
        document.getElementById('val-temp').innerText = `${temp} °C`;
        const warning = document.getElementById('cold-warning');
        if (warning) {
          warning.style.display = temp < 10 ? 'block' : 'none';
        }
        triggerEvaluate();
      });
    }

    ['chk-semi-only', 'chk-bio-bb', 'chk-tracer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', triggerEvaluate);
    });

    // 🔍 Section 3 Live Search & Filter Listeners
    const searchInput = document.getElementById('results-search-input');
    const searchClear = document.getElementById('results-search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (searchClear) {
          searchClear.style.display = e.target.value.trim() ? 'block' : 'none';
        }
        applyResultsFilterAndRender();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        applyResultsFilterAndRender();
      });
    }

    ['results-filter-propulsion', 'results-filter-weapon', 'results-filter-brand', 'results-filter-status'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', applyResultsFilterAndRender);
    });

    const roleGrid = document.getElementById('role-btn-grid');
    if (roleGrid) {
      roleGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.role-btn');
        if (btn) {
          roleGrid.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          triggerEvaluate();
        }
      });
    }

    const btnEvaluate = document.getElementById('btn-evaluate');
    if (btnEvaluate) {
      btnEvaluate.addEventListener('click', runEvaluation);
    }

    const modalClose = document.getElementById('skos-modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        document.getElementById('skos-modal').style.display = 'none';
      });
    }
  }

  function selectFieldPreset(fieldId) {
    if (fieldId === 'custom') {
      document.getElementById('field-desc-box').innerText = 'Custom user-configured field rules.';
      return;
    }

    const field = (advisorData.fields || []).find(f => f.id === fieldId);
    if (!field) return;

    selectedField = field;
    document.getElementById('field-desc-box').innerHTML = `
      <strong>${field.name}</strong> (${field.type})<br>
      <small>${field.description}</small>
    `;

    document.getElementById('input-max-joules').value = field.maxJoules;
    document.getElementById('val-max-joules').innerText = `${field.maxJoules.toFixed(2)} J`;
    const fps = Math.round(Math.sqrt((field.maxJoules * 2) / 0.0002) * 3.28084);
    document.getElementById('fps-equivalent').innerText = `≈ ${fps} FPS with 0.20g BB`;

    document.getElementById('input-max-length').value = field.maxPermissibleLengthMm;
    document.getElementById('val-max-length').innerText = `${field.maxPermissibleLengthMm} mm`;

    document.getElementById('input-med').value = field.minEngagementDistanceMeters;
    document.getElementById('val-med').innerText = `${field.minEngagementDistanceMeters} m`;

    document.getElementById('chk-semi-only').checked = field.isSemiOnlyRestricted;
    document.getElementById('chk-bio-bb').checked = field.requiresBioBB;
    document.getElementById('chk-tracer').checked = field.requiresTracerUnit;

    runEvaluation();
  }

  let evalTimeout = null;
  function triggerEvaluate() {
    clearTimeout(evalTimeout);
    evalTimeout = setTimeout(runEvaluation, 150);
  }

  async function runEvaluation() {
    const joules = parseFloat(document.getElementById('input-max-joules').value);
    const length = parseInt(document.getElementById('input-max-length').value, 10);
    const med = parseInt(document.getElementById('input-med').value, 10);
    const semiOnly = document.getElementById('chk-semi-only').checked;
    const bioBb = document.getElementById('chk-bio-bb').checked;
    const tracer = document.getElementById('chk-tracer').checked;
    const tempC = parseInt(document.getElementById('input-temp').value, 10);

    const activeRoleBtn = document.querySelector('.role-btn.active');
    const roleId = activeRoleBtn ? activeRoleBtn.dataset.roleId : 'role_assault';

    const currentFieldState = {
      name: selectedField ? selectedField.name : 'Custom Site',
      maxJoules: joules,
      maxPermissibleLengthMm: length,
      minEngagementDistanceMeters: med,
      isSemiOnlyRestricted: semiOnly,
      requiresBioBB: bioBb,
      requiresTracerUnit: tracer
    };

    const resultsContainer = document.getElementById('results-grid');
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div class="loading-spinner">Evaluating candidate replicas...</div>`;
    }

    try {
      const res = await fetch('/api/replica-advisor/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: currentFieldState,
          targetRole: roleId,
          temperatureC: tempC
        })
      });

      if (res.ok) {
        const data = await res.json();
        latestEvaluatedResults = data.results || [];
      } else {
        latestEvaluatedResults = getResultsFallback(currentFieldState, tempC);
      }
    } catch (err) {
      console.warn('API error during evaluation, using client fallback logic:', err);
      latestEvaluatedResults = getResultsFallback(currentFieldState, tempC);
    }

    applyResultsFilterAndRender();
  }

  function applyResultsFilterAndRender() {
    const searchInput = document.getElementById('results-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const propFilter = document.getElementById('results-filter-propulsion') ? document.getElementById('results-filter-propulsion').value : 'ALL';
    const weaponFilter = document.getElementById('results-filter-weapon') ? document.getElementById('results-filter-weapon').value : 'ALL';
    const brandFilter = document.getElementById('results-filter-brand') ? document.getElementById('results-filter-brand').value : 'ALL';
    const statusFilter = document.getElementById('results-filter-status') ? document.getElementById('results-filter-status').value : 'ALL';

    const filtered = latestEvaluatedResults.filter(res => {
      const r = res.replica || {};

      // 1. Search Bar match
      if (query) {
        const haystack = [
          r.name, r.brand, r.propulsion, r.description,
          r.skosPlatform, r.skosPropulsion, r.skosBrand, r.skosRole,
          r.owlClass
        ].filter(Boolean).join(' ').toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      // 2. Propulsion Filter
      if (propFilter !== 'ALL') {
        const p = r.skosPropulsion || '';
        const pText = r.propulsion || '';
        if (!p.includes(propFilter) && !pText.toLowerCase().includes(propFilter.toLowerCase())) {
          return false;
        }
      }

      // 3. Weapon Type Filter
      if (weaponFilter !== 'ALL') {
        const role = r.skosRole || '';
        const plat = r.skosPlatform || '';
        const cls = r.owlClass || '';
        if (!role.includes(weaponFilter) && !plat.includes(weaponFilter) && !cls.includes(weaponFilter)) {
          return false;
        }
      }

      // 4. Brand Filter
      if (brandFilter !== 'ALL') {
        if (!r.brand || !r.brand.toLowerCase().includes(brandFilter.toLowerCase())) {
          return false;
        }
      }

      // 5. Match Status Tier Filter
      if (statusFilter !== 'ALL') {
        if (res.status !== statusFilter) return false;
      }

      return true;
    });

    // Update Count Badge
    const countBadge = document.getElementById('results-count-badge');
    if (countBadge) {
      if (filtered.length === latestEvaluatedResults.length) {
        countBadge.innerText = `Showing all ${latestEvaluatedResults.length} candidate replicas`;
      } else {
        countBadge.innerText = `Showing ${filtered.length} of ${latestEvaluatedResults.length} candidate replicas`;
      }
    }

    renderResultsGrid(filtered);
  }

  function renderResultsGrid(results) {
    const container = document.getElementById('results-grid');
    if (!container) return;

    if (!results || results.length === 0) {
      container.innerHTML = `
        <div class="no-results" style="padding: 24px; text-align: center; color: #94a3b8; background: #0f172a; border-radius: 8px; border: 1px dashed #334155;">
          🔍 No candidate replicas matched your search/filter criteria.
        </div>
      `;
      return;
    }

    container.innerHTML = results.map(res => {
      const r = res.replica;
      const score = res.matchScore;
      const statusBadge = res.badgeClass;

      return `
        <div class="replica-card ${res.status === 'Non-Compliant Match' ? 'card-disqualified' : ''}">
          <div class="card-top">
            <div>
              <div class="replica-brand">${r.brand}</div>
              <h4 class="replica-name">${r.name}</h4>
            </div>
            <div class="badge ${statusBadge}">
              ${res.status}
            </div>
          </div>

          <div class="score-container">
            <div class="score-header">
              <span>Suitability Match Score</span>
              <span class="score-num">${score}%</span>
            </div>
            <div class="score-bar-bg">
              <div class="score-bar-fill ${score >= 85 ? 'fill-optimal' : score >= 65 ? 'fill-permissible' : score >= 40 ? 'fill-suboptimal' : 'fill-noncompliant'}" style="width: ${score}%;"></div>
            </div>
          </div>

          <div class="replica-specs">
            <div class="spec-item"><span class="spec-label">Muzzle Energy:</span> <strong>${r.muzzleEnergyJoules} J</strong> (${r.velocityFps020} FPS)</div>
            <div class="spec-item"><span class="spec-label">Overall Length:</span> <strong>${r.overallLengthMm} mm</strong></div>
            <div class="spec-item"><span class="spec-label">Weight (Mass):</span> <strong>${r.weightKg ? r.weightKg.toFixed(2) + ' kg (' + Math.round(r.weightKg * 1000) + 'g)' : 'N/A'}</strong></div>
            <div class="spec-item"><span class="spec-label">Propulsion:</span> <strong>${r.propulsion}</strong></div>
            <div class="spec-item"><span class="spec-label">Firing Modes:</span> <strong>${r.firingModes.join(', ')}</strong></div>
          </div>

          <!-- SKOS Concept Badges -->
          <div class="skos-badges-row">
            <span class="skos-row-title">SKOS Concepts:</span>
            ${r.skosPropulsion ? `<button class="skos-chip" onclick="window.inspectSkosConcept('${r.skosPropulsion}')">${r.skosPropulsion}</button>` : ''}
            ${r.skosPlatform ? `<button class="skos-chip" onclick="window.inspectSkosConcept('${r.skosPlatform}')">${r.skosPlatform}</button>` : ''}
            ${r.skosRole ? `<button class="skos-chip" onclick="window.inspectSkosConcept('${r.skosRole}')">${r.skosRole}</button>` : ''}
            ${r.skosBrand ? `<button class="skos-chip" onclick="window.inspectSkosConcept('${r.skosBrand}')">${r.skosBrand}</button>` : ''}
          </div>

          ${res.disqualifications && res.disqualifications.length > 0 ? `
            <div class="alert-box alert-disqualified">
              <strong>⛔ Safety/Rule Disqualification:</strong>
              <ul>${res.disqualifications.map(d => `<li>${d}</li>`).join('')}</ul>
            </div>
          ` : ''}

          ${res.warnings && res.warnings.length > 0 ? `
            <div class="alert-box alert-warning">
              <strong>⚠️ Tactical/Operational Warning:</strong>
              <ul>${res.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>
          ` : ''}

          <div class="checks-list">
            ${res.checks.map(c => `
              <div class="check-item ${c.passed ? 'check-pass' : 'check-fail'}">
                <span class="check-icon">${c.passed ? '✓' : '✕'}</span>
                <span><strong>${c.name}:</strong> ${c.msg}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function getResultsFallback(field, tempC) {
    const replicas = advisorData.replicas || [];

    const results = replicas.map(r => {
      let score = 100;
      let disqs = [];
      let warns = [];
      let checks = [];

      if (r.muzzleEnergyJoules > field.maxJoules) {
        score -= 50;
        disqs.push(`Energy (${r.muzzleEnergyJoules}J) exceeds limit (${field.maxJoules}J).`);
        checks.push({ name: 'Safety Energy Ceiling', passed: false, msg: `EXCEEDED: ${r.muzzleEnergyJoules}J > ${field.maxJoules}J` });
      } else {
        checks.push({ name: 'Safety Energy Ceiling', passed: true, msg: `COMPLIANT: ${r.muzzleEnergyJoules}J ≤ ${field.maxJoules}J` });
      }

      if (r.overallLengthMm > field.maxPermissibleLengthMm) {
        score -= 25;
        warns.push(`Length (${r.overallLengthMm}mm) exceeds max CQB clearance (${field.maxPermissibleLengthMm}mm).`);
        checks.push({ name: 'Layout Clearance', passed: false, msg: `SUBOPTIMAL` });
      } else {
        checks.push({ name: 'Layout Clearance', passed: true, msg: `OPTIMAL` });
      }

      score = Math.max(0, score);
      const status = disqs.length > 0 || score < 40 ? 'Non-Compliant Match' : score >= 85 ? 'Optimal Match' : 'Permissible Match';
      const badgeClass = status === 'Optimal Match' ? 'status-optimal' : status === 'Permissible Match' ? 'status-permissible' : 'status-noncompliant';

      return { replica: r, matchScore: score, status, badgeClass, disqualifications: disqs, warnings: warns, checks };
    });

    results.sort((a, b) => b.matchScore - a.matchScore);
    return results;
  }

  // Global helper to show SKOS Concept Modal
  window.inspectSkosConcept = async function (conceptId) {
    const modal = document.getElementById('skos-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.getElementById('skos-modal-title').innerText = conceptId;
    document.getElementById('skos-modal-uri').innerText = `https://github.com/cdcc-jpg/ontologies/airsoft-skos#${conceptId.replace('asoft-skos:', '')}`;
    document.getElementById('skos-modal-notation').innerText = conceptId;
    document.getElementById('skos-modal-def').innerText = 'Loading definition from RDF SKOS store...';
    document.getElementById('skos-modal-alt').innerText = '';
    document.getElementById('skos-modal-scope').innerText = '';

    try {
      const res = await fetch(`/api/skos/concept/${conceptId}`);
      if (res.ok) {
        const data = await res.json();
        document.getElementById('skos-modal-title').innerText = data.prefLabel || conceptId;
        document.getElementById('skos-modal-def').innerText = data.definition || 'No definition available.';
        if (data.altLabels && data.altLabels.length > 0) {
          document.getElementById('skos-modal-alt').innerHTML = `<strong>Synonyms / Alt Labels:</strong> ${data.altLabels.join(', ')}`;
        }
        document.getElementById('skos-modal-scope').innerText = data.scopeNote || 'Managed in airsoft-skos-2000 controlled vocabulary.';
      }
    } catch (err) {
      document.getElementById('skos-modal-def').innerText = `SKOS Concept ${conceptId} in controlled vocabulary.`;
    }
  };

})();
