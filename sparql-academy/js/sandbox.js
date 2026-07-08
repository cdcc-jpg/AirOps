/**
 * SPARQL Academy Sandbox — Frontend Engine
 * Drives query execution, cytoscape graph visualization, OWL schema indexing,
 * and guided pedagogical practice missions.
 */

// Guided Missions Configuration (Scaffolded with comments/gaps)
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
  # Write triple patterns below to match:
  # 1. ?player has type asoft:AirsoftPlayer
  # 2. ?player has role (asoft:hasRole) "Medic"
  # 3. ?player has callsign (asoft:callsign) ?callsign
  
  # YOUR CODE HERE
  
}`,
    hint: `Visual Pattern:
(?player) ──rdf:type──▶ asoft:AirsoftPlayer
    │
    ├──asoft:hasRole──▶ "Medic"
    │
    └──asoft:callsign──▶ (?callsign)

Use \`asoft:hasRole "Medic"\` and bind the \`asoft:callsign\` predicate to \`?callsign\`.`,
    validate: (vars, results) => {
      if (!vars.includes("player") || !vars.includes("callsign")) {
        return "Your query must SELECT variables ?player and ?callsign.";
      }
      if (results.length === 0) {
        return "Query returned no results. Make sure namespaces and filters are correct.";
      }
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
  
  # YOUR CODE HERE:
  # 1. Match ?replica to its model name (?model) using asoft:hasModelName
  # 2. Match ?replica to its power limit (?energy) using asoft:hasPowerLimit
  # 3. Add a FILTER for energy levels above 1.2 Joules
  
}`,
    hint: `Visual Pattern:
(?player) ──asoft:usesGear──▶ (?replica) ──asoft:hasPowerLimit──▶ (?energy > 1.2)
    │                                    └──asoft:hasModelName──▶ (?model)
    └──asoft:complianceStatus──▶ "BANNED"

Use \`asoft:hasModelName\` and \`asoft:hasPowerLimit\`. Filter with \`FILTER (?energy > 1.2)\`.`,
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
    scenario: "Left-joins with OPTIONAL. We want to list all players' callsigns, along with their warning counts if they have received any. Use OPTIONAL so that players without warnings are still returned with a blank warnCount. SELECT ?callsign and ?warnCount.",
    defaultQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?callsign ?warnCount
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:callsign ?callsign .
          
  # YOUR CODE HERE:
  # Use OPTIONAL to query warnings without filtering out players without violations.
  # 1. Match ?player hasWarning ?warning
  # 2. Match ?warning warningCount ?warnCount
  
}`,
    hint: `Visual Pattern:
(?player) ──asoft:callsign──▶ (?callsign)
    │
  (OPTIONAL)
    │
    └──asoft:hasWarning──▶ (?warning) ──asoft:warningCount──▶ (?warnCount)

Use: \`OPTIONAL { ?player asoft:hasWarning ?warning . ?warning asoft:warningCount ?warnCount . }\``,
    validate: (vars, results) => {
      if (!vars.includes("callsign") || !vars.includes("warnCount")) {
        return "Query must SELECT ?callsign and ?warnCount.";
      }
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

# YOUR CODE HERE:
# SELECT ?team, the SUM of ?joules (as ?totalEnergy), and the COUNT of ?player (as ?playerCount)
SELECT

WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:belongsToTeam ?team ;
          asoft:usesGear ?replica .
          
  ?replica asoft:hasPowerLimit ?joules .
}
# YOUR CODE HERE: GROUP BY ?team
`,
    hint: `Visual Pattern:
(?player) ──asoft:belongsToTeam──▶ (?team)
    │
    └──asoft:usesGear──▶ (?replica) ──asoft:hasPowerLimit──▶ (?joules)

Group by (?team), select SUM(?joules) and COUNT(?player).
Use \`GROUP BY ?team\` and alias expressions like \`(SUM(?joules) AS ?totalEnergy)\`.`,
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
  # YOUR CODE HERE:
  # 1. Match player role and replica
  # 2. Match replica power limit to ?joules
  # 3. Filter for roles 'Sniper' and 'Rifleman'
  
}
GROUP BY ?role`,
    hint: `Visual Pattern:
(?player) ──asoft:hasRole──▶ (?role ∈ {"Sniper", "Rifleman"})
    │
    └──asoft:usesGear──▶ (?replica) ──asoft:hasPowerLimit──▶ (?joules)

Group by (?role), select AVG(?joules).
Use \`AVG(?joules) AS ?avgEnergy\` and \`FILTER (?role = "Sniper" || ?role = "Rifleman")\`.`,
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
        return "Averages math error: Snipers' average joules should be higher than Riflemen.";
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
  # YOUR CODE HERE:
  # 1. Match ?event of type asoft:GameEvent and eventType "elimination"
  # 2. Retrieve ?attacker, ?target, and ?zone
  # 3. Resolve ?attacker and ?target callsigns as ?attackerCallsign and ?targetCallsign
  
}`,
    hint: `Visual Pattern:
(?event) ──asoft:hasAttacker──▶ (?attacker) ──asoft:callsign──▶ (?attackerCallsign)
   │ ├──asoft:hasTarget────▶ (?target)   ──asoft:callsign──▶ (?targetCallsign)
   │ ├──asoft:hasZone──────▶ (?zone)
   │ └──asoft:eventType─────▶ "elimination"

Game events link to player nodes via \`asoft:hasAttacker\` and \`asoft:hasTarget\`. Link their callsigns using \`asoft:callsign\`.`,
    validate: (vars, results) => {
      const required = ["attackerCallsign", "targetCallsign", "zone"];
      if (!required.every(v => vars.includes(v))) {
        return "Query must SELECT ?attackerCallsign, ?targetCallsign, and ?zone.";
      }
      if (results.length === 0) {
        return "No elimination events traced. Note: you might need to run default values.";
      }
      return true;
    }
  }
];

// Interactive Guided Tutorials Configuration (Scaffolded with blanks & new levels)
const TUTORIALS = [
  {
    id: "tut1",
    level: 1,
    title: "1. The RDF Triple",
    steps: [
      {
        stepId: 1,
        title: "Subject-Predicate Match",
        instruction: "Let's learn how to match a node class. Add a basic triple pattern matching any subject variable `?player` that is of type `asoft:AirsoftPlayer`. Use `SELECT *` to retrieve all matching variables.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT *
WHERE {
  # Add the triple pattern below
  
}`,
        hint: `Visual Pattern:
(?player) ──rdf:type──▶ asoft:AirsoftPlayer

Type \`?player a asoft:AirsoftPlayer .\` inside the WHERE clause.`,
        validate: (queryText, vars, results) => {
          const hasPattern = /\?player\s+(a|rdf:type)\s+asoft:AirsoftPlayer/i.test(queryText);
          if (!hasPattern) return "Please match `?player a asoft:AirsoftPlayer .`";
          if (results.length === 0) return "Query returned no results. Check syntax.";
          return true;
        }
      },
      {
        stepId: 2,
        title: "Extracting Properties",
        instruction: "Great! Now let's extract the callsign property. Add a second triple pattern to match the player's callsign predicate `asoft:callsign` and bind it to a new variable `?callsign`.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT *
WHERE {
  ?player a asoft:AirsoftPlayer .
  # YOUR CODE HERE: Match ?player callsign predicate to variable ?callsign
  
}`,
        hint: `Visual Pattern:
(?player) ──asoft:callsign──▶ (?callsign)

Write \`?player asoft:callsign ?callsign .\` or chain it with a semicolon (\`;\`).`,
        validate: (queryText, vars, results) => {
          const hasProp = /asoft:callsign\s+\?callsign/i.test(queryText);
          if (!hasProp) return "Please match the player's callsign to variable `?callsign`.";
          if (!vars.includes("callsign")) return "Make sure ?callsign is projected/available in results.";
          return true;
        }
      },
      {
        stepId: 3,
        title: "Variable Projection",
        instruction: "Excellent. Instead of displaying all columns using `SELECT *`, project only the callsign. Change `SELECT *` to `SELECT ?callsign`.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

# YOUR CODE HERE: Change * to only project ?callsign
SELECT *
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:callsign ?callsign .
}`,
        hint: "Replace the \`*\` in the SELECT clause with \`?callsign\`.",
        validate: (queryText, vars, results) => {
          const cleanQuery = queryText.replace(/\s+/g, ' ');
          const projectsOnlyCallsign = /SELECT\s+\?callsign\s/i.test(cleanQuery);
          if (!projectsOnlyCallsign) return "Your query must project exactly `?callsign`. Check that `SELECT *` was replaced.";
          if (vars.includes("player")) return "Ensure you are NOT projecting ?player. Only project ?callsign.";
          return true;
        }
      }
    ]
  },
  {
    id: "tut2",
    level: 2,
    title: "2. Constraints & Filters",
    steps: [
      {
        stepId: 1,
        title: "Retrieving Power Limits",
        instruction: "Let's find players and the power limits of their gear. Match players to their replicas using `asoft:usesGear`, and retrieve the power limits (`asoft:hasPowerLimit`) as `?energy`.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?player ?energy
WHERE {
  ?player a asoft:AirsoftPlayer .
  # Match the player to their gear replica and its power limit below
  
}`,
        hint: `Visual Pattern:
(?player) ──asoft:usesGear──▶ (?replica) ──asoft:hasPowerLimit──▶ (?energy)

Write: \`?player asoft:usesGear ?replica .\` and \`?replica asoft:hasPowerLimit ?energy .\``,
        validate: (queryText, vars, results) => {
          const hasGear = /asoft:usesGear/i.test(queryText);
          const hasPower = /asoft:hasPowerLimit/i.test(queryText);
          if (!hasGear || !hasPower) return "Ensure you match both `asoft:usesGear` and `asoft:hasPowerLimit`.";
          return true;
        }
      },
      {
        stepId: 2,
        title: "Applying Numeric Filter",
        instruction: "Now, let's filter out lower energy replicas. Add a `FILTER` expression to restrict the results to replicas with power limit values strictly greater than 1.1 Joules.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?player ?energy
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:usesGear ?replica .
  ?replica asoft:hasPowerLimit ?energy .
  
  # YOUR CODE HERE: Add FILTER here
  
}`,
        hint: `Visual Pattern:
(?energy) ──FILTER(?energy > 1.1)──▶ [Matched Rows]

Use: \`FILTER (?energy > 1.1)\``,
        validate: (queryText, vars, results) => {
          const hasFilter = /FILTER\s*\(\s*\?energy\s*>\s*1\.1\s*\)/i.test(queryText);
          if (!hasFilter) return "Add `FILTER (?energy > 1.1)` to isolate high power replicas.";
          if (results.some(r => parseFloat(r.energy) <= 1.1)) return "Some returned energy values are <= 1.1J. Check filter logic.";
          return true;
        }
      }
    ]
  },
  {
    id: "tut3",
    level: 3,
    title: "3. Grouping & Aggregate Counts",
    steps: [
      {
        stepId: 1,
        title: "Grouping Variable",
        instruction: "Let's group players by role. First, select all roles and query players who hold them using `asoft:hasRole`. Group by the `?role` variable using `GROUP BY`.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?role
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:hasRole ?role .
}
# YOUR CODE HERE: Add the GROUP BY clause below
`,
        hint: `Visual Pattern:
(?player) ──asoft:hasRole──▶ (?role)
Group by (?role)

Type \`GROUP BY ?role\` at the end of the query.`,
        validate: (queryText, vars, results) => {
          if (!/GROUP\s+BY\s+\?role/i.test(queryText)) return "Ensure you include `GROUP BY ?role` at the end.";
          return true;
        }
      },
      {
        stepId: 2,
        title: "Applying Count Aggregator",
        instruction: "Now, let's count the number of players associated with each role. Add `(COUNT(?player) AS ?playerCount)` to your SELECT clause.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

# YOUR CODE HERE: Add the COUNT expression inside the SELECT statement
SELECT ?role
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:hasRole ?role .
}
GROUP BY ?role`,
        hint: "Include \`(COUNT(?player) AS ?playerCount)\` alongside \`?role\` in the SELECT line.",
        validate: (queryText, vars, results) => {
          if (!/COUNT\s*\(\s*\?player\s*\)\s+AS\s+\?playerCount/i.test(queryText)) {
            return "Please alias the count of ?player as ?playerCount inside SELECT.";
          }
          if (!vars.includes("playerCount")) return "Make sure ?playerCount is projected.";
          return true;
        }
      }
    ]
  },
  {
    id: "tut4",
    level: 4,
    title: "4. Optional Patterns",
    steps: [
      {
        stepId: 1,
        title: "Standard Join (Filters unmatched)",
        instruction: "Let's see what happens with a normal join. Write a query to find all player callsigns and their warning types. Note that players without warnings will be missing from the results.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?callsign ?type
WHERE {
  # YOUR CODE HERE:
  # 1. Match ?player as asoft:AirsoftPlayer with callsign ?callsign
  # 2. Join ?player hasWarning ?warning and ?warning warningType ?type
  
}`,
        hint: `Visual Pattern:
(?player) ──asoft:callsign──▶ (?callsign)
    │
    └──asoft:hasWarning──▶ (?warning) ──asoft:warningType──▶ (?type)

Write triple patterns matching player, callsign, warning, and warning type.`,
        validate: (queryText, vars, results) => {
          if (!vars.includes("callsign") || !vars.includes("type")) return "SELECT ?callsign and ?type.";
          if (results.length === 0) return "Query returned no results.";
          const allHaveWarnings = results.every(r => r.type && r.type.trim() !== "");
          if (!allHaveWarnings) return "Standard inner join should only return players who have warning logs.";
          return true;
        }
      },
      {
        stepId: 2,
        title: "Left Join using OPTIONAL",
        instruction: "Now, let's keep all players in the list, even if they have no warnings. Wrap the warning triples in an `OPTIONAL` block.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?callsign ?type
WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:callsign ?callsign .
  
  # YOUR CODE HERE:
  # Wrap the warning triples below in an OPTIONAL { ... } block
  ?player asoft:hasWarning ?warning .
  ?warning asoft:warningType ?type .
}`,
        hint: `Visual Pattern:
(?player) ──asoft:callsign──▶ (?callsign)
  (OPTIONAL) ──▶ (?warning) ──asoft:warningType──▶ (?type)

Wrap the warning pattern triples inside \`OPTIONAL { ... }\`.`,
        validate: (queryText, vars, results) => {
          const hasOptional = /OPTIONAL\s*\{/i.test(queryText);
          if (!hasOptional) return "Wrap the warning patterns inside an `OPTIONAL { ... }` block.";
          const nullRows = results.filter(r => !r.type);
          if (nullRows.length === 0) return "OPTIONAL didn't return any blank fields; check your block boundaries.";
          return true;
        }
      }
    ]
  },
  {
    id: "tut5",
    level: 5,
    title: "5. Alternative Patterns",
    steps: [
      {
        stepId: 1,
        title: "Alternative Types (UNION)",
        instruction: "Sometimes we want to query nodes matching either one pattern OR another. Write a query to find nodes that are either an AirsoftPlayer or an AirsoftTeam. SELECT ?node and ?type.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

SELECT ?node ?type
WHERE {
  # YOUR CODE HERE: Match (?node a asoft:AirsoftPlayer) OR (?node a asoft:AirsoftTeam)
  # Syntax: { PatternA } UNION { PatternB }
  
}`,
        hint: `Visual Pattern:
   { (?node) ──rdf:type──▶ asoft:AirsoftPlayer }
                     UNION
   { (?node) ──rdf:type──▶ asoft:AirsoftTeam   }

Use the \`UNION\` keyword to combine the two braced patterns.`,
        validate: (queryText, vars, results) => {
          const hasUnion = /UNION/i.test(queryText);
          if (!hasUnion) return "Use the `UNION` keyword to combine alternative paths.";
          const playerMatches = results.filter(r => r.node.includes("P_") || r.node.includes("Player"));
          const teamMatches = results.filter(r => r.node.includes("Team_"));
          if (playerMatches.length === 0 || teamMatches.length === 0) return "Query should return both players and teams.";
          return true;
        }
      },
      {
        stepId: 2,
        title: "Matching Divergent Properties",
        instruction: "Let's retrieve names for the combined nodes. For players, we match `asoft:callsign` as `?label`. For teams, we match `rdfs:label` as `?label`. SELECT ?node and ?label.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?node ?label
WHERE {
  {
    ?node a asoft:AirsoftPlayer ;
          asoft:callsign ?label .
  }
  UNION
  {
    # YOUR CODE HERE: Match ?node as an AirsoftTeam and bind its rdfs:label to ?label
    
  }
}`,
        hint: `Visual Pattern:
{ ?node a asoft:AirsoftPlayer ; asoft:callsign ?label }
UNION
{ ?node a asoft:AirsoftTeam ; rdfs:label ?label }

Inside the second block of UNION, match the team and its \`rdfs:label\` property to \`?label\`.`,
        validate: (queryText, vars, results) => {
          const hasRdfsLabel = /rdfs:label\s+\?label/i.test(queryText);
          if (!hasRdfsLabel) return "Please query `rdfs:label ?label` for teams in the second block.";
          const hasLabel = results.every(r => r.label);
          if (!hasLabel) return "Some nodes did not resolve to a label variable.";
          return true;
        }
      }
    ]
  },
  {
    id: "tut6",
    level: 6,
    title: "6. Constructing Graphs",
    steps: [
      {
        stepId: 1,
        title: "Constructing Custom Triples",
        instruction: "So far we returned tabular data. SPARQL can also construct new RDF graphs using `CONSTRUCT`. Write a query to construct new triples of format `?player asoft:isTeammateOf ?team` for all players that belong to a team.",
        startingQuery: `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>

# YOUR CODE HERE: Write a CONSTRUCT clause to define teammate relations
# Syntax: CONSTRUCT { ?player asoft:isTeammateOf ?team }

WHERE {
  ?player a asoft:AirsoftPlayer ;
          asoft:belongsToTeam ?team .
}`,
        hint: `Visual Pattern:
Construct: (?player) ──asoft:isTeammateOf──▶ (?team)

Type \`CONSTRUCT { ?player asoft:isTeammateOf ?team }\` above the WHERE clause.`,
        validate: (queryText, vars, results) => {
          const hasConstruct = /CONSTRUCT\s*\{/i.test(queryText);
          if (!hasConstruct) return "Use the `CONSTRUCT { ... }` block instead of SELECT.";
          const teammateEdges = results.filter(r => r.predicate.includes("isTeammateOf"));
          if (teammateEdges.length === 0) return "Query did not construct any isTeammateOf relationships.";
          return true;
        }
      }
    ]
  }
];

class SPARQLSandbox {
  constructor() {
    this.editor = null;
    this.activeMission = null;
    this.activeTutorial = null;
    this.activeStepIndex = 0;
    this.cy = null;
    this.classes = [];
    this.properties = [];
    this.nodeMetadata = {}; // Cache of human-readable labels/types
    this.missionStatus = JSON.parse(localStorage.getItem("sparql_academy_missions") || "{}");
    this.tutorialStatus = JSON.parse(localStorage.getItem("sparql_academy_tutorials") || "{}");
  }

  async init() {
    console.log("Initializing SPARQL Academy sandbox...");
    
    this._initCodeMirror();
    this._initTabs();
    this._initListeners();
    this._renderMissions();
    this._renderTutorials();
    this._initSidebarTabs();
    this._initTutorialListeners();
    
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
            this.cy.layout({ name: 'dagre', rankDir: 'LR', animate: false }).run();
          }, 50);
        }
      });
    });
  }

  _initSidebarTabs() {
    const tabMissions = document.getElementById("tab-missions");
    const tabTutorials = document.getElementById("tab-tutorials");
    const listMissions = document.getElementById("missions-list");
    const listTutorials = document.getElementById("tutorials-list");
    const stepBanner = document.getElementById("tutorial-step-banner");

    tabMissions.addEventListener("click", () => {
      tabMissions.classList.add("active");
      tabMissions.style.borderBottomColor = "var(--accent-cyan)";
      tabMissions.style.color = "var(--text-heading)";

      tabTutorials.classList.remove("active");
      tabTutorials.style.borderBottomColor = "transparent";
      tabTutorials.style.color = "var(--text-secondary)";

      listMissions.style.display = "flex";
      listTutorials.style.display = "none";
      stepBanner.style.display = "none";

      this.activeTutorial = null;
      this._selectMission(this.activeMission ? this.activeMission.id : "mission1");
    });

    tabTutorials.addEventListener("click", () => {
      tabTutorials.classList.add("active");
      tabTutorials.style.borderBottomColor = "var(--accent-cyan)";
      tabTutorials.style.color = "var(--text-heading)";

      tabMissions.classList.remove("active");
      tabMissions.style.borderBottomColor = "transparent";
      tabMissions.style.color = "var(--text-secondary)";

      listMissions.style.display = "none";
      listTutorials.style.display = "flex";
      stepBanner.style.display = "flex";

      this.activeMission = null;
      this._selectTutorial("tut1");
    });
  }

  _initListeners() {
    document.getElementById("btn-execute").addEventListener("click", () => this._runActiveQuery());
    document.getElementById("btn-reset").addEventListener("click", () => this._resetQuery());
  }

  _initTutorialListeners() {
    document.getElementById("btn-tutorial-prev").addEventListener("click", () => {
      if (this.activeTutorial && this.activeStepIndex > 0) {
        this.activeStepIndex--;
        this._updateStepUI();
      }
    });

    document.getElementById("btn-tutorial-next").addEventListener("click", () => {
      if (this.activeTutorial && this.activeStepIndex < this.activeTutorial.steps.length - 1) {
        this.activeStepIndex++;
        this._updateStepUI();
      }
    });

    document.getElementById("btn-tutorial-hint").addEventListener("click", () => {
      const hintEl = document.getElementById("tutorial-step-hint");
      const hintBtn = document.getElementById("btn-tutorial-hint");
      if (hintEl.style.display === "none") {
        hintEl.style.display = "block";
        hintBtn.textContent = "Hide Hint";
      } else {
        hintEl.style.display = "none";
        hintBtn.textContent = "💡 Hint";
      }
    });
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
        
        <button class="btn btn-secondary" id="btn-show-mission-hint" style="margin-top: 12px; font-size: 0.72rem; align-self: flex-start;">💡 Show Hint & Reference</button>
        <pre class="mission-constraint" id="mission-hint-box" style="margin-top: 8px; display: none; white-space: pre-wrap; font-family: monospace;">${mission.hint}</pre>
        
        <button class="btn btn-primary" id="btn-start-mission" style="margin-top: 12px; align-self: flex-start;">🚀 Start Coding Query</button>
      </div>
    `;

    document.getElementById("btn-show-mission-hint")?.addEventListener("click", () => {
      const hintBox = document.getElementById("mission-hint-box");
      const hintBtn = document.getElementById("btn-show-mission-hint");
      if (hintBox.style.display === "none") {
        hintBox.style.display = "block";
        hintBtn.textContent = "Hide Hint & Reference";
      } else {
        hintBox.style.display = "none";
        hintBtn.textContent = "💡 Show Hint & Reference";
      }
    });

    document.getElementById("btn-start-mission")?.addEventListener("click", () => {
      this.editor.focus();
    });
  }

  _renderTutorials() {
    const container = document.getElementById("tutorials-list");
    container.innerHTML = TUTORIALS.map(t => {
      const isDone = this.tutorialStatus[t.id];
      const statusClass = isDone ? "status-done" : "status-todo";
      const statusLabel = isDone ? "PASSED" : "TODO";
      
      return `
        <div class="mission-card" id="card-${t.id}" data-id="${t.id}">
          <div class="mission-meta">
            <span class="mission-level">LEVEL ${t.level}</span>
            <span class="mission-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="mission-title">${t.title}</div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".mission-card").forEach(card => {
      card.addEventListener("click", () => {
        this._selectTutorial(card.dataset.id);
      });
    });
  }

  _selectTutorial(tutId) {
    const tut = TUTORIALS.find(t => t.id === tutId);
    if (!tut) return;

    this.activeTutorial = tut;
    this.activeStepIndex = 0;

    // Toggle active card
    document.querySelectorAll("#tutorials-list .mission-card").forEach(c => c.classList.remove("active"));
    const card = document.getElementById(`card-${tutId}`);
    if (card) card.classList.add("active");

    this._updateStepUI();
  }

  _updateStepUI() {
    if (!this.activeTutorial) return;
    const step = this.activeTutorial.steps[this.activeStepIndex];
    if (!step) return;

    // Update Banner elements
    document.getElementById("tutorial-step-title").textContent = `Step ${this.activeStepIndex + 1} of ${this.activeTutorial.steps.length}: ${step.title}`;
    document.getElementById("tutorial-step-instruction").textContent = step.instruction;
    
    const hintEl = document.getElementById("tutorial-step-hint");
    hintEl.textContent = step.hint;
    hintEl.style.display = "none";
    document.getElementById("btn-tutorial-hint").textContent = "💡 Hint";

    // Set editor value to startingQuery
    this.editor.setValue(step.startingQuery);

    // Disable Next button initially for this step, and adjust Prev button
    document.getElementById("btn-tutorial-next").setAttribute("disabled", "true");
    
    const prevBtn = document.getElementById("btn-tutorial-prev");
    if (this.activeStepIndex === 0) {
      prevBtn.setAttribute("disabled", "true");
    } else {
      prevBtn.removeAttribute("disabled");
    }

    // Set status to ready
    const statusLabel = document.getElementById("validation-status");
    statusLabel.className = "validation-badge badge-ready";
    statusLabel.textContent = "Status: Ready";

    // Build description HTML in Table Pane if query not run yet
    const container = document.getElementById("grid-container");
    container.innerHTML = `
      <div class="mission-detail-panel" style="margin: 20px;">
        <div class="schema-category-title" style="margin: 0; color: var(--accent-cyan); font-size: 0.95rem;">${this.activeTutorial.title} - ${step.title}</div>
        <div class="mission-desc" style="margin-top: 8px; font-size: 0.82rem;">${step.instruction}</div>
        
        <button class="btn btn-secondary" id="btn-show-step-hint" style="margin-top: 12px; font-size: 0.72rem; align-self: flex-start;">💡 Show Hint & Reference</button>
        <pre class="mission-constraint" id="step-hint-box" style="margin-top: 8px; display: none; white-space: pre-wrap; font-family: monospace;">${step.hint}</pre>
        
        <button class="btn btn-primary" id="btn-start-tutorial-step" style="margin-top: 12px; align-self: flex-start;">🚀 Start Coding Step</button>
      </div>
    `;

    document.getElementById("btn-show-step-hint")?.addEventListener("click", () => {
      const hintBox = document.getElementById("step-hint-box");
      const hintBtn = document.getElementById("btn-show-step-hint");
      if (hintBox.style.display === "none") {
        hintBox.style.display = "block";
        hintBtn.textContent = "Hide Hint & Reference";
      } else {
        hintBox.style.display = "none";
        hintBtn.textContent = "💡 Show Hint & Reference";
      }
    });

    document.getElementById("btn-start-tutorial-step")?.addEventListener("click", () => {
      this.editor.focus();
    });
  }

  _resetQuery() {
    if (this.activeMission) {
      this.editor.setValue(this.activeMission.defaultQuery);
    } else if (this.activeTutorial) {
      const step = this.activeTutorial.steps[this.activeStepIndex];
      if (step) {
        this.editor.setValue(step.startingQuery);
      }
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
      // Run companion SELECT * query for non-grouped SELECT queries to capture all intermediate variables
      let graphData = data;
      const selectMatch = query.match(/SELECT\s+([\s\S]*?)\s+WHERE/i);
      const hasGroupBy = /GROUP\s+BY/i.test(query);
      const isConstruct = /CONSTRUCT\s*\{/i.test(query);

      if (selectMatch && !hasGroupBy && !isConstruct) {
        try {
          const companionQuery = query.replace(/SELECT\s+[\s\S]*?\s+WHERE/i, "SELECT * WHERE");
          const companionRes = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: companionQuery })
          });
          const companionData = await companionRes.json();
          if (!companionData.error) {
            graphData = companionData;
          }
        } catch (e) {
          console.warn("Failed to fetch companion graph data, falling back to query results", e);
        }
      }

      this._renderResultsGraph(graphData.vars, graphData.results, query);

      // 3. Perform Mission / Tutorial Validation
      if (this.activeTutorial) {
        const step = this.activeTutorial.steps[this.activeStepIndex];
        const validationResult = step.validate(query, data.vars, data.results);
        if (validationResult === true) {
          statusLabel.className = "validation-badge badge-success";
          
          if (this.activeStepIndex === this.activeTutorial.steps.length - 1) {
            statusLabel.textContent = "Tutorial Passed! 🎉";
            this.tutorialStatus[this.activeTutorial.id] = true;
            localStorage.setItem("sparql_academy_tutorials", JSON.stringify(this.tutorialStatus));
            this._renderTutorials();
            const activeCard = document.getElementById(`card-${this.activeTutorial.id}`);
            if (activeCard) activeCard.classList.add("active");
          } else {
            statusLabel.textContent = "Step Passed! 🎉";
            document.getElementById("btn-tutorial-next").removeAttribute("disabled");
          }

          const successDiv = document.createElement("div");
          successDiv.style.cssText = "margin: 12px; padding: 10px; background: rgba(46,204,113,0.06); border: 1px solid rgba(46,204,113,0.15); border-radius: 4px; color: var(--accent-green); font-size: 0.72rem;";
          if (this.activeStepIndex === this.activeTutorial.steps.length - 1) {
            successDiv.innerHTML = `<strong>✨ Tutorial Complete:</strong> Outstanding work! You built the query successfully from scratch.`;
          } else {
            successDiv.innerHTML = `<strong>✨ Step Passed:</strong> Good job! Click "Next" to continue.`;
          }
          container.appendChild(successDiv);
        } else {
          statusLabel.className = "validation-badge badge-error";
          statusLabel.textContent = "Failed Step Check";
          const errDiv = document.createElement("div");
          errDiv.style.cssText = "margin: 12px; padding: 10px; background: rgba(231,76,60,0.06); border: 1px solid rgba(231,76,60,0.15); border-radius: 4px; color: var(--accent-red); font-size: 0.72rem;";
          errDiv.innerHTML = `<strong>⚠️ Step Check Failed:</strong> ${validationResult}`;
          container.appendChild(errDiv);
        }
      } else if (this.activeMission) {
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
      statusLabel.className = "validation-badge badge-error";
      statusLabel.textContent = "Server Error";
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

  // Parse triple patterns client-side to infer relationships
  _parseTriplePatterns(queryText) {
    // Strip comments
    let cleaned = queryText.replace(/#.*$/gm, "");
    
    // Extract text inside WHERE block (allowing nested braces)
    const whereMatch = cleaned.match(/WHERE\s*\{([\s\S]*)\}/i);
    if (!whereMatch) return [];
    
    let whereContent = whereMatch[1];
    
    // Clean braces and optional keywords
    whereContent = whereContent.replace(/OPTIONAL\s*\{/gi, " ");
    whereContent = whereContent.replace(/UNION\s*\{/gi, " ");
    whereContent = whereContent.replace(/[\{\}]/g, " ");
    whereContent = whereContent.replace(/FILTER\s*\(.*?\)/gi, " ");
    whereContent = whereContent.replace(/BIND\s*\(.*?\)/gi, " ");

    const patterns = [];
    // Split by '.' except when it's part of a decimal number
    const rawStatements = whereContent.split(/(?:\s\.\s*|\.\s*$|\.\r?\n)/);
    
    for (let stmt of rawStatements) {
      stmt = stmt.trim();
      if (!stmt) continue;
      
      const parts = stmt.split(";").map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      
      // First part has Subject Predicate Object
      const firstPartTokens = parts[0].split(/\s+/);
      if (firstPartTokens.length < 3) continue;
      
      const subject = firstPartTokens[0];
      const predicate = firstPartTokens[1];
      const object = firstPartTokens.slice(2).join(" ");
      
      patterns.push({ subject, predicate, object });
      
      // Subsequent semicolon-separated parts share the subject
      for (let i = 1; i < parts.length; i++) {
        const subTokens = parts[i].split(/\s+/);
        if (subTokens.length < 2) continue;
        const subPred = subTokens[0];
        const subObj = subTokens.slice(1).join(" ");
        patterns.push({ subject, predicate: subPred, object: subObj });
      }
    }
    return patterns;
  }

  _getNodeLabel(uri) {
    if (!uri) return "";
    if (uri === "a" || uri === "rdf:type" || uri === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") return "type";
    
    // Check metadata
    const meta = this.nodeMetadata[uri];
    if (meta && meta.labels.size > 0) {
      return Array.from(meta.labels)[0];
    }
    
    // Suffix from prefix formats
    if (uri.startsWith("asoft:") || uri.startsWith("foaf:") || uri.startsWith("rdf:") || uri.startsWith("rdfs:")) {
      return uri.split(":")[1];
    }
    
    // Fallback: split by '#' or '/'
    if (uri.includes("#")) {
      return uri.split("#")[1];
    }
    if (uri.includes("/")) {
      return uri.split("/").pop();
    }
    return uri;
  }

  _getNodeStyle(uri) {
    const meta = this.nodeMetadata[uri];
    let color = '#2196f3';
    let shape = 'ellipse';
    
    const types = meta ? Array.from(meta.types) : [];
    const typesStr = types.join(" ") + " " + uri;
    
    if (typesStr.includes("AirsoftPlayer") || typesStr.includes("Player") || uri.includes("P_")) {
      color = '#00e5ff'; // Cyan for player
      shape = 'round-rectangle';
    } else if (typesStr.includes("AirsoftTeam") || uri.includes("Team_")) {
      color = '#f1c40f'; // Gold for team
      shape = 'hexagon';
    } else if (typesStr.includes("Replica") || typesStr.includes("Rifle") || uri.includes("Replica")) {
      color = '#2ecc71'; // Green for gear/replica
      shape = 'triangle';
    } else if (typesStr.includes("Warning") || uri.includes("Warning")) {
      color = '#e74c3c'; // Red for warning
      shape = 'diamond';
    } else if (typesStr.includes("GameEvent") || uri.includes("Event_")) {
      color = '#9b59b6'; // Purple for game events
      shape = 'octagon';
    } else if (typesStr.includes("FieldZone") || uri.includes("Zone_")) {
      color = '#e67e22'; // Orange for zones
      shape = 'rectangle';
    } else if (uri.startsWith("asoft:") || uri.startsWith("foaf:") || uri.startsWith("owl:")) {
      color = '#34495e'; // Dark slate for schema classes/properties
      shape = 'ellipse';
    } else {
      color = '#94a3b8'; // Slate/gray for literals
      shape = 'ellipse';
    }
    
    return { color, shape };
  }

  _renderResultsGraph(vars, results, queryText) {
    const elements = [];
    const nodeTracker = new Set();
    const edgeTracker = new Set();

    const isConstruct = /CONSTRUCT\s*\{/i.test(queryText);
    const hasGroupBy = /GROUP\s+BY/i.test(queryText);

    // Case 1: CONSTRUCT queries return a graph triples list directly
    if (isConstruct && vars.includes("subject") && vars.includes("predicate") && vars.includes("object")) {
      results.forEach((row) => {
        const subVal = row.subject;
        const predVal = row.predicate;
        const objVal = row.object;
        if (!subVal || !objVal) return;

        // Add Subject Node
        if (!nodeTracker.has(subVal)) {
          nodeTracker.add(subVal);
          const style = this._getNodeStyle(subVal);
          elements.push({
            data: { id: subVal, label: this._getNodeLabel(subVal), color: style.color, shape: style.shape }
          });
        }

        // Add Object Node
        if (!nodeTracker.has(objVal)) {
          nodeTracker.add(objVal);
          const style = this._getNodeStyle(objVal);
          elements.push({
            data: { id: objVal, label: this._getNodeLabel(objVal), color: style.color, shape: style.shape }
          });
        }

        // Add Edge
        const edgeId = `${subVal}_${predVal}_${objVal}`;
        if (!edgeTracker.has(edgeId)) {
          edgeTracker.add(edgeId);
          elements.push({
            data: { id: edgeId, source: subVal, target: objVal, label: this._getNodeLabel(predVal) }
          });
        }
      });
    }
    // Case 2: GROUP BY aggregate queries
    else if (hasGroupBy) {
      results.forEach((row, rowIndex) => {
        const groupVar = vars[0];
        const groupVal = row[groupVar];
        if (!groupVal) return;

        if (!nodeTracker.has(groupVal)) {
          nodeTracker.add(groupVal);
          const style = this._getNodeStyle(groupVal);
          elements.push({
            data: { id: groupVal, label: this._getNodeLabel(groupVal), color: style.color, shape: style.shape }
          });
        }

        // Connect group node to aggregate value nodes
        for (let i = 1; i < vars.length; i++) {
          const aggVar = vars[i];
          const aggVal = row[aggVar];
          if (!aggVal) continue;

          const aggNodeId = `agg_${rowIndex}_${aggVar}_${aggVal}`;
          if (!nodeTracker.has(aggNodeId)) {
            nodeTracker.add(aggNodeId);
            elements.push({
              data: { id: aggNodeId, label: `${aggVar}: ${aggVal}`, color: '#94a3b8', shape: 'ellipse' }
            });
          }

          const edgeId = `${groupVal}_${aggVar}_${aggNodeId}`;
          if (!edgeTracker.has(edgeId)) {
            edgeTracker.add(edgeId);
            elements.push({
              data: { id: edgeId, source: groupVal, target: aggNodeId, label: aggVar }
            });
          }
        }
      });
    }
    // Case 3: Standard SELECT queries mapped via parsed WHERE triple patterns
    else {
      const patterns = this._parseTriplePatterns(queryText);
      results.forEach((row, rowIndex) => {
        patterns.forEach(pat => {
          let subVal = pat.subject;
          if (subVal.startsWith("?")) {
            subVal = row[subVal.slice(1)];
          }
          
          let objVal = pat.object;
          if (objVal.startsWith("?")) {
            objVal = row[objVal.slice(1)];
          }
          
          let predVal = pat.predicate;
          if (predVal.startsWith("?")) {
            predVal = row[predVal.slice(1)];
          }

          if (!subVal || !objVal) return;

          // Strip literal quotes if present
          if (typeof subVal === 'string' && subVal.startsWith('"') && subVal.endsWith('"')) {
            subVal = subVal.slice(1, -1);
          }
          if (typeof objVal === 'string' && objVal.startsWith('"') && objVal.endsWith('"')) {
            objVal = objVal.slice(1, -1);
          }

          // Add Subject Node
          if (!nodeTracker.has(subVal)) {
            nodeTracker.add(subVal);
            const style = this._getNodeStyle(subVal);
            elements.push({
              data: { id: subVal, label: this._getNodeLabel(subVal), color: style.color, shape: style.shape }
            });
          }

          // Add Object Node
          if (!nodeTracker.has(objVal)) {
            nodeTracker.add(objVal);
            const style = this._getNodeStyle(objVal);
            elements.push({
              data: { id: objVal, label: this._getNodeLabel(objVal), color: style.color, shape: style.shape }
            });
          }

          // Add Edge
          const edgeId = `${subVal}_${predVal}_${objVal}`;
          if (!edgeTracker.has(edgeId)) {
            edgeTracker.add(edgeId);
            elements.push({
              data: { id: edgeId, source: subVal, target: objVal, label: this._getNodeLabel(predVal) }
            });
          }
        });
      });
    }

    if (elements.length === 0) {
      document.getElementById("graph-container").innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">No relationships to visualize in query output.</div>';
      return;
    }

    // Initialize Cytoscape.js with Dagre layout
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
            'width': '65px',
            'height': '40px',
            'border-width': 1,
            'border-color': '#000000'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': 'rgba(255,255,255,0.2)',
            'target-arrow-color': 'rgba(255,255,255,0.3)',
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
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 40,
        rankSep: 80,
        animate: false
      }
    });
  }

  async _loadOntologyDictionary() {
    const dictContainer = document.getElementById("schema-dictionary");
    dictContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.7rem;">Loading classes & properties...</div>';

    this.nodeMetadata = {};

    // Fetch classes, properties, and instances for label resolution
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

    const qMetadata = `PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT DISTINCT ?s ?label ?type WHERE {
  ?s a ?type .
  { ?s asoft:callsign ?label } UNION
  { ?s rdfs:label ?label } UNION
  { ?s foaf:name ?label } UNION
  { ?s asoft:hasModelName ?label }
}`;

    try {
      const [resC, resP, resM] = await Promise.all([
        fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: qClasses }) }).then(r => r.json()),
        fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: qProps }) }).then(r => r.json()),
        fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: qMetadata }) }).then(r => r.json())
      ]);

      if (resM.results) {
        resM.results.forEach(row => {
          const uri = row.s;
          if (!uri) return;
          if (!this.nodeMetadata[uri]) {
            this.nodeMetadata[uri] = {
              labels: new Set(),
              types: new Set()
            };
          }
          if (row.label) this.nodeMetadata[uri].labels.add(row.label);
          if (row.type) this.nodeMetadata[uri].types.add(row.type);
        });
      }

      let html = `<div class="schema-category-title">OWL Classes</div>`;
      if (resC.results && resC.results.length > 0) {
        resC.results.forEach(c => {
          const suffix = c.class.includes("#") ? c.class.split("#")[1] : c.class;
          if (suffix.startsWith("Node") || suffix.startsWith("Thing")) return;
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
      console.error("Error loading dictionary:", e);
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
