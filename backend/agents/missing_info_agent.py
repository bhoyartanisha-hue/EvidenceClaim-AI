import time
from typing import List, Dict, Any, Optional
try:
    from ..schemas import MissingInformationResult, MissingItem
    from ..services.evidence import EvidenceStore
except (ImportError, ValueError):
    from schemas import MissingInformationResult, MissingItem
    from services.evidence import EvidenceStore


DOCUMENT_REQUIREMENTS = {
    "vehicle_accident": ["claim_form", "policy", "repair_invoice", "accident_report"],
    "property_damage": ["claim_form", "policy", "repair_invoice", "accident_report"],
    "other": ["claim_form", "policy"]
}

DOCUMENT_TITLES = {
    "claim_form": "Claim Form",
    "policy": "Insurance Policy",
    "repair_invoice": "Repair Invoice",
    "accident_report": "Accident Report",
    "other": "Supporting Document"
}

class MissingInformationAgent:
    def check(
        self,
        documents: List[Any],
        claim_type: str,
        policy_evidence: Optional[Any] = None,
        policy_section_map: Optional[Dict[str, str]] = None,
        evidence_store: Optional[EvidenceStore] = None
    ) -> Dict[str, Any]:
        if evidence_store is None:
            evidence_store = EvidenceStore()
        if policy_section_map is None:
            policy_section_map = {}
            for item in evidence_store.all_items():
                if item.get("agent_name") == "PolicyRAGAgent":
                    field = item.get("field", "")
                    if "4.2" in field:
                        policy_section_map["S4.2"] = item["id"]
                    elif "3.1" in field:
                        policy_section_map["S3.1"] = item["id"]

        start_time = time.time()
        required = DOCUMENT_REQUIREMENTS.get(claim_type, DOCUMENT_REQUIREMENTS["other"])

        # Determine present document types
        present_types = set()
        for doc in documents:
            if hasattr(doc, "document_type"):
                dtype = doc.document_type
            elif isinstance(doc, dict):
                dtype = doc.get("document_type")
            else:
                dtype = None
            if dtype:
                present_types.add(dtype)


        present = [req for req in required if req in present_types]
        missing = [req for req in required if req not in present_types]

        completeness = int(round(100.0 * len(present) / len(required))) if required else 100

        missing_items: List[MissingItem] = []

        for m_type in missing:
            item_title = DOCUMENT_TITLES.get(m_type, m_type.replace("_", " ").title())
            # Absence evidence (E6 in demo)
            abs_eid = evidence_store.add(
                agent_name="MissingInformationAgent",
                source_document=None,
                page=None,
                field=f"required_document:{m_type}",
                value="not submitted",
                description=f"No submitted document was classified as an {item_title.lower()}",
                confidence=0.97
            )
            item_eids = [abs_eid]

            # If policy section S4.2 exists, attach its evidence id (E7 in demo)
            sec_eid = policy_section_map.get("S4.2")
            if sec_eid:
                item_eids.append(sec_eid)

            reason = f"Required for the prototype {claim_type.replace('_', ' ')} workflow"
            if sec_eid:
                reason += " and referenced in policy section 4.2"

            missing_items.append(MissingItem(
                item=item_title,
                reason=reason,
                evidence_ids=item_eids
            ))

        status = "warning" if missing_items else "completed"
        summary = (
            f"{len(missing_items)} required document missing ({completeness}% complete)"
            if missing_items
            else f"All {len(required)} required documents submitted (100% complete)"
        )

        elapsed_ms = int((time.time() - start_time) * 1000)

        result_obj = MissingInformationResult(
            required=required,
            present=present,
            items=missing_items,
            completeness=completeness
        )

        return {
            "agent": {
                "key": "missing_info",
                "agent_name": "MissingInformationAgent",
                "status": status,
                "summary": summary,
                "confidence": 0.97,
                "duration_ms": max(elapsed_ms, 50)
            },
            "missing_information": result_obj
        }
