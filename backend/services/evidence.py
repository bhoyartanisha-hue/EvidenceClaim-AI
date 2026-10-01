import logging
from typing import Optional, List, Dict, Any

try:
    from ..schemas import Evidence
except (ImportError, ValueError):
    from schemas import Evidence



logger = logging.getLogger(__name__)

class EvidenceStore:
    def __init__(self):
        self._items: Dict[str, Dict[str, Any]] = {}
        self._counter: int = 1

    def add(
        self,
        agent_name: str,
        source_document: Optional[str],
        page: Optional[int],
        field: str,
        value: Any,
        description: str,
        confidence: float
    ) -> str:
        eid = f"E{self._counter}"
        self._counter += 1
        item = {
            "id": eid,
            "agent_name": agent_name,
            "source_document": source_document,
            "page": page,
            "field": str(field),
            "value": str(value),
            "description": description,
            "confidence": round(float(confidence), 2)
        }
        self._items[eid] = item
        return eid

    def get(self, evidence_id: str) -> Optional[Dict[str, Any]]:
        return self._items.get(evidence_id)

    def exists(self, evidence_id: str) -> bool:
        return evidence_id in self._items

    def all_items(self) -> List[Dict[str, Any]]:
        return list(self._items.values())

    def validate(self, findings: List[Dict[str, Any]]) -> None:
        """
        Validates findings against evidence store.
        If any evidence_id is missing, sets finding["unsupported"] = True,
        caps confidence at 0.3, and logs a safe message without claim content.
        """
        for finding in findings:
            if not isinstance(finding, dict):
                continue
            eids = finding.get("evidence_ids", [])
            missing_ids = [eid for eid in eids if not self.exists(eid)]
            if missing_ids or not eids:
                finding["unsupported"] = True
                curr_conf = finding.get("confidence", 1.0)
                finding["confidence"] = min(float(curr_conf), 0.3)
                logger.warning(
                    f"Evidence validation check: finding flagged unsupported due to missing evidence IDs: {missing_ids}"
                )
            else:
                finding["unsupported"] = False
