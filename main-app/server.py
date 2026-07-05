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

# Load Ontologies & SHACL shapes on startup
SCHEMA_DIR = os.path.join(os.path.dirname(__file__), '..', 'schemas')
OWL_PATH = os.path.join(SCHEMA_DIR, 'airsoft-ao-owl-AO.ttl')
GAMEOPS_PATH = os.path.join(SCHEMA_DIR, 'airsoft-ao-gameops.ttl')
SHACL_PATH = os.path.join(SCHEMA_DIR, 'airsoft-ao-shacl.ttl')

print("Loading OWL/Turtle schemas into rdflib graph...")
try:
    graph.parse(OWL_PATH, format="turtle")
    graph.parse(GAMEOPS_PATH, format="turtle")
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

@app.route('/learning/')
@app.route('/learning')
def serve_learning_index():
    learning_dir = os.path.join(os.path.dirname(__file__), '..', 'sparql-academy')
    return send_from_directory(learning_dir, 'index.html')

@app.route('/learning/<path:path>')
def serve_learning_static(path):
    learning_dir = os.path.join(os.path.dirname(__file__), '..', 'sparql-academy')
    return send_from_directory(learning_dir, path)

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

@app.route('/api/export', methods=['GET'])
def export_turtle():
    ttl_data = graph.serialize(format="turtle")
    return ttl_data, 200, {'Content-Type': 'text/turtle'}

if __name__ == '__main__':
    print("Starting AirOps v2.11 Semantic RDF microservice on port 3000...")
    app.run(host='0.0.0.0', port=3000, debug=False)
