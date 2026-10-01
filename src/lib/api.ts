import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { DEMO_CLAIMS } from "./demo-data";
import { getSessionClaims } from "./session-claims";
import type { Claim } from "./types";

const BASE = import.meta.env["VITE_API_BASE_URL"] as string | undefined;

function allClaims(): Claim[] {
  return [...getSessionClaims(), ...DEMO_CLAIMS];
}

async function getClaims(): Promise<Claim[]> {
  if (BASE) {
    const res = await fetch(`${BASE}/claims`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }
  return allClaims();
}

async function getClaim(id: string): Promise<Claim> {
  if (BASE) {
    const res = await fetch(`${BASE}/claims/${encodeURIComponent(id)}`);
    if (res.status === 404) throw notFound();
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
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
