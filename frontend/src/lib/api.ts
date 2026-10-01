import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { DEMO_CLAIMS } from "./demo-data";
import { getSessionClaims } from "./session-claims";
import type { Claim } from "./types";

const BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined ?? "").replace(/\/$/, "");

export function mapBackendClaim(c: Record<string, unknown>): Claim {
  const typeMap: Record<string, "Auto" | "Home" | "Health" | "Life"> = {
    vehicle_accident: "Auto",
    property_damage: "Home",
    health: "Health",
    life: "Life",
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
  };
}

function allClaims(): Claim[] {
  return [...getSessionClaims(), ...DEMO_CLAIMS];
}

async function getClaims(): Promise<Claim[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BASE}/api/claims`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const live = data.map(mapBackendClaim);
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
      return mapBackendClaim(data);
    }
  } catch {
    // Fall back
  }
  const claim = allClaims().find((c) => c.id === id);
  if (!claim) throw notFound();
  return claim;
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

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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
