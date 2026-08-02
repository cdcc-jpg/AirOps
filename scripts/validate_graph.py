import os
from pyshacl import validate
from rdflib import Graph

ONTOLOGIES_DIR = os.getenv('ONTOLOGIES_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'Ontologies')))

def run_validation_pipeline():
    print("[*] Merging datasets for validation checks...")
    data_graph = Graph()
    
    norm_path = "normalized_graph.ttl" if os.path.exists("normalized_graph.ttl") else os.path.join(ONTOLOGIES_DIR, "4-Application", "profiles", "normalized-graph.ttl")
    align_path = "alignments.ttl" if os.path.exists("alignments.ttl") else os.path.join(ONTOLOGIES_DIR, "4-Application", "alignments", "alignments-airsoft-bfo.ttl")
    
    if os.path.exists(norm_path):
        data_graph.parse(norm_path, format="turtle")
    if os.path.exists(align_path):
        data_graph.parse(align_path, format="turtle")
    
    shacl_graph = Graph()
    shacl_shapes = os.path.join(ONTOLOGIES_DIR, "Grouped-Vocabularies-and-Restrictions", "airsoft", "shapes", "airsoft-shacl-shapes.ttl")
    shacl_graph.parse(shacl_shapes, format="turtle")
    
    print("[*] Running SHACL engine evaluation...")
    conforms, results_graph, results_text = validate(
        data_graph,
        shacl_graph=shacl_graph,
        inference='rdfs',
        serialize_report_fn=None
    )
    
    if not conforms:
        print("\n[!] FIELD COMPLIANCE FAILURE ENCOUNTERED:")
        print(results_text)
    else:
        print("\n[+] Clean run. All items conform to field safety rules.")

if __name__ == "__main__":
    run_validation_pipeline()