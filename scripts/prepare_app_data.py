#!/usr/bin/env python3
"""
AirOps v2.1 Data Preparation — Humber Airsoft at Leggotts Quarry
Generates unified JSON dataset with 3-tier chrono, kill/death tracking,
graduated warnings, and Non-Band (grey) vs Band (yellow) teams.
Positions are set to null (none) to support real data tracking only.
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

# ─── Humber Quarry Zone Names ────────────────────────────────────────────────

HUMBER_ZONES = [
    "firebase", "village", "woodland_north", "woodland_east",
    "quarry_floor_north", "quarry_floor_south", "ridge", "entrance_road"
]

CQB_ZONES = ["firebase", "village"]
OPEN_ZONES = ["woodland_north", "woodland_east", "quarry_floor_north",
              "quarry_floor_south", "ridge"]

# ─── Humber Chrono Tiers ────────────────────────────────────────────────────

CHRONO_TIERS = {
    "AEG":         {"maxFps": 350, "maxJoules": 1.20, "med": 0,  "fireMode": "Full-Auto / Semi"},
    "DMR":         {"maxFps": 450, "maxJoules": 1.88, "med": 25, "fireMode": "Semi-Auto Locked"},
    "Bolt-Action": {"maxFps": 500, "maxJoules": 2.32, "med": 35, "fireMode": "Single-Shot"},
}

# ─── Violation Types & Thresholds ───────────────────────────────────────────

VIOLATION_TYPES = {
    "BLIND_FIRE":       {"maxWarnings": 2, "escalation": "TEMP_BAN_30MIN"},
    "OVERSHOOT":        {"maxWarnings": 2, "escalation": "TEMP_BAN_30MIN"},
    "DEAD_MAN_WALKING": {"maxWarnings": 3, "escalation": "TEMP_BAN_15MIN"},
    "MED_VIOLATION":    {"maxWarnings": 1, "escalation": "WEAPON_CONFISCATED"},
    "EYE_PRO_REMOVED":  {"maxWarnings": 2, "escalation": "EJECTED"},
    "JOULE_CREEP":      {"maxWarnings": 1, "escalation": "BANNED_FOR_DAY"},
    "AGGRESSION":       {"maxWarnings": 0, "escalation": "EJECTED"},
    "PYRO_MISUSE":      {"maxWarnings": 0, "escalation": "EJECTED"},
}

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


# ─── 4. Chrono tier assignment ───────────────────────────────────────────────

def assign_chrono_tier(replica_name, fps, joules):
    """Assign Humber 3-tier chrono classification."""
    r = replica_name.lower()

    # Bolt-action detection
    if any(kw in r for kw in ['bolt action', 'vsr', 'srs', 'ssg', 'l96', 'spring sniper']):
        tier = "Bolt-Action"
    # DMR detection
    elif any(kw in r for kw in ['sr25', 'dmr', 'mk12', 'm14', 'svd', 'scar-h', 'hk417']):
        tier = "DMR"
    else:
        tier = "AEG"

    limits = CHRONO_TIERS[tier]

    # Determine status based on tier limits
    if fps > limits["maxFps"] or joules > limits["maxJoules"]:
        status = "FAIL_OVER_POWER"
        compliance = "BANNED"
    elif joules < 0.3:
        status = "FAIL_MIN_PERFORMANCE"
        compliance = "FLAGGED"
    else:
        status = "PASS"
        compliance = "CLEARED"

    return tier, status, compliance, limits


# ─── 5. Player profile generation ────────────────────────────────────────────

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

# Teams: Non-Band (Grey) and Band (Yellow)
TEAMS = [
    {"id": "nonband", "name": "Non-Band (Grey)", "color": "#888888", "spawnZone": "woodland_north"},
    {"id": "band", "name": "Band (Yellow)", "color": "#f1c40f", "spawnZone": "woodland_east"},
]

def assign_role_from_tier(tier_name):
    """Map chrono tier to tactical role."""
    if tier_name == "Bolt-Action":
        return "Sniper"
    elif tier_name == "DMR":
        return random.choice(["Sniper", "Support"])
    else:
        return random.choices(
            ["Rifleman", "Support", "Breacher", "Medic"],
            weights=[0.45, 0.2, 0.2, 0.15]
        )[0]


def generate_players(chrono_events, repairs, catalog):
    """Generate rich player profiles grounded in Humber Quarry chrono tiers."""

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

    all_player_ids = sorted(set(
        list(chrono_by_player.keys()) + list(repairs_by_player.keys())
    ))

    # Limit to 50 for prototype
    all_player_ids = all_player_ids[:50]

    random.shuffle(FIRST_NAMES)
    random.shuffle(CALLSIGNS)

    players = []
    for i, pid in enumerate(all_player_ids):
        player_chrono = chrono_by_player.get(pid, [])
        latest_chrono = player_chrono[0] if player_chrono else {}
        player_repairs = repairs_by_player.get(pid, [])

        idx = int(pid.replace('P_', '')) - 1
        gear_entry = catalog[idx] if idx < len(catalog) else {}

        # Team assignment (alternate)
        team = TEAMS[i % 2]

        # Chrono data
        fps = latest_chrono.get('fps', random.randint(280, 340))
        joules = latest_chrono.get('joules', round(random.uniform(0.8, 1.15), 2))
        replica = latest_chrono.get('replica', gear_entry.get('name', 'Unknown'))

        # Assign tier & validate
        tier, status, compliance, limits = assign_chrono_tier(replica, fps, joules)

        # Override status from original data if it was joule creep
        orig_status = latest_chrono.get('status', '')
        if orig_status == 'JOULE_CREEP_DETECTED':
            status = 'JOULE_CREEP_DETECTED'
            compliance = 'BANNED'
        elif orig_status == 'FAILED_MIN_PERFORMANCE':
            status = 'FAIL_MIN_PERFORMANCE'
            compliance = 'FLAGGED'

        # Assign role from tier
        role = assign_role_from_tier(tier)

        # Commander override: one per team
        if i == 0 or i == 1:
            role = "Commander"
        elif i == 2 or i == 3:
            role = "Medic"

        # Player status
        player_status = "ACTIVE"
        if compliance == "BANNED":
            player_status = "OUT"
        elif random.random() < 0.08:
            player_status = random.choice(["ELIMINATED", "RESPAWNING"])

        # POSITION: SET TO NULL (None) for all players to ensure real coordinate tracking
        # We can add a few fixed positions for 2 commanders to verify map plotting
        position = None
        if (i == 0 or i == 1) and player_status == "ACTIVE":
            # Real static coordinates representing command post sensors
            position = {'x': 160 if i == 0 else 750, 'y': 100}

        player = {
            'id': pid,
            'name': FIRST_NAMES[i % len(FIRST_NAMES)],
            'callsign': f"{CALLSIGNS[i % len(CALLSIGNS)]}-{i+1:02d}",
            'team': team['id'],
            'teamName': team['name'],
            'teamColor': team['color'],
            'role': role,
            'status': player_status,
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
                'fps': fps,
                'joules': joules,
                'bbWeight': latest_chrono.get('bbWeight', 0.2),
                'status': status,
                'tier': tier,
                'med': limits['med'],
                'fireMode': limits['fireMode'],
            },
            'compliance': compliance,
            'repairs': player_repairs,
            'position': position,
            'isAlive': player_status in ('ACTIVE', 'RESPAWNING'),
            'warnings': [],
            'stats': {
                'kills': 0,
                'deaths': 0,
                'assists': 0,
                'objectiveCaptures': 0,
                'revives': 0,
            }
        }

        players.append(player)

    return players


# ─── 6. Game events with K/D tracking ────────────────────────────────────────

def generate_game_events(players):
    """Generate Humber-specific game events with kill/death tracking."""
    events = []
    base_time = datetime(2026, 11, 24, 10, 0, 0)

    alive_nonband = [p for p in players if p['team'] == 'nonband' and p['isAlive']]
    alive_band = [p for p in players if p['team'] == 'band' and p['isAlive']]

    kill_count = {}  # playerId -> kills
    death_count = {}  # playerId -> deaths

    for i in range(45):
        t = base_time + timedelta(minutes=random.randint(0, 120), seconds=random.randint(0, 59))

        roll = random.random()

        if roll < 0.50 and alive_nonband and alive_band:
            # Elimination event
            zone = random.choice(HUMBER_ZONES)
            if random.random() < 0.5:
                attacker = random.choice(alive_nonband)
                target = random.choice(alive_band)
            else:
                attacker = random.choice(alive_band)
                target = random.choice(alive_nonband)

            kill_count[attacker['id']] = kill_count.get(attacker['id'], 0) + 1
            death_count[target['id']] = death_count.get(target['id'], 0) + 1

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

        elif roll < 0.68:
            # Objective capture
            team = random.choice(['nonband', 'band'])
            obj = random.choice(['obj_firebase_compound', 'obj_village_centre', 'obj_ridge_tower'])
            capturer = random.choice(alive_nonband if team == 'nonband' else alive_band) if (alive_nonband if team == 'nonband' else alive_band) else None
            ev = {
                'type': 'objective_capture',
                'timestamp': t.isoformat(),
                'team': team,
                'zone': obj,
            }
            if capturer:
                capturer['stats']['objectiveCaptures'] += 1
                ev['capturerId'] = capturer['id']
                ev['capturerCallsign'] = capturer['callsign']
            events.append(ev)

        elif roll < 0.82:
            # Medic revive
            team_pool = alive_nonband if random.random() < 0.5 else alive_band
            if len(team_pool) >= 2:
                medics = [p for p in team_pool if p['role'] == 'Medic']
                medic = random.choice(medics) if medics else random.choice(team_pool)
                revived = random.choice([p for p in team_pool if p['id'] != medic['id']])
                medic['stats']['revives'] += 1
                events.append({
                    'type': 'medic_revive',
                    'timestamp': t.isoformat(),
                    'medicId': medic['id'],
                    'medicCallsign': medic['callsign'],
                    'revivedId': revived['id'],
                    'revivedCallsign': revived['callsign'],
                    'team': medic['team'],
                    'zone': random.choice(HUMBER_ZONES),
                })

        else:
            # Rule violation with graduated warning
            all_active = alive_nonband + alive_band
            if all_active:
                violator = random.choice(all_active)
                vtype = random.choice(list(VIOLATION_TYPES.keys()))
                vinfo = VIOLATION_TYPES[vtype]

                # Compute warning count for this player/type
                existing = len([w for w in violator['warnings'] if w['type'] == vtype])
                action = "WARNING"
                if existing >= vinfo['maxWarnings']:
                    action = vinfo['escalation']
                violator['warnings'].append({'type': vtype, 'count': existing + 1})

                events.append({
                    'type': 'violation',
                    'timestamp': t.isoformat(),
                    'playerId': violator['id'],
                    'playerCallsign': violator['callsign'],
                    'team': violator['team'],
                    'violationType': vtype,
                    'warningNumber': existing + 1,
                    'maxWarnings': vinfo['maxWarnings'],
                    'zone': random.choice(HUMBER_ZONES),
                    'action': action,
                })

    events.sort(key=lambda e: e['timestamp'])

    # Write back K/D stats to player objects
    for p in players:
        p['stats']['kills'] = kill_count.get(p['id'], 0)
        p['stats']['deaths'] = death_count.get(p['id'], 0)

    return events


# ─── 7. Game session (Humber-specific) ───────────────────────────────────────

def build_game_session(player_count):
    return {
        'id': 'GS_HUMBER_2026_001',
        'date': '2026-11-24',
        'field': 'Humber Airsoft — Leggotts Quarry',
        'fieldType': 'Outdoor (Quarry + Woodland + CQB)',
        'fieldAddress': 'South Ferriby, DN18 6RA',
        'mode': 'Full Site Domination',
        'modeDescription': 'Three objectives across the quarry. Capture and hold Firebase, Village, and Ridge. Most points at end wins.',
        'phases': [
            {'name': 'Registration & Chrono', 'startTime': '08:30', 'duration': 60, 'status': 'completed'},
            {'name': 'Safety Briefing', 'startTime': '09:30', 'duration': 15, 'status': 'completed'},
            {'name': 'Game 1 — Firebase Assault', 'startTime': '09:45', 'duration': 45, 'status': 'active'},
            {'name': 'Turnaround', 'startTime': '10:30', 'duration': 15, 'status': 'pending'},
            {'name': 'Game 2 — Village CQB', 'startTime': '10:45', 'duration': 45, 'status': 'pending'},
            {'name': 'Lunch Break', 'startTime': '11:30', 'duration': 60, 'status': 'pending'},
            {'name': 'Game 3 — Full Site Domination', 'startTime': '12:30', 'duration': 45, 'status': 'pending'},
            {'name': 'Game 4 — Last Stand', 'startTime': '13:15', 'duration': 30, 'status': 'pending'},
            {'name': 'After-Action Review', 'startTime': '13:45', 'duration': 15, 'status': 'pending'},
        ],
        'currentPhase': 2,
        'playerCount': player_count,
        'objectives': [
            {'id': 'obj_firebase_compound', 'name': 'Firebase Compound', 'holder': 'contested', 'points': 0, 'x': 480, 'y': 560},
            {'id': 'obj_village_centre', 'name': 'Village Centre', 'holder': 'nonband', 'points': 85, 'x': 460, 'y': 260},
            {'id': 'obj_ridge_tower', 'name': 'Ridge Observation Post', 'holder': 'band', 'points': 65, 'x': 80, 'y': 420},
        ],
        'score': {'nonband': 85, 'band': 65},
        'chronoTiers': CHRONO_TIERS,
        'violationTypes': VIOLATION_TYPES,
    }


# ─── 8. Build complete dataset ───────────────────────────────────────────────

def main():
    print("AirOps v2.1 Data Preparation — Humber Airsoft")
    print("=" * 55)

    print("  [1/6] Parsing field logs (silo 2)...")
    chrono_events = parse_field_logs()
    print(f"         → {len(chrono_events)} chrono events")

    print("  [2/6] Parsing retail catalog (silo 1)...")
    catalog = parse_retail_catalog()
    print(f"         → {len(catalog)} gear items")

    print("  [3/6] Parsing tech repairs (silo 3)...")
    repairs = parse_tech_repairs()
    print(f"         → {len(repairs)} repair records")

    print("  [4/6] Generating player profiles (Humber tiers, no-pos)...")
    players = generate_players(chrono_events, repairs, catalog)
    print(f"         → {len(players)} player profiles")

    print("  [5/6] Generating game events (with K/D tracking)...")
    game_events = generate_game_events(players)
    print(f"         → {len(game_events)} game events")

    print("  [6/6] Building Humber game session...")
    session = build_game_session(len(players))

    # Compile final dataset
    dataset = {
        '_meta': {
            'generated': datetime.now().isoformat(),
            'generator': 'prepare_app_data.py (v2.1 — Humber)',
            'description': 'Unified AirOps dataset for Humber Airsoft (Non-Band vs Band, no position simulation)',
            'silos': {
                'silo1': 'Retail catalog (JSON-LD)',
                'silo2': 'Field chrono logs (TTL)',
                'silo3': 'Tech repair records (CSV)',
                'silo4': 'Social scrape (MD) — sentiment context',
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
    tier_counts = {}
    for p in players:
        t = p['chrono']['tier']
        tier_counts[t] = tier_counts.get(t, 0) + 1

    print(f"\n📊 Chrono tier breakdown:")
    for tier, count in sorted(tier_counts.items()):
        print(f"   {tier}: {count}")

    statuses = {}
    for p in players:
        s = p['chrono']['status']
        statuses[s] = statuses.get(s, 0) + 1

    print(f"\n📊 Compliance breakdown:")
    for status, count in sorted(statuses.items()):
        print(f"   {status}: {count}")

    roles = {}
    for p in players:
        r = p['role']
        roles[r] = roles.get(r, 0) + 1

    print(f"\n🎖️  Role distribution:")
    for role, count in sorted(roles.items()):
        print(f"   {role}: {count}")

    # K/D summary
    total_kills = sum(p['stats']['kills'] for p in players)
    total_deaths = sum(p['stats']['deaths'] for p in players)
    print(f"\n💀 K/D tracking: {total_kills} kills, {total_deaths} deaths")

    team_counts = {}
    for p in players:
        t = p['teamName']
        team_counts[t] = team_counts.get(t, 0) + 1

    print(f"\n👥 Team sizes:")
    for team, count in sorted(team_counts.items()):
        print(f"   {team}: {count}")


if __name__ == "__main__":
    main()
