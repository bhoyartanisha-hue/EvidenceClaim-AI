import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Loader2, Upload, X } from "lucide-react";

import { PIPELINE_AGENTS } from "@/lib/demo-data";
import { addSessionClaim, nextClaimId } from "@/lib/session-claims";
import type { AgentResult, Claim, ClaimType } from "@/lib/types";

const TYPES: ClaimType[] = ["Auto", "Home", "Health", "Life"];

const DEMO_PRESET = {
  claimant: "Rohan Mehta",
  policyNumber: "POL-AU-77123",
  type: "Auto" as ClaimType,
  dateFiled: new Date().toISOString().slice(0, 10),
  amountClaimed: "5600",
  summary:
    "Front bumper and headlight damage from a parking-lot collision; repair estimate attached.",
  docs: ["claim_form.pdf", "repair_estimate.pdf", "incident_photo_1.jpg"],
};

export const Route = createFileRoute("/new-claim")({
  head: () => ({
    meta: [
      { title: "New Claim — ClaimIQ" },
      {
        name: "description",
        content:
          "Submit a new insurance claim: enter the claim details, attach supporting documents and run the 7-agent AI analysis.",
      },
      { property: "og:title", content: "New Claim — ClaimIQ" },
      {
        property: "og:description",
        content:
          "Submit a new insurance claim: enter the claim details, attach supporting documents and run the 7-agent AI analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewClaimPage,
});

function NewClaimPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [claimant, setClaimant] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [type, setType] = useState<ClaimType>("Auto");
  const [dateFiled, setDateFiled] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState("");
  const [docs, setDocs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step1Valid =
    claimant.trim().length > 1 &&
    policyNumber.trim().length > 2 &&
    Number(amount) > 0 &&
    summary.trim().length > 5;

  function loadDemo() {
    setClaimant(DEMO_PRESET.claimant);
    setPolicyNumber(DEMO_PRESET.policyNumber);
    setType(DEMO_PRESET.type);
    setDateFiled(DEMO_PRESET.dateFiled);
    setAmount(DEMO_PRESET.amountClaimed);
    setSummary(DEMO_PRESET.summary);
    setDocs([...DEMO_PRESET.docs]);
    setStep(2);
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    setDocs((prev) => [...prev, ...Array.from(files).map((f) => f.name)]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const claim: Claim = {
      id: nextClaimId(),
      claimant: claimant.trim(),
      policyNumber: policyNumber.trim(),
      type,
      dateFiled,
      amountClaimed: Math.round(Number(amount)),
      status: "In Review",
      riskScore: 20,
      summary: summary.trim(),
      agents: PIPELINE_AGENTS.map<AgentResult>((a) => ({
        agent: a.key,
        name: a.name,
        status: "pending",
        decision: "Awaiting analysis",
        reason: "Run the AI analysis to populate this step.",
        evidence: "—",
        source: { document: "Not submitted", page: null },
        confidence: 0,
      })),
    };
    try {
      addSessionClaim(claim);
      await queryClient.invalidateQueries({ queryKey: ["claims"] });
      await navigate({ to: "/claim/$id", params: { id: claim.id }, search: { run: 1 } });
    } catch {
      setError("Something went wrong while creating the claim. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-navy">New Claim</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Submit a claim and run the 7-agent AI analysis on it.
      </p>

      <ol className="mt-8 flex items-center gap-3" aria-label="Progress">
        {[
          { n: 1 as const, label: "Claim details" },
          { n: 2 as const, label: "Documents" },
        ].map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                step >= s.n
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {step > s.n ? <Check className="h-4 w-4" /> : s.n}
            </span>
            <span
              className={`text-sm font-semibold ${step >= s.n ? "text-navy" : "text-muted-foreground"}`}
            >
              {s.label}
            </span>
            {i === 0 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {step === 1 ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Claimant name">
              <input
                value={claimant}
                onChange={(e) => setClaimant(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className={inputClass}
              />
            </Field>
            <Field label="Policy number">
              <input
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder="e.g. POL-AU-88213"
                className={inputClass}
              />
            </Field>
            <Field label="Claim type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ClaimType)}
                className={inputClass}
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Date filed">
              <input
                type="date"
                value={dateFiled}
                onChange={(e) => setDateFiled(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Amount claimed (USD)">
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 4200"
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="What happened?">
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  placeholder="Describe the incident in a sentence or two."
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button
                onClick={() => step1Valid && setStep(2)}
                disabled={!step1Valid}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue to documents
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={loadDemo}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-light"
              >
                Load Demo Claim
              </button>
              {!step1Valid && (
                <p className="text-xs text-muted-foreground">
                  Fill in the name, policy number, amount and description to continue.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFiles(e.dataTransfer.files);
              }}
              className="rounded-xl border-2 border-dashed border-border bg-brand-lighter px-6 py-10 text-center"
            >
              <Upload className="mx-auto h-8 w-8 text-brand" />
              <p className="mt-3 text-sm font-semibold text-navy">
                Drag documents here, or
              </p>
              <button
                onClick={() => fileInput.current?.click()}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
              >
                Browse files
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Claim forms, invoices, reports and photos (demo only — files are not uploaded).
              </p>
            </div>

            {docs.length > 0 && (
              <ul className="mt-4 space-y-2">
                {docs.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm text-navy">
                      <FileText className="h-4 w-4 text-brand" />
                      {name}
                    </span>
                    <button
                      onClick={() => setDocs((prev) => prev.filter((d) => d !== name))}
                      aria-label={`Remove ${name}`}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Submit &amp; run AI analysis
              </button>
              <button
                onClick={() => setStep(1)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <p className="text-xs text-muted-foreground">
                {docs.length} document{docs.length === 1 ? "" : "s"} attached
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
