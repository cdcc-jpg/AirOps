/**
 * SPARQL Academy Sandbox — Frontend Engine
 * Drives query execution, cytoscape graph visualization, OWL schema indexing,
 * and guided pedagogical practice missions.
 */

// Guided Missions Configuration
const MISSIONS = [
  {
    id: "mission1",
    level: 1,
    title: "1. The Medic Callsigns",
    scenario: "Explore player roles. Write a query to find the URIs and callsigns of all players who hold the role of \"Medic\". Make sure to SELECT exactly two variables: ?player and ?callsign.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?player ?callsign
WHERE {
  # Write a triple pattern that matches players and their callsigns
  ?player a asoft:AirsoftPlayer ;
          asoft:hasRole "Medic" ;
          asoft:callsign ?callsign .
}`,
    hint: "Use `asoft:hasRole \"Medic\"` and match the predicate `asoft:callsign` to retrieve callsign literal values.",
    validate: (vars, results) => {
      if (!vars.includes("player") || !vars.includes("callsign")) {
        return "Your query must SELECT variables ?player and ?callsign.";
      }
      if (results.length === 0) {
        return "Query returned no results. Make sure namespaces are correct.";
      }
      // Check that all matched players are indeed Medics
      const medicCount = results.filter(r => r.player.includes("P_") && r.callsign).length;
      if (medicCount < 2) {
        return `Expected to find at least 5 medics in the sign-in registry, found ${medicCount}.`;
      }
      return true;
    }
  },
  {
    id: "mission2",
    level: 2,
    title: "2. The Chrono Overpowers",
    scenario: "Identify safety violations. Find the URIs of all players, their replica models, and their muzzle energy (joules) for replicas that failed the chrono checks because they are over-powered (energy > 1.2J) and are BANNED. SELECT ?player, ?model, and ?energy.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?player ?model ?energy
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:complianceStatus "BANNED" ;
          asoft:usesGear ?replica .
  
  ?replica asoft:hasModelName ?model ;
           asoft:hasPowerLimit ?energy .
  
  # Filter energy levels above the 1.2 Joules limit
  FILTER (?energy > 1.2)
}`,
    hint: "Use `FILTER (?energy > 1.2)` and assert `asoft:complianceStatus \"BANNED\"` on the player node.",
    validate: (vars, results) => {
      const required = ["player", "model", "energy"];
      if (!required.every(v => vars.includes(v))) {
        return "Query must SELECT ?player, ?model, and ?energy.";
      }
      if (results.length === 0) {
        return "No results found. Verify your FILTER condition.";
      }
      const bannedHighEnergy = results.every(r => parseFloat(r.energy) > 1.2);
      if (!bannedHighEnergy) {
        return "Some results include replicas with energy <= 1.2J. Adjust your FILTER.";
      }
      return true;
    }
  },
  {
    id: "mission3",
    level: 3,
    title: "3. Audit Warning History",
    scenario: "Left-joins with OPTIONAL. We want to list all players callsigns, along with their warning counts if they have received any. Use OPTIONAL so that players without warnings are still returned with a blank warnCount. SELECT ?callsign and ?warnCount.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?callsign ?warnCount
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:callsign ?callsign .
          
  # Use OPTIONAL to query warnings without filtering out players without violations
  OPTIONAL {
    ?player asoft:hasWarning ?warning .
    ?warning asoft:warningCount ?warnCount .
  }
}`,
    hint: "OPTIONAL blocks preserve all rows on the left side of the match. Put the warning pattern inside `OPTIONAL { ... }`.",
    validate: (vars, results) => {
      if (!vars.includes("callsign") || !vars.includes("warnCount")) {
        return "Query must SELECT ?callsign and ?warnCount.";
      }
      // Expect some nulls/blanks for warnCount
      const totalCount = results.length;
      const blankWarnings = results.filter(r => !r.warnCount).length;
      if (blankWarnings === 0) {
        return "OPTIONAL did not return any blank fields; check if you wrote a standard cross-product instead of a left-join.";
      }
      if (blankWarnings === totalCount) {
        return "All warnCount values are blank. Verify your warning property predicate.";
      }
      return true;
    }
  },
  {
    id: "mission4",
    level: 4,
    title: "4. Total Team Energies",
    scenario: "SPARQL Aggregations. Calculate the sum of muzzle energy (joules) and the count of players grouped by their assigned Team color. SELECT ?team, ?totalEnergy, and ?playerCount.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?team (SUM(?joules) AS ?totalEnergy) (COUNT(?player) AS ?playerCount)
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:belongsToTeam ?team ;
          asoft:usesGear ?replica .
          
  ?replica asoft:hasPowerLimit ?joules .
}
GROUP BY ?team`,
    hint: "Remember to use `GROUP BY ?team` and alias expressions like `(SUM(?joules) AS ?totalEnergy)`.",
    validate: (vars, results) => {
      const required = ["team", "totalEnergy", "playerCount"];
      if (!required.every(v => vars.includes(v))) {
        return "Query must SELECT ?team, ?totalEnergy, and ?playerCount.";
      }
      if (results.length < 2) {
        return "Expected grouped aggregation rows for at least the two teams (Band, Nonband).";
      }
      const hasLargeEnergy = results.some(r => parseFloat(r.totalEnergy) > 10.0);
      if (!hasLargeEnergy) {
        return "Total energy sums are unexpectedly low. Check your SUM expression.";
      }
      return true;
    }
  },
  {
    id: "mission5",
    level: 5,
    title: "5. Snipers vs Riflemen Averages",
    scenario: "Advanced Subquery comparison. Calculate the average muzzle energy of Snipers compared to the average of Riflemen. Write a SELECT query returning ?role and ?avgEnergy, filtering for only roles 'Sniper' and 'Rifleman'.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?role (AVG(?joules) AS ?avgEnergy)
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:hasRole ?role ;
          asoft:usesGear ?replica .
          
  ?replica asoft:hasPowerLimit ?joules .
  
  FILTER (?role = "Sniper" || ?role = "Rifleman")
}
GROUP BY ?role`,
    hint: "Use `AVG(?joules) AS ?avgEnergy` grouped by `?role` and FILTER for roles 'Sniper' or 'Rifleman'.",
    validate: (vars, results) => {
      if (!vars.includes("role") || !vars.includes("avgEnergy")) {
        return "Query must SELECT ?role and ?avgEnergy.";
      }
      const roles = results.map(r => r.role);
      if (!roles.includes("Sniper") || !roles.includes("Rifleman")) {
        return "Result set must contain average records for both 'Sniper' and 'Rifleman' roles.";
      }
      const sniperAvg = parseFloat(results.find(r => r.role === 'Sniper')?.avgEnergy || 0);
      const riflemanAvg = parseFloat(results.find(r => r.role === 'Rifleman')?.avgEnergy || 0);
      if (sniperAvg <= riflemanAvg) {
        return "Averages math error: Snipers average joules should be higher than Riflemen.";
      }
      return true;
    }
  },
  {
    id: "mission6",
    level: 6,
    title: "6. Tracing Elimination Networks",
    scenario: "Explore graph path relationships. Find all elimination events, displaying the attacker callsign, target callsign, and field zone where the event took place. SELECT ?attackerCallsign, ?targetCallsign, and ?zone.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?attackerCallsign ?targetCallsign ?zone
WHERE {
  ?event a asoft:GameEvent ;
         asoft:eventType "elimination" ;
         asoft:hasAttacker ?attacker ;
         asoft:hasTarget ?target ;
         asoft:hasZone ?zone .
         
  ?attacker asoft:callsign ?attackerCallsign .
  ?target asoft:callsign ?targetCallsign .
}`,
    hint: "Game events link back to player nodes via predicates `asoft:hasAttacker` and `asoft:hasTarget`. Pull their callsigns to display.",
    validate: (vars, results) => {
      const required = ["attackerCallsign", "targetCallsign", "zone"];
      if (!required.every(v => vars.includes(v))) {
        return "Query must SELECT ?attackerCallsign, ?targetCallsign, and ?zone.";
      }
      if (results.length === 0) {
        return "No elimination events traced. Note: you might need to log eliminations in the main console or run default demo values.";
      }
      return true;
    }
  }
];

class SPARQLSandbox {
  constructor() {
    this.editor = null;
    this.activeMission = null;
    this.cy = null;
    this.classes = [];
    this.properties = [];
    this.missionStatus = JSON.parse(localStorage.getItem("sparql_academy_missions") || "{}");
  }

  async init() {
    console.log("Initializing SPARQL Academy sandbox...");
    
    this._initCodeMirror();
    this._initTabs();
    this._initListeners();
    this._renderMissions();
    
    // Load dictionary & default first mission
    await this._loadOntologyDictionary();
    this._selectMission("mission1");
  }

  _initCodeMirror() {
    const textarea = document.getElementById("editor");
    this.editor = CodeMirror.fromTextArea(textarea, {
      mode: "sparql",
      theme: "material-darker",
      lineNumbers: true,
      matchBrackets: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true
    });
  }

  _initTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        const outputType = btn.dataset.output;
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(`output-${outputType}`).classList.add("active");
        
        if (outputType === "graph" && this.cy) {
          // Resize and center Cytoscape layout on tab transition
          setTimeout(() => {
            this.cy.resize();
            this.cy.layout({ name: 'cose', animate: false }).run();
          }, 50);
        }
      });
    });
  }

  _initListeners() {
    document.getElementById("btn-execute").addEventListener("click", () => this._runActiveQuery());
    document.getElementById("btn-reset").addEventListener("click", () => this._resetQuery());
  }

  _renderMissions() {
    const container = document.getElementById("missions-list");
    container.innerHTML = MISSIONS.map(m => {
      const isDone = this.missionStatus[m.id];
      const statusClass = isDone ? "status-done" : "status-todo";
      const statusLabel = isDone ? "PASSED" : "TODO";
      
      return `
        <div class="mission-card" id="card-${m.id}" data-id="${m.id}">
          <div class="mission-meta">
            <span class="mission-level">LEVEL ${m.level}</span>
            <span class="mission-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="mission-title">${m.title}</div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".mission-card").forEach(card => {
      card.addEventListener("click", () => {
        this._selectMission(card.dataset.id);
      });
    });
  }

  _selectMission(missionId) {
    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return;

    this.activeMission = mission;
    
    // Toggle active card
    document.querySelectorAll(".mission-card").forEach(c => c.classList.remove("active"));
    document.getElementById(`card-${missionId}`).classList.add("active");
    
    // Set query editor text
    this.editor.setValue(mission.defaultQuery);
    
    // Render left panel info
    const statusLabel = document.getElementById("validation-status");
    statusLabel.className = "validation-badge badge-ready";
    statusLabel.textContent = "Status: Ready";

    // Build description HTML in Table Pane if query not run yet
    const container = document.getElementById("grid-container");
    container.innerHTML = `
      <div class="mission-detail-panel" style="margin: 20px;">
        <div class="schema-category-title" style="margin: 0; color: var(--accent-cyan); font-size: 0.95rem;">${mission.title}</div>
        <div class="mission-desc" style="margin-top: 8px; font-size: 0.82rem;">${mission.scenario}</div>
        <div style="margin-top: var(--space-sm); font-weight: bold; font-size: 0.72rem;">HINT & REFERENCE:</div>
        <div class="mission-constraint">${mission.hint}</div>
        <button class="btn btn-primary" id="btn-start-mission" style="margin-top: 12px; align-self: flex-start;">🚀 Start Coding Query</button>
      </div>
    `;

    document.getElementById("btn-start-mission")?.addEventListener("click", () => {
      this.editor.focus();
    });
  }

  _resetQuery() {
    if (this.activeMission) {
      this.editor.setValue(this.activeMission.defaultQuery);
    }
  }

  async _runActiveQuery() {
    const query = this.editor.getValue();
    const statusLabel = document.getElementById("validation-status");
    const container = document.getElementById("grid-container");

    statusLabel.className = "validation-badge badge-ready";
    statusLabel.textContent = "Executing SPARQL query...";

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();

      if (data.error) {
        statusLabel.className = "validation-badge badge-error";
        statusLabel.textContent = "Syntax Error";
        container.innerHTML = `<div style="padding: var(--space-md); color: var(--accent-red); font-family: var(--font-mono); white-space: pre-wrap;">${data.error}</div>`;
        return;
      }

      // 1. Render Table output
      this._renderResultsTable(data.vars, data.results);

      // 2. Render Cytoscape Graph Visualization
      this._renderResultsGraph(data.vars, data.results);

      // 3. Perform Mission Validation
      if (this.activeMission) {
        const validationResult = this.activeMission.validate(data.vars, data.results);
        if (validationResult === true) {
          statusLabel.className = "validation-badge badge-success";
          statusLabel.textContent = "Mission Passed! 🎉";
          
          // Save status
          this.missionStatus[this.activeMission.id] = true;
          localStorage.setItem("sparql_academy_missions", JSON.stringify(this.missionStatus));
          
          // Re-render list
          this._renderMissions();
          document.getElementById(`card-${this.activeMission.id}`).classList.add("active");
        } else {
          statusLabel.className = "validation-badge badge-error";
          statusLabel.textContent = "Failed Check";
          // Append error message to table pane bottom
          const errDiv = document.createElement("div");
          errDiv.style.cssText = "margin: 12px; padding: 10px; background: rgba(231,76,60,0.06); border: 1px solid rgba(231,76,60,0.15); border-radius: 4px; color: var(--accent-red); font-size: 0.72rem;";
          errDiv.innerHTML = `<strong>⚠️ Mission Check Failed:</strong> ${validationResult}`;
          container.appendChild(errDiv);
        }
      }

    } catch (err) {
      statusEl.className = "validation-badge badge-error";
      statusEl.textContent = "Server Offline";
      container.innerHTML = `<div style="padding: var(--space-md); color: var(--accent-red); font-family: var(--font-mono);">${err.message}</div>`;
    }
  }

  _renderResultsTable(vars, results) {
    const container = document.getElementById("grid-container");
    if (results.length === 0) {
      container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">Empty result set returned.</div>';
      return;
    }

    let html = `<table><thead><tr>`;
    for (const v of vars) {
      html += `<th>?${v}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (const row of results) {
      html += `<tr>`;
      for (const v of vars) {
        let val = row[v] || "";
        // Suffix display cleanup for raw URIs
        if (val.startsWith("http") && val.includes("#")) {
          const suffix = val.split("#")[1];
          html += `<td title="${val}" style="color: var(--accent-cyan);">${suffix}</td>`;
        } else {
          html += `<td title="${val}">${val}</td>`;
        }
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  _renderResultsGraph(vars, results) {
    const elements = [];
    const nodeTracker = new Set();

    // Scan results rows to assemble Node & Edge elements
    results.forEach((row, rowIndex) => {
      const rowNodes = [];
      
      vars.forEach(v => {
        const val = row[v];
        if (!val) return;
        
        // Node identification: URIs or player IDs
        const isURI = val.startsWith("http") || val.includes("#") || val.startsWith("P_") || val.startsWith("Team_");
        if (isURI) {
          const suffix = val.includes("#") ? val.split("#")[1] : val;
          const nodeID = val;
          
          if (!nodeTracker.has(nodeID)) {
            nodeTracker.add(nodeID);
            
            // Assign shapes and colors based on class types
            let color = '#2196f3';
            let shape = 'ellipse';
            if (val.startsWith("P_") || val.includes("Player")) { color = '#94a3b8'; shape = 'round-rectangle'; }
            else if (val.includes("Team_Nonband")) { color = '#64748b'; shape = 'hexagon'; }
            else if (val.includes("Team_Band")) { color = '#f1c40f'; shape = 'hexagon'; }
            else if (val.includes("Replica") || val.includes("usesGear")) { color = '#00e5ff'; shape = 'triangle'; }
            else if (val.includes("Warning") || val.includes("violation")) { color = '#e74c3c'; shape = 'diamond'; }
            
            elements.push({
              data: { id: nodeID, label: suffix, color, shape }
            });
          }
          rowNodes.push(nodeID);
        }
      });

      // Draw Edges between nodes found in the same row
      if (rowNodes.length >= 2) {
        // Draw links between adjacent URIs in the result row
        for (let i = 0; i < rowNodes.length - 1; i++) {
          const source = rowNodes[i];
          const target = rowNodes[i+1];
          
          // Determine edge label based on variable name
          let edgeLabel = "links";
          const varSrc = vars[i];
          const varTgt = vars[i+1];
          if (varSrc === "player" && varTgt === "callsign") edgeLabel = "callsign";
          else if (varSrc === "player" && varTgt === "replica") edgeLabel = "usesGear";
          else if (varSrc === "player" && varTgt === "team") edgeLabel = "belongsToTeam";
          else if (varSrc === "player" && varTgt === "energy") edgeLabel = "replicaEnergy";
          else if (varSrc === "attackerCallsign" && varTgt === "targetCallsign") edgeLabel = "eliminated";
          
          elements.push({
            data: {
              id: `edge_${rowIndex}_${i}`,
              source,
              target,
              label: edgeLabel
            }
          });
        }
      }
    });

    if (elements.length === 0) {
      document.getElementById("graph-container").innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">No relationships to visualize in query output.</div>';
      return;
    }

    // Initialize Cytoscape.js
    this.cy = cytoscape({
      container: document.getElementById('graph-container'),
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'shape': 'data(shape)',
            'color': '#ffffff',
            'font-family': 'Outfit',
            'font-size': '10px',
            'text-valign': 'center',
            'text-halign': 'center',
            'width': '55px',
            'height': '35px',
            'border-width': 1,
            'border-color': '#000000'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': 'rgba(255,255,255,0.15)',
            'target-arrow-color': 'rgba(255,255,255,0.15)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'color': '#94a3b8',
            'font-family': 'JetBrains Mono',
            'font-size': '8px',
            'text-rotation': 'autorotate',
            'text-margin-y': -8
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeOverlap: 20,
        componentSpacing: 40,
        refresh: 20
      }
    });
  }

  async _loadOntologyDictionary() {
    const dictContainer = document.getElementById("schema-dictionary");
    dictContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.7rem;">Loading classes & properties...</div>';

    // Fetch classes and properties directly from the RDF microservice using SPARQL
    const qClasses = `PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?class ?label ?comment WHERE {
  ?class a owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
  OPTIONAL { ?class rdfs:comment ?comment }
} ORDER BY ?class`;

    const qProps = `PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?prop ?label ?comment WHERE {
  { ?prop a owl:ObjectProperty } UNION { ?prop a owl:DatatypeProperty }
  OPTIONAL { ?prop rdfs:label ?label }
  OPTIONAL { ?prop rdfs:comment ?comment }
} ORDER BY ?prop`;

    try {
      const [resC, resP] = await Promise.all([
        fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: qClasses }) }).then(r => r.json()),
        fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: qProps }) }).then(r => r.json())
      ]);

      let html = `<div class="schema-category-title">OWL Classes</div>`;
      if (resC.results && resC.results.length > 0) {
        resC.results.forEach(c => {
          const suffix = c.class.includes("#") ? c.class.split("#")[1] : c.class;
          if (suffix.startsWith("Node") || suffix.startsWith("Thing")) return; // ignore meta
          const desc = c.comment || "No definition specified.";
          html += `
            <div class="schema-item" data-term="asoft:${suffix}">
              <span class="schema-item-uri">asoft:${suffix}</span>
              <span class="schema-item-desc">${desc}</span>
            </div>
          `;
        });
      } else {
        html += `<div style="color: var(--text-muted); font-size: 0.65rem;">No classes found.</div>`;
      }

      html += `<div class="schema-category-title" style="margin-top: 15px;">Properties</div>`;
      if (resP.results && resP.results.length > 0) {
        resP.results.forEach(p => {
          const suffix = p.prop.includes("#") ? p.prop.split("#")[1] : p.prop;
          const desc = p.comment || "No definition specified.";
          html += `
            <div class="schema-item" data-term="asoft:${suffix}">
              <span class="schema-item-uri" style="color: var(--accent-green)">asoft:${suffix}</span>
              <span class="schema-item-desc">${desc}</span>
            </div>
          `;
        });
      } else {
        html += `<div style="color: var(--text-muted); font-size: 0.65rem;">No properties found.</div>`;
      }

      dictContainer.innerHTML = html;

      // Hook dictionary items to paste into editor
      dictContainer.querySelectorAll(".schema-item").forEach(item => {
        item.addEventListener("click", () => {
          const term = item.dataset.term;
          this.editor.replaceSelection(term);
          this.editor.focus();
        });
      });

    } catch (e) {
      dictContainer.innerHTML = `<div style="color: var(--accent-red); font-size: 0.65rem;">Failed to connect to dictionary backend.</div>`;
    }
  }
}

// Instantiate on startup
document.addEventListener("DOMContentLoaded", () => {
  const app = new SPARQLSandbox();
  app.init();
  window.sandbox = app;
});
