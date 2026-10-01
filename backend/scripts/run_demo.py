import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add workspace directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir.parent))
sys.path.insert(0, str(backend_dir))

from backend.config import DEMO_DIR
from backend.services.files import extract_text_from_file
from backend.services.evidence import EvidenceStore
from backend.ai.provider import get_provider
from backend.schemas import Analysis, AgentResult
from backend.agents.document_agent import DocumentAgent
from backend.agents.policy_agent import PolicyRAGAgent
from backend.agents.coverage_agent import CoverageAgent
from backend.agents.missing_info_agent import MissingInformationAgent
from backend.agents.anomaly_agent import AnomalyAgent
from backend.agents.assessment_agent import AssessmentAgent
from backend.agents.human_review_agent import HumanReviewAgent
from backend.db import init_db

def main():
    init_db()

    # Read demo files
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

    evidence_store = EvidenceStore()
    ai_provider = get_provider()

    # 1. DocumentAgent: process(documents)
    doc_agent = DocumentAgent()
    doc_out = doc_agent.process(documents, evidence_store=evidence_store)
    extracted_docs = doc_out["extracted_documents"]

    # 2. PolicyRAGAgent: search(claim_data, policy_documents)
    policy_agent = PolicyRAGAgent()
    policy_docs = [d for d in documents if d.get("document_type") == "policy" or "policy" in d.get("filename", "").lower()]
    rag_out = policy_agent.search(claim_data, policy_docs, evidence_store=evidence_store)
    policy_evidence = rag_out["policy_evidence"]
    sec_map = rag_out.get("section_evidence_map", {})
    if "S3.1" in sec_map:
        for ed in extracted_docs:
            if ed.document_type == "policy":
                ed.evidence_ids = [sec_map["S3.1"]]

    # 3. CoverageAgent: evaluate(claim_data, policy_evidence)
    coverage_agent = CoverageAgent()
    cov_out = coverage_agent.evaluate(
        claim_data,
        policy_evidence,
        policy_section_map=sec_map,
        evidence_store=evidence_store,
        ai_provider=ai_provider
    )
    coverage_res = cov_out["coverage"]

    # 4. MissingInformationAgent: check(documents, claim_type, policy_evidence)
    missing_agent = MissingInformationAgent()
    missing_out = missing_agent.check(
        extracted_docs,
        claim_data["claim_type"],
        policy_evidence=policy_evidence,
        policy_section_map=sec_map,
        evidence_store=evidence_store
    )
    missing_res = missing_out["missing_information"]

    # 5. AnomalyAgent: detect(documents, claim)
    anomaly_agent = AnomalyAgent()
    anom_out = anomaly_agent.detect(
        extracted_docs,
        claim_data,
        evidence_store=evidence_store,
        ai_provider=ai_provider
    )
    anomalies_res = anom_out["anomalies"]

    # 6. AssessmentAgent: evaluate(coverage, missing, anomalies, documents)
    assessment_agent = AssessmentAgent()
    assess_out = assessment_agent.evaluate(
        coverage_res,
        missing_res,
        anomalies_res,
        extracted_docs,
        evidence_store=evidence_store
    )
    assessment_res = assess_out["assessment"]

    # 7. HumanReviewAgent: summarize(claim, coverage, missing, anomalies, assessment)
    human_agent = HumanReviewAgent()
    rev_out = human_agent.summarize(
        claim_data,
        coverage_res,
        missing_res,
        anomalies_res,
        assessment_res,
        ai_provider=ai_provider
    )
    human_review_res = rev_out["human_review"]

    # Assemble Analysis object matching contract shape
    agents_list = [
        AgentResult(**doc_out["agent"]),
        AgentResult(**rag_out["agent"]),
        AgentResult(**cov_out["agent"]),
        AgentResult(**missing_out["agent"]),
        AgentResult(**anom_out["agent"]),
        AgentResult(**assess_out["agent"]),
        AgentResult(**rev_out["agent"])
    ]

    analysis = Analysis(
        claim_id=claim_data["id"],
        status="completed",
        mode="ai" if ai_provider.available() else "demo_fallback",
        disclaimer="AI-generated decision-support assessment from a prototype. Not a legally binding approval or rejection.",
        agents=agents_list,
        extracted_documents=extracted_docs,
        policy_evidence=policy_evidence,
        coverage=coverage_res,
        missing_information=missing_res,
        anomalies=anomalies_res,
        assessment=assessment_res,
        human_review=human_review_res,
        evidence=evidence_store.all_items() # type: ignore
    )

    analysis_json = analysis.model_dump_json(indent=2)
    print("================== ASSEMBLED ANALYSIS JSON ==================")
    print(analysis_json)
    print("============================================================\n")

    # Contract Verification Checks
    checks = []

    # 1. Coverage applicable
    cov_status = analysis.coverage.coverage_status if analysis.coverage else None
    checks.append(("Coverage applicable", cov_status == "applicable", f"Got '{cov_status}', expected 'applicable'"))

    # 2. Completeness 75
    completeness = analysis.missing_information.completeness if analysis.missing_information else None
    checks.append(("Completeness 75", completeness == 75, f"Got '{completeness}', expected 75"))

    # 3. 2 Anomalies
    anom_count = len(analysis.anomalies) if analysis.anomalies else 0
    anom_types = [a.type for a in (analysis.anomalies or [])]
    expected_anoms = ["date_mismatch", "amount_mismatch"]
    anom_match = anom_count == 2 and set(anom_types) == set(expected_anoms)
    checks.append(("2 Anomalies (date_mismatch, amount_mismatch)", anom_match, f"Got {anom_types}, expected {expected_anoms}"))

    # 4. Score 62
    score = analysis.assessment.complexity_score if analysis.assessment else None
    checks.append(("Score 62", score == 62, f"Got '{score}', expected 62"))

    # 5. Route human_review
    route = analysis.assessment.recommended_route if analysis.assessment else None
    checks.append(("Route human_review", route == "human_review", f"Got '{route}', expected 'human_review'"))

    print("================ CONTRACT CHECK RESULTS ================")
    all_passed = True
    for name, passed, details in checks:
        status_str = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
            print(f"[{status_str}] {name} -> {details}")
        else:
            print(f"[{status_str}] {name}")

    print("========================================================")
    if all_passed:
        print("ALL DEMO VERIFICATION CHECKS PASSED SUCCESSFULLY!")
    else:
        print("SOME CHECKS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    main()
