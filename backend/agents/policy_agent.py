import time
from typing import List, Dict, Any, Optional

try:
    from ..schemas import PolicyEvidence, RelevantSection
    from ..rag.ingest import ingest_policy
    from ..rag.retriever import retrieve_sections
    from ..services.evidence import EvidenceStore
except (ImportError, ValueError):
    from schemas import PolicyEvidence, RelevantSection
    from rag.ingest import ingest_policy
    from rag.retriever import retrieve_sections
    from services.evidence import EvidenceStore


class PolicyRAGAgent:
    def search(
        self,
        claim_data: Dict[str, Any],
        policy_documents: List[Dict[str, Any]],
        evidence_store: Optional[EvidenceStore] = None
    ) -> Dict[str, Any]:
        if evidence_store is None:
            evidence_store = EvidenceStore()
        start_time = time.time()

        claim_type = claim_data.get("claim_type", "")
        description = claim_data.get("description", "")

        all_chunks: List[Dict[str, Any]] = []
        for doc in policy_documents:
            filename = doc.get("filename", "insurance_policy.txt")
            text = doc.get("text", "")
            pages = doc.get("pages", [])
            chunks = ingest_policy(filename, text, pages)
            all_chunks.extend(chunks)

        sufficient, sections = retrieve_sections(claim_type, description, all_chunks)

        relevant_sections: List[RelevantSection] = []
        section_evidence_map: Dict[str, str] = {}
        section_evidence_ids: List[str] = []

        for sec in sections:
            sec_id = sec.get("section_id", "")
            title = sec.get("section", "")
            body = sec.get("text", "")
            source_doc = sec.get("source_document")
            page = sec.get("page")
            relevance = sec.get("relevance", 0.8)

            rel_sec = RelevantSection(
                section_id=sec_id,
                section=title,
                text=body,
                source_document=source_doc,
                page=page,
                relevance=relevance
            )
            relevant_sections.append(rel_sec)

            # Description according to section purpose
            desc = "Policy clause retrieved as most relevant to the claim"
            if "required" in title.lower() or sec_id == "S4.2":
                desc = "Policy clause listing required documents"

            eid = evidence_store.add(
                agent_name="PolicyRAGAgent",
                source_document=source_doc,
                page=page,
                field=f"Section {title}",
                value=body,
                description=desc,
                confidence=relevance
            )
            section_evidence_map[sec_id] = eid
            section_evidence_ids.append(eid)

        elapsed_ms = int((time.time() - start_time) * 1000)

        if not sufficient or not relevant_sections:
            return {
                "agent": {
                    "key": "policy_rag",
                    "agent_name": "PolicyRAGAgent",
                    "status": "warning",
                    "summary": "Insufficient policy evidence.",
                    "confidence": 0.50,
                    "duration_ms": max(elapsed_ms, 50)
                },
                "policy_evidence": PolicyEvidence(sufficient=False, relevant_sections=relevant_sections),
                "section_evidence_map": section_evidence_map,
                "evidence_ids": section_evidence_ids
            }

        return {
            "agent": {
                "key": "policy_rag",
                "agent_name": "PolicyRAGAgent",
                "status": "completed",
                "summary": f"Retrieved {len(relevant_sections)} relevant policy sections",
                "confidence": round(relevant_sections[0].relevance, 2),
                "duration_ms": max(elapsed_ms, 50)
            },
            "policy_evidence": PolicyEvidence(sufficient=True, relevant_sections=relevant_sections),
            "section_evidence_map": section_evidence_map,
            "evidence_ids": section_evidence_ids
        }
