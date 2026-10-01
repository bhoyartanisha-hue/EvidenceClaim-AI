import time
import json
import sys
import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"

def main():
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    # 1. POST /api/demo/load -> id
    print("1. Loading demo claim via POST /api/demo/load...")
    res_load = client.post("/api/demo/load")
    assert res_load.status_code == 200, f"Failed demo load: {res_load.text}"
    claim = res_load.json()["claim"]
    claim_id = claim["id"]
    print(f"   Created demo claim: {claim_id} with {len(claim['documents'])} documents.\n")

    # 2. POST /api/claims/{id}/analyze -> 202
    print(f"2. Triggering analysis via POST /api/claims/{claim_id}/analyze...")
    res_analyze = client.post(f"/api/claims/{claim_id}/analyze")
    assert res_analyze.status_code == 202, f"Failed analyze trigger: {res_analyze.text}"
    print(f"   Received status: {res_analyze.status_code} {res_analyze.json()}\n")

    # 3. Poll GET /api/claims/{id}/analysis every 0.5s
    print("3. Polling GET /api/claims/{id}/analysis every 0.5s:")
    poll_count = 0
    final_data = None

    while poll_count < 30:
        time.sleep(0.5)
        poll_count += 1
        res_poll = client.get(f"/api/claims/{claim_id}/analysis")
        if res_poll.status_code != 200:
            print(f"   [Poll #{poll_count}] Waiting for analysis to initialize ({res_poll.status_code})...")
            continue

        data = res_poll.json()
        analysis_status = data.get("status")
        agents = data.get("agents", [])
        agent_statuses = " | ".join([f"{a['key']}: {a['status']}" for a in agents])
        print(f"   [Poll #{poll_count} - {analysis_status}] {agent_statuses}")

        if analysis_status in ["completed", "error"]:
            final_data = data
            break

    print("\n================ FINAL ANALYSIS VERIFICATION ================")
    assert final_data is not None, "Analysis timed out without reaching completed state!"

    # Print summary results
    cov = final_data.get("coverage", {})
    missing = final_data.get("missing_information", {})
    anomalies = final_data.get("anomalies", [])
    assessment = final_data.get("assessment", {})
    evidence = final_data.get("evidence", [])

    print(f"Claim ID:            {final_data.get('claim_id')}")
    print(f"Status:              {final_data.get('status')}")
    print(f"Mode:                {final_data.get('mode')}")
    print(f"Coverage Status:     {cov.get('coverage_status')}")
    print(f"Completeness:        {missing.get('completeness')}%")
    print(f"Anomalies Count:     {len(anomalies)} ({[a.get('type') for a in anomalies]})")
    print(f"Complexity:          {assessment.get('complexity')}")
    print(f"Complexity Score:    {assessment.get('complexity_score')}")
    print(f"Recommended Route:   {assessment.get('recommended_route')}")
    print(f"Resolved Evidence:   {len(evidence)} items")

    print("\n--- Evidence Items ---")
    for ev in evidence:
        print(f"  [{ev['id']}] {ev['agent_name']} | {ev.get('source_document') or 'None'} | {ev['field']} -> {ev['value']}")

    print("\nContract Check Results:")
    c1 = cov.get("coverage_status") == "applicable"
    c2 = missing.get("completeness") == 75
    c3 = len(anomalies) == 2 and {a["type"] for a in anomalies} == {"date_mismatch", "amount_mismatch"}
    c4 = assessment.get("complexity_score") == 62
    c5 = assessment.get("recommended_route") == "human_review"
    c6 = len(evidence) >= 7

    print(f"  [{'PASS' if c1 else 'FAIL'}] Coverage is 'applicable'")
    print(f"  [{'PASS' if c2 else 'FAIL'}] Missing information completeness is 75%")
    print(f"  [{'PASS' if c3 else 'FAIL'}] Exactly 2 anomalies (date_mismatch & amount_mismatch)")
    print(f"  [{'PASS' if c4 else 'FAIL'}] Assessment complexity score is 62")
    print(f"  [{'PASS' if c5 else 'FAIL'}] Recommended route is 'human_review'")
    print(f"  [{'PASS' if c6 else 'FAIL'}] Resolved evidence count >= 7")

    if all([c1, c2, c3, c4, c5, c6]):
        print("\nALL CONTRACT VERIFICATIONS PASSED!")
    else:
        print("\nSOME CHECKS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    main()
