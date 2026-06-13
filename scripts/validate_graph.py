from pyshacl import validate
from rdflib import Graph

def run_validation_pipeline():
    print("[*] Merging datasets for validation checks...")
    data_graph = Graph()
    data_graph.parse("normalized_graph.ttl", format="turtle")
    data_graph.parse("alignments.ttl", format="turtle")
    
    shacl_graph = Graph()
    shacl_graph.parse("schemas/airsoft-ao-shacl.ttl", format="turtle")
    
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