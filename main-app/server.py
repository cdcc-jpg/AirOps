# AirOps v2.11 — Python Semantic RDF Server
# Statefully maintains the in-memory RDF Graph via rdflib
# Serves standard static front-end assets and REST endpoints

import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
import rdflib
from rdflib import Namespace, URIRef, Literal, RDF, RDFS, XSD
import pyshacl

app = Flask(__name__, static_folder='.')

# Semantic Namespaces
ASOFT = Namespace("https://github.com/cdcc-jpg/ontologies#")
FOAF = Namespace("http://xmlns.com/foaf/0.1/")
SH = Namespace("http://www.w3.org/ns/shacl#")

# Global In-Memory RDF Store
graph = rdflib.Graph()

# Load Ontologies & SHACL shapes on startup from master Ontologies repository
ONTOLOGIES_DIR = os.getenv('ONTOLOGIES_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'Ontologies')))

ONTOLOGY_FILES = [
    os.path.join(ONTOLOGIES_DIR, '1-Upper', 'bfo.ttl'),
    os.path.join(ONTOLOGIES_DIR, '1-Upper', 'foaf.ttl'),
    os.path.join(ONTOLOGIES_DIR, '3-Domain', 'airsoft', 'airsoft-core.ttl'),
    os.path.join(ONTOLOGIES_DIR, '3-Domain', 'airsoft', 'airsoft-gameops.ttl'),
    os.path.join(ONTOLOGIES_DIR, '3-Domain', 'airsoft', 'airsoft-field.ttl'),
    os.path.join(ONTOLOGIES_DIR, '3-Domain', 'airsoft', 'airsoft-safety.ttl'),
    os.path.join(ONTOLOGIES_DIR, '4-Application', 'profiles', 'airsoft-gameday-marshal-app.ttl'),
    os.path.join(ONTOLOGIES_DIR, '4-Application', 'profiles', 'airsoft-replica-selector-app.ttl'),
    os.path.join(ONTOLOGIES_DIR, '4-Application', 'alignments', 'alignments-airsoft-bfo.ttl'),
    os.path.join(ONTOLOGIES_DIR, 'Grouped-Vocabularies-and-Restrictions', 'airsoft', 'vocabularies', 'airsoft-skos-taxonomy.ttl'),
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'controlled-vocabulary', 'vocabularies', 'airsoft-skos-2000.jsonld'))
]

SHACL_PATH = os.path.join(ONTOLOGIES_DIR, 'Grouped-Vocabularies-and-Restrictions', 'airsoft', 'shapes', 'airsoft-shacl-shapes.ttl')
ALIGNMENTS_PATH = os.path.join(ONTOLOGIES_DIR, '4-Application', 'alignments', 'alignments-airsoft-bfo.ttl')

print(f"Loading modular OWL/SKOS schemas from {ONTOLOGIES_DIR} into rdflib graph...")
try:
    for filepath in ONTOLOGY_FILES:
        if os.path.exists(filepath):
            fmt = "json-ld" if filepath.endswith(".jsonld") else "turtle"
            graph.parse(filepath, format=fmt)
        else:
            print(f"Warning: Ontology file not found: {filepath}")
    print(f"Loaded schema graph successfully. Triples count: {len(graph)}")
except Exception as e:
    print(f"Error loading RDF schemas: {e}")

# Cache of initial JSON layout to return lists to JS frontend
raw_field_layout = {}
raw_game_session = {}

def load_initial_json_data():
    global raw_field_layout, raw_game_session
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    app_data_path = os.path.join(data_dir, 'app-data.json')
    field_layout_path = os.path.join(data_dir, 'field-layout.json')

    # Read field layout
    if os.path.exists(field_layout_path):
        with open(field_layout_path, 'r', encoding='utf-8') as f:
            raw_field_layout = json.load(f)
            # Add field zones to graph
            for zone in raw_field_layout.get('zones', []):
                z_uri = ASOFT[zone['id']]
                graph.add((z_uri, RDF.type, ASOFT.FieldZone))
                graph.add((z_uri, RDFS.label, Literal(zone['name'], datatype=XSD.string)))
                if zone.get('maxJoules', 0) > 0:
                    graph.add((z_uri, ASOFT.hasMaxJouleLimit, Literal(zone['maxJoules'], datatype=XSD.decimal)))

    # Read app data and populate graph
    if os.path.exists(app_data_path):
        with open(app_data_path, 'r', encoding='utf-8') as f:
            app_data = json.load(f)
            raw_game_session = app_data.get('gameSession', {})

            print("Mapping JSON-LD data to RDF Graph store...")
            
            # Map Teams
            for team in app_data.get('teams', []):
                t_uri = ASOFT[f"Team_{team['id'].capitalize()}"]
                graph.add((t_uri, RDF.type, ASOFT.AirsoftTeam))
                graph.add((t_uri, RDFS.label, Literal(team['name'], datatype=XSD.string)))

            # Map Players
            for p in app_data.get('players', []):
                p_uri = ASOFT[p['id']]
                graph.add((p_uri, RDF.type, ASOFT.AirsoftPlayer))
                graph.add((p_uri, FOAF.name, Literal(p['name'], datatype=XSD.string)))
                graph.add((p_uri, ASOFT.callsign, Literal(p['callsign'], datatype=XSD.string)))
                graph.add((p_uri, ASOFT.hasRole, Literal(p['role'], datatype=XSD.string)))
                graph.add((p_uri, ASOFT.playerStatus, Literal(p['status'], datatype=XSD.string)))
                graph.add((p_uri, ASOFT.complianceStatus, Literal(p['compliance'], datatype=XSD.string)))

                if p.get('team') and p['team'] != 'unassigned':
                    t_uri = ASOFT[f"Team_{p['team'].capitalize()}"]
                    graph.add((p_uri, ASOFT.belongsToTeam, t_uri))

                # Primary replica mapping
                if p.get('gear') and p['gear'].get('primary'):
                    rep = p['gear']['primary']
                    rep_uri = ASOFT[f"Replica_{p['id']}"]
                    graph.add((p_uri, ASOFT.usesGear, rep_uri))
                    
                    # Subclass determination based on chrono tier
                    tier = p['chrono']['tier']
                    if tier == 'DMR':
                        graph.add((rep_uri, RDF.type, ASOFT.DesignatedMarksmanRifle))
                    elif tier == 'Bolt-Action':
                        graph.add((rep_uri, RDF.type, ASOFT.BoltActionSniper))
                    else:
                        graph.add((rep_uri, RDF.type, ASOFT.AirsoftReplica))

                    graph.add((rep_uri, ASOFT.hasModelName, Literal(rep['name'], datatype=XSD.string)))
                    graph.add((rep_uri, ASOFT.hasFPS, Literal(p['chrono']['fps'], datatype=XSD.integer)))
                    graph.add((rep_uri, ASOFT.hasPowerLimit, Literal(p['chrono']['joules'], datatype=XSD.decimal)))
                    graph.add((rep_uri, ASOFT.hasBBWeight, Literal(p['chrono']['bbWeight'], datatype=XSD.decimal)))
                    graph.add((rep_uri, ASOFT.chronoStatus, Literal(p['chrono']['status'], datatype=XSD.string)))

                # Map warnings
                for w in p.get('warnings', []):
                    w_uri = ASOFT[f"Warning_{p['id']}_{w['type']}_{w['count']}"]
                    graph.add((w_uri, RDF.type, ASOFT.WarningRecord))
                    graph.add((p_uri, ASOFT.hasWarning, w_uri))
                    graph.add((w_uri, ASOFT.warningType, Literal(w['type'], datatype=XSD.string)))
                    graph.add((w_uri, ASOFT.warningCount, Literal(w['count'], datatype=XSD.integer)))

            # Map Chrono Logs
            for ev in app_data.get('chronoEvents', []):
                log_uri = ASOFT[ev['logId']]
                graph.add((log_uri, RDF.type, ASOFT.ChronoLog))
                graph.add((ASOFT[ev['playerId']], ASOFT.hasChronoLog, log_uri))
                graph.add((log_uri, ASOFT.muzzleVelocityFPS, Literal(ev['fps'], datatype=XSD.integer)))
                graph.add((log_uri, ASOFT.muzzleEnergyJoules, Literal(ev['joules'], datatype=XSD.decimal)))
                graph.add((log_uri, ASOFT.chronoStatus, Literal(ev['status'], datatype=XSD.string)))

            # Map Game Events
            for idx, ev in enumerate(app_data.get('gameEvents', [])):
                ev_uri = ASOFT[f"Event_{idx}"]
                graph.add((ev_uri, RDF.type, ASOFT.GameEvent))
                graph.add((ev_uri, ASOFT.eventType, Literal(ev['type'], datatype=XSD.string)))
                graph.add((ev_uri, ASOFT.eventTimestamp, Literal(ev['timestamp'], datatype=XSD.string)))
                if ev.get('attackerId'):
                    graph.add((ev_uri, ASOFT.hasAttacker, ASOFT[ev['attackerId']]))
                if ev.get('targetId'):
                    graph.add((ev_uri, ASOFT.hasTarget, ASOFT[ev['targetId']]))
                if ev.get('zone'):
                    graph.add((ev_uri, ASOFT.hasZone, ASOFT[ev['zone']]))

            print(f"Graph initialization complete. Triples count: {len(graph)}")

load_initial_json_data()

# Disable caching for developer console iterations
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# ─── Static Routing ──────────────────────────────────────────

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/data/field-layout.json')
def serve_field_layout():
    return jsonify(raw_field_layout)

# ─── API Endpoints ────────────────────────────────────────────

@app.route('/api/query', methods=['POST'])
def run_query():
    query_str = request.json.get('query', '')
    try:
        res = graph.query(query_str)
        # Check if result is a Graph (CONSTRUCT / DESCRIBE queries)
        if isinstance(res, rdflib.Graph) or not hasattr(res, 'vars') or res.vars is None:
            results = []
            for s, p, o in res:
                results.append({
                    'subject': str(s),
                    'predicate': str(p),
                    'object': str(o)
                })
            return jsonify({
                'vars': ['subject', 'predicate', 'object'],
                'results': results
            })

        results = []
        for row in res:
            row_dict = {}
            for idx, var in enumerate(res.vars):
                val = row[idx]
                if val is not None:
                    row_dict[str(var)] = str(val.toPython() if hasattr(val, 'toPython') else val)
                else:
                    row_dict[str(var)] = ""
            results.append(row_dict)
        return jsonify({
            'vars': [str(v) for v in res.vars],
            'results': results
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/mutate', methods=['POST'])
def run_mutation():
    mut = request.json
    action = mut.get('action')
    pid = mut.get('playerId')
    p_uri = ASOFT[pid]

    if action == 'add_player':
        name = mut.get('name')
        callsign = mut.get('callsign')
        role = mut.get('role')
        status = mut.get('status')
        compliance = mut.get('compliance')
        fps = int(mut.get('fps', 300))
        joules = float(mut.get('joules', 1.0))
        bbWeight = float(mut.get('bbWeight', 0.2))
        replicaName = mut.get('replicaName', 'AEG')
        tier = mut.get('tier', 'AEG')

        graph.add((p_uri, RDF.type, ASOFT.AirsoftPlayer))
        graph.add((p_uri, FOAF.name, Literal(name, datatype=XSD.string)))
        graph.add((p_uri, ASOFT.callsign, Literal(callsign, datatype=XSD.string)))
        graph.add((p_uri, ASOFT.hasRole, Literal(role, datatype=XSD.string)))
        graph.add((p_uri, ASOFT.playerStatus, Literal(status, datatype=XSD.string)))
        graph.add((p_uri, ASOFT.complianceStatus, Literal(compliance, datatype=XSD.string)))

        rep_uri = ASOFT[f"Replica_{pid}"]
        graph.add((p_uri, ASOFT.usesGear, rep_uri))
        if tier == 'DMR':
            graph.add((rep_uri, RDF.type, ASOFT.DesignatedMarksmanRifle))
        elif tier == 'Bolt-Action':
            graph.add((rep_uri, RDF.type, ASOFT.BoltActionSniper))
        else:
            graph.add((rep_uri, RDF.type, ASOFT.AirsoftReplica))

        graph.add((rep_uri, ASOFT.hasModelName, Literal(replicaName, datatype=XSD.string)))
        graph.add((rep_uri, ASOFT.hasFPS, Literal(fps, datatype=XSD.integer)))
        graph.add((rep_uri, ASOFT.hasPowerLimit, Literal(joules, datatype=XSD.decimal)))
        graph.add((rep_uri, ASOFT.hasBBWeight, Literal(bbWeight, datatype=XSD.decimal)))
        graph.add((rep_uri, ASOFT.chronoStatus, Literal(compliance, datatype=XSD.string)))

    elif action == 'update_status':
        status = mut.get('status')
        # Delete existing status
        graph.remove((p_uri, ASOFT.playerStatus, None))
        # Insert new status
        graph.add((p_uri, ASOFT.playerStatus, Literal(status, datatype=XSD.string)))
        
        # If OUT, check if they are also banned
        if status == 'OUT':
            graph.remove((p_uri, ASOFT.complianceStatus, None))
            graph.add((p_uri, ASOFT.complianceStatus, Literal('BANNED', datatype=XSD.string)))
            
    elif action == 'update_compliance':
        compliance = mut.get('compliance')
        graph.remove((p_uri, ASOFT.complianceStatus, None))
        graph.add((p_uri, ASOFT.complianceStatus, Literal(compliance, datatype=XSD.string)))
        if compliance == 'BANNED':
            graph.remove((p_uri, ASOFT.playerStatus, None))
            graph.add((p_uri, ASOFT.playerStatus, Literal('OUT', datatype=XSD.string)))

    elif action == 'assign_team':
        team = mut.get('team')
        graph.remove((p_uri, ASOFT.belongsToTeam, None))
        if team and team != 'unassigned':
            t_uri = ASOFT[f"Team_{team.capitalize()}"]
            graph.add((p_uri, ASOFT.belongsToTeam, t_uri))

    elif action == 'update_chrono':
        fps = int(mut.get('fps', 300))
        joules = float(mut.get('joules', 1.0))
        bbWeight = float(mut.get('bbWeight', 0.2))
        
        rep_uri = ASOFT[f"Replica_{pid}"]
        graph.remove((rep_uri, ASOFT.hasFPS, None))
        graph.remove((rep_uri, ASOFT.hasPowerLimit, None))
        graph.remove((rep_uri, ASOFT.hasBBWeight, None))
        graph.remove((rep_uri, ASOFT.chronoStatus, None))
        
        # Chrono limit evaluation
        tier = 'AEG'
        # Basic check to determine subclass of replica in triple store
        q = f"SELECT ?tier WHERE {{ <{rep_uri}> a ?tier . ?tier rdfs:subClassOf* asoft:AirsoftReplica }}"
        res = graph.query(q)
        # Determine tier limits
        max_joules = 1.2
        if graph.value(rep_uri, RDF.type) == ASOFT.DesignatedMarksmanRifle:
            tier = 'DMR'
            max_joules = 1.88
        elif graph.value(rep_uri, RDF.type) == ASOFT.BoltActionSniper:
            tier = 'Bolt-Action'
            max_joules = 2.32

        status = 'PASS'
        compliance = 'CLEARED'
        if joules > max_joules or fps > (500 if tier == 'Bolt-Action' else 450 if tier == 'DMR' else 350):
            status = 'FAIL_OVER_POWER'
            compliance = 'BANNED'
        elif joules < 0.3:
            status = 'FAIL_MIN_PERFORMANCE'
            compliance = 'FLAGGED'

        graph.add((rep_uri, ASOFT.hasFPS, Literal(fps, datatype=XSD.integer)))
        graph.add((rep_uri, ASOFT.hasPowerLimit, Literal(joules, datatype=XSD.decimal)))
        graph.add((rep_uri, ASOFT.hasBBWeight, Literal(bbWeight, datatype=XSD.decimal)))
        graph.add((rep_uri, ASOFT.chronoStatus, Literal(status, datatype=XSD.string)))

        graph.remove((p_uri, ASOFT.complianceStatus, None))
        graph.add((p_uri, ASOFT.complianceStatus, Literal(compliance, datatype=XSD.string)))
        if compliance == 'BANNED':
            graph.remove((p_uri, ASOFT.playerStatus, None))
            graph.add((p_uri, ASOFT.playerStatus, Literal('OUT', datatype=XSD.string)))

        # Log event
        log_id = f"Log_{int(datetime.now().timestamp()*1000)}"
        log_uri = ASOFT[log_id]
        graph.add((log_uri, RDF.type, ASOFT.ChronoLog))
        graph.add((p_uri, ASOFT.hasChronoLog, log_uri))
        graph.add((log_uri, ASOFT.muzzleVelocityFPS, Literal(fps, datatype=XSD.integer)))
        graph.add((log_uri, ASOFT.muzzleEnergyJoules, Literal(joules, datatype=XSD.decimal)))
        graph.add((log_uri, ASOFT.chronoStatus, Literal(status, datatype=XSD.string)))

    elif action == 'add_warning':
        wtype = mut.get('violationType')
        wcount = int(mut.get('count', 1))
        w_uri = ASOFT[f"Warning_{pid}_{wtype}_{wcount}"]
        graph.add((w_uri, RDF.type, ASOFT.WarningRecord))
        graph.add((p_uri, ASOFT.hasWarning, w_uri))
        graph.add((w_uri, ASOFT.warningType, Literal(wtype, datatype=XSD.string)))
        graph.add((w_uri, ASOFT.warningCount, Literal(wcount, datatype=XSD.integer)))

    elif action == 'add_elimination':
        attacker = mut.get('attackerId')
        target = mut.get('targetId')
        zone = mut.get('zone')
        
        ev_idx = len(list(graph.subjects(RDF.type, ASOFT.GameEvent)))
        ev_uri = ASOFT[f"Event_{ev_idx}"]
        graph.add((ev_uri, RDF.type, ASOFT.GameEvent))
        graph.add((ev_uri, ASOFT.eventType, Literal('elimination', datatype=XSD.string)))
        graph.add((ev_uri, ASOFT.eventTimestamp, Literal(datetime.now().isoformat(), datatype=XSD.string)))
        graph.add((ev_uri, ASOFT.hasAttacker, ASOFT[attacker]))
        graph.add((ev_uri, ASOFT.hasTarget, ASOFT[target]))
        graph.add((ev_uri, ASOFT.hasZone, ASOFT[zone]))

        # Perform player state update
        t_uri = ASOFT[target]
        graph.remove((t_uri, ASOFT.playerStatus, None))
        graph.add((t_uri, ASOFT.playerStatus, Literal('ELIMINATED', datatype=XSD.string)))

    return jsonify({'success': True})

@app.route('/api/validate', methods=['GET'])
def validate_shapes():
    shacl_graph = rdflib.Graph()
    shacl_graph.parse(SHACL_PATH, format="turtle")
    
    conforms, results_graph, results_text = pyshacl.validate(
        graph,
        shacl_graph=shacl_graph,
        ont_graph=None,
        inference='rdfs',
        abort_on_first=False,
        meta_shacl=False,
        debug=False
    )
    
    # Parse results graph
    violations = []
    for report in results_graph.subjects(RDF.type, SH.ValidationResult):
        focus = results_graph.value(report, SH.focusNode)
        path = results_graph.value(report, SH.resultPath)
        message = results_graph.value(report, SH.resultMessage)
        severity = results_graph.value(report, SH.resultSeverity)
        
        violations.append({
            'focusNode': str(focus).replace(str(ASOFT), 'asoft:'),
            'path': str(path).replace(str(ASOFT), 'asoft:'),
            'message': str(message),
            'severity': str(severity).replace(str(SH), 'sh:')
        })
        
    return jsonify({
        'conforms': conforms,
        'violations': violations
    })

@app.route('/api/matchmake', methods=['POST'])
def run_matchmaking():
    setup = request.json
    weather = setup.get('weather', 'Dry')
    marshall_count = int(setup.get('marshallCount', 3))
    
    # 1. Weather Suggestion Rules using SPARQL over loaded graph
    suggested_mode = "Full Site Domination"
    reason = "Optimal weather. All quarry zones fully open."
    warnings = []
    
    if weather == 'Rainy' or weather == 'Wet':
        suggested_mode = "Village Assault (CQB)"
        reason = "Chalk quarry floor is highly slippery. Village structures provide safe footing."
        warnings.append("Weather Advisory: Wet ground conditions. Quarry sector closed.")
    elif weather == 'Windy':
        suggested_mode = "Attack & Defend Firebase"
        reason = "HESCO compounds provide wind shelter. Combats are close-range."
        warnings.append("Tactical Warning: Strong winds drift BB trajectory.")

    # Query eligible active players from the graph
    q = """
    SELECT ?pid ?role ?joules WHERE {
        ?pid a asoft:AirsoftPlayer ;
             asoft:playerStatus ?status ;
             asoft:complianceStatus ?comp ;
             asoft:hasRole ?role ;
             asoft:usesGear ?replica .
        ?replica asoft:hasPowerLimit ?joules .
        FILTER (?status != "OUT" && ?comp != "BANNED")
    }
    """
    res = graph.query(q)
    players = []
    for row in res:
        players.append({
            'id': str(row[0]).split('#')[-1],
            'role': str(row[1]),
            'joules': float(row[2])
        })

    # Marshall ratio check
    ratio = marshall_count / len(players) if players else 1
    if ratio < 0.05:
        warnings.append(f"SAFETY WARNING: Low marshall ratio (1:{int(1/ratio)}). Suggest adding marshalls.")

    # Partition Matchmaking Grep Algorithm
    # Sort by threat weight: sniper count, support, average energy
    role_weights = {'Commander': 1.5, 'Sniper': 1.4, 'Support': 1.3, 'Breacher': 1.1, 'Medic': 1.0, 'Rifleman': 1.0}
    players.sort(key=lambda x: role_weights.get(x['role'], 1.0) * x['joules'], reverse=True)

    nonband = []
    band = []
    for p in players:
        # Calculate threat score for greedy split
        threat_non = sum(x['joules'] * 10 + (2 if x['role'] in ('Sniper', 'Support') else 0) for x in nonband) + len(nonband)
        threat_band = sum(x['joules'] * 10 + (2 if x['role'] in ('Sniper', 'Support') else 0) for x in band) + len(band)
        
        if len(nonband) < len(band):
            nonband.append(p)
        elif len(band) < len(nonband):
            band.append(p)
        else:
            if threat_non <= threat_band:
                nonband.append(p)
            else:
                band.append(p)

    # Perform mutations on active graph
    for p in nonband:
        p_uri = ASOFT[p['id']]
        graph.remove((p_uri, ASOFT.belongsToTeam, None))
        graph.add((p_uri, ASOFT.belongsToTeam, ASOFT.Team_Nonband))
    for p in band:
        p_uri = ASOFT[p['id']]
        graph.remove((p_uri, ASOFT.belongsToTeam, None))
        graph.add((p_uri, ASOFT.belongsToTeam, ASOFT.Team_Band))

    return jsonify({
        'suggestedMode': suggested_mode,
        'modeReason': reason,
        'warnings': warnings,
        'assignedCount': len(players),
        'nonbandCount': len(nonband),
        'bandCount': len(band),
        'nonband': [p['id'] for p in nonband],
        'band': [p['id'] for p in band]
    })

@app.route('/api/ontology/schema', methods=['GET'])
def get_ontology_schema():
    OWL = Namespace("http://www.w3.org/2002/07/owl#")
    
    def compact(uri):
        if not uri: return ""
        u = str(uri)
        if u.startswith("https://github.com/cdcc-jpg/ontologies#"):
            return "asoft:" + u.split("#")[-1]
        elif u.startswith("http://purl.obolibrary.org/obo/BFO_"):
            return "bfo:" + u.split("BFO_")[-1]
        elif u.startswith("http://purl.obolibrary.org/obo/"):
            return "obo:" + u.split("/")[-1]
        elif u.startswith("http://xmlns.com/foaf/0.1/"):
            return "foaf:" + u.split("/")[-1]
        elif u.startswith("http://schema.org/"):
            return "schema:" + u.split("/")[-1]
        elif u.startswith("http://www.w3.org/2000/01/rdf-schema#"):
            return "rdfs:" + u.split("#")[-1]
        elif u.startswith("http://www.w3.org/2002/07/owl#"):
            return "owl:" + u.split("#")[-1]
        return u

    airops_classes = []
    bfo_classes = []
    
    for c in graph.subjects(RDF.type, OWL.Class):
        uri_str = str(c)
        label = str(graph.value(c, RDFS.label) or uri_str.split("#")[-1].split("/")[-1])
        comment = str(graph.value(c, RDFS.comment) or "")
        super_classes = [compact(s) for s in graph.objects(c, RDFS.subClassOf) if isinstance(s, URIRef)]
        
        item = {
            'uri': uri_str,
            'prefixed': compact(c),
            'label': label,
            'comment': comment,
            'superClasses': super_classes
        }
        
        if "purl.obolibrary.org/obo/BFO_" in uri_str or uri_str.startswith("http://purl.obolibrary.org/obo/bfo"):
            bfo_classes.append(item)
        elif "cdcc-jpg/ontologies" in uri_str or uri_str.startswith("https://github.com/cdcc-jpg/"):
            airops_classes.append(item)
        elif not uri_str.startswith("http://www.w3.org/"):
            airops_classes.append(item)

    airops_props = []
    bfo_props = []
    for p in graph.subjects(RDF.type, OWL.ObjectProperty):
        uri_str = str(p)
        label = str(graph.value(p, RDFS.label) or uri_str.split("#")[-1].split("/")[-1])
        domain = compact(graph.value(p, RDFS.domain))
        range_ = compact(graph.value(p, RDFS.range))
        comment = str(graph.value(p, RDFS.comment) or "")
        sub_props = [compact(s) for s in graph.objects(p, RDFS.subPropertyOf)]
        
        item = {
            'uri': uri_str,
            'prefixed': compact(p),
            'label': label,
            'domain': domain,
            'range': range_,
            'comment': comment,
            'subPropertyOf': sub_props
        }
        if "purl.obolibrary.org/obo/BFO_" in uri_str:
            bfo_props.append(item)
        else:
            airops_props.append(item)

    alignments = []
    for s, p, o in graph:
        p_str = str(p)
        if p_str in [str(RDFS.subClassOf), str(OWL.equivalentClass), str(OWL.equivalentProperty), str(OWL.sameAs)]:
            s_str = str(s)
            o_str = str(o)
            if ("cdcc-jpg" in s_str and "BFO_" in o_str) or ("BFO_" in s_str and "cdcc-jpg" in o_str) or ("alignments" in s_str or "alignments" in o_str):
                alignments.append({
                    'subject': compact(s),
                    'subjectUri': s_str,
                    'predicate': compact(p),
                    'predicateUri': p_str,
                    'object': compact(o),
                    'objectUri': o_str
                })

    return jsonify({
        'airops': {
            'classes': airops_classes,
            'properties': airops_props
        },
        'bfo': {
            'classes': bfo_classes,
            'properties': bfo_props
        },
        'alignments': alignments
    })

@app.route('/api/ontology/alignments', methods=['GET', 'POST'])
def handle_alignments():
    OWL = Namespace("http://www.w3.org/2002/07/owl#")
    if request.method == 'POST':
        data = request.json or {}
        new_alignments = data.get('alignments', [])
        
        align_graph = rdflib.Graph()
        if os.path.exists(ALIGNMENTS_PATH):
            try:
                align_graph.parse(ALIGNMENTS_PATH, format="turtle")
            except Exception:
                pass
                
        for item in new_alignments:
            s_raw = item.get('subjectUri') or item.get('subject')
            p_raw = item.get('predicateUri') or item.get('predicate')
            o_raw = item.get('objectUri') or item.get('object')
            
            def resolve(uri_or_prefix):
                if not uri_or_prefix: return None
                if uri_or_prefix.startswith("http://") or uri_or_prefix.startswith("https://"):
                    return URIRef(uri_or_prefix)
                if uri_or_prefix.startswith("asoft:"):
                    return URIRef("https://github.com/cdcc-jpg/ontologies#" + uri_or_prefix[6:])
                if uri_or_prefix.startswith("bfo:") or uri_or_prefix.startswith("obo:"):
                    val = uri_or_prefix.split(":")[-1]
                    if not val.startswith("BFO_"):
                        val = "BFO_" + val
                    return URIRef("http://purl.obolibrary.org/obo/" + val)
                if uri_or_prefix.startswith("rdfs:"):
                    return URIRef("http://www.w3.org/2000/01/rdf-schema#" + uri_or_prefix[5:])
                if uri_or_prefix.startswith("owl:"):
                    return URIRef("http://www.w3.org/2002/07/owl#" + uri_or_prefix[4:])
                return URIRef(uri_or_prefix)

            s_uri = resolve(s_raw)
            p_uri = resolve(p_raw)
            o_uri = resolve(o_raw)

            if s_uri and p_uri and o_uri:
                graph.add((s_uri, p_uri, o_uri))
                align_graph.add((s_uri, p_uri, o_uri))
                
        try:
            align_graph.serialize(destination=ALIGNMENTS_PATH, format="turtle")
        except Exception as e:
            print(f"Error saving alignments TTL: {e}")

        return jsonify({'success': True, 'count': len(new_alignments)})

    alignments = []
    for s, p, o in graph:
        p_str = str(p)
        if p_str in [str(RDFS.subClassOf), str(OWL.equivalentClass), str(OWL.equivalentProperty), str(OWL.sameAs)]:
            s_str = str(s)
            o_str = str(o)
            if ("cdcc-jpg" in s_str and "BFO_" in o_str) or ("BFO_" in s_str and "cdcc-jpg" in o_str):
                alignments.append({
                    'subject': str(s),
                    'predicate': str(p),
                    'object': str(o)
                })
    return jsonify({'alignments': alignments})

@app.route('/api/export', methods=['GET'])
def export_turtle():
    ttl_data = graph.serialize(format="turtle")
    return ttl_data, 200, {'Content-Type': 'text/turtle'}

# ═════════════════════════════════════════════════════════════════
# 🎯 REPLICA SELECTION ADVISOR API ENDPOINTS
# ═════════════════════════════════════════════════════════════════

@app.route('/api/replica-advisor/options', methods=['GET'])
def get_replica_advisor_options():
    advisor_data_path = os.path.join(os.path.dirname(__file__), 'data', 'replica-advisor-data.json')
    if os.path.exists(advisor_data_path):
        with open(advisor_data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    return jsonify({'fields': [], 'replicas': [], 'tacticalRoles': []}), 404

@app.route('/api/skos/concept/<concept_id>', methods=['GET'])
def get_skos_concept(concept_id):
    SKOS = Namespace("http://www.w3.org/2004/02/skos/core#")
    ASOFT_SKOS = Namespace("https://github.com/cdcc-jpg/ontologies/airsoft-skos#")
    
    clean_id = concept_id.replace("asoft-skos:", "").replace("asoft-skos#", "")
    concept_uri = ASOFT_SKOS[clean_id]

    pref_label = graph.value(concept_uri, SKOS.prefLabel)
    definition = graph.value(concept_uri, SKOS.definition)
    notation = graph.value(concept_uri, SKOS.notation)
    scope_note = graph.value(concept_uri, SKOS.scopeNote)
    alt_labels = [str(o) for o in graph.objects(concept_uri, SKOS.altLabel)]

    if pref_label or definition:
        return jsonify({
            'uri': str(concept_uri),
            'id': clean_id,
            'prefLabel': str(pref_label or clean_id),
            'definition': str(definition or 'No definition available in SKOS database.'),
            'notation': str(notation or clean_id),
            'scopeNote': str(scope_note or ''),
            'altLabels': alt_labels
        })
    
    return jsonify({
        'uri': str(concept_uri),
        'id': clean_id,
        'prefLabel': clean_id,
        'definition': 'SKOS Concept registered in controlled vocabulary.',
        'notation': clean_id,
        'altLabels': []
    })

@app.route('/api/replica-advisor/evaluate', methods=['POST'])
def evaluate_replica_suitability():
    payload = request.json or {}
    field = payload.get('field', {})
    target_role = payload.get('targetRole', 'role_assault')
    temperature_c = float(payload.get('temperatureC', 18))
    propulsion_filter = payload.get('propulsionFilter', 'ALL')
    weapon_type_filter = payload.get('weaponTypeFilter', 'ALL')
    brand_filter = payload.get('brandFilter', 'ALL')

    advisor_data_path = os.path.join(os.path.dirname(__file__), 'data', 'replica-advisor-data.json')
    replicas = payload.get('customReplicas')
    if not replicas and os.path.exists(advisor_data_path):
        with open(advisor_data_path, 'r', encoding='utf-8') as f:
            db = json.load(f)
            replicas = db.get('replicas', [])

    # Filter replicas by user constraints
    filtered_replicas = []
    for r in replicas:
        if propulsion_filter != 'ALL':
            skos_p = r.get('skosPropulsion', '')
            p_text = r.get('propulsion', '')
            if propulsion_filter not in skos_p and propulsion_filter.lower() not in p_text.lower():
                continue

        if weapon_type_filter != 'ALL':
            skos_r = r.get('skosRole', '')
            skos_plat = r.get('skosPlatform', '')
            owl_cls = r.get('owlClass', '')
            if weapon_type_filter not in skos_r and weapon_type_filter not in skos_plat and weapon_type_filter not in owl_cls:
                continue

        if brand_filter != 'ALL':
            if brand_filter.lower() not in r.get('brand', '').lower():
                continue

        filtered_replicas.append(r)

    replicas = filtered_replicas

    field_max_j = float(field.get('maxJoules', 1.88))
    field_max_len = int(field.get('maxPermissibleLengthMm', 1400))
    field_semi_only = bool(field.get('isSemiOnlyRestricted', False))
    field_requires_bio = bool(field.get('requiresBioBB', False))
    field_requires_tracer = bool(field.get('requiresTracerUnit', False))
    field_med = int(field.get('minEngagementDistanceMeters', 0))

    # ═════════════════════════════════════════════════════════════════
    # Dynamic SHACL Shape Construction (sh:maxInclusive = slider value)
    # ═════════════════════════════════════════════════════════════════
    SH = Namespace("http://www.w3.org/ns/shacl#")
    ASOFT = Namespace("https://github.com/cdcc-jpg/ontologies/airsoft-core#")
    
    shacl_g = rdflib.Graph()
    shape_uri = ASOFT.ReplicaChronoSafetyShape
    prop_node = rdflib.BNode()

    shacl_g.add((shape_uri, RDF.type, SH.NodeShape))
    shacl_g.add((shape_uri, SH.targetClass, ASOFT.AirsoftReplica))
    shacl_g.add((shape_uri, SH.property, prop_node))
    shacl_g.add((prop_node, SH.path, ASOFT.hasJoules))
    shacl_g.add((prop_node, SH.datatype, XSD.float))
    shacl_g.add((prop_node, SH.maxInclusive, Literal(float(field_max_j), datatype=XSD.float)))
    shacl_g.add((prop_node, SH.message, Literal(f"SHACL Violation: Muzzle energy exceeds dynamic site ceiling of {field_max_j:.2f} Joules (sh:maxInclusive {field_max_j:.2f}J).", lang="en")))

    results = []

    for rep in replicas:
        score = 100.0
        disqualifications = []
        warnings = []
        checks = []

        energy = float(rep.get('muzzleEnergyJoules', 1.0))
        length = int(rep.get('overallLengthMm', 800))
        firing_modes = rep.get('firingModes', [])
        uses_bio = bool(rep.get('usesBioBB', True))
        has_tracer = bool(rep.get('hasTracerUnit', False))
        cold_reliable = bool(rep.get('isColdWeatherReliable', True))

        # ─── Execute SHACL Shape Validation via PySHACL ───
        data_g = rdflib.Graph()
        rep_uri = ASOFT[rep.get('id', 'rep_temp')]
        data_g.add((rep_uri, RDF.type, ASOFT.AirsoftReplica))
        data_g.add((rep_uri, ASOFT.hasJoules, Literal(energy, datatype=XSD.float)))

        conforms, results_graph, _ = pyshacl.validate(
            data_graph=data_g,
            shacl_graph=shacl_g,
            inference='none',
            meta_shacl=False,
            debug=False
        )

        shacl_report = {
            'conforms': conforms,
            'shapeTarget': 'airsoft:ReplicaChronoSafetyShape',
            'appliedMaxInclusive': field_max_j,
            'shaclPropertyPath': 'airsoft:hasJoules'
        }

        # Check 1: Muzzle Energy vs Site Limit (SHACL Enforced)
        if not conforms:
            penalty = round((energy - field_max_j) * 100, 1)
            score -= (40 + penalty)
            disqualifications.append(f"SHACL Shape Violation: Muzzle energy ({energy:.2f}J) exceeds dynamic sh:maxInclusive ceiling ({field_max_j:.2f}J).")
            checks.append({
                'name': 'SHACL Muzzle Energy Ceiling',
                'passed': False,
                'msg': f"SHACL VIOLATION: {energy:.2f}J > sh:maxInclusive {field_max_j:.2f}J",
                'shaclReport': shacl_report
            })
        else:
            checks.append({
                'name': 'SHACL Muzzle Energy Ceiling',
                'passed': True,
                'msg': f"SHACL CONFORMS: {energy:.2f}J ≤ sh:maxInclusive {field_max_j:.2f}J",
                'shaclReport': shacl_report
            })

        # Check 2: Bio BB Requirement
        if field_requires_bio and not uses_bio:
            score -= 15
            warnings.append("Replica is not configured for biodegradable BBs mandatory at this field.")
            checks.append({'name': 'Bio BB Mandate', 'passed': False, 'msg': "NON-BIO: Field mandates 100% Bio BBs"})
        else:
            checks.append({'name': 'Bio BB Mandate', 'passed': True, 'msg': "COMPLIANT"})

        # Check 3: Semi-Auto Restriction
        if field_semi_only and ("Semi-Auto" not in firing_modes and "Single-Shot" not in firing_modes):
            score -= 50
            disqualifications.append("Replica lacks Semi-Auto mode required by site indoor/CQB rules.")
            checks.append({'name': 'Semi-Auto Restriction', 'passed': False, 'msg': "NON-COMPLIANT: Lacks Semi-Auto/Single-Shot"})
        else:
            checks.append({'name': 'Semi-Auto Restriction', 'passed': True, 'msg': "COMPLIANT"})

        # Check 4: Replica Length & Tactical Layout
        if length > field_max_len:
            score -= 25
            warnings.append(f"Replica length ({length}mm) exceeds recommended maximum CQB clearance ({field_max_len}mm).")
            checks.append({'name': 'Layout Clearance', 'passed': False, 'msg': f"SUBOPTIMAL: {length}mm > {field_max_len}mm max clearance"})
        else:
            checks.append({'name': 'Layout Clearance', 'passed': True, 'msg': f"OPTIMAL: {length}mm ≤ {field_max_len}mm"})

        # Check 5: Ambient Temperature & Propulsion Reliability
        if temperature_c < 10 and not cold_reliable:
            score -= 20
            warnings.append(f"Gas propulsion (GBBR) suffers severe cool-down at {temperature_c}°C ambient temperature.")
            checks.append({'name': 'Cold Weather Reliability', 'passed': False, 'msg': f"RISK: {rep.get('propulsion')} suffers gas cool-down < 10°C"})
        else:
            checks.append({'name': 'Cold Weather Reliability', 'passed': True, 'msg': "RELIABLE"})

        # Check 6: Tracer Requirement
        if field_requires_tracer and not has_tracer:
            score -= 10
            warnings.append("Field requires illuminated tracer units for night/low-light games.")
            checks.append({'name': 'Tracer Unit Requirement', 'passed': False, 'msg': "MISSING: Night ops require tracer unit"})
        else:
            checks.append({'name': 'Tracer Unit Requirement', 'passed': True, 'msg': "COMPLIANT"})

        # Final Score & Suitability Status Classification
        final_score = max(0.0, round(score, 1))

        if len(disqualifications) > 0 or final_score < 40:
            status = "Non-Compliant Match"
            owl_class = "selector:NonCompliantMatch"
            badge_class = "status-noncompliant"
        elif final_score >= 85:
            status = "Optimal Match"
            owl_class = "selector:OptimalMatch"
            badge_class = "status-optimal"
        elif final_score >= 65:
            status = "Permissible Match"
            owl_class = "selector:PermissibleMatch"
            badge_class = "status-permissible"
        else:
            status = "Suboptimal Match"
            owl_class = "selector:SuboptimalMatch"
            badge_class = "status-suboptimal"

        results.append({
            'replica': rep,
            'matchScore': final_score,
            'status': status,
            'owlClass': owl_class,
            'badgeClass': badge_class,
            'disqualifications': disqualifications,
            'warnings': warnings,
            'checks': checks
        })

    # Sort results by match score descending
    results.sort(key=lambda x: x['matchScore'], reverse=True)

    return jsonify({
        'field': field,
        'targetRole': target_role,
        'temperatureC': temperature_c,
        'results': results
    })

if __name__ == '__main__':
    print("Starting AirOps v2.11 Semantic RDF microservice on port 3000...")
    app.run(host='0.0.0.0', port=3000, debug=False)

