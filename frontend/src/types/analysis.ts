import type { AgentKey } from "@/lib/types";

export type RunStatus = "pending" | "running" | "completed" | "warning" | "error";

export interface Evidence {
  id: string;
  /** null = absence evidence ("Not submitted") */
  source_document: string | null;
  field: string;
  value: string;
  page: number | null;
  description?: string;
  confidence?: number;
  agent?: string;
}

export interface AgentRun {
  key: AgentKey;
  name: string;
  status: Exclude<RunStatus, "pending" | "running">;
  summary: string;
  confidence: number;
}

export interface PolicyClause {
  section: string;
  text: string;
  source_document: string;
  page: number | null;
}

export interface Anomaly {
  type: "timing" | "amount" | "document" | "duplicate";
  description: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  evidence_ids: string[];
  /** side-by-side comparison for mismatch anomalies */
  comparison?: { left: string; right: string; difference: string };
}

export interface ExtractedDocument {
  name: string;
  type: string;
  confidence: number;
  extracted_data: Record<string, string>;
}

export interface Analysis {
  claim_id: string;
  agents: AgentRun[];
  evidence: Evidence[];
  documents: ExtractedDocument[];
  coverage: {
    coverage_status: "applicable" | "conflict" | "insufficient_evidence";
    reason: string;
    confidence: number;
    clauses: PolicyClause[];
    evidence_ids: string[];
  };
  missing_info: {
    completeness: number;
    items: { label: string; present: boolean; reason?: string; evidence_id?: string }[];
  };
  anomalies: Anomaly[];
  assessment: {
    route: "HUMAN REVIEW" | "FAST TRACK";
    complexity: "Low" | "Medium" | "High";
    score: number;
    reason: string;
    score_breakdown: { factor: string; points: number }[];
    evidence_ids: string[];
  };
  human_review: { summary: string; key_findings: string[]; next_step: string };
}
