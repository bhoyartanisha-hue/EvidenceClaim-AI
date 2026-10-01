import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "ai_provider" in data
    assert "ai_available" in data

def test_api_demo_flow():
    # 1. Load demo
    res_load = client.post("/api/demo/load")
    assert res_load.status_code == 200
    claim = res_load.json()["claim"]
    assert claim["id"] == "CLM-1001"
    assert len(claim["documents"]) == 3

    # 2. Get claim
    res_get = client.get("/api/claims/CLM-1001")
    assert res_get.status_code == 200

    # 3. Analyze claim (synchronous execution for test)
    res_analyze = client.post("/api/claims/CLM-1001/analyze")
    assert res_analyze.status_code == 202

    # 4. Check analysis
    res_analysis = client.get("/api/claims/CLM-1001/analysis")
    assert res_analysis.status_code == 200
    data = res_analysis.json()
    assert data["claim_id"] == "CLM-1001"
    assert "agents" in data

def test_cors_headers():
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"
    }
    res = client.options("/api/health", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
