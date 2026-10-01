from typing import Literal, Optional, List, Dict, Any
from pydantic import BaseModel, Field

# --- Enums matching Shared API Contract ---
AgentStatus = Literal["pending", "running", "completed", "warning", "error"]
ClaimStatus = Literal["draft", "analyzing", "analyzed", "error"]
CoverageStatus = Literal["applicable", "conflict", "insufficient_evidence"]
RecommendedRoute = Literal["automated_processing", "human_review", "investigation_required"]
Complexity = Literal["low", "medium", "high"]
Severity = Literal["low", "medium", "high"]
DocumentType = Literal["claim_form", "policy", "repair_invoice", "accident_report", "other"]
ClaimType = Literal["vehicle_accident", "property_damage", "other"]
AnalysisMode = Literal["ai", "demo_fallback"]

# --- Core Sub-objects ---

class Evidence(BaseModel):
    id: str
    agent_name: str
    source_document: Optional[str] = None
    page: Optional[int] = None
    field: str
    value: str
    description: str
    confidence: float

class ClaimDocument(BaseModel):
    id: str
    filename: str
    document_type: Optional[DocumentType] = None

class ClaimCreate(BaseModel):
    claim_type: ClaimType
    description: str
    claim_amount: int
    incident_date: str

class Claim(BaseModel):
    id: str
    claim_type: ClaimType
    description: str
    claim_amount: int
    incident_date: str
    status: ClaimStatus = "draft"
    complexity: Optional[Complexity] = None
    complexity_score: Optional[int] = None
    recommendation: Optional[RecommendedRoute] = None
    issues_count: Optional[int] = None
    created_at: str
    documents: List[ClaimDocument] = []

class AgentResult(BaseModel):
    key: str
    agent_name: str
    status: AgentStatus
    summary: str
    confidence: float
    duration_ms: int

class ExtractedDocument(BaseModel):
    document_id: str
    filename: str
    document_type: DocumentType
    confidence: float
    extracted_data: Dict[str, Any]
    evidence_ids: List[str] = []

class RelevantSection(BaseModel):
    section_id: str
    section: str
    text: str
    source_document: Optional[str] = None
    page: Optional[int] = None
    relevance: float

class PolicyEvidence(BaseModel):
    sufficient: bool
    relevant_sections: List[RelevantSection] = []

class CoverageResult(BaseModel):
    coverage_status: CoverageStatus
    reason: str
    confidence: float
    evidence_ids: List[str] = []

class MissingItem(BaseModel):
    item: str
    reason: str
    evidence_ids: List[str] = []

class MissingInformationResult(BaseModel):
    required: List[str]
    present: List[str]
    items: List[MissingItem] = []
    completeness: int

class AnomalyItem(BaseModel):
    id: str
    type: str
    description: str
    severity: Severity
    confidence: float
    evidence_ids: List[str] = []

class ScoreBreakdownItem(BaseModel):
    factor: str
    points: int

class AssessmentResult(BaseModel):
    complexity: Complexity
    complexity_score: int
    recommended_route: RecommendedRoute
    reason: str
    score_breakdown: List[ScoreBreakdownItem] = []
    confidence: float
    evidence_ids: List[str] = []

class HumanReviewResult(BaseModel):
    summary: str
    key_findings: List[str] = []
    recommended_next_step: str

# --- Full Analysis Object ---

class Analysis(BaseModel):
    claim_id: str
    status: Literal["pending", "running", "completed", "error"] = "pending"
    mode: AnalysisMode = "demo_fallback"
    disclaimer: str = (
        "AI-generated decision-support assessment from a prototype. "
        "Not a legally binding approval or rejection."
    )
    agents: List[AgentResult] = []
    extracted_documents: Optional[List[ExtractedDocument]] = None
    policy_evidence: Optional[PolicyEvidence] = None
    coverage: Optional[CoverageResult] = None
    missing_information: Optional[MissingInformationResult] = None
    anomalies: Optional[List[AnomalyItem]] = None
    assessment: Optional[AssessmentResult] = None
    human_review: Optional[HumanReviewResult] = None
    evidence: List[Evidence] = []

class StatsResponse(BaseModel):
    total: int
    needs_review: int
    investigation_required: int
    automated: int
    analyzing: int
    avg_complexity_score: Optional[float] = None
