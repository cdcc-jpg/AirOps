#!/usr/bin/env python3
"""
AirOps Data Preparation Script
Extracts and cross-references synthetic data from all 4 silos,
generates a unified JSON dataset for the AirOps web app prototype.
"""

import json
import csv
import re
import random
import os
from pathlib import Path
from datetime import datetime, timedelta

random.seed(42)  # Reproducible output

ROOT = Path(__file__).resolve().parent.parent
SYNTHETIC = ROOT / "synthetic_data"
OUTPUT = ROOT / "app" / "data"
OUTPUT.mkdir(parents=True, exist_ok=True)

# ─── 1. Parse field logs (TTL) ──────────────────────────────────────────────

def parse_field_logs():
    """Parse silo2_field_logs.ttl into a list of chrono event dicts."""
    path = SYNTHETIC / "silo2_field_logs.ttl"
    text = path.read_text()
    
    # Split into individual log blocks (each ends with " .")
    blocks = re.split(r'\.\s*\n\s*\n', text)
    events = []
    
    for block in blocks:
        block = block.strip()
        if not block or block.startswith('@prefix'):
            continue
        
        ev = {}
        
        # Log ID
        m = re.search(r'field:(Log_\d+_\d+)', block)
        if m:
            ev['logId'] = m.group(1)
        
        # Player ID
        m = re.search(r'field:playerID\s+"(P_\d+)"', block)
        if m:
            ev['playerId'] = m.group(1)
        
        # Replica spotted
        m = re.search(r'field:replicaSpotted\s+"([^"]+)"', block)
        if m:
            ev['replica'] = m.group(1)
        
        # Muzzle energy
        m = re.search(r'field:measuredMuzzleEnergy\s+"([\d.]+)"', block)
        if m:
            ev['joules'] = float(m.group(1))
        
        # FPS
        m = re.search(r'field:velocityFps\s+"(\d+)"', block)
        if m:
            ev['fps'] = int(m.group(1))
        
        # BB weight
        m = re.search(r'field:projectileWeightUsed\s+"([\d.]+)"', block)
        if m:
            ev['bbWeight'] = float(m.group(1))
        
        # Test status
        m = re.search(r'field:testStatus\s+"([^"]+)"', block)
        if m:
            ev['status'] = m.group(1)
        
        # Marshall note (optional)
        m = re.search(r'field:marshallNote\s+"([^"]+)"', block)
        if m:
            ev['marshallNote'] = m.group(1)
        
        # Marshall action (optional)
        m = re.search(r'field:marshallAction\s+"([^"]+)"', block)
        if m:
            ev['marshallAction'] = m.group(1)
        
        if ev.get('logId'):
            events.append(ev)
    
    return events


# ─── 2. Parse retail catalog (JSON-LD) ──────────────────────────────────────

def parse_retail_catalog():
    """Parse silo1_retail_catalog.jsonld into gear catalog."""
    path = SYNTHETIC / "silo1_retail_catalog.jsonld"
    raw = json.loads(path.read_text())
    
    catalog = []
    for item in raw:
        entry = {
            'sku': item.get('sku', ''),
            'name': item.get('name', ''),
            'brand': item.get('brand', {}).get('name', 'Unknown'),
        }
        
        # Extract additional properties
        props = item.get('additionalProperty', [])
        for prop in props:
            pname = prop.get('name', '')
            pval = prop.get('value', '')
            if pname == 'power_source':
                entry['powerSource'] = pval
            elif pname == 'gearbox_type':
                entry['gearboxType'] = pval
        
        catalog.append(entry)
    
    return catalog


# ─── 3. Parse tech repairs (CSV) ─────────────────────────────────────────────

def parse_tech_repairs():
    """Parse silo3_tech_repairs.csv into repair records."""
    path = SYNTHETIC / "silo3_tech_repairs.csv"
    repairs = []
    
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            repairs.append({
                'repairId': row.get('REPAIR_ID', '').strip(),
                'playerId': row.get('PLAYER_ID', '').strip(),
                'platform': row.get('PLATFORM_MODEL', '').strip(),
                'date': row.get('INTAKE_DATE', '').strip(),
                'diagnosis': row.get('TECH_DIAGNOSIS', '').strip(),
                'partsInstalled': row.get('UPGRADE_PARTS_INSTALLED', '').strip(),
                'status': row.get('REPAIR_STATUS', '').strip(),
            })
    
    return repairs


# ─── 4. Generate player profiles ─────────────────────────────────────────────

FIRST_NAMES = [
    "Alex", "Jordan", "Sam", "Casey", "Riley", "Morgan", "Taylor", "Jamie",
    "Quinn", "Avery", "Charlie", "Dakota", "Emery", "Frankie", "Harley",
    "Jesse", "Kai", "Logan", "Mason", "Noel", "Parker", "Reese", "Sage",
    "Tyler", "Val", "Blake", "Cameron", "Drew", "Ellis", "Flynn",
    "Grey", "Hunter", "Indigo", "Jules", "Kit", "Lane", "Marlow",
    "Nash", "Oakley", "Phoenix", "Remy", "Sky", "Tate", "Uri",
    "Wren", "Zephyr", "Ash", "Briar", "Cruz", "Dex"
]

CALLSIGNS = [
    "Viper", "Ghost", "Hawk", "Shadow", "Raven", "Wolf", "Fox", "Cobra",
    "Phantom", "Storm", "Blaze", "Frost", "Echo", "Cipher", "Nomad",
    "Reaper", "Spartan", "Wraith", "Saber", "Titan", "Apex", "Onyx",
    "Bolt", "Dagger", "Ember", "Flint", "Grizzly", "Hornet", "Iron",
    "Jackal", "Kodiak", "Lynx", "Mantis", "Nitro", "Osprey", "Python",
    "Raptor", "Sentinel", "Talon", "Venom", "Warden", "Zero", "Bravo",
    "Delta", "Sierra", "Tango", "Whiskey", "X-Ray", "Yankee", "Zulu"
]

TEAMS = [
    {"id": "alpha", "name": "Alpha Force", "color": "#00ff88", "spawnZone": "spawn_a"},
    {"id": "bravo", "name": "Bravo Company", "color": "#4488ff", "spawnZone": "spawn_b"},
]

ROLES = ["Rifleman", "Sniper", "Support", "Breacher", "Medic", "Commander"]
ROLE_WEIGHTS = [0.35, 0.12, 0.18, 0.15, 0.12, 0.08]

def assign_role_from_replica(replica_name):
    """Infer a player's role from their chrono'd replica type."""
    r = replica_name.lower()
    if 'bolt action' in r or 'vsr' in r or 'srs' in r or 'ssg' in r:
        return "Sniper"
    elif 'hpa' in r or 'polarstar' in r or 'wolverine' in r or 'redline' in r:
        return "Support"
    elif 'smg' in r or 'vector' in r or 'mp' in r or 'cqb' in r:
        return "Breacher"
    elif 'sr25' in r or 'dmr' in r:
        return "Sniper"
    else:
        return random.choices(["Rifleman", "Rifleman", "Support", "Breacher", "Medic"], 
                              weights=[0.45, 0.25, 0.1, 0.1, 0.1])[0]


def compliance_from_status(status):
    """Determine compliance level from chrono status."""
    if status == "PASS" or status == "PASS_DMR_RULES":
        return "CLEARED"
    elif status == "FAILED_MIN_PERFORMANCE":
        return "FLAGGED"
    elif status == "JOULE_CREEP_DETECTED":
        return "BANNED"
    return "UNKNOWN"


def generate_players(chrono_events, repairs, catalog):
    """Generate rich player profiles by cross-referencing all data sources."""
    
    # Group chrono events and repairs by player ID
    chrono_by_player = {}
    for ev in chrono_events:
        pid = ev.get('playerId')
        if pid:
            chrono_by_player.setdefault(pid, []).append(ev)
    
    repairs_by_player = {}
    for r in repairs:
        pid = r.get('playerId')
        if pid:
            repairs_by_player.setdefault(pid, []).append(r)
    
    # Get unique player IDs (sorted)
    all_player_ids = sorted(set(
        list(chrono_by_player.keys()) + list(repairs_by_player.keys())
    ))
    
    # Limit to first 50 for the prototype
    all_player_ids = all_player_ids[:50]
    
    random.shuffle(FIRST_NAMES)
    random.shuffle(CALLSIGNS)
    
    players = []
    for i, pid in enumerate(all_player_ids):
        # Get the latest/first chrono event for this player
        player_chrono = chrono_by_player.get(pid, [])
        latest_chrono = player_chrono[0] if player_chrono else {}
        
        # Get repair records
        player_repairs = repairs_by_player.get(pid, [])
        
        # Match to catalog by index (SKU alignment)
        idx = int(pid.replace('P_', '')) - 1
        gear_entry = catalog[idx] if idx < len(catalog) else {}
        
        # Assign team (alternate)
        team = TEAMS[i % 2]
        
        # Determine role from replica
        replica = latest_chrono.get('replica', gear_entry.get('name', 'Unknown'))
        role = assign_role_from_replica(replica)
        
        # Commander override: one per team
        if i == 0:
            role = "Commander"
        elif i == 1:
            role = "Commander"
        # Medic override: ensure at least one per team
        elif i == 2:
            role = "Medic"
        elif i == 3:
            role = "Medic"
        
        # Compliance
        status = latest_chrono.get('status', 'PASS')
        compliance = compliance_from_status(status)
        
        # Generate position on map (within team's spawn zone area)
        if team['id'] == 'alpha':
            pos_x = random.randint(60, 280)
            pos_y = random.randint(150, 500)
        else:
            pos_x = random.randint(720, 940)
            pos_y = random.randint(150, 500)
        
        player = {
            'id': pid,
            'name': FIRST_NAMES[i % len(FIRST_NAMES)],
            'callsign': f"{CALLSIGNS[i % len(CALLSIGNS)]}-{i+1:02d}",
            'team': team['id'],
            'teamName': team['name'],
            'teamColor': team['color'],
            'role': role,
            'gear': {
                'primary': {
                    'name': gear_entry.get('name', replica),
                    'sku': gear_entry.get('sku', ''),
                    'brand': gear_entry.get('brand', 'Unknown'),
                    'powerSource': gear_entry.get('powerSource', 'Unknown'),
                    'gearboxType': gear_entry.get('gearboxType', ''),
                },
                'eyeProtection': True,
            },
            'chrono': {
                'fps': latest_chrono.get('fps', 0),
                'joules': latest_chrono.get('joules', 0),
                'bbWeight': latest_chrono.get('bbWeight', 0.2),
                'status': status,
            },
            'compliance': compliance,
            'repairs': player_repairs,
            'position': {'x': pos_x, 'y': pos_y},
            'isAlive': compliance != 'BANNED',
        }
        
        players.append(player)
    
    return players


# ─── 5. Generate game events ─────────────────────────────────────────────────

ZONE_NAMES = [
    "woodland_north", "woodland_south", "hill_overlook", 
    "bunker_a", "bunker_b", "cqb_building", "bridge", 
    "obj_alpha", "obj_bravo", "obj_central"
]

def generate_game_events(players):
    """Generate synthetic in-game events for the AAR module."""
    events = []
    base_time = datetime(2026, 11, 24, 10, 0, 0)
    
    alive_alpha = [p for p in players if p['team'] == 'alpha' and p['isAlive']]
    alive_bravo = [p for p in players if p['team'] == 'bravo' and p['isAlive']]
    
    # Generate 30 game events over a 2-hour game
    for i in range(35):
        t = base_time + timedelta(minutes=random.randint(0, 120), seconds=random.randint(0, 59))
        zone = random.choice(ZONE_NAMES)
        
        roll = random.random()
        
        if roll < 0.55 and alive_alpha and alive_bravo:
            # Elimination event
            if random.random() < 0.5:
                attacker = random.choice(alive_alpha)
                target = random.choice(alive_bravo)
            else:
                attacker = random.choice(alive_bravo)
                target = random.choice(alive_alpha)
            
            events.append({
                'type': 'elimination',
                'timestamp': t.isoformat(),
                'attackerId': attacker['id'],
                'attackerCallsign': attacker['callsign'],
                'attackerTeam': attacker['team'],
                'targetId': target['id'],
                'targetCallsign': target['callsign'],
                'targetTeam': target['team'],
                'zone': zone,
                'weapon': attacker['gear']['primary']['name'],
            })
        elif roll < 0.75:
            # Objective capture
            team = random.choice(['alpha', 'bravo'])
            obj = random.choice(['obj_alpha', 'obj_bravo', 'obj_central'])
            events.append({
                'type': 'objective_capture',
                'timestamp': t.isoformat(),
                'team': team,
                'zone': obj,
            })
        elif roll < 0.88:
            # Medic revive
            team_pool = alive_alpha if random.random() < 0.5 else alive_bravo
            if len(team_pool) >= 2:
                medic = random.choice([p for p in team_pool if p['role'] == 'Medic'] or team_pool)
                revived = random.choice([p for p in team_pool if p['id'] != medic['id']])
                events.append({
                    'type': 'medic_revive',
                    'timestamp': t.isoformat(),
                    'medicId': medic['id'],
                    'medicCallsign': medic['callsign'],
                    'revivedId': revived['id'],
                    'revivedCallsign': revived['callsign'],
                    'team': medic['team'],
                    'zone': zone,
                })
        else:
            # Rule violation
            all_active = alive_alpha + alive_bravo
            if all_active:
                violator = random.choice(all_active)
                vtype = random.choice(['BLIND_FIRE', 'NO_BANG_BANG', 'OVERSHOT', 'DEAD_MAN_WALKING'])
                events.append({
                    'type': 'violation',
                    'timestamp': t.isoformat(),
                    'playerId': violator['id'],
                    'playerCallsign': violator['callsign'],
                    'team': violator['team'],
                    'violationType': vtype,
                    'zone': zone,
                    'action': random.choice(['WARNING', 'TEMP_BAN_5MIN', 'EJECTED']),
                })
    
    events.sort(key=lambda e: e['timestamp'])
    return events


# ─── 6. Game session metadata ────────────────────────────────────────────────

def build_game_session(player_count):
    return {
        'id': 'GS_2026_001',
        'date': '2026-11-24',
        'field': 'Blackwood Compound',
        'fieldType': 'Hybrid (Woodland + CQB)',
        'mode': 'Domination',
        'modeDescription': 'Three objectives. Capture and hold to accumulate points. Team with most points at game end wins.',
        'phases': [
            {'name': 'Registration & Chrono', 'startTime': '08:30', 'duration': 60, 'status': 'completed'},
            {'name': 'Safety Briefing', 'startTime': '09:30', 'duration': 15, 'status': 'completed'},
            {'name': 'Game 1 — Domination', 'startTime': '09:45', 'duration': 45, 'status': 'active'},
            {'name': 'Turnaround', 'startTime': '10:30', 'duration': 15, 'status': 'pending'},
            {'name': 'Game 2 — TDM', 'startTime': '10:45', 'duration': 45, 'status': 'pending'},
            {'name': 'Lunch Break', 'startTime': '11:30', 'duration': 60, 'status': 'pending'},
            {'name': 'Game 3 — VIP Escort', 'startTime': '12:30', 'duration': 45, 'status': 'pending'},
            {'name': 'Game 4 — Last Stand', 'startTime': '13:15', 'duration': 30, 'status': 'pending'},
            {'name': 'After-Action Review', 'startTime': '13:45', 'duration': 15, 'status': 'pending'},
        ],
        'currentPhase': 2,
        'playerCount': player_count,
        'objectives': [
            {'id': 'obj_alpha', 'name': 'Alpha Point', 'holder': 'alpha', 'points': 120, 'x': 280, 'y': 415},
            {'id': 'obj_bravo', 'name': 'Bravo Point', 'holder': 'bravo', 'points': 95, 'x': 720, 'y': 415},
            {'id': 'obj_central', 'name': 'Central Tower', 'holder': 'contested', 'points': 0, 'x': 500, 'y': 540},
        ],
        'score': {'alpha': 120, 'bravo': 95},
    }


# ─── 7. Build complete dataset ───────────────────────────────────────────────

def main():
    print("AirOps Data Preparation")
    print("=" * 50)
    
    print("  [1/6] Parsing field logs (silo 2)...")
    chrono_events = parse_field_logs()
    print(f"         → {len(chrono_events)} chrono events")
    
    print("  [2/6] Parsing retail catalog (silo 1)...")
    catalog = parse_retail_catalog()
    print(f"         → {len(catalog)} gear items")
    
    print("  [3/6] Parsing tech repairs (silo 3)...")
    repairs = parse_tech_repairs()
    print(f"         → {len(repairs)} repair records")
    
    print("  [4/6] Generating player profiles...")
    players = generate_players(chrono_events, repairs, catalog)
    print(f"         → {len(players)} player profiles")
    
    print("  [5/6] Generating game events...")
    game_events = generate_game_events(players)
    print(f"         → {len(game_events)} game events")
    
    print("  [6/6] Building game session...")
    session = build_game_session(len(players))
    
    # Compile final dataset
    dataset = {
        '_meta': {
            'generated': datetime.now().isoformat(),
            'generator': 'prepare_app_data.py',
            'description': 'Unified AirOps dataset derived from 4 synthetic data silos',
            'silos': {
                'silo1': 'Retail catalog (JSON-LD)',
                'silo2': 'Field chrono logs (TTL)',
                'silo3': 'Tech repair records (CSV)',
                'silo4': 'Social scrape (MD) — used for sentiment, not directly imported',
            },
        },
        'teams': TEAMS,
        'players': players,
        'chronoEvents': chrono_events,
        'gearCatalog': catalog,
        'repairs': repairs,
        'gameEvents': game_events,
        'gameSession': session,
    }
    
    # Write output
    out_path = OUTPUT / "app-data.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Written to {out_path}")
    print(f"   File size: {out_path.stat().st_size / 1024:.1f} KB")
    
    # Summary stats
    statuses = {}
    for p in players:
        s = p['chrono']['status']
        statuses[s] = statuses.get(s, 0) + 1
    
    print(f"\n📊 Player compliance breakdown:")
    for status, count in sorted(statuses.items()):
        print(f"   {status}: {count}")
    
    roles = {}
    for p in players:
        r = p['role']
        roles[r] = roles.get(r, 0) + 1
    
    print(f"\n🎖️  Role distribution:")
    for role, count in sorted(roles.items()):
        print(f"   {role}: {count}")
    
    team_counts = {}
    for p in players:
        t = p['teamName']
        team_counts[t] = team_counts.get(t, 0) + 1
    
    print(f"\n👥 Team sizes:")
    for team, count in sorted(team_counts.items()):
        print(f"   {team}: {count}")


if __name__ == "__main__":
    main()
