import time
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

try:
    from ..config import DEMO_STEP_DELAY_MS, AI_PROVIDER
    from ..schemas import Analysis, AgentResult, ClaimDocument, Evidence
    from ..ai.provider import get_provider
    from ..services.evidence import EvidenceStore
    from ..agents.document_agent import DocumentAgent
    from ..agents.policy_agent import PolicyRAGAgent
    from ..agents.coverage_agent import CoverageAgent
    from ..agents.missing_info_agent import MissingInformationAgent
    from ..agents.anomaly_agent import AnomalyAgent
    from ..agents.assessment_agent import AssessmentAgent
    from ..agents.human_review_agent import HumanReviewAgent
    from ..db import get_db
except (ImportError, ValueError):
    from config import DEMO_STEP_DELAY_MS, AI_PROVIDER
    from schemas import Analysis, AgentResult, ClaimDocument, Evidence
    from ai.provider import get_provider
    from services.evidence import EvidenceStore

    from agents.document_agent import DocumentAgent
    from agents.policy_agent import PolicyRAGAgent
    from agents.coverage_agent import CoverageAgent
    from agents.missing_info_agent import MissingInformationAgent
    from agents.anomaly_agent import AnomalyAgent
    from agents.assessment_agent import AssessmentAgent
    from agents.human_review_agent import HumanReviewAgent
    from db import get_db

logger = logging.getLogger("claimiq.orchestrator")

# In-memory live state for polling
ANALYSIS_STATE: Dict[str, Analysis] = {}
_ACTIVE_RUNS: set = set()
_STATE_LOCK = threading.Lock()

INITIAL_AGENT_SPECS = [
    ("document", "DocumentAgent"),
    ("policy_rag", "PolicyRAGAgent"),
    ("coverage", "CoverageAgent"),
    ("missing_info", "MissingInformationAgent"),
    ("anomaly", "AnomalyAgent"),
    ("assessment", "AssessmentAgent"),
    ("human_review", "HumanReviewAgent"),
]

def get_initial_agents() -> List[AgentResult]:
    return [
        AgentResult(
            key=key,
            agent_name=name,
            status="pending",
            summary="",
            confidence=0.0,
            duration_ms=0
        )
        for key, name in INITIAL_AGENT_SPECS
    ]

def run_analysis(claim_id: str, step_delay_ms: Optional[int] = None) -> Analysis:
    """
    Executes the 7 narrow agents in strict sequence:
    Document -> Policy/RAG -> Coverage -> Missing Information -> Anomaly -> Assessment -> Human Review.
    Maintains ANALYSIS_STATE[claim_id] so the polling endpoint can stream live status.
    """
    with _STATE_LOCK:
        if claim_id in _ACTIVE_RUNS:
            logger.info(f"Analysis for claim {claim_id} is already in progress.")
            return ANALYSIS_STATE[claim_id]
        _ACTIVE_RUNS.add(claim_id)

    delay_sec = (step_delay_ms if step_delay_ms is not None else DEMO_STEP_DELAY_MS) / 1000.0
    evidence_store = EvidenceStore()
    ai_provider = get_provider()
    ai_call_succeeded = False

    # Initialize live state
    agents_list = get_initial_agents()
    analysis = Analysis(
        claim_id=claim_id,
        status="running",
        mode="demo_fallback",
        disclaimer="AI-generated decision-support assessment from a prototype. Not a legally binding approval or rejection.",
        agents=agents_list,
        extracted_documents=None,
        policy_evidence=None,
        coverage=None,
        missing_information=None,
        anomalies=None,
        assessment=None,
        human_review=None,
        evidence=[]
    )
    ANALYSIS_STATE[claim_id] = analysis

    try:
        # Fetch claim and attached documents from DB
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM claims WHERE id = ?", (claim_id,))
            crow = cursor.fetchone()
            if not crow:
                analysis.status = "error"
                return analysis
            claim_data = dict(crow)

            cursor.execute("SELECT * FROM documents WHERE claim_id = ?", (claim_id,))
            doc_rows = cursor.fetchall()
            documents = []
            for d in doc_rows:
                d_dict = dict(d)
                documents.append({
                    "id": d_dict["id"],
                    "filename": d_dict["filename"],
                    "document_type": d_dict.get("document_type"),
                    "text": d_dict.get("extracted_text", "")
                })


        # -------------------------------------------------------------
        # Stage 1: Document Agent
        # -------------------------------------------------------------
        agents_list[0].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        try:
            doc_agent = DocumentAgent()
            doc_out = doc_agent.process(documents, evidence_store=evidence_store)
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[0].status = doc_out["agent"]["status"]
            agents_list[0].summary = doc_out["agent"]["summary"]
            agents_list[0].confidence = doc_out["agent"]["confidence"]
            agents_list[0].duration_ms = elapsed_ms
            analysis.extracted_documents = doc_out["extracted_documents"]
        except Exception as e:
            logger.error(f"Stage 1 DocumentAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[0].status = "error"
            agents_list[0].summary = "DocumentAgent could not complete. Assessment continues with available information."
            agents_list[0].confidence = 0.3
            agents_list[0].duration_ms = elapsed_ms
            analysis.extracted_documents = []

        # -------------------------------------------------------------
        # Stage 2: Policy RAG Agent
        # -------------------------------------------------------------
        agents_list[1].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        sec_map = {}
        try:
            policy_agent = PolicyRAGAgent()
            policy_docs = [
                d for d in documents
                if d.get("document_type") == "policy" or "policy" in d.get("filename", "").lower()
            ]
            if not policy_docs:
                elapsed_ms = int((time.time() - start_t) * 1000)
                agents_list[1].status = "warning"
                agents_list[1].summary = "Policy could not be parsed. Upload a readable document."
                agents_list[1].confidence = 0.3
                agents_list[1].duration_ms = elapsed_ms
            else:
                rag_out = policy_agent.search(claim_data, policy_docs, evidence_store=evidence_store)
                elapsed_ms = int((time.time() - start_t) * 1000)
                agents_list[1].status = rag_out["agent"]["status"]
                agents_list[1].summary = rag_out["agent"]["summary"]
                agents_list[1].confidence = rag_out["agent"]["confidence"]
                agents_list[1].duration_ms = elapsed_ms
                analysis.policy_evidence = rag_out["policy_evidence"]
                sec_map = rag_out.get("section_evidence_map", {})

                if analysis.extracted_documents and "S3.1" in sec_map:
                    for edoc in analysis.extracted_documents:
                        if edoc.document_type == "policy":
                            edoc.evidence_ids = [sec_map["S3.1"]]
        except Exception as e:
            logger.error(f"Stage 2 PolicyRAGAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[1].status = "error"
            agents_list[1].summary = "PolicyRAGAgent could not complete. Assessment continues with available information."
            agents_list[1].confidence = 0.3
            agents_list[1].duration_ms = elapsed_ms

        # -------------------------------------------------------------
        # Stage 3: Coverage Agent
        # -------------------------------------------------------------
        agents_list[2].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        try:
            cov_agent = CoverageAgent()
            cov_out = cov_agent.evaluate(
                claim_data,
                analysis.policy_evidence,
                policy_section_map=sec_map,
                evidence_store=evidence_store,
                ai_provider=ai_provider
            )
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[2].status = cov_out["agent"]["status"]
            agents_list[2].summary = cov_out["agent"]["summary"]
            agents_list[2].confidence = cov_out["agent"]["confidence"]
            agents_list[2].duration_ms = elapsed_ms
            analysis.coverage = cov_out["coverage"]
        except Exception as e:
            logger.error(f"Stage 3 CoverageAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[2].status = "error"
            agents_list[2].summary = "CoverageAgent could not complete. Assessment continues with available information."
            agents_list[2].confidence = 0.3
            agents_list[2].duration_ms = elapsed_ms

        # -------------------------------------------------------------
        # Stage 4: Missing Information Agent
        # -------------------------------------------------------------
        agents_list[3].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        try:
            missing_agent = MissingInformationAgent()
            missing_out = missing_agent.check(
                analysis.extracted_documents or [],
                claim_data.get("claim_type", "vehicle_accident"),
                policy_evidence=analysis.policy_evidence,
                policy_section_map=sec_map,
                evidence_store=evidence_store
            )
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[3].status = missing_out["agent"]["status"]
            agents_list[3].summary = missing_out["agent"]["summary"]
            agents_list[3].confidence = missing_out["agent"]["confidence"]
            agents_list[3].duration_ms = elapsed_ms
            analysis.missing_information = missing_out["missing_information"]
        except Exception as e:
            logger.error(f"Stage 4 MissingInformationAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[3].status = "error"
            agents_list[3].summary = "MissingInformationAgent could not complete. Assessment continues with available information."
            agents_list[3].confidence = 0.3
            agents_list[3].duration_ms = elapsed_ms

        # -------------------------------------------------------------
        # Stage 5: Anomaly Agent
        # -------------------------------------------------------------
        agents_list[4].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        try:
            anom_agent = AnomalyAgent()
            anom_out = anom_agent.detect(
                analysis.extracted_documents or [],
                claim_data,
                evidence_store=evidence_store,
                ai_provider=ai_provider
            )
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[4].status = anom_out["agent"]["status"]
            agents_list[4].summary = anom_out["agent"]["summary"]
            agents_list[4].confidence = anom_out["agent"]["confidence"]
            agents_list[4].duration_ms = elapsed_ms
            analysis.anomalies = anom_out["anomalies"]
        except Exception as e:
            logger.error(f"Stage 5 AnomalyAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[4].status = "error"
            agents_list[4].summary = "AnomalyAgent could not complete. Assessment continues with available information."
            agents_list[4].confidence = 0.3
            agents_list[4].duration_ms = elapsed_ms
            analysis.anomalies = []

        # -------------------------------------------------------------
        # Stage 6: Assessment Agent
        # -------------------------------------------------------------
        agents_list[5].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        try:
            assess_agent = AssessmentAgent()
            assess_out = assess_agent.evaluate(
                analysis.coverage,
                analysis.missing_information,
                analysis.anomalies or [],
                analysis.extracted_documents or [],
                evidence_store=evidence_store
            )
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[5].status = assess_out["agent"]["status"]
            agents_list[5].summary = assess_out["agent"]["summary"]
            agents_list[5].confidence = assess_out["agent"]["confidence"]
            agents_list[5].duration_ms = elapsed_ms
            analysis.assessment = assess_out["assessment"]
        except Exception as e:
            logger.error(f"Stage 6 AssessmentAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[5].status = "error"
            agents_list[5].summary = "AssessmentAgent could not complete. Assessment continues with available information."
            agents_list[5].confidence = 0.3
            agents_list[5].duration_ms = elapsed_ms

        # -------------------------------------------------------------
        # Stage 7: Human Review Agent
        # -------------------------------------------------------------
        agents_list[6].status = "running"
        if delay_sec > 0:
            time.sleep(delay_sec)

        start_t = time.time()
        try:
            rev_agent = HumanReviewAgent()
            rev_out = rev_agent.summarize(
                claim_data,
                analysis.coverage,
                analysis.missing_information,
                analysis.anomalies or [],
                analysis.assessment,
                ai_provider=ai_provider
            )
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[6].status = rev_out["agent"]["status"]
            agents_list[6].summary = rev_out["agent"]["summary"]
            agents_list[6].confidence = rev_out["agent"]["confidence"]
            agents_list[6].duration_ms = elapsed_ms
            analysis.human_review = rev_out["human_review"]
        except Exception as e:
            logger.error(f"Stage 7 HumanReviewAgent exception type: {type(e).__name__}")
            elapsed_ms = int((time.time() - start_t) * 1000)
            agents_list[6].status = "error"
            agents_list[6].summary = "HumanReviewAgent could not complete. Assessment continues with available information."
            agents_list[6].confidence = 0.3
            agents_list[6].duration_ms = elapsed_ms

        # -------------------------------------------------------------
        # Finalization: Evidence validation & Database persistence
        # -------------------------------------------------------------
        findings_to_validate = []
        if analysis.coverage:
            findings_to_validate.append(analysis.coverage.model_dump())
        if analysis.missing_information:
            for item in analysis.missing_information.items:
                findings_to_validate.append(item.model_dump())
        if analysis.anomalies:
            for anom in analysis.anomalies:
                findings_to_validate.append(anom.model_dump())
        if analysis.assessment:
            findings_to_validate.append(analysis.assessment.model_dump())

        evidence_store.validate(findings_to_validate)

        # Set final evidence list and status
        analysis.evidence = [Evidence(**e) for e in evidence_store.all_items()]
        analysis.status = "completed"

        analysis.mode = "ai" if (ai_provider.available() and ai_call_succeeded) else "demo_fallback"

        now_iso = datetime.now(timezone.utc).isoformat()
        missing_count = len(analysis.missing_information.items) if analysis.missing_information else 0
        anom_count = len(analysis.anomalies) if analysis.anomalies else 0
        issues_count = missing_count + anom_count

        complexity = analysis.assessment.complexity if analysis.assessment else "medium"
        complexity_score = analysis.assessment.complexity_score if analysis.assessment else 62
        recommendation = analysis.assessment.recommended_route if analysis.assessment else "human_review"

        with get_db() as conn:
            # Update claim row
            conn.execute("""
                UPDATE claims SET
                    status = 'analyzed',
                    complexity = ?,
                    complexity_score = ?,
                    recommendation = ?,
                    issues_count = ?
                WHERE id = ?
            """, (complexity, complexity_score, recommendation, issues_count, claim_id))

            # Store final Analysis
            conn.execute("""
                INSERT OR REPLACE INTO analyses (claim_id, analysis_json, updated_at)
                VALUES (?, ?, ?)
            """, (claim_id, analysis.model_dump_json(), now_iso))

            # Store per-agent results
            for ag in agents_list:
                conn.execute("""
                    INSERT INTO agent_results (claim_id, agent_name, status, result_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (claim_id, ag.agent_name, ag.status, ag.model_dump_json(), now_iso))

    finally:
        with _STATE_LOCK:
            _ACTIVE_RUNS.discard(claim_id)

    return analysis

def start_analysis_background(claim_id: str, step_delay_ms: Optional[int] = None):
    """Starts run_analysis in a daemon background thread."""
    t = threading.Thread(target=run_analysis, args=(claim_id, step_delay_ms), daemon=True)
    t.start()
    return t

class PipelineOrchestrator:
    def __init__(self, step_delay_ms: Optional[int] = None):
        self.step_delay_ms = step_delay_ms

    def run_pipeline(
        self,
        claim: Dict[str, Any],
        documents: List[Dict[str, Any]],
        async_poll: bool = False
    ) -> Analysis:
        cid = claim.get("id", "CLM-1001")
        now_iso = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM claims WHERE id = ?", (cid,))
            if not cursor.fetchone():
                conn.execute("""
                    INSERT INTO claims (id, claim_type, description, claim_amount, incident_date, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'draft', ?)
                """, (
                    cid,
                    claim.get("claim_type", "vehicle_accident"),
                    claim.get("description", ""),
                    int(claim.get("claim_amount", 0)),
                    claim.get("incident_date", "2026-09-12"),
                    now_iso
                ))
            for doc in documents:
                doc_id = doc.get("id", "doc-1")
                cursor.execute("SELECT id FROM documents WHERE id = ? AND claim_id = ?", (doc_id, cid))
                if not cursor.fetchone():
                    conn.execute("""
                        INSERT INTO documents (id, claim_id, filename, document_type, extracted_text, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        doc_id,
                        cid,
                        doc.get("filename", "unknown.txt"),
                        doc.get("document_type"),
                        doc.get("text", ""),
                        now_iso
                    ))
        return run_analysis(cid, step_delay_ms=self.step_delay_ms)


