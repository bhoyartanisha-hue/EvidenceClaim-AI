export type AgentKey =
  | "document"
  | "policy"
  | "coverage"
  | "missing_info"
  | "anomaly"
  | "assessment"
  | "human_review";

export type ClaimType = "Auto" | "Home" | "Health" | "Life";

export type ClaimStatus =
  | "In Review"
  | "Needs Info"
  | "Ready for Decision"
  | "Anomaly Detected";

export type AgentStatus = "complete" | "flagged" | "pending";

export interface EvidenceSource {
  document: string;
  /** null when the source page is unknown — rendered as "Page: n/a" */
  page: number | null;
}

export interface AgentResult {
  agent: AgentKey;
  name: string;
  status: AgentStatus;
  decision: string;
  reason: string;
  evidence: string;
  source: EvidenceSource;
  /** 0–100 */
  confidence: number;
}

export interface Claim {
  id: string;
  claimant: string;
  policyNumber: string;
  type: ClaimType;
  dateFiled: string;
  amountClaimed: number;
  status: ClaimStatus;
  /** 0–100, higher = more risk indicators */
  riskScore: number;
  summary: string;
  agents: AgentResult[];
  backendStatus?: string;
  claim_type?: string;
  complexity?: "low" | "medium" | "high" | null;
  complexity_score?: number | null;
  recommendation?: "automated_processing" | "human_review" | "investigation_required" | null;
  issues_count?: number | null;
  created_at?: string;
  documents?: BackendClaimDocument[];
  isMock?: boolean;
}

export interface PipelineAgent {
  key: AgentKey;
  name: string;
  tagline: string;
  description: string;
}

export interface BackendStats {
  total: number;
  needs_review: number;
  investigation_required: number;
  automated: number;
  analyzing: number;
  avg_complexity_score: number | null;
}

export interface BackendClaimDocument {
  id: string;
  filename: string;
  document_type?: string;
}

export interface BackendClaim {
  id: string;
  claim_type: "vehicle_accident" | "property_damage" | "other" | string;
  description: string;
  claim_amount: number;
  incident_date: string;
  status: "draft" | "analyzing" | "analyzed" | "error" | string;
  complexity?: "low" | "medium" | "high" | null;
  complexity_score?: number | null;
  recommendation?: "automated_processing" | "human_review" | "investigation_required" | null;
  issues_count?: number | null;
  created_at: string;
  documents: BackendClaimDocument[];
}
