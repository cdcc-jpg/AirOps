from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import OWL, RDF
import re

def execute_entity_resolution():
    print("[*] Initiating Entity Resolution Engine...")
    g = Graph()
    g.parse("normalized_graph.ttl", format="turtle")
    
    ASOFT = Namespace("https://github.com/cdcc-jpg/ontologies#")
    alignments = Graph()
    alignments.bind("owl", OWL)
    alignments.bind("asoft", ASOFT)
    
    # Resolve ChronoEvents to Retail SKUs
    chrono_events = list(g.subjects(ASOFT.isOwnedBy, None))
    for chrono_event in chrono_events:
        player_uri = g.value(chrono_event, ASOFT.isOwnedBy)
        if player_uri:
            match = re.search(r"Player_P_(\d{4})", str(player_uri))
            if match:
                idx = match.group(1)
                sku_uri = URIRef(f"https://retailer.com/sku/SKU-{idx}")
                print(f"[Link Found] Merging Chrono Event <{chrono_event}> with Retail SKU <{sku_uri}>")
                alignments.add((chrono_event, OWL.sameAs, sku_uri))
                # Add type to help SHACL engine validation (since rdfs inference may not propagate class via sameAs)
                alignments.add((chrono_event, RDF.type, ASOFT.AirsoftReplica))
                
    # Resolve Repair Invoices to Retail SKUs
    repair_invoices = list(g.subjects(RDF.type, ASOFT.RepairInvoice))
    for repair in repair_invoices:
        player_uri = g.value(repair, ASOFT.associatedPlayer)
        if player_uri:
            match = re.search(r"Player_P_(\d{4})", str(player_uri))
            if match:
                idx = match.group(1)
                sku_uri = URIRef(f"https://retailer.com/sku/SKU-{idx}")
                # Link the repair to the specific retail asset
                alignments.add((repair, ASOFT.repairedReplica, sku_uri))
                print(f"[Link Found] Linking Repair Invoice <{repair}> to Retail SKU <{sku_uri}>")
                
    alignments.serialize(destination="alignments.ttl", format="turtle")
    print(f"[+] Alignment mapping completed. Saved {len(alignments)} identity links to 'alignments.ttl'.")

if __name__ == "__main__":
    execute_entity_resolution()