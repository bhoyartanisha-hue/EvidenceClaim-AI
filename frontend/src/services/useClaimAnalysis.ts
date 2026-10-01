import { useMemo } from "react";

import { DEMO_FALLBACK_ID } from "@/lib/backend";
import { getSessionClaims } from "@/lib/session-claims";
import { mockAnalysisFor, mockClaims } from "@/mocks/analysis";

/** Demo mode: resolves claim + analysis from mocks (incl. claims created this session). */
export function useClaimAnalysis(claimId: string) {
  return useMemo(() => {
    let claim =
      mockClaims.find((c) => c.id === claimId) ??
      getSessionClaims().find((c) => c.id === claimId) ??
      null;
    // Built-in demo replay claim used when the backend is unavailable.
    if (!claim && claimId === DEMO_FALLBACK_ID) {
      const base = mockClaims.find((c) => c.riskScore >= 35) ?? mockClaims[0];
      if (base) claim = { ...base, id: DEMO_FALLBACK_ID };
    }
    const analysis = claim ? mockAnalysisFor(claimId, claim) : null;
    return { claim, analysis };
  }, [claimId]);
}
