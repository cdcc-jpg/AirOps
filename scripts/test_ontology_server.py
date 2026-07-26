import os
import sys
import rdflib

# Add main-app directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app'))

import server

def test_ontology_loading():
    print("Testing Ontology Schema Loading...")
    g = server.graph
    print(f"Total graph triples loaded: {len(g)}")
    
    # Verify BFO classes exist in graph
    bfo_entities = list(g.subjects(rdflib.RDF.type, rdflib.OWL.Class))
    bfo_count = sum(1 for e in bfo_entities if "BFO_" in str(e) or "obolibrary" in str(e))
    airops_count = sum(1 for e in bfo_entities if "cdcc-jpg" in str(e))
    
    print(f"BFO Classes loaded: {bfo_count}")
    print(f"AirOps Classes loaded: {airops_count}")
    
    assert bfo_count > 0, "BFO classes were not loaded!"
    assert airops_count > 0, "AirOps classes were not loaded!"
    
    # Test API schema endpoint logic directly using Flask test client
    with server.app.test_client() as client:
        res = client.get('/api/ontology/schema')
        assert res.status_code == 200
        data = res.get_json()
        print(f"API /api/ontology/schema returns {len(data['airops']['classes'])} AirOps classes and {len(data['bfo']['classes'])} BFO classes.")
        
        # Test posting an alignment
        test_align = {
            'alignments': [{
                'subject': 'asoft:AirsoftPlayer',
                'predicate': 'rdfs:subClassOf',
                'object': 'bfo:0000040'
            }]
        }
        res_post = client.post('/api/ontology/alignments', json=test_align)
        assert res_post.status_code == 200
        print("API /api/ontology/alignments POST successful!")
        
    print("All ontology visualizer tests passed successfully!")

if __name__ == '__main__':
    test_ontology_loading()
