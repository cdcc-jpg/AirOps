# AirOps v2.11 — Automated Semantic RDF Server Tests
# Validates the Flask backend, rdflib querying, SHACL constraints, and matchmaking mutations

import urllib.request
import json
import sys

BASE_URL = "http://localhost:3000"

def test_endpoint(path, data=None, method="GET"):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    
    body = None
    if data:
        body = json.dumps(data).encode('utf-8')
        
    try:
        with urllib.request.urlopen(req, data=body, timeout=5) as response:
            res_data = response.read().decode('utf-8')
            return json.loads(res_data)
    except Exception as e:
        print(f"Error testing {path}: {e}")
        return None

def main():
    print("AirOps v2.11 Backend Integration Tests")
    print("=" * 50)

    # 1. Test SPARQL query endpoint
    print("  [1/4] Testing /api/query SPARQL execution...")
    q = {
        "query": """
        PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
        SELECT ?player ?callsign WHERE {
            ?player a asoft:AirsoftPlayer ;
                    asoft:callsign ?callsign .
        }
        LIMIT 3
        """
    }
    res_query = test_endpoint("/api/query", data=q, method="POST")
    if res_query and "results" in res_query:
        print(f"         → SUCCESS: Found {len(res_query['results'])} players.")
        for r in res_query['results']:
            print(f"           - {r.get('callsign')}")
    else:
        print("         → FAIL: Query returned invalid structure.")
        sys.exit(1)

    # 2. Test SHACL validation endpoint
    print("  [2/4] Testing /api/validate SHACL shapes check...")
    res_val = test_endpoint("/api/validate", method="GET")
    if res_val and "conforms" in res_val:
        violations = res_val.get("violations", [])
        print(f"         → SUCCESS: Conforms: {res_val.get('conforms')}. Found {len(violations)} shape violations.")
    else:
        print("         → FAIL: SHACL validation query failed.")
        sys.exit(1)

    # 3. Test Mutation updates
    print("  [3/4] Testing /api/mutate player status updates...")
    mutation = {
        "action": "update_status",
        "playerId": "P_1",
        "status": "ELIMINATED"
    }
    res_mut = test_endpoint("/api/mutate", data=mutation, method="POST")
    if res_mut and res_mut.get("success"):
        print("         → SUCCESS: Triples mutation completed.")
    else:
        print("         → FAIL: Mutation failed.")
        sys.exit(1)

    # 4. Verify status mutated in graph
    print("  [4/4] Verifying status mutation in rdflib store...")
    verify_q = {
        "query": """
        PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
        SELECT ?status WHERE {
            asoft:P_1 asoft:playerStatus ?status .
        }
        """
    }
    res_verify = test_endpoint("/api/query", data=verify_q, method="POST")
    if res_verify and res_verify.get("results"):
        status = res_verify["results"][0].get("status")
        print(f"         → SUCCESS: Player P_1 mutated status is: {status}")
        assert status == "ELIMINATED", "Player status was not successfully mutated!"
    else:
        print("         → FAIL: Verification query failed.")
        sys.exit(1)

    # 5. Test SPARQL Sandbox Academy static routing
    print("  [5/5] Testing /learning SPARQL Sandbox static routing...")
    try:
        req = urllib.request.Request(f"{BASE_URL}/learning", method="GET")
        with urllib.request.urlopen(req, timeout=5) as response:
            html = response.read().decode('utf-8')
            if "SPARQL Academy" in html:
                print("         → SUCCESS: Learning Sandbox HTML loaded correctly.")
            else:
                print("         → FAIL: Sandbox HTML has invalid content.")
                sys.exit(1)
    except Exception as e:
        print(f"         → FAIL: Could not fetch sandbox page: {e}")
        sys.exit(1)

    print("\n✅ All v2.11 backend integration tests passed successfully.")

if __name__ == "__main__":
    main()
