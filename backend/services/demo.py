from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Tuple
try:
    from ..config import DEMO_DIR
    from ..db import get_db, get_next_claim_id, get_next_doc_id
    from ..schemas import Claim, ClaimDocument
    from .files import extract_text_from_file
except (ImportError, ValueError):
    from config import DEMO_DIR
    from db import get_db, get_next_claim_id, get_next_doc_id
    from schemas import Claim, ClaimDocument
    from services.files import extract_text_from_file


DEMO_CLAIM_INFO = {
    "claim_type": "vehicle_accident",
    "description": "Rear-ended at a traffic signal; rear bumper and boot damaged.",
    "claim_amount": 85000,
    "incident_date": "2026-09-12"
}

def load_demo_claim() -> Claim:
    """
    Creates a new demo claim in the DB and attaches the 3 demo documents.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    claim_id = "CLM-1001"

    with get_db() as conn:
        # Check if CLM-1001 exists, if so generate next or reset
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM claims WHERE id = 'CLM-1001'")
        if cursor.fetchone():
            # If CLM-1001 already exists, delete old records for fresh demo run
            cursor.execute("DELETE FROM documents WHERE claim_id = 'CLM-1001'")
            cursor.execute("DELETE FROM analyses WHERE claim_id = 'CLM-1001'")
            cursor.execute("DELETE FROM evidence WHERE claim_id = 'CLM-1001'")
            cursor.execute("DELETE FROM agent_results WHERE claim_id = 'CLM-1001'")
            cursor.execute("DELETE FROM claims WHERE id = 'CLM-1001'")

        cursor.execute("""
            INSERT INTO claims (id, claim_type, description, claim_amount, incident_date, status, complexity, complexity_score, recommendation, issues_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            claim_id,
            DEMO_CLAIM_INFO["claim_type"],
            DEMO_CLAIM_INFO["description"],
            DEMO_CLAIM_INFO["claim_amount"],
            DEMO_CLAIM_INFO["incident_date"],
            "draft",
            None,
            None,
            None,
            None,
            now_iso
        ))

        demo_files = [
            ("claim_form.txt", "claim_form"),
            ("repair_invoice.txt", "repair_invoice"),
            ("insurance_policy.txt", "policy")
        ]

        claim_docs = []
        for idx, (filename, doc_type) in enumerate(demo_files, start=1):
            doc_id = f"doc-{idx}"
            file_path = DEMO_DIR / filename
            text, _ = extract_text_from_file(file_path)

            cursor.execute("""
                INSERT INTO documents (id, claim_id, filename, document_type, extracted_text, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (doc_id, claim_id, filename, doc_type, text or "", now_iso))

            claim_docs.append(ClaimDocument(
                id=doc_id,
                filename=filename,
                document_type=doc_type
            ))

    return Claim(
        id=claim_id,
        claim_type=DEMO_CLAIM_INFO["claim_type"], # type: ignore
        description=DEMO_CLAIM_INFO["description"],
        claim_amount=DEMO_CLAIM_INFO["claim_amount"],
        incident_date=DEMO_CLAIM_INFO["incident_date"],
        status="draft",
        complexity=None,
        complexity_score=None,
        recommendation=None,
        issues_count=None,
        created_at=now_iso,
        documents=claim_docs
    )
