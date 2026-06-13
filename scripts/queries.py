from rdflib import Graph

def execute_analytics_suite():
    g = Graph()
    g.parse("normalized_graph.ttl", format="turtle")
    g.parse("alignments.ttl", format="turtle")
    
    print("\n" + "="*60)
    print("CQ1: JOULE-CREEP & FIELD SAFETY VIOLATION AUDIT")
    print("="*60)
    
    cq1 = """
    PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
    PREFIX owl: <http://www.w3.org/2002/07/owl#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    
    SELECT ?player ?skuName ?joules ?status
    WHERE {
        ?chrono asoft:isOwnedBy ?player ;
                asoft:hasPowerLimit ?joules ;
                asoft:hasChronoStatus ?status .
        FILTER(?status IN ("JOULE_CREEP_DETECTED", "FAILED_MIN_PERFORMANCE"))
        ?chrono owl:sameAs ?retailReplica .
        ?retailReplica rdfs:label ?skuName .
    }
    """
    
    for row in g.query(cq1):
        player_id = row.player.split('_P_')[-1] if '_P_' in str(row.player) else row.player
        print(f"Player: P_{player_id} | Weapon: {row.skuName} | Energy: {row.joules}J | Verdict: {row.status}")

    print("\n" + "="*60)
    print("CQ2: SLANG-TO-TECH CONTEXT RECONSTRUCTION MATRIX")
    print("="*60)
    
    cq2 = """
    PREFIX asoft: <https://github.com/cdcc-jpg/ontologies#>
    
    SELECT ?player ?mentionTopic ?failedPart ?upgradePart
    WHERE {
        ?mention asoft:mentionSource ?player ;
                 asoft:classifiedTopic ?mentionTopic .
        ?repair asoft:associatedPlayer ?player ;
                asoft:detectedFailure ?failedPart ;
                asoft:installedUpgrade ?upgradePart .
    }
    """
    
    for row in g.query(cq2):
        topic = row.mentionTopic.split('#')[-1]
        player_id = row.player.split('_P_')[-1] if '_P_' in str(row.player) else row.player
        print(f"Player Profile: P_{player_id}")
        print(f" -> Discussed Slang Topic: {topic}")
        print(f" -> Verified Field Failure: '{row.failedPart}' -> Upgraded with: '{row.upgradePart}'")

if __name__ == "__main__":
    execute_analytics_suite()