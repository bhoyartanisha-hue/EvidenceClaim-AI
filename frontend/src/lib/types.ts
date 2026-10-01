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
}

export interface PipelineAgent {
  key: AgentKey;
  name: string;
  tagline: string;
  description: string;
}
