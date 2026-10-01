import time
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional
try:
    from ..schemas import AnomalyItem
    from ..ai.provider import AIProvider
    from ..services.evidence import EvidenceStore
except (ImportError, ValueError):
    from schemas import AnomalyItem
    from ai.provider import AIProvider
    from services.evidence import EvidenceStore


def format_inr(val: int) -> str:
    # Formats integer to Indian currency string like ₹85,000
    s = str(abs(val))
    if len(s) <= 3:
        res = s
    else:
        last3 = s[-3:]
        remaining = s[:-3]
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        res = ",".join(groups) + "," + last3
    return f"₹{res}"

def to_display_date(iso_or_slash_date: str) -> str:
    # Convert YYYY-MM-DD to DD/MM/YYYY for display
    try:
        if "-" in iso_or_slash_date:
            dt = datetime.strptime(iso_or_slash_date, "%Y-%m-%d")
            return dt.strftime("%d/%m/%Y")
    except Exception:
        pass
    return iso_or_slash_date

class AnomalyAgent:
    def detect(
        self,
        extracted_documents: List[Any],
        claim: Dict[str, Any],
        evidence_store: Optional[EvidenceStore] = None,
        ai_provider: Optional[AIProvider] = None
    ) -> Dict[str, Any]:
        if evidence_store is None:
            evidence_store = EvidenceStore()
        if ai_provider is None:
            from ..ai.provider import get_provider
            ai_provider = get_provider()
        start_time = time.time()
        anomalies: List[AnomalyItem] = []
        counter = 1


        # Gather extracted fields across docs
        claim_form_doc = None
        invoice_doc = None
        doc_names = []
        doc_policies = []

        for doc in extracted_documents:
            d_dict = doc.extracted_data if hasattr(doc, "extracted_data") else doc.get("extracted_data", {})
            d_type = doc.document_type if hasattr(doc, "document_type") else doc.get("document_type")

            if d_type == "claim_form":
                claim_form_doc = (doc, d_dict)
            elif d_type == "repair_invoice":
                invoice_doc = (doc, d_dict)

            if "claimant_name" in d_dict:
                doc_names.append((d_dict["claimant_name"], doc))
            if "policy_number" in d_dict:
                doc_policies.append((d_dict["policy_number"], doc))

        # Check 1: Date Mismatch (Incident date vs Repair/Invoice date)
        incident_date_str = None
        repair_date_str = None
        incident_eid = "E1"
        repair_eid = "E3"

        if claim_form_doc and "incident_date" in claim_form_doc[1]:
            incident_date_str = claim_form_doc[1]["incident_date"]
        elif claim.get("incident_date"):
            incident_date_str = claim["incident_date"]

        if invoice_doc:
            if "repair_date" in invoice_doc[1]:
                repair_date_str = invoice_doc[1]["repair_date"]
            elif "invoice_date" in invoice_doc[1]:
                repair_date_str = invoice_doc[1]["invoice_date"]

        if incident_date_str and repair_date_str:
            try:
                # Compare as dates
                dt_inc = datetime.strptime(incident_date_str, "%Y-%m-%d") if "-" in incident_date_str else datetime.strptime(incident_date_str, "%d/%m/%Y")
                dt_rep = datetime.strptime(repair_date_str, "%Y-%m-%d") if "-" in repair_date_str else datetime.strptime(repair_date_str, "%d/%m/%Y")

                if dt_rep < dt_inc:
                    days_gap = (dt_inc - dt_rep).days
                    severity = "high" if days_gap > 30 else "medium"
                    disp_rep = to_display_date(repair_date_str)
                    disp_inc = to_display_date(incident_date_str)
                    desc = f"Anomaly detected: repair invoice date ({disp_rep}) precedes the reported accident date ({disp_inc})."
                    eids = [eid for eid in [incident_eid, repair_eid] if evidence_store.exists(eid)]
                    anomalies.append(AnomalyItem(
                        id=f"A{counter}",
                        type="date_mismatch",
                        description=desc,
                        severity=severity,
                        confidence=0.91,
                        evidence_ids=eids
                    ))
                    counter += 1
                elif dt_rep != dt_inc:
                    disp_rep = to_display_date(repair_date_str)
                    disp_inc = to_display_date(incident_date_str)
                    desc = f"Risk indicator: repair invoice date ({disp_rep}) differs from reported accident date ({disp_inc})."
                    eids = [eid for eid in [incident_eid, repair_eid] if evidence_store.exists(eid)]
                    anomalies.append(AnomalyItem(
                        id=f"A{counter}",
                        type="date_mismatch",
                        description=desc,
                        severity="low",
                        confidence=0.91,
                        evidence_ids=eids
                    ))
                    counter += 1
            except Exception:
                pass

        # Check 2: Amount Mismatch (Claimed amount vs Invoice amount)
        claim_amt = None
        inv_amt = None
        clm_amt_eid = "E2"
        inv_amt_eid = "E4"

        if claim_form_doc and "claim_amount" in claim_form_doc[1]:
            claim_amt = claim_form_doc[1]["claim_amount"]
        elif claim.get("claim_amount"):
            claim_amt = claim.get("claim_amount")

        if invoice_doc and "invoice_amount" in invoice_doc[1]:
            inv_amt = invoice_doc[1]["invoice_amount"]

        if claim_amt is not None and inv_amt is not None and claim_amt != inv_amt and claim_amt > 0:
            diff = abs(inv_amt - claim_amt)
            pct = round((diff / claim_amt) * 100, 1)

            if pct < 5.0:
                severity = "low"
            elif pct <= 20.0:
                severity = "medium"
            else:
                severity = "high"

            desc = (
                f"Risk indicator: invoice amount ({format_inr(inv_amt)}) "
                f"differs from claimed amount ({format_inr(claim_amt)}) "
                f"by {format_inr(diff)} ({pct}%)."
            )
            eids = [eid for eid in [clm_amt_eid, inv_amt_eid] if evidence_store.exists(eid)]
            anomalies.append(AnomalyItem(
                id=f"A{counter}",
                type="amount_mismatch",
                description=desc,
                severity=severity,
                confidence=0.95,
                evidence_ids=eids
            ))
            counter += 1

        # Check 3: Name Mismatch
        if len(doc_names) >= 2:
            clean_names = set()
            for name, _ in doc_names:
                clean = "".join(ch for ch in name.lower() if ch.isalnum() or ch.isspace()).strip()
                clean_names.add(clean)
            if len(clean_names) > 1:
                anomalies.append(AnomalyItem(
                    id=f"A{counter}",
                    type="name_mismatch",
                    description=f"Risk indicator: claimant name variations detected across submitted documents.",
                    severity="medium",
                    confidence=0.88,
                    evidence_ids=[]
                ))
                counter += 1

        # Check 4: Policy Number Mismatch
        if len(doc_policies) >= 2:
            pols = {p.strip().upper() for p, _ in doc_policies}
            if len(pols) > 1:
                anomalies.append(AnomalyItem(
                    id=f"A{counter}",
                    type="policy_number_mismatch",
                    description=f"Risk indicator: conflicting policy numbers identified across documents.",
                    severity="high",
                    confidence=0.96,
                    evidence_ids=[]
                ))
                counter += 1

        # Validate findings against evidence store
        findings_dicts = [a.model_dump() for a in anomalies]
        evidence_store.validate(findings_dicts)

        status = "warning" if anomalies else "completed"
        summary = (
            f"{len(anomalies)} anomaly indicators detected"
            if anomalies
            else "No anomalies detected across documents"
        )
        elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "agent": {
                "key": "anomaly",
                "agent_name": "AnomalyAgent",
                "status": status,
                "summary": summary,
                "confidence": 0.91 if anomalies else 0.95,
                "duration_ms": max(elapsed_ms, 50)
            },
            "anomalies": anomalies
        }
