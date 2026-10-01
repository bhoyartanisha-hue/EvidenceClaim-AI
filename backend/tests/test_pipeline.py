import pytest
from backend.services.orchestrator import PipelineOrchestrator
from backend.services.files import extract_text_from_file
from backend.config import DEMO_DIR
from backend.db import init_db

def test_full_demo_pipeline():
    init_db()
    demo_files = [
        ("claim_form.txt", "claim_form"),
        ("repair_invoice.txt", "repair_invoice"),
        ("insurance_policy.txt", "policy")
    ]

    documents = []
    for idx, (fname, dtype) in enumerate(demo_files, start=1):
        fpath = DEMO_DIR / fname
        text, pages = extract_text_from_file(fpath)
        documents.append({
            "id": f"doc-{idx}",
            "filename": fname,
            "document_type": dtype,
            "text": text,
            "pages": pages
        })

    claim_data = {
        "id": "CLM-1001",
        "claim_type": "vehicle_accident",
        "description": "Rear-ended at a traffic signal; rear bumper and boot damaged.",
        "claim_amount": 85000,
        "incident_date": "2026-09-12"
    }

    orchestrator = PipelineOrchestrator(step_delay_ms=0)
    analysis = orchestrator.run_pipeline(claim_data, documents, async_poll=False)

    # 1. Coverage applicable
    assert analysis.coverage is not None
    assert analysis.coverage.coverage_status == "applicable"
    assert "E5" in analysis.coverage.evidence_ids

    # 2. Completeness 75
    assert analysis.missing_information is not None
    assert analysis.missing_information.completeness == 75
    assert len(analysis.missing_information.items) == 1
    assert analysis.missing_information.items[0].item == "Accident Report"

    # 3. 2 anomalies
    assert analysis.anomalies is not None
    assert len(analysis.anomalies) == 2
    anom_types = [a.type for a in analysis.anomalies]
    assert "date_mismatch" in anom_types
    assert "amount_mismatch" in anom_types

    # 4. Complexity & score 62
    assert analysis.assessment is not None
    assert analysis.assessment.complexity_score == 62
    assert analysis.assessment.complexity == "medium"
    assert analysis.assessment.recommended_route == "human_review"

    # 5. Evidence safety & presence
    assert len(analysis.evidence) >= 7
    evidence_ids = {e.id for e in analysis.evidence}
    for anom in analysis.anomalies:
        for eid in anom.evidence_ids:
            assert eid in evidence_ids

    # 6. Wording check: banned terms must never appear
    dumped_str = analysis.model_dump_json().lower()
    for banned in ["fraud confirmed", "fraudulent", "approved", "rejected"]:
        assert banned not in dumped_str
