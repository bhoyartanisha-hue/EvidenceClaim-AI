import re
import time
from typing import List, Dict, Any, Optional
try:
    from ..schemas import ExtractedDocument
    from ..services.evidence import EvidenceStore
except (ImportError, ValueError):
    from schemas import ExtractedDocument
    from services.evidence import EvidenceStore


def parse_date(date_str: str) -> str:
    """Parses DD/MM/YYYY into YYYY-MM-DD."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", date_str)
    if m:
        day, month, year = m.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    # Already YYYY-MM-DD
    m_iso = re.search(r"\d{4}-\d{2}-\d{2}", date_str)
    if m_iso:
        return m_iso.group(0)
    return date_str.strip()

def parse_money(amount_str: str) -> int:
    """Parses INR 85,000 or ₹85,000 or 85000 to int."""
    cleaned = re.sub(r"[^\d]", "", amount_str)
    return int(cleaned) if cleaned else 0

class DocumentAgent:
    def _classify_type(self, filename: str, text: str) -> str:
        combined = f"{filename} {text[:300]}".lower()
        if "claim form" in combined or "claim_form" in combined:
            return "claim_form"
        if "repair" in combined or "invoice" in combined:
            return "repair_invoice"
        if "policy" in combined or "insurance" in combined:
            return "policy"
        if "accident report" in combined or "fir" in combined or "police" in combined:
            return "accident_report"
        return "other"

    def process(
        self,
        documents: List[Dict[str, Any]],
        evidence_store: Optional[EvidenceStore] = None
    ) -> Dict[str, Any]:
        if evidence_store is None:
            evidence_store = EvidenceStore()
        start_time = time.time()
        extracted_docs: List[ExtractedDocument] = []

        for doc in documents:
            doc_id = doc.get("id", "doc-1")
            filename = doc.get("filename", "unknown.txt")
            raw_text = doc.get("text") or ""
            doc_type = doc.get("document_type") or self._classify_type(filename, raw_text)


            extracted_data: Dict[str, Any] = {}
            evidence_ids: List[str] = []

            # Regex field extraction (case-insensitive)
            name_m = re.search(r"(?:Claimant Name|Customer|Policyholder)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if name_m:
                extracted_data["claimant_name"] = name_m.group(1).strip()

            pol_m = re.search(r"(POL-\d+)", raw_text, re.IGNORECASE)
            if pol_m:
                extracted_data["policy_number"] = pol_m.group(1).strip()

            clm_m = re.search(r"(CLM-\d+)", raw_text, re.IGNORECASE)
            if clm_m:
                extracted_data["claim_number"] = clm_m.group(1).strip()

            inc_dt_m = re.search(r"Date of Accident\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if inc_dt_m:
                parsed_dt = parse_date(inc_dt_m.group(1))
                extracted_data["incident_date"] = parsed_dt

            loc_m = re.search(r"Location of Accident\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if loc_m:
                extracted_data["incident_location"] = loc_m.group(1).strip()

            clm_amt_m = re.search(r"Claimed Amount\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if clm_amt_m:
                extracted_data["claim_amount"] = parse_money(clm_amt_m.group(1))

            inv_amt_m = re.search(r"(?:Total Repair Amount|Invoice Amount)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if inv_amt_m:
                extracted_data["invoice_amount"] = parse_money(inv_amt_m.group(1))

            inv_dt_m = re.search(r"Invoice Date\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if inv_dt_m:
                extracted_data["invoice_date"] = parse_date(inv_dt_m.group(1))

            rep_dt_m = re.search(r"Repair Date\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if rep_dt_m:
                extracted_data["repair_date"] = parse_date(rep_dt_m.group(1))

            veh_m = re.search(r"Vehicle\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if veh_m:
                extracted_data["vehicle"] = veh_m.group(1).strip()

            desc_m = re.search(r"Description\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
            if desc_m:
                extracted_data["statement"] = desc_m.group(1).strip()

            # For policy document
            if doc_type == "policy":
                if "claimant_name" in extracted_data:
                    extracted_data["policyholder"] = extracted_data["claimant_name"]
                if "Accidental vehicle damage" in raw_text or "accidental" in raw_text.lower():
                    extracted_data["coverage_summary"] = "Accidental vehicle damage"

            confidence = 0.95
            # Add specific evidence in standard order
            if doc_type == "claim_form":
                confidence = 0.97
                if "incident_date" in extracted_data:
                    eid1 = evidence_store.add(
                        agent_name="DocumentAgent",
                        source_document=filename,
                        page=None,
                        field="incident_date",
                        value=extracted_data["incident_date"],
                        description="Accident date stated on the claim form",
                        confidence=0.97
                    )
                    evidence_ids.append(eid1)
                if "claim_amount" in extracted_data:
                    eid2 = evidence_store.add(
                        agent_name="DocumentAgent",
                        source_document=filename,
                        page=None,
                        field="claim_amount",
                        value=str(extracted_data["claim_amount"]),
                        description="Claimed amount stated on the claim form",
                        confidence=0.97
                    )
                    evidence_ids.append(eid2)

            elif doc_type == "repair_invoice":
                confidence = 0.96
                if "repair_date" in extracted_data:
                    eid3 = evidence_store.add(
                        agent_name="DocumentAgent",
                        source_document=filename,
                        page=None,
                        field="repair_date",
                        value=extracted_data["repair_date"],
                        description="Repair date extracted from repair invoice",
                        confidence=0.96
                    )
                    evidence_ids.append(eid3)
                if "invoice_amount" in extracted_data:
                    eid4 = evidence_store.add(
                        agent_name="DocumentAgent",
                        source_document=filename,
                        page=None,
                        field="invoice_amount",
                        value=str(extracted_data["invoice_amount"]),
                        description="Total repair amount extracted from repair invoice",
                        confidence=0.96
                    )
                    evidence_ids.append(eid4)

            elif doc_type == "policy":
                confidence = 0.93

            ext_doc = ExtractedDocument(
                document_id=doc_id,
                filename=filename,
                document_type=doc_type,
                confidence=confidence,
                extracted_data=extracted_data,
                evidence_ids=evidence_ids
            )
            extracted_docs.append(ext_doc)

        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "agent": {
                "key": "document",
                "agent_name": "DocumentAgent",
                "status": "completed",
                "summary": f"Extracted structured fields from {len(documents)} documents",
                "confidence": 0.95,
                "duration_ms": max(elapsed_ms, 50)
            },
            "extracted_documents": extracted_docs
        }
