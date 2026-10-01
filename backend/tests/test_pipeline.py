import pytest
import os
import io
import time
from unittest.mock import patch

from backend.db import init_db
from backend.services.orchestrator import PipelineOrchestrator, run_analysis, ANALYSIS_STATE
from backend.services.evidence import EvidenceStore
from backend.services.files import sanitize_filename, validate_file_metadata
from backend.agents.anomaly_agent import AnomalyAgent
from backend.ai.provider import OllamaProvider

SAMPLE_POLICY = """MOTOR INSURANCE POLICY
Policy Number: POL-1024
Policyholder: Rahul Verma

1. Definitions
"Insured vehicle" means the vehicle described in the policy schedule.

2. Eligibility
This policy is issued to private vehicle owners residing in India.

3.1 Accidental Damage
Accidental vehicle damage is covered, including collision with another vehicle, subject to the exclusions in Section 3.2.

3.2 Exclusions
The policy does not cover normal wear and tear, intentional damage, damage while driving under the influence, or use of the vehicle in racing.

4.1 Claim Procedure
Claims must be reported within 7 days of the incident.

4.2 Required Documents
For vehicle accident claims, an accident report (police FIR or equivalent) must accompany the claim form and repair invoice.

5. Cancellation
The policy may be cancelled by either party with 15 days written notice.
"""

HOME_POLICY = """HOME CONTENTS INSURANCE POLICY
Policy Number: POL-9999
Policyholder: Rahul Verma

1. Definitions
"Home contents" means furniture, furnishings, and personal belongings inside the residential home.

2. Scope of Cover
This policy provides home contents insurance for fire and theft inside the private residence.

3. Exclusions
Vehicular damage, automobiles, and traffic accidents are strictly excluded from this home contents policy.
"""


@pytest.fixture(autouse=True)
def setup_database():
    init_db()

# ----------------------------------------------------------------------
# 1. Normal claim
# ----------------------------------------------------------------------
def test_normal_clean_claim():
    claim_form = """CLAIM FORM
Claim Number: CLM-1010
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Location of Accident: Nagpur, Maharashtra
Vehicle: Maruti Swift (MH31AB1234)
Claimed Amount: INR 85,000
Description: Rear-ended at a traffic signal; rear bumper and boot damaged.
"""
    repair_invoice = """REPAIR INVOICE
Invoice No: INV-5521
Workshop: Sai Auto Works, Nagpur
Customer: Rahul Verma
Policy Number: POL-1024
Vehicle: Maruti Swift (MH31AB1234)
Invoice Date: 12/09/2026
Repair Date: 12/09/2026
Total Repair Amount: INR 85,000
"""
    accident_report = """ACCIDENT REPORT
Police Station: Nagpur Central
Date of Incident: 12/09/2026
Vehicle Involved: Maruti Swift (MH31AB1234)
Details: Collision reported at traffic intersection.
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "repair_invoice.txt", "document_type": "repair_invoice", "text": repair_invoice},
        {"id": "doc-3", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
        {"id": "doc-4", "filename": "accident_report.txt", "document_type": "accident_report", "text": accident_report},
    ]
    claim_data = {
        "id": "CLM-NORM",
        "claim_type": "vehicle_accident",
        "description": "Rear-ended at a traffic signal; rear bumper and boot damaged.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    assert analysis.coverage.coverage_status == "applicable"
    assert len(analysis.anomalies) == 0
    assert len(analysis.missing_information.items) == 0
    assert analysis.missing_information.completeness == 100
    assert analysis.assessment.complexity == "low"
    assert analysis.assessment.recommended_route == "automated_processing"
    assert analysis.assessment.complexity_score == 20

# ----------------------------------------------------------------------
# 2. Date mismatch
# ----------------------------------------------------------------------
def test_date_mismatch_anomaly():
    claim_form = """CLAIM FORM
Claim Number: CLM-1020
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Collision damage.
"""
    # Repair date is BEFORE accident date
    repair_invoice = """REPAIR INVOICE
Invoice No: INV-5521
Customer: Rahul Verma
Policy Number: POL-1024
Repair Date: 08/09/2026
Total Repair Amount: INR 85,000
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "repair_invoice.txt", "document_type": "repair_invoice", "text": repair_invoice},
        {"id": "doc-3", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
    ]
    claim_data = {
        "id": "CLM-DATE",
        "claim_type": "vehicle_accident",
        "description": "Collision damage.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    anom_types = [a.type for a in analysis.anomalies]
    assert "date_mismatch" in anom_types
    assert analysis.assessment.recommended_route in ["human_review", "investigation_required"]

# ----------------------------------------------------------------------
# 3. Amount mismatch
# ----------------------------------------------------------------------
def test_amount_mismatch_anomaly():
    claim_form = """CLAIM FORM
Claim Number: CLM-1030
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Collision damage.
"""
    # Dates match, but amount differs: 92,000 vs 85,000
    repair_invoice = """REPAIR INVOICE
Invoice No: INV-5521
Customer: Rahul Verma
Policy Number: POL-1024
Invoice Date: 12/09/2026
Repair Date: 12/09/2026
Total Repair Amount: INR 92,000
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "repair_invoice.txt", "document_type": "repair_invoice", "text": repair_invoice},
        {"id": "doc-3", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
    ]
    claim_data = {
        "id": "CLM-AMT",
        "claim_type": "vehicle_accident",
        "description": "Collision damage.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    amt_anom = next((a for a in analysis.anomalies if a.type == "amount_mismatch"), None)
    assert amt_anom is not None
    assert "₹7,000" in amt_anom.description
    assert "8.2%" in amt_anom.description

# ----------------------------------------------------------------------
# 4. Missing document
# ----------------------------------------------------------------------
def test_missing_accident_report():
    claim_form = """CLAIM FORM
Claim Number: CLM-1040
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Collision damage.
"""
    repair_invoice = """REPAIR INVOICE
Invoice No: INV-5521
Customer: Rahul Verma
Policy Number: POL-1024
Invoice Date: 12/09/2026
Repair Date: 12/09/2026
Total Repair Amount: INR 85,000
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "repair_invoice.txt", "document_type": "repair_invoice", "text": repair_invoice},
        {"id": "doc-3", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
    ]
    claim_data = {
        "id": "CLM-MISS",
        "claim_type": "vehicle_accident",
        "description": "Collision damage.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    missing_names = [m.item for m in analysis.missing_information.items]
    assert "Accident Report" in missing_names
    assert analysis.missing_information.completeness == 75

# ----------------------------------------------------------------------
# 5. Unsupported policy evidence
# ----------------------------------------------------------------------
def test_unsupported_policy_evidence():
    claim_form = """CLAIM FORM
Claim Number: CLM-1050
Policy Number: POL-9999
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Collision with a truck on the highway.
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "insurance_policy.txt", "document_type": "policy", "text": HOME_POLICY},
    ]
    claim_data = {
        "id": "CLM-UNSUP",
        "claim_type": "vehicle_accident",
        "description": "Collision with a truck on the highway.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    assert analysis.policy_evidence.sufficient is False
    assert analysis.coverage.coverage_status == "insufficient_evidence"

# ----------------------------------------------------------------------
# 6. AI unavailable fallback
# ----------------------------------------------------------------------
def test_ai_unavailable_fallback():
    claim_form = """CLAIM FORM
Claim Number: CLM-1060
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Collision damage.
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
    ]
    claim_data = {
        "id": "CLM-AI-FAIL",
        "claim_type": "vehicle_accident",
        "description": "Collision damage.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    # Point Ollama provider to an unreachable address
    unreachable_provider = OllamaProvider(base_url="http://127.0.0.1:59999", model="llama3")

    with patch("backend.services.orchestrator.get_provider", return_value=unreachable_provider):
        orchestrator = PipelineOrchestrator(step_delay_ms=0)
        analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    assert analysis.status == "completed"
    assert analysis.mode == "demo_fallback"
    assert len(analysis.agents) == 7
    for ag in analysis.agents:
        assert ag.status in ["completed", "warning", "error"]

# ----------------------------------------------------------------------
# 8. Wording test
# ----------------------------------------------------------------------
def test_wording_safety_constraints():
    claim_form = """CLAIM FORM
Claim Number: CLM-1070
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Rear-ended at a traffic signal; rear bumper and boot damaged.
"""
    repair_invoice = """REPAIR INVOICE
Invoice No: INV-5521
Customer: Rahul Verma
Policy Number: POL-1024
Invoice Date: 08/09/2026
Repair Date: 08/09/2026
Total Repair Amount: INR 92,000
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "repair_invoice.txt", "document_type": "repair_invoice", "text": repair_invoice},
        {"id": "doc-3", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
    ]
    claim_data = {
        "id": "CLM-WORDING",
        "claim_type": "vehicle_accident",
        "description": "Rear-ended at a traffic signal; rear bumper and boot damaged.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    json_str = analysis.model_dump_json().lower()
    for forbidden in ["fraud confirmed", "fraudulent", "approved", "rejected"]:
        assert forbidden not in json_str, f"Forbidden word '{forbidden}' found in analysis JSON!"

# ----------------------------------------------------------------------
# 9. Evidence safety test
# ----------------------------------------------------------------------
def test_evidence_safety_validation():
    store = EvidenceStore()
    store.add(
        agent_name="DocumentAgent",
        source_document="claim_form.txt",
        page=1,
        field="claim_amount",
        value="85000",
        description="Claimed amount",
        confidence=0.95
    )

    finding_good = {
        "id": "A1",
        "type": "test_finding",
        "confidence": 0.95,
        "evidence_ids": ["E1"]
    }
    finding_bad = {
        "id": "A2",
        "type": "bad_finding",
        "confidence": 0.95,
        "evidence_ids": ["E999"]
    }

    store.validate([finding_good, finding_bad])

    assert finding_good.get("unsupported") is False
    assert finding_good.get("confidence") == 0.95

    assert finding_bad.get("unsupported") is True
    assert finding_bad.get("confidence") <= 0.3

# ----------------------------------------------------------------------
# 10. Upload validation & sanitization
# ----------------------------------------------------------------------
def test_upload_validation_and_sanitization():
    # .exe rejection
    valid_exe, err_exe = validate_file_metadata("malicious.exe", 1024)
    assert valid_exe is False
    assert "Unsupported file extension" in err_exe

    # > 10 MB rejection
    oversized = 11 * 1024 * 1024
    valid_size, err_size = validate_file_metadata("document.pdf", oversized)
    assert valid_size is False
    assert "exceeds 10 MB" in err_size

    # Valid PDF
    valid_pdf, _ = validate_file_metadata("claim.pdf", 2048)
    assert valid_pdf is True

    # Filename traversal sanitization
    sanitized = sanitize_filename("../../etc/passwd.txt")
    assert "/" not in sanitized
    assert "\\" not in sanitized
    assert ".." not in sanitized
    assert sanitized == "passwd.txt"

# ----------------------------------------------------------------------
# Hardening: Monkeypatch failure handling
# ----------------------------------------------------------------------
def test_pipeline_hardening_agent_exception():
    claim_form = """CLAIM FORM
Claim Number: CLM-1080
Policy Number: POL-1024
Claimant Name: Rahul Verma
Claim Type: Vehicle Accident
Date of Accident: 12/09/2026
Claimed Amount: INR 85,000
Description: Collision damage.
"""
    documents = [
        {"id": "doc-1", "filename": "claim_form.txt", "document_type": "claim_form", "text": claim_form},
        {"id": "doc-2", "filename": "insurance_policy.txt", "document_type": "policy", "text": SAMPLE_POLICY},
    ]
    claim_data = {
        "id": "CLM-CRASH",
        "claim_type": "vehicle_accident",
        "description": "Collision damage.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    # Simulate crash in AnomalyAgent
    def mock_detect(*args, **kwargs):
        raise RuntimeError("Simulated crash in AnomalyAgent")

    with patch.object(AnomalyAgent, "detect", side_effect=mock_detect):
        orchestrator = PipelineOrchestrator(step_delay_ms=0)
        # Should NOT raise an unhandled exception
        analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    assert analysis.status == "completed"
    anom_agent_res = next(a for a in analysis.agents if a.key == "anomaly")
    assert anom_agent_res.status == "error"
    assert "could not complete" in anom_agent_res.summary
    assert analysis.assessment.recommended_route in ["automated_processing", "human_review", "investigation_required"]
