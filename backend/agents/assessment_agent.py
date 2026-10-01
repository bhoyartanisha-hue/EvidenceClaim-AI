import time
from typing import List, Dict, Any, Optional
try:
    from ..schemas import AssessmentResult, ScoreBreakdownItem
    from ..services.evidence import EvidenceStore
except (ImportError, ValueError):
    from schemas import AssessmentResult, ScoreBreakdownItem
    from services.evidence import EvidenceStore


class AssessmentAgent:
    def evaluate(
        self,
        coverage: Any,
        missing: Any,
        anomalies: List[Any],
        documents: List[Any],
        evidence_store: Optional[EvidenceStore] = None
    ) -> Dict[str, Any]:
        if evidence_store is None:
            evidence_store = EvidenceStore()
        start_time = time.time()

        score_breakdown: List[ScoreBreakdownItem] = []
        drivng_evidence_ids: List[str] = []
        confidences: List[float] = []

        # 1. Base score
        base_score = 20
        score_breakdown.append(ScoreBreakdownItem(factor="Base score", points=base_score))
        total_score = base_score

        # 2. Coverage factor
        cov_status = getattr(coverage, "coverage_status", "insufficient_evidence") if coverage else "insufficient_evidence"
        cov_conf = getattr(coverage, "confidence", 0.5) if coverage else 0.5
        confidences.append(cov_conf)

        if cov_status == "insufficient_evidence":
            total_score += 20
            score_breakdown.append(ScoreBreakdownItem(factor="Insufficient policy evidence", points=20))
        elif cov_status == "conflict":
            total_score += 30
            score_breakdown.append(ScoreBreakdownItem(factor="Coverage conflict detected", points=30))
            if coverage and hasattr(coverage, "evidence_ids"):
                drivng_evidence_ids.extend(coverage.evidence_ids)

        # 3. Missing documents (+12 per missing)
        missing_count = 0
        if missing and hasattr(missing, "items"):
            missing_count = len(missing.items)
            for item in missing.items:
                total_score += 12
                score_breakdown.append(ScoreBreakdownItem(
                    factor=f"Missing document: {item.item}",
                    points=12
                ))
                if hasattr(item, "evidence_ids") and item.evidence_ids:
                    # Take primary absence evidence id (e.g. E6)
                    drivng_evidence_ids.append(item.evidence_ids[0])

        # 4. Anomalies
        valid_anomalies = []
        has_high_anomaly = False
        for a in (anomalies or []):
            is_unsupported = getattr(a, "unsupported", False)
            if is_unsupported:
                continue
            valid_anomalies.append(a)
            confidences.append(getattr(a, "confidence", 0.9))

            sev = getattr(a, "severity", "medium")
            a_type = getattr(a, "type", "anomaly")
            if sev == "high":
                has_high_anomaly = True
                total_score += 25
                score_breakdown.append(ScoreBreakdownItem(
                    factor=f"{a_type.replace('_', ' ').title()} (high)",
                    points=25
                ))
            elif sev == "medium":
                total_score += 15
                if a_type == "date_mismatch":
                    factor_name = "Date mismatch (medium)"
                elif a_type == "amount_mismatch":
                    factor_name = "Amount mismatch (medium)"
                else:
                    factor_name = f"{a_type.replace('_', ' ').title()} (medium)"
                score_breakdown.append(ScoreBreakdownItem(factor=factor_name, points=15))
            else: # low
                total_score += 8
                score_breakdown.append(ScoreBreakdownItem(
                    factor=f"{a_type.replace('_', ' ').title()} (low)",
                    points=8
                ))

            if hasattr(a, "evidence_ids"):
                drivng_evidence_ids.extend(a.evidence_ids)

        capped_score = min(100, total_score)

        # Complexity rating
        if capped_score < 40:
            complexity = "low"
        elif capped_score < 70:
            complexity = "medium"
        else:
            complexity = "high"

        # Recommended route
        if capped_score >= 70 or has_high_anomaly or cov_status == "conflict":
            recommended_route = "investigation_required"
        elif capped_score >= 40 or len(valid_anomalies) > 0 or missing_count > 0 or cov_status != "applicable":
            recommended_route = "human_review"
        else:
            recommended_route = "automated_processing"

        # Construct explanation
        reasons_list = []
        if cov_status == "applicable":
            cov_phrase = "Coverage appears applicable"
        elif cov_status == "conflict":
            cov_phrase = "Potential coverage conflict detected"
        else:
            cov_phrase = "Policy coverage is inconclusive"

        issue_parts = []
        if missing_count == 1:
            issue_parts.append("one required document is missing")
        elif missing_count > 1:
            issue_parts.append(f"{missing_count} required documents are missing")

        anom_count = len(valid_anomalies)
        if anom_count == 1:
            issue_parts.append("one cross-document inconsistency requires review")
        elif anom_count == 2:
            issue_parts.append("two cross-document inconsistencies require review")
        elif anom_count > 2:
            issue_parts.append(f"{anom_count} cross-document inconsistencies require review")

        if issue_parts:
            reason = f"{cov_phrase}, but {' and '.join(issue_parts)}."
        else:
            reason = f"{cov_phrase}, and all documentation meets criteria for automated routing."

        # Unique ordered evidence IDs
        seen = set()
        unique_ev_ids = []
        for eid in drivng_evidence_ids:
            if eid not in seen and evidence_store.exists(eid):
                seen.add(eid)
                unique_ev_ids.append(eid)

        mean_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.88

        result_obj = AssessmentResult(
            complexity=complexity,
            complexity_score=capped_score,
            recommended_route=recommended_route,
            reason=reason,
            score_breakdown=score_breakdown,
            confidence=mean_conf,
            evidence_ids=unique_ev_ids
        )

        elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "agent": {
                "key": "assessment",
                "agent_name": "AssessmentAgent",
                "status": "completed",
                "summary": f"{complexity.title()} complexity ({capped_score}). Route: {recommended_route}",
                "confidence": mean_conf,
                "duration_ms": max(elapsed_ms, 50)
            },
            "assessment": result_obj
        }
