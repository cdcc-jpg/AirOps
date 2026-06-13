import csv
import json
import re
from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import OWL, RDF, RDFS, XSD

g = Graph()
ASOFT = Namespace("https://github.com/cdcc-jpg/ontologies#")
SCHEMA = Namespace("http://schema.org/")
FIELD = Namespace("http://local-airsoft-field.com/ontology/logs#")

g.bind("asoft", ASOFT)
g.bind("owl", OWL)
g.bind("schema", SCHEMA)
g.bind("field", FIELD)

def normalize_silo1():
    print("[*] Normalizing Silo 1: Retail Inventory...")
    with open("synthetic_data/silo1_retail_catalog.jsonld", "r") as f:
        data = json.load(f)
    for item in data:
        sku = item.get("sku")
        if not sku:
            continue
        replica_uri = URIRef(f"https://retailer.com/sku/{sku}")
        g.add((replica_uri, RDF.type, ASOFT.AirsoftReplica))
        g.add((replica_uri, RDFS.label, Literal(item.get("name"))))
        
        brand = item.get("brand", {})
        if "name" in brand:
            g.add((replica_uri, ASOFT.hasBrand, Literal(brand["name"])))
            
        for prop in item.get("additionalProperty", []):
            if prop.get("name") == "power_source":
                g.add((replica_uri, ASOFT.hasPowerSource, Literal(prop.get("value"))))

def normalize_silo2():
    print("[*] Normalizing Silo 2: Chrono Field Logs...")
    local_g = Graph()
    local_g.parse("synthetic_data/silo2_field_logs.ttl", format="turtle")
    
    for s, p, o in local_g:
        if p == FIELD.measuredMuzzleEnergy:
            g.add((s, ASOFT.hasPowerLimit, o))
        elif p == FIELD.velocityFps:
            g.add((s, ASOFT.hasFPS, o))
        elif p == FIELD.playerID:
            player_uri = ASOFT[f"Player_{o}"]
            g.add((s, ASOFT.isOwnedBy, player_uri))
            g.add((player_uri, RDF.type, ASOFT.AirsoftPlayer))
        elif p == FIELD.testStatus:
            g.add((s, ASOFT.hasChronoStatus, o))
        elif p == RDF.type:
            g.add((s, RDF.type, ASOFT.ChronoEvent))

def normalize_silo3():
    print("[*] Normalizing Silo 3: Workshop Diagnostics...")
    with open("synthetic_data/silo3_tech_repairs.csv", "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            repair_uri = ASOFT[row["REPAIR_ID"]]
            player_uri = ASOFT[f"Player_{row['PLAYER_ID']}"]
            
            g.add((repair_uri, RDF.type, ASOFT.RepairInvoice))
            g.add((repair_uri, ASOFT.associatedPlayer, player_uri))
            g.add((repair_uri, ASOFT.detectedFailure, Literal(row["TECH_DIAGNOSIS"])))
            g.add((repair_uri, ASOFT.installedUpgrade, Literal(row["UPGRADE_PARTS_INSTALLED"])))
            g.add((repair_uri, ASOFT.platformModel, Literal(row["PLATFORM_MODEL"])))
            g.add((player_uri, RDF.type, ASOFT.AirsoftPlayer))

def normalize_silo4():
    print("[*] Normalizing Silo 4: Unstructured Social Stream...")
    with open("synthetic_data/silo4_social_scrape.md", "r") as f:
        lines = f.readlines()
        
    skos_map = {
        "green juice": ASOFT.GreenGasAnomaly,
        "screeching cat": ASOFT.GearboxFailure,
        "glitter gears": ASOFT.StrippedGears,
        "pearls": ASOFT.HeavyAmmunition
    }
    
    player_idx = 1
    for line in lines:
        player_match = re.search(r"\*\*(?:u/|@|User:\s*)(User_\d+_[a-zA-Z]+):?\*\*", line)
        if player_match:
            player_uri = ASOFT[f"Player_P_{player_idx:04d}"]
            player_idx += 1
            
            g.add((player_uri, RDF.type, ASOFT.AirsoftPlayer))
            
            for token, topic_class in skos_map.items():
                if token in line.lower():
                    annotation_node = ASOFT[f"Annotation_{hash(line) & 0xffffffff}"]
                    g.add((annotation_node, RDF.type, ASOFT.SocialMention))
                    g.add((annotation_node, ASOFT.mentionSource, player_uri))
                    g.add((annotation_node, ASOFT.classifiedTopic, topic_class))

if __name__ == "__main__":
    normalize_silo1()
    normalize_silo2()
    normalize_silo3()
    normalize_silo4()
    
    g.serialize(destination="normalized_graph.ttl", format="turtle")
    print(f"[+] Success: Created 'normalized_graph.ttl' containing {len(g)} total triples.")
