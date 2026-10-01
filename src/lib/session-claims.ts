import type { Claim } from "./types";

/**
 * Demo-mode store for claims created through the New Claim form.
 * Lives for the browser session only — swap for the FastAPI backend later.
 */
const created: Claim[] = [];

export function addSessionClaim(claim: Claim) {
  created.unshift(claim);
}

export function getSessionClaims(): Claim[] {
  return created;
}

export function nextClaimId(): string {
  const base = 2050 + created.length;
  return `CLM-${base}`;
}
