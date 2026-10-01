import type { AgentResult, Claim, PipelineAgent } from "./types";

export const PIPELINE_AGENTS: PipelineAgent[] = [
  {
    key: "document",
    name: "Document Intake",
    tagline: "Reads every page",
    description:
      "Ingests claim forms, photos, invoices and police or medical reports. Extracts structured fields and flags unreadable or missing documents.",
  },
  {
    key: "policy",
    name: "Policy Retrieval (RAG)",
    tagline: "Finds the fine print",
    description:
      "Retrieves the relevant policy clauses with retrieval-augmented generation, so every coverage statement links back to the exact policy text.",
  },
  {
    key: "coverage",
    name: "Coverage Analysis",
    tagline: "Maps claim to coverage",
    description:
      "Compares the claimed loss against retrieved policy clauses to determine whether the event type, dates and amounts fall within coverage.",
  },
  {
    key: "missing_info",
    name: "Missing Info Check",
    tagline: "Spots the gaps",
    description:
      "Identifies absent documents, unsigned forms or inconsistent fields that would block a fair assessment, and drafts the follow-up request.",
  },
  {
    key: "anomaly",
    name: "Anomaly Detection",
    tagline: "Raises risk indicators",
    description:
      "Scores the claim against historical patterns — timing, amounts, duplicates and document metadata — and surfaces risk indicators for review.",
  },
  {
    key: "assessment",
    name: "Assessment",
    tagline: "Drafts the recommendation",
    description:
      "Combines all upstream findings into a recommended settlement range with a full evidence trail, ready for human judgement.",
  },
  {
    key: "human_review",
    name: "Human Review",
    tagline: "People decide",
    description:
      "A licensed adjuster reviews the AI recommendation, the evidence and every source before any decision is made. The human always has the final word.",
  },
];

const src = (document: string, page: number | null) => ({ document, page });

function makeAgents(overrides: Partial<Record<string, Partial<AgentResult>>>): AgentResult[] {
  const base: AgentResult[] = [
    {
      agent: "document",
      name: "Document Intake",
      status: "complete",
      decision: "All submitted documents parsed successfully",
      reason: "Claim form, repair estimate and incident photos were legible and internally consistent.",
      evidence: "3 documents ingested: FNOL form, repair estimate, 4 photos.",
      source: src("FNOL_Form.pdf", 1),
      confidence: 96,
    },
    {
      agent: "policy",
      name: "Policy Retrieval (RAG)",
      status: "complete",
      decision: "Relevant policy clauses retrieved",
      reason: "Matched the claim to the active policy's coverage and exclusion sections.",
      evidence: "Retrieved Section II (Coverage) and Section IV (Exclusions).",
      source: src("Policy_Document.pdf", 7),
      confidence: 93,
    },
    {
      agent: "coverage",
      name: "Coverage Analysis",
      status: "complete",
      decision: "Event type falls within policy coverage",
      reason: "The reported loss matches a covered peril and occurred within the policy period.",
      evidence: "Loss date inside policy period; peril listed as covered.",
      source: src("Policy_Document.pdf", 8),
      confidence: 90,
    },
    {
      agent: "missing_info",
      name: "Missing Info Check",
      status: "complete",
      decision: "No blocking gaps found",
      reason: "All required fields and supporting documents are present.",
      evidence: "Checklist complete: 12 of 12 required items present.",
      source: src("FNOL_Form.pdf", 2),
      confidence: 88,
    },
    {
      agent: "anomaly",
      name: "Anomaly Detection",
      status: "complete",
      decision: "No significant risk indicators",
      reason: "Claim amount, timing and history are within normal ranges for this policy type.",
      evidence: "Amount within 1.2× median for comparable claims; no duplicates found.",
      source: src("claims_history.csv", null),
      confidence: 85,
    },
    {
      agent: "assessment",
      name: "Assessment",
      status: "complete",
      decision: "Recommend settlement within estimated range",
      reason: "Coverage confirmed, documentation complete, no material risk indicators.",
      evidence: "Recommended range derived from repair estimate and comparable settlements.",
      source: src("Repair_Estimate.pdf", 1),
      confidence: 87,
    },
    {
      agent: "human_review",
      name: "Human Review",
      status: "pending",
      decision: "Awaiting adjuster review",
      reason: "AI recommendation is ready; a licensed adjuster must make the final decision.",
      evidence: "Full evidence trail packaged for review.",
      source: src("ClaimIQ_Report.pdf", null),
      confidence: 100,
    },
  ];
  return base.map((a) => ({ ...a, ...(overrides[a.agent] ?? {}) }));
}

export const DEMO_CLAIMS: Claim[] = [
  {
    id: "CLM-1001",
    claimant: "Rahul Mehta",
    policyNumber: "POL-AU-77120",
    type: "Auto",
    dateFiled: "2026-09-24",
    amountClaimed: 24800,
    status: "Anomaly Detected",
    riskScore: 95,
    summary: "Rear-end collision claim where the repair invoice predates the reported incident.",
    agents: makeAgents({
      anomaly: {
        status: "flagged",
        decision: "Anomaly detected — risk indicators raised",
        reason:
          "The repair invoice is dated four days before the reported incident, and its total exceeds the claimed amount.",
        evidence:
          "Claim form incident date 20/09/2026; repair invoice dated 16/09/2026; invoice total exceeds the claimed amount.",
        source: src("Repair_Invoice.pdf", 1),
        confidence: 81,
      },
      assessment: {
        status: "flagged",
        decision: "Recommend investigation before settlement",
        reason:
          "The timing mismatch between the invoice and the reported incident warrants verification before any payment.",
        evidence: "Investigation recommended per anomaly findings; settlement held pending review.",
        source: src("ClaimIQ_Report.pdf", null),
        confidence: 72,
      },
    }),
  },
  {
    id: "CLM-1002",
    claimant: "Sunita Desai",
    policyNumber: "POL-LF-40876",
    type: "Life",
    dateFiled: "2026-09-25",
    amountClaimed: 14200,
    status: "Needs Info",
    riskScore: 88,
    summary: "Beneficiary claim with a physician statement whose licence number could not be verified.",
    agents: makeAgents({
      missing_info: {
        status: "flagged",
        decision: "Physician statement pending verification",
        reason: "The physician's licence number could not be matched in the registry lookup.",
        evidence: "Registry lookup returned no match for licence on statement.",
        source: src("Physician_Statement.pdf", 2),
        confidence: 77,
      },
      assessment: {
        status: "pending",
        decision: "Assessment paused pending verification",
        reason: "High-value claim requires verified documentation before a recommendation.",
        evidence: "Verification request sent to issuing clinic.",
        source: src("ClaimIQ_Report.pdf", null),
        confidence: 58,
      },
    }),
  },
  {
    id: "CLM-1003",
    claimant: "Vikram Iyer",
    policyNumber: "POL-HE-58234",
    type: "Health",
    dateFiled: "2026-09-26",
    amountClaimed: 4600,
    status: "Ready for Decision",
    riskScore: 33,
    summary: "Outpatient procedure with itemised hospital invoice attached; documentation complete.",
    agents: makeAgents({}),
  },
  {
    id: "CLM-1004",
    claimant: "Meera Nair",
    policyNumber: "POL-HO-33918",
    type: "Home",
    dateFiled: "2026-09-27",
    amountClaimed: 9800,
    status: "Ready for Decision",
    riskScore: 33,
    summary: "Storm damage to roof shingles and guttering; contractor estimate attached.",
    agents: makeAgents({}),
  },
];

/**
 * 0–100 assessment prototype score, shared by the dashboard stat cards and the
 * mock analysis so the two can never disagree.
 */
export function prototypeScore(claim: Claim): number {
  const missing = claim.status === "Needs Info";
  return Math.min(
    100,
    Math.round(claim.riskScore * 0.6 + (missing ? 20 : 0) + (claim.amountClaimed > 10000 ? 15 : 5)),
  );
}

/** True when the pipeline routes the claim to a licensed adjuster instead of fast track. */
export function needsHumanReview(claim: Claim): boolean {
  return claim.riskScore >= 35 || claim.status === "Needs Info" || prototypeScore(claim) >= 40;
}
