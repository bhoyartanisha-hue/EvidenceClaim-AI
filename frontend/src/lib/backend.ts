import type { AgentKey } from "@/lib/types";
import type { Analysis, Evidence, RunStatus } from "@/types/analysis";

export const API_BASE =
  ((import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "").replace(/\/$/, "");

/** Defensive accessor: returns fallback when value is null/undefined. */
export function safe<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(t);
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface LiveClaim {
  id: string;
  status?: string;
  claimant?: string;
  claimant_name?: string;
  claim_type?: string;
  type?: string;
  amount_claimed?: number;
  claim_amount?: number;
  summary?: string;
  description?: string;
  [k: string]: unknown;
}

export interface LiveAgent {
  key: AgentKey;
  name?: string;
  status: RunStatus;
  summary?: string;
  confidence?: number;
}

/** Live analysis — same shape as Analysis but every section may still be null while running. */
export interface LiveAnalysis {
  claim_id: string;
  status: "pending" | "running" | "analyzing" | "completed" | "error";
  agents: LiveAgent[];
  evidence?: Evidence[] | null;
  documents?: Analysis["documents"] | null;
  coverage?: Analysis["coverage"] | null;
  missing_info?: Analysis["missing_info"] | null;
  anomalies?: Analysis["anomalies"] | null;
  assessment?: Analysis["assessment"] | null;
  human_review?: Analysis["human_review"] | null;
}

export const api = {
  health: () => request<unknown>("/api/health", {}, 2500),
  loadDemo: () => request<{ claim: LiveClaim }>("/api/demo/load", { method: "POST" }),
  createClaim: (body: Record<string, unknown>) => request<LiveClaim>("/api/claims", json(body)),
  uploadDocument: (id: string, file: File, documentType: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("document_type", documentType);
    return request<unknown>(`/api/claims/${encodeURIComponent(id)}/documents`, { method: "POST", body: fd }, 30000);
  },
  analyze: (id: string) => request<unknown>(`/api/claims/${encodeURIComponent(id)}/analyze`, { method: "POST" }),
  getClaim: (id: string) => request<LiveClaim>(`/api/claims/${encodeURIComponent(id)}`),
  getAnalysis: (id: string) => request<LiveAnalysis>(`/api/claims/${encodeURIComponent(id)}/analysis`, {}, 5000),
};

/** Guess a document_type from a filename. */
export function guessDocType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("policy")) return "policy";
  if (n.includes("invoice") || n.includes("estimate")) return "invoice";
  if (n.includes("report")) return "accident_report";
  if (/\.(jpg|jpeg|png|webp)$/.test(n)) return "photo";
  if (n.includes("claim")) return "claim_form";
  return "other";
}

export const DEMO_FALLBACK_ID = "CLM-1001";
