/**
 * AirOps v2.11 — Replica Selection Advisor Application Logic
 * Operationalizes airsoft-replica-selector-app.ttl & SKOS controlled vocabulary
 */

import {
  PRIORY_UI_ICONS,
  renderBfoSigilHtml,
  renderEpistemicSigilHtml
} from './priory-semiotics.js?v=2.11.2';

let advisorData = { fields: [], replicas: [], tacticalRoles: [] };
let selectedField = null;
let latestEvaluatedResults = [];
let isProfileLocked = true;
let evalTimeout = null;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
      <header class="advisor-header">
        <div class="advisor-title">
          ${renderBfoSigilHtml('gdc')}
          <h2>Replica Selection Advisor</h2>
          <span class="subtitle">Ontology &amp; SKOS Tactical Suitability</span>
        </div>
        <div class="advisor-schema-badge">
          <span class="owl-tag"><code>owl:Ontology</code></span>
          <code>airsoft-replica-selector-app.ttl</code>
        </div>
      </header>

      <div class="advisor-grid">
        <!-- Left Sub-Pane: Controls & Constraints -->
        <section class="advisor-sidebar-card">
          <div class="wb-sec-hdr">
            <span>1. Target Field &amp; Site Rules</span>
            <button id="btn-toggle-lock" type="button" class="btn-lock-toggle btn-locked" title="Toggle lock or custom edit mode">
              <span id="lock-icon">${PRIORY_UI_ICONS.lock}</span>
              <span id="lock-btn-text">Unlock</span>
            </button>
          </div>

          <div class="wb-block-pad" style="border-bottom: 1px solid var(--border-subtle);">
            <div class="form-group">
              <label for="field-preset-select">Venue Preset</label>
              <select id="field-preset-select" class="advisor-select">
                ${(advisorData.fields || []).map(f => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)} (${escapeHtml(f.type)})</option>`).join('')}
                <option value="custom">Custom Site Rules (Editing Mode)...</option>
              </select>
            </div>
            <div class="field-desc-box text-muted" id="field-desc-box" style="font-size: 11.5px; line-height: 1.4;">
              Select a field above to inspect constraints.
            </div>
          </div>

          <div class="profile-lock-bar wb-epistemic-row" id="profile-lock-bar">
            ${renderEpistemicSigilHtml('entailed', 'FieldConstraintProfile')}
            <div>
              <div class="lock-status-pill locked" id="lock-status-pill">Locked to Venue Rules</div>
              <div class="lock-hint-text text-muted" id="lock-hint-text" style="font-size: 11.5px; margin-top: 2px;">
                Locked to official venue limits. Unlock to customize.
              </div>
            </div>
          </div>

          <div class="wb-sec-hdr">
            <span>Site Constraints</span>
            <span id="section-lock-indicator" class="lock-indicator-tag locked">READ ONLY</span>
          </div>

          <div class="wb-block-pad" style="border-bottom: 1px solid var(--border-subtle);">
            <div class="form-group">
              <div class="slider-header">
                <label for="input-max-joules">Max Muzzle Energy</label>
                <span class="slider-val" id="val-max-joules">1.14 J</span>
              </div>
              <input type="range" id="input-max-joules" min="0.5" max="3.0" step="0.05" value="1.14" class="advisor-slider">
              <div class="slider-subtext" id="fps-equivalent">~350 FPS with 0.20g BB</div>
            </div>

            <div class="form-group">
              <div class="slider-header">
                <label for="input-max-length">Max CQB Length</label>
                <span class="slider-val" id="val-max-length">800 mm</span>
              </div>
              <input type="range" id="input-max-length" min="400" max="1400" step="25" value="800" class="advisor-slider">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <div class="slider-header">
                <label for="input-med">Min Engagement Dist (MED)</label>
                <span class="slider-val" id="val-med">0 m</span>
              </div>
              <input type="range" id="input-med" min="0" max="30" step="5" value="0" class="advisor-slider">
            </div>
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

          <div class="matching-fields-card" id="matching-fields-card" style="display: none;">
            <div class="wb-sec-hdr">
              <span>Venue Rule Matcher</span>
              <span class="matching-count-badge tabular-nums" id="matching-count-badge">0 Matches</span>
            </div>
            <div class="matching-fields-grid" id="matching-fields-grid"></div>
          </div>

          <div class="wb-sec-hdr">
            <span>2. Tactical Role &amp; Environment</span>
          </div>

          <div class="wb-block-pad">
            <div class="form-group">
              <label>Requested Role</label>
              <div class="role-btn-grid" id="role-btn-grid">
                ${(advisorData.tacticalRoles || []).map((r, i) => `
                  <button type="button" class="role-btn ${i === 0 ? 'active' : ''}" data-role-id="${escapeHtml(r.id)}" data-skos="${escapeHtml(r.skosConcept)}">
                    ${escapeHtml(r.label)}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <div class="slider-header">
                <label for="input-temp">Ambient Temperature</label>
                <span class="slider-val" id="val-temp">18 C</span>
              </div>
              <input type="range" id="input-temp" min="-5" max="35" step="1" value="18" class="advisor-slider">
              <div class="cold-warning-msg" id="cold-warning" style="display:none;">
                Sub-10C cold weather: Gas GBBR replicas risk cool-down.
              </div>
            </div>

            <button type="button" id="btn-evaluate" class="btn-primary-evaluate">
              Run Suitability Assessment
            </button>
          </div>
        </section>

        <!-- Right Sub-Pane: Assessment Results -->
        <section class="advisor-results-card">
          <div class="wb-sec-hdr">
            <span>3. Candidate Suitability Ranking</span>
            <span class="results-count-badge tabular-nums" id="results-count-badge">Evaluating...</span>
          </div>

          <div class="results-filter-toolbar">
            <div class="results-search-box">
              <input type="text" id="results-search-input" class="advisor-search-input" placeholder="Filter replicas by name, brand, SKOS tag..." autocomplete="off">
              <button type="button" id="results-search-clear" class="btn-clear-search" style="display:none;" aria-label="Clear search">&times;</button>
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
                ${Array.from(new Set((advisorData.replicas || []).map(r => r.brand))).sort().map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
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
            <div class="wb-prop-row"><span class="wb-prop-key">Status</span><span class="wb-prop-val text-muted">Evaluating replicas against ontology rules...</span></div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function bindEvents() {
  const btnLock = document.getElementById('btn-toggle-lock');
  if (btnLock) {
    btnLock.addEventListener('click', () => {
      setProfileLockState(!isProfileLocked);
    });
  }

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
      document.getElementById('fps-equivalent').innerText = `~${fps} FPS with 0.20g BB`;
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
      document.getElementById('val-temp').innerText = `${temp} C`;
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

  const matchingGrid = document.getElementById('matching-fields-grid');
  if (matchingGrid) {
    matchingGrid.addEventListener('click', (e) => {
      const item = e.target.closest('.matching-field-item');
      if (item) {
        const fieldId = item.dataset.fieldId;
        const select = document.getElementById('field-preset-select');
        if (select) {
          select.value = fieldId;
          selectFieldPreset(fieldId);
        }
      }
    });
  }

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
      const modal = document.getElementById('skos-modal');
      if (modal) modal.style.display = 'none';
    });
  }
}

function setProfileLockState(locked) {
  isProfileLocked = locked;
  const btnLock = document.getElementById('btn-toggle-lock');
  const lockIcon = document.getElementById('lock-icon');
  const lockBtnText = document.getElementById('lock-btn-text');
  const pill = document.getElementById('lock-status-pill');
  const hint = document.getElementById('lock-hint-text');
  const indicator = document.getElementById('section-lock-indicator');
  const matchingCard = document.getElementById('matching-fields-card');

  const els = [
    document.getElementById('input-max-joules'),
    document.getElementById('input-max-length'),
    document.getElementById('input-med'),
    document.getElementById('chk-semi-only'),
    document.getElementById('chk-bio-bb'),
    document.getElementById('chk-tracer')
  ];

  els.forEach(el => {
    if (el) {
      el.disabled = isProfileLocked;
      el.classList.toggle('cursor-locked', isProfileLocked);
    }
  });

  if (isProfileLocked) {
    if (btnLock) btnLock.className = 'btn-lock-toggle btn-locked';
    if (lockIcon) lockIcon.innerHTML = PRIORY_UI_ICONS.lock;
    if (lockBtnText) lockBtnText.innerText = 'Unlock';
    if (pill) {
      pill.className = 'lock-status-pill locked';
      pill.innerText = 'Locked to Venue Rules';
    }
    if (hint) hint.innerText = 'Locked to official venue limits. Unlock to customize.';
    if (indicator) {
      indicator.className = 'lock-indicator-tag locked';
      indicator.innerText = 'READ ONLY';
    }
    if (matchingCard) matchingCard.style.display = 'none';
  } else {
    if (btnLock) btnLock.className = 'btn-lock-toggle btn-unlocked';
    if (lockIcon) lockIcon.innerHTML = PRIORY_UI_ICONS.unlock;
    if (lockBtnText) lockBtnText.innerText = 'Lock';
    if (pill) {
      pill.className = 'lock-status-pill unlocked';
      pill.innerText = 'Custom Profile (Unlocked)';
    }
    if (hint) hint.innerText = 'Adjust constraints below to check compatible venues.';
    if (indicator) {
      indicator.className = 'lock-indicator-tag unlocked';
      indicator.innerText = 'EDITING';
    }
    if (matchingCard) {
      matchingCard.style.display = 'block';
      renderMatchingFields();
    }
  }
}

function renderMatchingFields() {
  const matchingCard = document.getElementById('matching-fields-card');
  if (!matchingCard || isProfileLocked) return;

  const joules = parseFloat(document.getElementById('input-max-joules').value);
  const length = parseInt(document.getElementById('input-max-length').value, 10);
  const med = parseInt(document.getElementById('input-med').value, 10);
  const semiOnly = document.getElementById('chk-semi-only').checked;
  const bioBb = document.getElementById('chk-bio-bb').checked;
  const tracer = document.getElementById('chk-tracer').checked;

  const fields = advisorData.fields || [];
  let matchCount = 0;

  const itemsHtml = fields.map(f => {
    const issues = [];
    if (joules > f.maxJoules) issues.push(`Energy (${joules.toFixed(2)}J) > venue max (${f.maxJoules.toFixed(2)}J)`);
    if (length > f.maxPermissibleLengthMm) issues.push(`Length (${length}mm) > venue max (${f.maxPermissibleLengthMm}mm)`);
    if (f.isSemiOnlyRestricted && !semiOnly) issues.push(`Venue requires Semi-Only`);
    if (f.requiresBioBB && !bioBb) issues.push(`Venue mandates Bio BBs`);
    if (f.requiresTracerUnit && !tracer) issues.push(`Venue mandates Tracer`);
    if (med < f.minEngagementDistanceMeters) issues.push(`Venue requires MED >= ${f.minEngagementDistanceMeters}m`);

    const isMatch = issues.length === 0;
    if (isMatch) matchCount++;

    return `
      <div class="matching-field-item ${isMatch ? 'match-ok' : 'match-fail'}" data-field-id="${escapeHtml(f.id)}" title="${isMatch ? 'Click to select venue' : escapeHtml(issues.join(' | '))}">
        <div class="wb-prop-row" style="border-bottom:none;padding:2px 0;">
          <span class="wb-prop-key" style="color:var(--text-primary);display:flex;align-items:center;gap:5px;">
            <span class="${isMatch ? 'tag-ok' : 'tag-fail'}">${isMatch ? PRIORY_UI_ICONS.check : PRIORY_UI_ICONS.cross}</span>
            ${escapeHtml(f.name)}
          </span>
          <span class="wb-prop-val ${isMatch ? 'tag-ok' : 'tag-fail'}">${isMatch ? 'Allowed' : escapeHtml(issues[0])}</span>
        </div>
      </div>
    `;
  }).join('');

  const badge = document.getElementById('matching-count-badge');
  if (badge) badge.innerText = `${matchCount} / ${fields.length} Match`;

  const grid = document.getElementById('matching-fields-grid');
  if (grid) grid.innerHTML = itemsHtml;
}

function selectFieldPreset(fieldId) {
  if (fieldId === 'custom') {
    selectedField = null;
    document.getElementById('field-desc-box').innerText = 'Custom user-configured field rule profile.';
    setProfileLockState(false);
    triggerEvaluate();
    return;
  }

  const field = (advisorData.fields || []).find(f => f.id === fieldId);
  if (!field) return;

  selectedField = field;
  document.getElementById('field-desc-box').innerHTML = `<strong>${escapeHtml(field.name)}</strong> (${escapeHtml(field.type)}) — ${escapeHtml(field.description)}`;

  document.getElementById('input-max-joules').value = field.maxJoules;
  document.getElementById('val-max-joules').innerText = `${field.maxJoules.toFixed(2)} J`;
  const fps = Math.round(Math.sqrt((field.maxJoules * 2) / 0.0002) * 3.28084);
  document.getElementById('fps-equivalent').innerText = `~${fps} FPS with 0.20g BB`;

  document.getElementById('input-max-length').value = field.maxPermissibleLengthMm;
  document.getElementById('val-max-length').innerText = `${field.maxPermissibleLengthMm} mm`;

  document.getElementById('input-med').value = field.minEngagementDistanceMeters;
  document.getElementById('val-med').innerText = `${field.minEngagementDistanceMeters} m`;

  document.getElementById('chk-semi-only').checked = field.isSemiOnlyRestricted;
  document.getElementById('chk-bio-bb').checked = field.requiresBioBB;
  document.getElementById('chk-tracer').checked = field.requiresTracerUnit;

  setProfileLockState(true);
  runEvaluation();
}

function triggerEvaluate() {
  clearTimeout(evalTimeout);
  evalTimeout = setTimeout(() => {
    runEvaluation();
    if (!isProfileLocked) {
      renderMatchingFields();
    }
  }, 150);
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
    resultsContainer.innerHTML = `<div class="wb-prop-row"><span class="wb-prop-key">Status</span><span class="wb-prop-val text-muted">Evaluating candidate replicas...</span></div>`;
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
      latestEvaluatedResults = getResultsFallback(currentFieldState);
    }
  } catch (err) {
    console.warn('API error during evaluation, using client fallback logic:', err);
    latestEvaluatedResults = getResultsFallback(currentFieldState);
  }

  applyResultsFilterAndRender();
}

function applyResultsFilterAndRender() {
  const searchInput = document.getElementById('results-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const propFilter = document.getElementById('results-filter-propulsion')?.value || 'ALL';
  const weaponFilter = document.getElementById('results-filter-weapon')?.value || 'ALL';
  const brandFilter = document.getElementById('results-filter-brand')?.value || 'ALL';
  const statusFilter = document.getElementById('results-filter-status')?.value || 'ALL';

  const filtered = latestEvaluatedResults.filter(res => {
    const r = res.replica || {};

    if (query) {
      const haystack = [
        r.name, r.brand, r.propulsion, r.description,
        r.skosPlatform, r.skosPropulsion, r.skosBrand, r.skosRole,
        r.owlClass
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (propFilter !== 'ALL') {
      const p = r.skosPropulsion || '';
      const pText = r.propulsion || '';
      if (!p.includes(propFilter) && !pText.toLowerCase().includes(propFilter.toLowerCase())) {
        return false;
      }
    }

    if (weaponFilter !== 'ALL') {
      const role = r.skosRole || '';
      const plat = r.skosPlatform || '';
      const cls = r.owlClass || '';
      if (!role.includes(weaponFilter) && !plat.includes(weaponFilter) && !cls.includes(weaponFilter)) {
        return false;
      }
    }

    if (brandFilter !== 'ALL') {
      if (!r.brand || !r.brand.toLowerCase().includes(brandFilter.toLowerCase())) {
        return false;
      }
    }

    if (statusFilter !== 'ALL' && res.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const countBadge = document.getElementById('results-count-badge');
  if (countBadge) {
    countBadge.innerText = `${filtered.length} / ${latestEvaluatedResults.length} Replicas`;
  }

  renderResultsGrid(filtered);
}

function renderResultsGrid(results) {
  const container = document.getElementById('results-grid');
  if (!container) return;

  if (!results || results.length === 0) {
    container.innerHTML = `<div class="wb-prop-row"><span class="wb-prop-key">Matches</span><span class="wb-prop-val text-muted">No candidate replicas matched current filter criteria</span></div>`;
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
            <div class="replica-brand">${escapeHtml(r.brand)}</div>
            <h4 class="replica-name">${escapeHtml(r.name)}</h4>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="score-num tabular-nums">${score}%</span>
            <span class="badge ${escapeHtml(statusBadge)}">${escapeHtml(res.status)}</span>
          </div>
        </div>

        <div class="score-container">
          <div class="score-bar-bg">
            <div class="score-bar-fill ${score >= 85 ? 'fill-optimal' : score >= 65 ? 'fill-permissible' : score >= 40 ? 'fill-suboptimal' : 'fill-noncompliant'}" style="width: ${score}%;"></div>
          </div>
        </div>

        <div class="replica-specs">
          <div class="wb-prop-row"><span class="wb-prop-key">Muzzle Energy</span><span class="wb-prop-val">${r.muzzleEnergyJoules} J (${r.velocityFps020} FPS)</span></div>
          <div class="wb-prop-row"><span class="wb-prop-key">Overall Length</span><span class="wb-prop-val">${r.overallLengthMm} mm</span></div>
          <div class="wb-prop-row"><span class="wb-prop-key">Weight (Mass)</span><span class="wb-prop-val">${r.weightKg ? `${r.weightKg.toFixed(2)} kg (${Math.round(r.weightKg * 1000)}g)` : 'N/A'}</span></div>
          <div class="wb-prop-row"><span class="wb-prop-key">Propulsion</span><span class="wb-prop-val">${escapeHtml(r.propulsion)}</span></div>
          <div class="wb-prop-row"><span class="wb-prop-key">Firing Modes</span><span class="wb-prop-val">${escapeHtml((r.firingModes || []).join(', '))}</span></div>
        </div>

        <div class="skos-badges-row">
          ${renderBfoSigilHtml('gdc', '', 'SKOS Concepts')}
          ${r.skosPropulsion ? `<button type="button" class="skos-chip" onclick="window.inspectSkosConcept('${escapeHtml(r.skosPropulsion)}')"><code>${escapeHtml(r.skosPropulsion)}</code></button>` : ''}
          ${r.skosPlatform ? `<button type="button" class="skos-chip" onclick="window.inspectSkosConcept('${escapeHtml(r.skosPlatform)}')"><code>${escapeHtml(r.skosPlatform)}</code></button>` : ''}
          ${r.skosRole ? `<button type="button" class="skos-chip" onclick="window.inspectSkosConcept('${escapeHtml(r.skosRole)}')"><code>${escapeHtml(r.skosRole)}</code></button>` : ''}
          ${r.skosBrand ? `<button type="button" class="skos-chip" onclick="window.inspectSkosConcept('${escapeHtml(r.skosBrand)}')"><code>${escapeHtml(r.skosBrand)}</code></button>` : ''}
        </div>

        ${(res.disqualifications || []).map(d => `
          <div class="wb-epistemic-row">
            ${renderEpistemicSigilHtml('entailed', 'SHACL Disqualification')}
            <span class="text-red">${escapeHtml(d)}</span>
          </div>
        `).join('')}

        ${(res.warnings || []).map(w => `
          <div class="wb-epistemic-row">
            ${renderEpistemicSigilHtml('synthesized', 'Tactical Warning')}
            <span class="text-amber">${escapeHtml(w)}</span>
          </div>
        `).join('')}

        ${(res.checks || []).map(c => `
          <div class="wb-prop-row">
            <span class="wb-prop-key" style="display:flex;align-items:center;gap:5px;">
              <span class="${c.passed ? 'check-pass' : 'check-fail'}">${c.passed ? PRIORY_UI_ICONS.check : PRIORY_UI_ICONS.cross}</span>
              ${escapeHtml(c.name)}
            </span>
            <span class="wb-prop-val ${c.passed ? 'check-pass' : 'check-fail'}" title="${escapeHtml(c.msg)}">${escapeHtml(c.msg)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function getResultsFallback(field) {
  const replicas = advisorData.replicas || [];

  const results = replicas.map(r => {
    let score = 100;
    const disqs = [];
    const warns = [];
    const checks = [];

    if (r.muzzleEnergyJoules > field.maxJoules) {
      score -= 50;
      disqs.push(`Energy (${r.muzzleEnergyJoules}J) exceeds limit (${field.maxJoules}J).`);
      checks.push({ name: 'Safety Energy Ceiling', passed: false, msg: `EXCEEDED: ${r.muzzleEnergyJoules}J > ${field.maxJoules}J` });
    } else {
      checks.push({ name: 'Safety Energy Ceiling', passed: true, msg: `COMPLIANT: ${r.muzzleEnergyJoules}J <= ${field.maxJoules}J` });
    }

    if (r.overallLengthMm > field.maxPermissibleLengthMm) {
      score -= 25;
      warns.push(`Length (${r.overallLengthMm}mm) exceeds max CQB clearance (${field.maxPermissibleLengthMm}mm).`);
      checks.push({ name: 'Layout Clearance', passed: false, msg: 'SUBOPTIMAL' });
    } else {
      checks.push({ name: 'Layout Clearance', passed: true, msg: 'OPTIMAL' });
    }

    score = Math.max(0, score);
    const status = disqs.length > 0 || score < 40 ? 'Non-Compliant Match' : score >= 85 ? 'Optimal Match' : 'Permissible Match';
    const badgeClass = status === 'Optimal Match' ? 'status-optimal' : status === 'Permissible Match' ? 'status-permissible' : 'status-noncompliant';

    return { replica: r, matchScore: score, status, badgeClass, disqualifications: disqs, warnings: warns, checks };
  });

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

// Global helper to show SKOS Concept in Docked Right Inspector
window.inspectSkosConcept = async function (conceptId) {
  const modal = document.getElementById('skos-modal');
  if (!modal) return;

  // Ensure right inspector pane is open
  document.getElementById('app')?.classList.remove('wb-no-right');
  const titleEl = document.getElementById('inspector-pane-title');
  const metaEl = document.getElementById('inspector-pane-meta');
  if (titleEl) titleEl.textContent = 'Inspector · SKOS Concept';
  if (metaEl) metaEl.textContent = conceptId;

  modal.style.display = 'block';
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
        document.getElementById('skos-modal-alt').innerHTML = `<div class="wb-prop-row"><span class="wb-prop-key">Alt Labels</span><span class="wb-prop-val">${escapeHtml(data.altLabels.join(', '))}</span></div>`;
      }
      document.getElementById('skos-modal-scope').innerText = data.scopeNote || 'Managed in airsoft-skos-2000 controlled vocabulary.';
    }
  } catch (err) {
    document.getElementById('skos-modal-def').innerText = `SKOS Concept ${conceptId} in controlled vocabulary.`;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReplicaAdvisor);
} else {
  initReplicaAdvisor();
}
