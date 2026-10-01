import { DEMO_CLAIMS, needsHumanReview, prototypeScore } from "@/lib/demo-data";
import type { Claim } from "@/lib/types";
import type { Analysis } from "@/types/analysis";

export const mockClaims: Claim[] = DEMO_CLAIMS;

const toDMY = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function mockAnalysisFor(claimId: string, fallback?: Claim): Analysis | null {
  const claim =
    (fallback && fallback.id === claimId ? fallback : undefined) ??
    mockClaims.find((c) => c.id === claimId) ??
    null;
  if (!claim) return null;
  const risky = claim.riskScore >= 35;
  const missing = claim.status === "Needs Info" || claim.agents.some((a) => a.agent === "missing_info" && a.status !== "complete");
  const amount = `₹${claim.amountClaimed.toLocaleString("en-IN")}`;
  const incident = toDMY(claim.dateFiled);
  const isAuto = claim.type === "Auto";
  const d = new Date(claim.dateFiled); d.setDate(d.getDate() - 4);
  const repairDate = toDMY(d.toISOString().slice(0, 10));
  const invoiceAmt = `₹${(claim.amountClaimed + 7000).toLocaleString("en-IN")}`;

  const evidence: Analysis["evidence"] = [
    { id: "ev1", source_document: "claim_form.txt", field: "incident_date", value: incident, page: 1 },
    { id: "ev2", source_document: "claim_form.txt", field: "claim_amount", value: amount, page: 1 },
    { id: "ev3", source_document: "policy.pdf", field: "policy_period", value: "01/01/2026 – 31/12/2026", page: 2 },
    { id: "ev4", source_document: "repair_invoice.pdf", field: "invoice_total", value: risky ? invoiceAmt : amount, page: null },
    { id: "ev7", source_document: "repair_invoice.pdf", field: "repair_date", value: repairDate, page: 1 },
    { id: "ev5", source_document: "policy.pdf", field: "policy_start_date", value: "01/01/2026", page: 2 },
    { id: "ev6", source_document: null, field: "accident_report", value: "Document not provided by claimant", page: null },
  ];

  const META: Record<string, [string, number, string]> = {
    ev1: ["Incident date stated by the claimant on the claim form.", 96, "Document Agent"],
    ev2: ["Total amount claimed on the claim form.", 95, "Document Agent"],
    ev3: ["Policy period of insurance retrieved from the schedule.", 92, "Policy / RAG Agent"],
    ev4: ["Total on the repair invoice from the service centre.", 84, "Document Agent"],
    ev5: ["Policy inception date.", 91, "Policy / RAG Agent"],
    ev6: ["Required document absent from the submission.", 90, "Missing Info Agent"],
    ev7: ["Repair date printed on the repair invoice.", 82, "Document Agent"],
  };
  evidence.forEach((e) => { const m = META[e.id]; if (m) { e.description = m[0]; e.confidence = m[1]; e.agent = m[2]; } });

  const items = [
    { label: "Claim Form", present: true, evidence_id: "ev1" },
    { label: "Policy", present: true, evidence_id: "ev3" },
    { label: "Repair Invoice", present: true, evidence_id: "ev4" },
    missing
      ? { label: "Accident Report", present: false, reason: "Required for incidents above the fast-track threshold; not found in submission.", evidence_id: "ev6" }
      : { label: "Accident Report", present: true },
  ];
  const completeness = Math.round((items.filter((i) => i.present).length / items.length) * 100);

  const anomalies: Analysis["anomalies"] = risky
    ? [
        { type: "timing", description: "Date mismatch: repair invoice is dated before the reported incident.", severity: claim.riskScore >= 60 ? "high" : "medium", confidence: 78, evidence_ids: ["ev1", "ev7"],
          comparison: { left: `Claim Form → Accident Date: ${incident}`, right: `Repair Invoice → Repair Date: ${repairDate}`, difference: "Repair is 4 days before the accident" } },
        { type: "amount", description: "Amount mismatch: invoice total differs from the claimed amount.", severity: "medium", confidence: 64, evidence_ids: ["ev2", "ev4"],
          comparison: { left: `Claim Form → Claim Amount: ${amount}`, right: `Repair Invoice → Invoice Total: ${invoiceAmt}`, difference: "Invoice is ₹7,000 above claim" } },
      ]
    : [];

  const score = prototypeScore(claim);
  const humanReview = needsHumanReview(claim);
  const complexity = score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";

  return {
    claim_id: claim.id,
    evidence,
    documents: [
      {
        name: "claim_form.txt",
        type: "Claim Form",
        confidence: 95,
        extracted_data: {
          claimant: claim.claimant,
          policy_number: claim.policyNumber,
          incident_date: incident,
          claim_amount: amount,
          ...(isAuto ? { vehicle: "Maruti Suzuki Swift · MH12 AB 4521" } : {}),
        },
      },
      { name: "policy.pdf", type: "Policy", confidence: 92, extracted_data: { policy_number: claim.policyNumber, policy_period: "01/01/2026 – 31/12/2026", product: `${claim.type} Comprehensive` } },
      { name: "repair_invoice.pdf", type: "Invoice", confidence: 84, extracted_data: { invoice_total: amount, vendor: "Authorised service centre" } },
    ],
    agents: [
      { key: "document", name: "Document", status: "completed", summary: "3 documents parsed, key fields extracted.", confidence: 94 },
      { key: "policy", name: "Policy / RAG", status: "completed", summary: "2 relevant policy clauses retrieved.", confidence: 91 },
      { key: "coverage", name: "Coverage", status: "completed", summary: "Loss appears within covered perils.", confidence: 87 },
      { key: "missing_info", name: "Missing Info", status: missing ? "warning" : "completed", summary: missing ? "1 required document missing." : "All required documents present.", confidence: 90 },
      { key: "anomaly", name: "Anomaly", status: risky ? "warning" : "completed", summary: risky ? `${anomalies.length} risk indicators detected.` : "No anomaly detected.", confidence: 76 },
      { key: "assessment", name: "Assessment", status: "completed", summary: `${complexity} complexity · prototype score ${score}.`, confidence: 82 },
      { key: "human_review", name: "Human Review", status: humanReview ? "warning" : "completed", summary: humanReview ? "Routed to an adjuster." : "Eligible for fast-track review.", confidence: 88 },
    ],
    coverage: {
      coverage_status: missing ? "insufficient_evidence" : "applicable",
      reason: missing
        ? "The peril is covered, but supporting evidence is incomplete for a full assessment."
        : "The reported loss matches a covered peril and falls within the policy period.",
      confidence: missing ? 68 : 87,
      clauses: [
        { section: "Section II — Coverage", text: `The insurer will indemnify the insured against accidental loss or damage to the insured ${isAuto ? "vehicle" : "property"} during the period of insurance.`, source_document: "policy.pdf", page: 7 },
        { section: "Section IV — Exclusions", text: "Loss arising from wear and tear, mechanical breakdown or consequential loss is excluded.", source_document: "policy.pdf", page: null },
      ],
      evidence_ids: ["ev1", "ev3"],
    },
    missing_info: { completeness, items },
    anomalies,
    assessment: {
      route: humanReview ? "HUMAN REVIEW" : "FAST TRACK",
      complexity,
      score,
      reason: humanReview
        ? "Risk indicators and/or missing documentation mean an adjuster should verify the claim before any decision."
        : "Complete documentation and no risk indicators; suitable for an expedited human review.",
      score_breakdown: [
        { factor: "Risk indicators", points: Math.round(claim.riskScore * 0.6) },
        { factor: "Missing documents", points: missing ? 20 : 0 },
        { factor: "Claim amount", points: claim.amountClaimed > 10000 ? 15 : 5 },
      ],
      evidence_ids: ["ev2", ...(missing ? ["ev6"] : []), ...(risky ? ["ev5"] : [])],
    },
    human_review: {
      summary: `${claim.claimant}'s ${claim.type.toLowerCase()} claim for ${amount} has been analysed by all agents. ${humanReview ? "Some findings need human verification." : "Findings are consistent across documents."}`,
      key_findings: [
        "Policy was active on the incident date",
        "Claimed amount matches the invoice total",
        ...(missing ? ["Accident report not submitted"] : []),
        ...(risky ? ["Timing risk indicator raised — verify circumstances"] : []),
      ],
      next_step: missing
        ? "Request the accident report from the claimant, then re-run the analysis."
        : risky
          ? "Adjuster to verify incident circumstances with the claimant."
          : "Adjuster to confirm findings and proceed with settlement review.",
    },
  };
}
