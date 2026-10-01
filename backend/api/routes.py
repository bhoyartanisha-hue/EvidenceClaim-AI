import os
import re
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse

try:
    from ..config import UPLOADS_DIR, AI_PROVIDER, DEMO_DIR
    from ..schemas import (
        Claim, ClaimCreate, ClaimDocument, Analysis, Evidence
    )
    from ..db import get_db, get_next_claim_id, get_next_doc_id
    from ..services.files import sanitize_filename, validate_file_metadata, extract_text_from_file
    from ..services.demo import load_demo_claim
    from ..services.orchestrator import run_analysis, start_analysis_background, ANALYSIS_STATE, _ACTIVE_RUNS
    from ..ai.provider import get_provider
except (ImportError, ValueError):
    from config import UPLOADS_DIR, AI_PROVIDER, DEMO_DIR
    from schemas import (
        Claim, ClaimCreate, ClaimDocument, Analysis, Evidence
    )
    from db import get_db, get_next_claim_id, get_next_doc_id
    from services.files import sanitize_filename, validate_file_metadata, extract_text_from_file
    from services.demo import load_demo_claim
    from services.orchestrator import run_analysis, start_analysis_background, ANALYSIS_STATE, _ACTIVE_RUNS
    from ai.provider import get_provider

logger = logging.getLogger("claimiq.routes")
router = APIRouter()

def normalize_date(date_str: str) -> str:
    """Accepts ISO YYYY-MM-DD or DD/MM/YYYY and returns ISO YYYY-MM-DD."""
    m_slash = re.search(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", date_str.strip())
    if m_slash:
        d, m, y = m_slash.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    m_iso = re.search(r"^\d{4}-\d{2}-\d{2}$", date_str.strip())
    if m_iso:
        return date_str.strip()
    # Try parsing generic date
    try:
        dt = datetime.fromisoformat(date_str.strip())
        return dt.strftime("%Y-%m-%d")
    except Exception:
        raise ValueError(f"Invalid date format '{date_str}'. Expected YYYY-MM-DD or DD/MM/YYYY.")

@router.get("/health")
def get_health():
    provider = get_provider()
    return {
        "status": "ok",
        "ai_provider": AI_PROVIDER,
        "ai_available": provider.available()
    }

@router.post("/claims", response_model=Claim, status_code=status.HTTP_201_CREATED)
def create_claim(claim_in: ClaimCreate):
    # Validation
    if claim_in.claim_type not in ["vehicle_accident", "property_damage", "other"]:
        raise HTTPException(
            status_code=422,
            detail="Invalid claim_type. Allowed: vehicle_accident, property_damage, other."
        )
    if claim_in.claim_amount <= 0:
        raise HTTPException(
            status_code=422,
            detail="claim_amount must be greater than 0."
        )
    try:
        norm_date = normalize_date(claim_in.incident_date)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))

    claim_id = get_next_claim_id()
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        conn.execute("""
            INSERT INTO claims (id, claim_type, description, claim_amount, incident_date, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'draft', ?)
        """, (
            claim_id,
            claim_in.claim_type,
            claim_in.description.strip(),
            int(claim_in.claim_amount),
            norm_date,
            now_iso
        ))

    return Claim(
        id=claim_id,
        claim_type=claim_in.claim_type,
        description=claim_in.description.strip(),
        claim_amount=int(claim_in.claim_amount),
        incident_date=norm_date,
        status="draft",
        complexity=None,
        complexity_score=None,
        recommendation=None,
        issues_count=None,
        created_at=now_iso,
        documents=[]
    )

@router.get("/claims", response_model=List[Claim])
def list_claims():
    claims_list: List[Claim] = []
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM claims ORDER BY created_at DESC")
        claim_rows = cursor.fetchall()

        for crow in claim_rows:
            cid = crow["id"]
            cursor.execute("SELECT id, filename, document_type FROM documents WHERE claim_id = ?", (cid,))
            doc_rows = cursor.fetchall()
            docs = [
                ClaimDocument(id=d["id"], filename=d["filename"], document_type=d["document_type"])
                for d in doc_rows
            ]

            claims_list.append(Claim(
                id=cid,
                claim_type=crow["claim_type"],
                description=crow["description"],
                claim_amount=crow["claim_amount"],
                incident_date=crow["incident_date"],
                status=crow["status"],
                complexity=crow["complexity"],
                complexity_score=crow["complexity_score"],
                recommendation=crow["recommendation"],
                issues_count=crow["issues_count"],
                created_at=crow["created_at"],
                documents=docs
            ))
    return claims_list

@router.get("/claims/{claim_id}", response_model=Claim)
def get_claim(claim_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM claims WHERE id = ?", (claim_id,))
        crow = cursor.fetchone()
        if not crow:
            raise HTTPException(status_code=404, detail="Claim not found")

        cursor.execute("SELECT id, filename, document_type FROM documents WHERE claim_id = ?", (claim_id,))
        doc_rows = cursor.fetchall()
        docs = [
            ClaimDocument(id=d["id"], filename=d["filename"], document_type=d["document_type"])
            for d in doc_rows
        ]

        return Claim(
            id=crow["id"],
            claim_type=crow["claim_type"],
            description=crow["description"],
            claim_amount=crow["claim_amount"],
            incident_date=crow["incident_date"],
            status=crow["status"],
            complexity=crow["complexity"],
            complexity_score=crow["complexity_score"],
            recommendation=crow["recommendation"],
            issues_count=crow["issues_count"],
            created_at=crow["created_at"],
            documents=docs
        )

@router.post("/claims/{claim_id}/documents", response_model=ClaimDocument)
async def upload_document(
    claim_id: str,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form(None)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM claims WHERE id = ?", (claim_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Claim not found")

    content = await file.read()
    valid, err_msg = validate_file_metadata(file.filename or "", len(content))
    if not valid:
        raise HTTPException(status_code=400, detail=err_msg)

    safe_name = sanitize_filename(file.filename or "upload.txt")
    doc_id = get_next_doc_id(claim_id)

    # Save under uploads/<claim_id>/<filename>
    claim_uploads_dir = UPLOADS_DIR / claim_id
    claim_uploads_dir.mkdir(parents=True, exist_ok=True)
    save_path = claim_uploads_dir / f"{doc_id}_{safe_name}"

    with open(save_path, "wb") as f:
        f.write(content)

    text, _ = extract_text_from_file(save_path)
    if text is None:
        text = ""

    # Classify document_type from filename if missing
    classified_type = document_type
    if not classified_type:
        lower_name = safe_name.lower()
        if "claim form" in lower_name or "claim_form" in lower_name:
            classified_type = "claim_form"
        elif "invoice" in lower_name or "repair" in lower_name:
            classified_type = "repair_invoice"
        elif "policy" in lower_name or "insurance" in lower_name:
            classified_type = "policy"
        elif "accident report" in lower_name or "fir" in lower_name:
            classified_type = "accident_report"
        else:
            classified_type = "other"

    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        conn.execute("""
            INSERT INTO documents (id, claim_id, filename, document_type, extracted_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (doc_id, claim_id, safe_name, classified_type, text, now_iso))

    return ClaimDocument(
        id=doc_id,
        filename=safe_name,
        document_type=classified_type # type: ignore
    )

@router.post("/claims/{claim_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
def analyze_claim_endpoint(claim_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM claims WHERE id = ?", (claim_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Claim not found")

        conn.execute("UPDATE claims SET status = 'analyzing' WHERE id = ?", (claim_id,))

    # Guard against double-starting the same claim
    if claim_id in _ACTIVE_RUNS:
        return {"claim_id": claim_id, "status": "analyzing"}

    start_analysis_background(claim_id)
    return {"claim_id": claim_id, "status": "analyzing"}

@router.get("/claims/{claim_id}/analysis", response_model=Analysis)
def get_analysis_endpoint(claim_id: str):
    # 1. Check live in-memory state
    if claim_id in ANALYSIS_STATE:
        return ANALYSIS_STATE[claim_id]

    # 2. Check DB
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT analysis_json FROM analyses WHERE claim_id = ?", (claim_id,))
        row = cursor.fetchone()
        if row:
            data = json.loads(row["analysis_json"])
            return Analysis(**data)

        # Check if claim exists
        cursor.execute("SELECT id, status FROM claims WHERE id = ?", (claim_id,))
        crow = cursor.fetchone()
        if not crow:
            raise HTTPException(status_code=404, detail="Claim not found")

        # Claim exists but was never analysed
        raise HTTPException(status_code=404, detail="Analysis not found")

@router.get("/claims/{claim_id}/evidence", response_model=List[Evidence])
def get_evidence_endpoint(claim_id: str):
    # 1. Check live state
    if claim_id in ANALYSIS_STATE:
        return ANALYSIS_STATE[claim_id].evidence

    # 2. Check DB
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT analysis_json FROM analyses WHERE claim_id = ?", (claim_id,))
        row = cursor.fetchone()
        if row:
            data = json.loads(row["analysis_json"])
            return [Evidence(**e) for e in data.get("evidence", [])]

        cursor.execute("SELECT id FROM claims WHERE id = ?", (claim_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Claim not found")

        raise HTTPException(status_code=404, detail="Evidence not found")

@router.post("/demo/load")
def load_demo():
    claim = load_demo_claim()
    return {"claim": claim}
