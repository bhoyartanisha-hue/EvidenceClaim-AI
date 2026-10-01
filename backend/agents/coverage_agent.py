import time
import json
from typing import Dict, Any, List, Optional

try:
    from ..schemas import CoverageResult
    from ..ai.provider import AIProvider
    from ..services.evidence import EvidenceStore
except (ImportError, ValueError):
    from schemas import CoverageResult
    from ai.provider import AIProvider
    from services.evidence import EvidenceStore


EXCLUSION_KEYWORDS = ["intentional", "drunk", "under the influence", "racing", "wear and tear"]

class CoverageAgent:
    def evaluate(
        self,
        claim_data: Dict[str, Any],
        policy_evidence: Any,
        policy_section_map: Optional[Dict[str, str]] = None,
        evidence_store: Optional[EvidenceStore] = None,
        ai_provider: Optional[AIProvider] = None
    ) -> Dict[str, Any]:
        if evidence_store is None:
            evidence_store = EvidenceStore()
        if ai_provider is None:
            from ..ai.provider import get_provider
            ai_provider = get_provider()
        if policy_section_map is None:
            policy_section_map = {}
            # Auto-discover from evidence store if possible
            for item in evidence_store.all_items():
                if item.get("agent_name") == "PolicyRAGAgent":
                    field = item.get("field", "")
                    if "3.1" in field:
                        policy_section_map["S3.1"] = item["id"]
                    elif "4.2" in field:
                        policy_section_map["S4.2"] = item["id"]

        start_time = time.time()
        desc = (claim_data.get("description") or "").lower()
        claim_type = claim_data.get("claim_type", "")


        top_section = None
        if policy_evidence and policy_evidence.relevant_sections:
            top_section = policy_evidence.relevant_sections[0]

        top_section_eid = policy_section_map.get(top_section.section_id) if top_section else None

        # Check sufficiency
        if not policy_evidence or not policy_evidence.sufficient or not top_section:
            res = CoverageResult(
                coverage_status="insufficient_evidence",
                reason="Insufficient policy evidence.",
                confidence=0.4,
                evidence_ids=[]
            )
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "agent": {
                    "key": "coverage",
                    "agent_name": "CoverageAgent",
                    "status": "warning",
                    "summary": "Insufficient policy evidence",
                    "confidence": 0.40,
                    "duration_ms": max(elapsed_ms, 50)
                },
                "coverage": res
            }

        # Check exclusions
        found_exclusion = any(kw in desc for kw in EXCLUSION_KEYWORDS)
        if found_exclusion:
            ev_ids = [top_section_eid] if top_section_eid else []
            res = CoverageResult(
                coverage_status="conflict",
                reason="The reported claim circumstances conflict with policy exclusions.",
                confidence=0.80,
                evidence_ids=ev_ids
            )
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "agent": {
                    "key": "coverage",
                    "agent_name": "CoverageAgent",
                    "status": "completed",
                    "summary": "Coverage conflict detected",
                    "confidence": 0.80,
                    "duration_ms": max(elapsed_ms, 50)
                },
                "coverage": res
            }

        # Applicable coverage logic
        sec_text = (top_section.text or "").lower()
        sec_title = (top_section.section or "").lower()
        is_covered = ("accident" in sec_text or "collision" in sec_text or "damage" in sec_text or "damage" in sec_title)

        if is_covered:
            coverage_status = "applicable"
            confidence = 0.92
            # Deterministic reason template
            incident_type_str = "rear-end collision" if "rear-ended" in desc else "reported damage"
            reason = (
                f"The retrieved policy section covers accidental vehicle damage, which matches the "
                f"reported {incident_type_str}. No retrieved exclusion appears to apply."
            )
            ev_ids = []
            if top_section_eid:
                ev_ids.append(top_section_eid)
            if evidence_store.exists("E1"):
                ev_ids.append("E1")

            # Optional LLM refinement
            if ai_provider.available():
                prompt_sys = (
                    "You are the Coverage Agent in an insurance claim assessment workflow. "
                    "Use only the supplied claim data and retrieved policy evidence. "
                    "Determine whether the evidence indicates applicable, conflict or insufficient_evidence. "
                    "Never invent policy clauses. Return JSON {coverage_status, reason}."
                )
                user_msg = json.dumps({
                    "claim": claim_data,
                    "policy_section": {"title": top_section.section, "text": top_section.text}
                })
                llm_res = ai_provider.complete_json(prompt_sys, user_msg)
                if (
                    llm_res
                    and isinstance(llm_res, dict)
                    and llm_res.get("coverage_status") in ["applicable", "conflict", "insufficient_evidence"]
                ):
                    if llm_res.get("reason"):
                        reason = llm_res["reason"]

            res = CoverageResult(
                coverage_status=coverage_status,
                reason=reason,
                confidence=confidence,
                evidence_ids=ev_ids
            )
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "agent": {
                    "key": "coverage",
                    "agent_name": "CoverageAgent",
                    "status": "completed",
                    "summary": "Coverage appears applicable",
                    "confidence": confidence,
                    "duration_ms": max(elapsed_ms, 50)
                },
                "coverage": res
            }

        # Fallback if neither exclusion nor direct coverage matched
        res = CoverageResult(
            coverage_status="insufficient_evidence",
            reason="Retrieved policy clauses do not conclusively establish coverage.",
            confidence=0.50,
            evidence_ids=[top_section_eid] if top_section_eid else []
        )
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "agent": {
                "key": "coverage",
                "agent_name": "CoverageAgent",
                "status": "warning",
                "summary": "Retrieved policy clauses inconclusive",
                "confidence": 0.50,
                "duration_ms": max(elapsed_ms, 50)
            },
            "coverage": res
        }
