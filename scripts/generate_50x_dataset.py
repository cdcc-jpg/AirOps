import json
import csv
import random
import math
from datetime import datetime, timedelta

def calc_joules(fps, weight_g):
    fps_ms = fps * 0.3048
    kg = weight_g / 1000.0
    return round(0.5 * kg * (fps_ms ** 2), 2)

# Pools for diversity
aeg_brands = ["Krytac", "VFC", "G&G", "Tokyo Marui", "Cyma", "LCT"]
aeg_models = ["M4 CQB", "Vector SMG", "AK74U", "SCAR-L", "SR25"]
gbb_brands = ["Tokyo Marui", "WE Tech", "KWA", "GHK", "KJW"]
gbb_models = ["MP7", "M4A1", "Hi-Capa 5.1", "Glock 19", "AKM"]
hpa_brands = ["Wolverine", "PolarStar", "Redline"]
hpa_models = ["MTW", "F2 M4", "Kythera SR25", "Jack CQB"]
sniper_brands = ["Tokyo Marui", "Silverback", "Modify", "Novritsch"]
sniper_models = ["VSR-10", "SRS A2", "Steyr Scout", "SSG10"]

slang = ["gat", "pew", "laser", "juice", "tapped", "shimming", "AOE", "pre-cocking", "brrrrt", "rental kid", "speedsoft", "milsim"]

silo1_catalog = []
silo2_ttl = ["@prefix field: <http://local-airsoft-field.com/ontology/logs#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n"]
silo3_csv = [["REPAIR_ID","PLAYER_ID","PLATFORM_MODEL","INTAKE_DATE","TECH_DIAGNOSIS","UPGRADE_PARTS_INSTALLED","REPAIR_STATUS"]]
silo4_md = []

# Generate exactly 250 interconnected stories
for i in range(1, 251):
    player_id = f"P_{i:04d}"
    repair_id = f"R_8{i:03d}"
    username = f"User_{random.randint(1000, 9999)}_{random.choice(['Snipe', 'Op', 'Tech', 'Gat', 'BB'])}"
    
    story_type = random.choice(["AEG_SHIM_FAIL", "HPA_JOULE_CREEP", "GBB_COLD_VENT", "SNIPER_OVERHOP", "STANDARD_PASS"])
    
    # Defaults
    brand = "Unknown"
    model = "Unknown"
    sku = f"SKU-{i:04d}"
    
    if story_type == "AEG_SHIM_FAIL":
        brand = random.choice(aeg_brands)
        model = random.choice(aeg_models)
        fps = random.randint(320, 350)
        weight = 0.20
        joules = calc_joules(fps, weight)
        
        # Silo 1
        silo1_catalog.append({
            "@context": "https://schema.org/", "@type": "Product", "sku": sku, "name": f"{brand} {model} AEG",
            "brand": {"@type": "Brand", "name": brand},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": "power_source", "value": "Electric (LiPo)"},
                {"@type": "PropertyValue", "name": "gearbox_type", "value": "V2/V3 Standard"}
            ]
        })
        
        # Silo 2
        silo2_ttl.append(f"""
field:Log_2026_{i:04d} a field:ChronoEvent ;
    field:playerID "{player_id}" ;
    field:replicaSpotted "{brand} {model}" ;
    field:measuredMuzzleEnergy "{joules}"^^xsd:decimal ;
    field:velocityFps "{fps}"^^xsd:integer ;
    field:projectileWeightUsed "{weight}"^^xsd:decimal ;
    field:testStatus "PASS" .
""")
        
        # Silo 3
        silo3_csv.append([repair_id, player_id, f"{brand}_{model}_Elec", "2026-11-20", 
                          "Stripped spur gear and burnt motor due to terrible factory shimming/AOE.", 
                          "Prometheus Shim Set; High Torque Motor", "COMPLETED"])
        
        # Silo 4
        silo4_md.append(f"### Discord - Airsoft Techs\n**@{username}:** I swear the factory {brand} assemblers are deaf. My {model} sounded like a screeching cat today. Mid-game it just locked up. Pulled the gearbox and the gears are absolute glitter. Motor was burning up because the AOE was trash. Gotta rebuild the whole train now.\n")

    elif story_type == "HPA_JOULE_CREEP":
        brand = random.choice(hpa_brands)
        model = random.choice(hpa_models)
        base_fps = random.randint(340, 360) # Chrono with 0.20
        heavy_weight = random.choice([0.32, 0.36, 0.40])
        creep_joules = calc_joules(base_fps, heavy_weight) * 1.3 # Simulate volume push
        creep_fps = int(math.sqrt((creep_joules * 2) / (heavy_weight / 1000.0)) / 0.3048)
        
        # Silo 1
        silo1_catalog.append({
            "@context": "https://schema.org/", "@type": "Product", "sku": sku, "name": f"{brand} {model} HPA System",
            "brand": {"@type": "Brand", "name": brand},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": "power_source", "value": "High Pressure Air"},
                {"@type": "PropertyValue", "name": "velocity_feet_per_second", "value": "Adjustable"}
            ]
        })
        
        # Silo 2
        silo2_ttl.append(f"""
field:Log_2026_{i:04d} a field:ChronoEvent ;
    field:playerID "{player_id}" ;
    field:replicaSpotted "HPA Rig" ;
    field:measuredMuzzleEnergy "{round(creep_joules,2)}"^^xsd:decimal ;
    field:velocityFps "{creep_fps}"^^xsd:integer ;
    field:projectileWeightUsed "{heavy_weight}"^^xsd:decimal ;
    field:testStatus "JOULE_CREEP_DETECTED" ;
    field:marshallAction "CONFISCATED_FOR_DAY" .
""")
        
        # Silo 3
        silo3_csv.append([repair_id, player_id, f"{brand} {model}", "2026-11-21", 
                          "FCU locked due to field ban. Customer requested dwell reduction for heavy ammo.", 
                          "Zip-tie tournament lock", "COMPLETED"])
        
        # Silo 4
        silo4_md.append(f"### Reddit - r/airsoft\n**u/{username}:** Refs are so dumb. Passed chrono at 350 in the morning. Put my {heavy_weight}g pearls in for the woodland game and suddenly my {brand} rig is 'shooting too hot' and 'creeping'. Like dude, it's basic physics. Air volume pushes heavier BBs more efficiently. Now my gat is zip-tied and my dwell is lowered. Rentals ruin everything.\n")

    elif story_type == "GBB_COLD_VENT":
        brand = random.choice(gbb_brands)
        model = random.choice(gbb_models)
        fps = random.randint(200, 250) # Low due to cold
        weight = 0.25
        joules = calc_joules(fps, weight)
        
        # Silo 1
        silo1_catalog.append({
            "@context": "https://schema.org/", "@type": "Product", "sku": sku, "name": f"{brand} {model} GBBR",
            "brand": {"@type": "Brand", "name": brand},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": "power_source", "value": "Green Gas"}
            ]
        })
        
        # Silo 2
        silo2_ttl.append(f"""
field:Log_2026_{i:04d} a field:ChronoEvent ;
    field:playerID "{player_id}" ;
    field:replicaSpotted "Gas Blowback" ;
    field:measuredMuzzleEnergy "{joules}"^^xsd:decimal ;
    field:velocityFps "{fps}"^^xsd:integer ;
    field:projectileWeightUsed "{weight}"^^xsd:decimal ;
    field:testStatus "FAILED_MIN_PERFORMANCE" ;
    field:marshallNote "SEVERE_COOLDOWN_OBSERVED" .
""")
        
        # Silo 3
        silo3_csv.append([repair_id, player_id, f"{brand} GBB", "2026-11-22", 
                          "Shattered loading nozzle and frozen piston seal from rapid venting in cold weather.", 
                          "Polycarbonate Loading Nozzle; Winter Seal", "COMPLETED"])
        
        # Silo 4
        silo4_md.append(f"### Forum - GasGunKings\n**User: {username}:** Never running green juice in November again. Dropped to 5C today. My {model} cycled twice, then the whole mag just dumped in a massive white cloud. I stripped it and my nozzle is literally snapped in half like glass. Sick. Back to AEGs until Spring.\n")

    elif story_type == "SNIPER_OVERHOP":
        brand = random.choice(sniper_brands)
        model = random.choice(sniper_models)
        weight = random.choice([0.40, 0.43, 0.48])
        fps = random.randint(300, 320) # Lower fps for very heavy bb, but high joules
        joules = calc_joules(fps, weight)
        
        # Silo 1
        silo1_catalog.append({
            "@context": "https://schema.org/", "@type": "Product", "sku": sku, "name": f"{brand} {model} Bolt Action",
            "brand": {"@type": "Brand", "name": brand},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": "power_source", "value": "Spring Action"}
            ]
        })
        
        # Silo 2
        silo2_ttl.append(f"""
field:Log_2026_{i:04d} a field:ChronoEvent ;
    field:playerID "{player_id}" ;
    field:replicaSpotted "Bolt Action Rifle" ;
    field:measuredMuzzleEnergy "{joules}"^^xsd:decimal ;
    field:velocityFps "{fps}"^^xsd:integer ;
    field:projectileWeightUsed "{weight}"^^xsd:decimal ;
    field:testStatus "PASS_DMR_RULES" .
""")
        
        # Silo 3
        silo3_csv.append([repair_id, player_id, f"{brand}_{model}", "2026-11-23", 
                          "Customer wanted to lift heavy ammo. Factory rubber too weak.", 
                          "Maple Leaf 70deg Macaron; Omega Nub", "COMPLETED"])
        
        # Silo 4
        silo4_md.append(f"### Reddit - r/airsoft\n**u/{username}:** Just upgraded the hop on my {model}. Tossed in a 70 degree yellow bucking and omega nub. I am effortlessly lifting {weight}g ammo now. Shooting absolute lasers out to 250ft. Chrono'd right at the edge of the {round(joules,1)}J limit. It's a laser beam now.\n")

    else:
        # Standard Pass
        brand = random.choice(aeg_brands)
        model = random.choice(aeg_models)
        fps = random.randint(330, 345)
        weight = 0.20
        joules = calc_joules(fps, weight)
        
        silo1_catalog.append({
            "@context": "https://schema.org/", "@type": "Product", "sku": sku, "name": f"{brand} {model} AEG",
            "brand": {"@type": "Brand", "name": brand},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": "power_source", "value": "Electric (LiPo)"}
            ]
        })
        
        silo2_ttl.append(f"""
field:Log_2026_{i:04d} a field:ChronoEvent ;
    field:playerID "{player_id}" ;
    field:replicaSpotted "{brand} {model}" ;
    field:measuredMuzzleEnergy "{joules}"^^xsd:decimal ;
    field:velocityFps "{fps}"^^xsd:integer ;
    field:projectileWeightUsed "{weight}"^^xsd:decimal ;
    field:testStatus "PASS" .
""")
        
        silo3_csv.append([repair_id, player_id, f"{brand} {model}", "2026-11-24", 
                          "Routine maintenance. Re-lubed cylinder.", 
                          "Silicone Grease", "COMPLETED"])
        
        silo4_md.append(f"### Discord - General\n**@{username}:** Had a solid day. {brand} ran flawlessly, didn't even have to mess with the hop up. Sometimes stock is best.\n")

# Save Silo 1
with open("/Users/clementd/Documents/GitHub/ontologies/silo1_retail_catalog.jsonld", "w") as f:
    json.dump(silo1_catalog, f, indent=2)

# Save Silo 2
with open("/Users/clementd/Documents/GitHub/ontologies/silo2_field_logs.ttl", "w") as f:
    f.writelines(silo2_ttl)

# Save Silo 3
with open("/Users/clementd/Documents/GitHub/ontologies/silo3_tech_repairs.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerows(silo3_csv)

# Save Silo 4
with open("/Users/clementd/Documents/GitHub/ontologies/silo4_social_scrape.md", "w") as f:
    f.writelines(silo4_md)

print("Massive 50x Dataset successfully generated.")
