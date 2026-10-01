import io
import time
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.db import init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_root_endpoint():
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "ClaimIQ API"
    assert data["docs"] == "/docs"

def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "ai_provider" in data
    assert "ai_available" in data

def test_demo_load_and_contract_polling():
    # 1. Load demo
    res_load = client.post("/api/demo/load")
    assert res_load.status_code == 200
    claim = res_load.json()["claim"]
    claim_id = claim["id"]
    assert claim_id == "CLM-1001"
    assert len(claim["documents"]) == 3

    # 2. Trigger analyze
    res_analyze = client.post(f"/api/claims/{claim_id}/analyze")
    assert res_analyze.status_code == 202

    # 3. Poll analysis
    final_analysis = None
    for _ in range(25):
        time.sleep(0.3)
        res_poll = client.get(f"/api/claims/{claim_id}/analysis")
        assert res_poll.status_code == 200
        data = res_poll.json()
        if data.get("status") in ["completed", "error"]:
            final_analysis = data
            break

    assert final_analysis is not None
    assert final_analysis["status"] == "completed"

    # Contract Assertions
    cov = final_analysis["coverage"]
    assert cov["coverage_status"] == "applicable"

    missing = final_analysis["missing_information"]
    assert missing["completeness"] == 75

    anomalies = final_analysis["anomalies"]
    assert len(anomalies) == 2
    anom_types = {a["type"] for a in anomalies}
    assert anom_types == {"date_mismatch", "amount_mismatch"}

    assessment = final_analysis["assessment"]
    assert assessment["complexity_score"] == 62
    assert assessment["recommended_route"] == "human_review"

    # Every evidence_id in findings must exist in top-level evidence list
    all_evidence = final_analysis["evidence"]
    assert len(all_evidence) >= 7
    evidence_id_set = {e["id"] for e in all_evidence}

    for eid in cov.get("evidence_ids", []):
        assert eid in evidence_id_set, f"Coverage evidence ID '{eid}' missing from evidence table"

    for item in missing.get("items", []):
        for eid in item.get("evidence_ids", []):
            assert eid in evidence_id_set, f"Missing item evidence ID '{eid}' missing from evidence table"

    for a in anomalies:
        for eid in a.get("evidence_ids", []):
            assert eid in evidence_id_set, f"Anomaly evidence ID '{eid}' missing from evidence table"

    # Wording check
    json_text = res_poll.text.lower()
    for banned in ["fraud confirmed", "fraudulent", "approved", "rejected"]:
        assert banned not in json_text

def test_cors_headers_localhost():
    # Localhost
    headers_local = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"
    }
    res_local = client.options("/api/health", headers=headers_local)
    assert res_local.status_code == 200
    assert res_local.headers.get("access-control-allow-origin") == "http://localhost:5173"

    # 127.0.0.1
    headers_127 = {
        "Origin": "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "GET"
    }
    res_127 = client.options("/api/health", headers=headers_127)
    assert res_127.status_code == 200
    assert res_127.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"

def test_upload_api_validation():
    # Setup test claim
    res_claim = client.post("/api/claims", json={
        "claim_type": "vehicle_accident",
        "description": "Minor dent",
        "claim_amount": 10000,
        "incident_date": "2026-09-15"
    })
    assert res_claim.status_code == 201
    claim_id = res_claim.json()["id"]

    # Reject .exe
    exe_file = io.BytesIO(b"MZ\x90\x00")
    res_exe = client.post(
        f"/api/claims/{claim_id}/documents",
        files={"file": ("virus.exe", exe_file, "application/octet-stream")}
    )
    assert res_exe.status_code == 400
    assert "Unsupported file extension" in res_exe.json()["detail"]

    # Accept valid .txt
    txt_file = io.BytesIO(b"Incident report details")
    res_txt = client.post(
        f"/api/claims/{claim_id}/documents",
        files={"file": ("report.txt", txt_file, "text/plain")}
    )
    assert res_txt.status_code == 200
    assert res_txt.json()["filename"] == "report.txt"

def test_stats_and_delete_endpoints():
    # 1. Test GET /api/stats returns all keys
    res_stats = client.get("/api/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert "total" in stats
    assert "needs_review" in stats
    assert "investigation_required" in stats
    assert "automated" in stats
    assert "analyzing" in stats
    assert "avg_complexity_score" in stats

    # 2. Create a test claim
    res_create = client.post("/api/claims", json={
        "claim_type": "property_damage",
        "description": "Roof leakage test",
        "claim_amount": 25000,
        "incident_date": "2026-09-10"
    })
    assert res_create.status_code == 201
    claim_id = res_create.json()["id"]

    # 3. Test DELETE /api/claims/{id} (204)
    res_del = client.delete(f"/api/claims/{claim_id}")
    assert res_del.status_code == 204

    # 4. Confirm it is gone (404)
    res_get = client.get(f"/api/claims/{claim_id}")
    assert res_get.status_code == 404

    # 5. Delete non-existent claim returns 404
    res_del_unknown = client.delete(f"/api/claims/CLM-999999")
    assert res_del_unknown.status_code == 404

    # 6. Test 409 conflict when claim is analyzing
    res_create2 = client.post("/api/claims", json={
        "claim_type": "vehicle_accident",
        "description": "Bumper damage test",
        "claim_amount": 15000,
        "incident_date": "2026-09-11"
    })
    assert res_create2.status_code == 201
    cid2 = res_create2.json()["id"]
    from backend.db import get_db
    with get_db() as conn:
        conn.execute("UPDATE claims SET status = 'analyzing' WHERE id = ?", (cid2,))

    res_conflict = client.delete(f"/api/claims/{cid2}")
    assert res_conflict.status_code == 409

    # Clean up status
    with get_db() as conn:
        conn.execute("UPDATE claims SET status = 'draft' WHERE id = ?", (cid2,))

    # 7. Test DELETE /api/claims (bulk delete)
    res_del_all = client.delete("/api/claims")
    assert res_del_all.status_code == 200
    assert "deleted" in res_del_all.json()
    assert res_del_all.json()["deleted"] >= 1
