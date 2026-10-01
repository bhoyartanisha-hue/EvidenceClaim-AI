import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { DEMO_CLAIMS, needsHumanReview, prototypeScore } from "./demo-data";
import { getSessionClaims } from "./session-claims";
import type { Claim, BackendStats } from "./types";

const BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined ?? "").replace(/\/$/, "");

export function mapBackendClaim(c: Record<string, unknown>, isMock = false): Claim {
  const typeMap: Record<string, "Auto" | "Home" | "Health" | "Life"> = {
    vehicle_accident: "Auto",
    property_damage: "Home",
    health: "Health",
    life: "Life",
    other: "Auto",
    Auto: "Auto",
    Home: "Home",
    Health: "Health",
    Life: "Life",
  };
  const statusMap: Record<string, Claim["status"]> = {
    draft: "In Review",
    analyzing: "In Review",
    analyzed: (c["recommendation"] === "investigation_required" ? "Anomaly Detected" : "In Review") as Claim["status"],
    error: "Needs Info",
  };
  const score = typeof c["complexity_score"] === "number"
    ? Number(c["complexity_score"])
    : typeof c["riskScore"] === "number"
      ? Number(c["riskScore"])
      : 20;

  return {
    id: String(c["id"] ?? "CLM-1001"),
    claimant: String(c["claimant_name"] ?? c["claimant"] ?? "Rahul Verma"),
    policyNumber: String(c["policy_number"] ?? c["policyNumber"] ?? "POL-1024"),
    type: typeMap[String(c["claim_type"] ?? c["type"] ?? "Auto")] ?? "Auto",
    dateFiled: String(c["incident_date"] ?? c["dateFiled"] ?? new Date().toISOString().slice(0, 10)),
    amountClaimed: Number(c["claim_amount"] ?? c["amountClaimed"] ?? 0),
    status: statusMap[String(c["status"])] ?? (c["status"] as Claim["status"]) ?? "In Review",
    riskScore: score,
    summary: String(c["description"] ?? c["summary"] ?? ""),
    agents: Array.isArray(c["agents"]) ? (c["agents"] as Claim["agents"]) : [],
    backendStatus: typeof c["status"] === "string" ? c["status"] : undefined,
    claim_type: typeof c["claim_type"] === "string" ? c["claim_type"] : undefined,
    complexity: (c["complexity"] as Claim["complexity"]) ?? null,
    complexity_score: typeof c["complexity_score"] === "number" ? c["complexity_score"] : null,
    recommendation: (c["recommendation"] as Claim["recommendation"]) ?? null,
    issues_count: typeof c["issues_count"] === "number" ? c["issues_count"] : null,
    created_at: typeof c["created_at"] === "string" ? c["created_at"] : undefined,
    documents: Array.isArray(c["documents"]) ? (c["documents"] as any) : [],
    isMock,
  };
}

function allClaims(): Claim[] {
  return [
    ...getSessionClaims().map((c) => ({ ...c, isMock: true })),
    ...DEMO_CLAIMS.map((c) => ({ ...c, isMock: true })),
  ];
}

async function getClaims(): Promise<Claim[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BASE}/api/claims`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const live = data.map((d) => mapBackendClaim(d, false));
        const liveIds = new Set(live.map((c) => c.id));
        const rest = allClaims().filter((c) => !liveIds.has(c.id));
        return [...live, ...rest];
      }
    }
  } catch {
    // Fall back to demo/session claims
  }
  return allClaims();
}

async function getClaim(id: string): Promise<Claim> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BASE}/api/claims/${encodeURIComponent(id)}`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (res.ok) {
      const data = await res.json();
      return mapBackendClaim(data, false);
    }
  } catch {
    // Fall back
  }
  const claim = allClaims().find((c) => c.id === id);
  if (!claim) throw notFound();
  return claim;
}

export async function getStats(): Promise<BackendStats> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${BASE}/api/stats`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (res.ok) {
      return (await res.json()) as BackendStats;
    }
  } catch {
    // Fall back to computed stats from demo claims
  }
  const claims = allClaims();
  const reviewCount = claims.filter(needsHumanReview).length;
  const investigationCount = claims.filter((c) => c.status === "Anomaly Detected").length;
  const avg = claims.length > 0 ? Math.round(claims.reduce((s, c) => s + prototypeScore(c), 0) / claims.length) : null;
  return {
    total: claims.length,
    needs_review: reviewCount,
    investigation_required: investigationCount,
    automated: claims.filter((c) => c.status === "Ready for Decision").length,
    analyzing: 0,
    avg_complexity_score: avg,
  };
}

export async function deleteClaim(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/claims/${encodeURIComponent(id)}`, { method: "DELETE" });
    return res.status === 204;
  } catch {
    return false;
  }
}

export async function deleteAllClaims(): Promise<{ deleted: number }> {
  try {
    const res = await fetch(`${BASE}/api/claims`, { method: "DELETE" });
    if (res.ok) {
      return (await res.json()) as { deleted: number };
    }
  } catch {
    // ignore
  }
  return { deleted: 0 };
}

export const claimsQueryOptions = queryOptions({
  queryKey: ["claims"],
  queryFn: getClaims,
});

export const claimQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["claims", id],
    queryFn: () => getClaim(id),
  });

export const statsQueryOptions = queryOptions({
  queryKey: ["stats"],
  queryFn: getStats,
  refetchInterval: 10000,
});

export function formatMoney(n: number): string {
  return formatINR(n);
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDMY(iso: string | undefined | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      const parts = iso.split("-");
      if (parts.length === 3) return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
      return iso;
    }
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return iso;
  }
}
