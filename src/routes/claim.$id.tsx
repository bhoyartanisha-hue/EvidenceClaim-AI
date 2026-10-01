import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle, ArrowRight, Bot, Car, CheckCircle2, ChevronDown, Clock, FileSearch, FileText,
  Gauge, Loader2, Play, RotateCcw, Scale, ScanSearch, ShieldCheck, ShieldQuestion, User, UserCheck,
  XCircle, Lightbulb, Quote, ClipboardList, BookOpen, WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { useEvidenceDrawer, type Finding } from "@/components/EvidenceDrawer";
import { useClaimAnalysis } from "@/services/useClaimAnalysis";
import { api, DEMO_FALLBACK_ID, safe, type LiveAnalysis, type LiveClaim } from "@/lib/backend";
import type { AgentKey } from "@/lib/types";
import type { Analysis, Evidence, RunStatus } from "@/types/analysis";

export const Route = createFileRoute("/claim/$id")({
  validateSearch: (s: Record<string, unknown>): { run?: number; live?: number } => ({
    ...(s["run"] !== undefined ? { run: Number(s["run"]) } : {}),
    ...(s["live"] !== undefined ? { live: Number(s["live"]) } : {}),
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Claim Analysis ${params.id} — ClaimIQ` },
      { name: "description", content: "Live 7-agent AI analysis of an insurance claim with evidence-backed findings." },
      { property: "og:title", content: `Claim Analysis ${params.id} — ClaimIQ` },
      { property: "og:description", content: "Live 7-agent AI analysis with Decision → Reason → Evidence → Source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimAnalysisPage,
});

const ICONS: Record<AgentKey, typeof Bot> = {
  document: FileText, policy: BookOpen, coverage: ShieldCheck, missing_info: ClipboardList,
  anomaly: ScanSearch, assessment: Scale, human_review: UserCheck,
};
const ORDER: AgentKey[] = ["document", "policy", "coverage", "missing_info", "anomaly", "assessment", "human_review"];
const NAMES: Record<AgentKey, string> = {
  document: "Document Agent", policy: "Policy / RAG Agent", coverage: "Coverage Agent", missing_info: "Missing Info Agent",
  anomaly: "Anomaly Agent", assessment: "Assessment Agent", human_review: "Human Review Agent",
};
const STEP_MS = 1000;
const POLL_MS = 700;

interface ViewAgent { key: AgentKey; name: string; status: RunStatus; summary?: string | undefined; confidence?: number | undefined }
interface Header { id: string; type: string; claimant: string; summary: string; amount: number | null; status?: string }
interface View {
  header: Header;
  agents: ViewAgent[];
  evidence: Evidence[];
  documents: Analysis["documents"] | null;
  coverage: Analysis["coverage"] | null;
  missing_info: Analysis["missing_info"] | null;
  anomalies: Analysis["anomalies"] | null;
  assessment: Analysis["assessment"] | null;
  human_review: Analysis["human_review"] | null;
}

/** Normalise a (possibly partial) live analysis so nothing downstream throws on missing optional fields. */
function normaliseLive(l: LiveAnalysis): Omit<View, "header"> {
  const evidence = safe(l.evidence, []).map((e) => ({ ...e, page: safe(e.page, null), source_document: safe(e.source_document, null), field: safe(e.field, "—"), value: safe(e.value, "—") }));
  const byKey = new Map(safe(l.agents, []).map((a) => [a.key, a]));
  return {
    agents: ORDER.map((k) => {
      const a = byKey.get(k);
      return { key: k, name: safe(a?.name, NAMES[k]), status: safe(a?.status, "pending"), summary: a?.summary, confidence: a?.confidence };
    }),
    evidence,
    documents: l.documents ? l.documents.map((d) => ({ ...d, extracted_data: safe(d.extracted_data, {}), confidence: safe(d.confidence, 0) })) : null,
    coverage: l.coverage ? { ...l.coverage, clauses: safe(l.coverage.clauses, []).map((c) => ({ ...c, page: safe(c.page, null), source_document: safe(c.source_document, "n/a") })), evidence_ids: safe(l.coverage.evidence_ids, []) } : null,
    missing_info: l.missing_info ? { completeness: safe(l.missing_info.completeness, 0), items: safe(l.missing_info.items, []) } : null,
    anomalies: l.anomalies ? l.anomalies.map((a) => ({ ...a, evidence_ids: safe(a.evidence_ids, []) })) : null,
    assessment: l.assessment ? { ...l.assessment, score_breakdown: safe(l.assessment.score_breakdown, []), evidence_ids: safe(l.assessment.evidence_ids, []) } : null,
    human_review: l.human_review ? { ...l.human_review, key_findings: safe(l.human_review.key_findings, []) } : null,
  };
}

function headerFromLive(id: string, c: LiveClaim | null, docs: Analysis["documents"] | null): Header {
  const ex = docs?.[0]?.extracted_data ?? {};
  const amt = c?.amount_claimed ?? c?.claim_amount;
  return {
    id,
    type: String(c?.claim_type ?? c?.type ?? "Claim"),
    claimant: String(c?.claimant_name ?? c?.claimant ?? ex["claimant"] ?? "Claimant"),
    summary: String(c?.summary ?? c?.description ?? ""),
    amount: typeof amt === "number" ? amt : null,
    ...(c?.status ? { status: String(c.status) } : {}),
  };
}

function useLiveAnalysis(id: string, enabled: boolean) {
  const [data, setData] = useState<LiveAnalysis | null>(null);
  const [claim, setClaim] = useState<LiveClaim | null>(null);
  const [lost, setLost] = useState(false);
  const [done, setDone] = useState(false);
  const fails = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    api.getClaim(id).then((c) => !stop && setClaim(c), () => {});
    const tick = async () => {
      try {
        const a = await api.getAnalysis(id);
        if (stop) return;
        fails.current = 0;
        setData(a);
        if (a.status === "completed" || a.status === "error") { setDone(true); return; }
      } catch {
        fails.current += 1;
        if (fails.current >= 3) { setLost(true); return; }
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [id, enabled]);

  return { data, claim, lost, done };
}

function ClaimAnalysisPage() {
  const { id } = Route.useParams();
  const { run, live } = Route.useSearch();
  const isLive = live === 1;
  const navigate = useNavigate();
  const { claim, analysis } = useClaimAnalysis(id);
  const liveState = useLiveAnalysis(id, isLive);

  // demo: step = index of running agent; 7 = all done
  const [step, setStep] = useState<number>(run === 1 ? 0 : ORDER.length);
  const running = !isLive && step < ORDER.length;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, running]);

  const replay = useCallback(() => {
    if (isLive) navigate({ to: "/claim/$id", params: { id: DEMO_FALLBACK_ID }, search: { run: 1 } });
    else setStep(0);
  }, [isLive, navigate]);
  const switchToDemo = () => navigate({ to: "/claim/$id", params: { id: DEMO_FALLBACK_ID }, search: { run: 1 } });

  let view: View | null = null;
  if (isLive) {
    if (liveState.data) {
      const n = normaliseLive(liveState.data);
      view = { header: headerFromLive(id, liveState.claim, n.documents), ...n };
    }
  } else if (claim && analysis) {
    const doneK = (k: AgentKey) => ORDER.indexOf(k) < step;
    view = {
      header: { id: claim.id, type: claim.type, claimant: claim.claimant, summary: claim.summary, amount: claim.amountClaimed, status: claim.status },
      agents: analysis.agents.map((a, i) => ({
        key: a.key, name: a.name,
        status: i < step ? a.status : i === step ? "running" : "pending",
        ...(i < step ? { summary: a.summary, confidence: a.confidence } : {}),
      })),
      evidence: analysis.evidence,
      documents: doneK("document") ? analysis.documents : null,
      coverage: doneK("coverage") ? analysis.coverage : null,
      missing_info: doneK("missing_info") ? analysis.missing_info : null,
      anomalies: doneK("anomaly") ? analysis.anomalies : null,
      assessment: doneK("assessment") ? analysis.assessment : null,
      human_review: doneK("human_review") ? analysis.human_review : null,
    };
  }

  if (!view) {
    if (isLive && !liveState.lost) {
      return (
        <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="mt-4 text-muted-foreground">Connecting to the analysis service…</p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-navy">{isLive ? "Connection lost" : "Claim not found"}</h1>
        <p className="mt-2 text-muted-foreground">{isLive ? "The analysis service did not respond." : `No claim with ID “${id}”.`}</p>
        <div className="mt-6 flex justify-center gap-4">
          {isLive && <button onClick={switchToDemo} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-primary-foreground">Switch to demo replay</button>}
          <Link to="/claims" className="inline-block self-center text-brand underline">Back to claims</Link>
        </div>
      </div>
    );
  }

  const v = view;
  const finished = v.agents.filter((a) => a.status !== "pending" && a.status !== "running").length;
  const busy = isLive ? !liveState.done && !liveState.lost : running;
  const ev = (ids: string[] | null | undefined) => safe(ids, []).map((i) => v.evidence.find((e) => e.id === i)).filter(Boolean) as Evidence[];
  const docs = safe(v.documents, []);
  const extracted = docs[0]?.extracted_data ?? {};
  // full shape for section cards; each card is only rendered when its own section is non-null
  const full = {
    claim_id: v.header.id, agents: [], evidence: v.evidence, documents: docs,
    coverage: v.coverage, missing_info: v.missing_info, anomalies: safe(v.anomalies, []),
    assessment: v.assessment, human_review: v.human_review,
  } as unknown as Analysis;
  const knownStatuses = ["Approved", "In Review", "Needs Info", "Flagged", "New"];

  return (
    <div className="bg-[#F4F7FB] pb-16">
      {/* Header strip */}
      <section className="bg-navy-deep text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/60">
              Claim analysis · {v.header.type} · {isLive ? "Live API" : "Demo data"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl md:text-5xl">{v.header.id}</h1>
              {!isLive && v.header.status && knownStatuses.includes(v.header.status) && claim && <StatusBadge status={claim.status} />}
              {isLive && v.header.status && <span className="rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-semibold capitalize">{v.header.status}</span>}
            </div>
          </div>
          <div className="flex gap-3">
            {!isLive && (
              <button onClick={replay} disabled={running}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:brightness-110 disabled:opacity-50">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run AI Analysis
              </button>
            )}
            <button onClick={replay}
              className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-foreground/10">
              <RotateCcw className="h-4 w-4" /> {isLive ? "Demo replay" : "Replay analysis"}
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-6 pt-8">
        {isLive && liveState.lost && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" /> Connection lost — showing last known results</span>
            <button onClick={switchToDemo} className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-primary-foreground">Switch to demo replay</button>
          </div>
        )}

        {/* Summary */}
        <Card icon={FileSearch} eyebrow="Claim summary" title={v.header.claimant}>
          {v.header.summary && <p className="text-sm leading-relaxed text-muted-foreground">{v.header.summary}</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Claim amount" value={v.header.amount !== null ? `₹${v.header.amount.toLocaleString("en-IN")}` : (extracted["claim_amount"] ?? "n/a")} />
            <Stat label="Incident date" value={extracted["incident_date"] ?? "n/a"} />
            <Stat label="Claimant" value={extracted["claimant"] ?? v.header.claimant} icon={User} />
            {extracted["vehicle"] && <Stat label="Vehicle" value={extracted["vehicle"]} icon={Car} />}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {docs.map((d) => (
              <span key={d.name} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs">
                <FileText className="h-3.5 w-3.5 text-brand" />{d.name}
                <span className="rounded-full bg-brand-light px-2 py-0.5 font-semibold text-brand">{d.type}</span>
              </span>
            ))}
          </div>
        </Card>

        {/* Workflow */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>Agent workflow</Eyebrow>
            <span className="flex items-center gap-2 text-sm font-medium text-navy">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}{finished} of 7 agents complete
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(finished / 7) * 100}%` }} />
          </div>
          <div className="relative mt-6 grid gap-4 lg:grid-cols-7">
            <div className="absolute left-0 right-0 top-9 hidden h-px bg-border lg:block" />
            {v.agents.map((a) => {
              const st = a.status;
              const Icon = ICONS[a.key] ?? Bot;
              const isErr = st === "error";
              const showSummary = st !== "pending" && st !== "running" && a.summary;
              return (
                <div key={a.key}
                  className={`relative rounded-xl border bg-card p-4 transition ${st === "running" ? "ring-4 ring-teal-400/40 border-teal-400 shadow-[0_0_24px_rgba(45,212,191,0.35)]" : ""} ${st === "pending" ? "border-dashed opacity-70" : ""} ${isErr ? "border-red-400 bg-red-50 ring-2 ring-red-300/50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${isErr ? "bg-red-100 text-red-600" : "bg-brand-light text-brand"}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <RunIcon status={st} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-navy">{a.name}</p>
                  <RunBadge status={st} />
                  {showSummary && (
                    <p className={`mt-2 text-xs ${isErr ? "text-red-700" : "text-muted-foreground"}`}>
                      {a.summary}{typeof a.confidence === "number" && !isErr && <span className="font-semibold text-navy"> · {a.confidence}%</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Recommendation */}
        {v.assessment ? <Recommendation a={full} ev={ev} /> : <Skeleton h="h-72" dark />}

        {/* Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {v.coverage ? <CoverageCard a={full} ev={ev} /> : <Skeleton />}
          {v.missing_info ? <MissingCard a={full} ev={ev} /> : <Skeleton />}
          {v.anomalies ? <AnomalyCard a={full} ev={ev} /> : <Skeleton />}
          {v.human_review ? <ReviewCard a={full} /> : <Skeleton />}
        </div>

        {/* Extracted */}
        {v.documents ? (
          <Card icon={FileText} eyebrow="Extracted data" title="Per-document extraction">
            <div className="space-y-3">
              {docs.map((d) => (
                <details key={d.name} className="group rounded-xl border">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-navy">
                    <span>{d.name} <span className="ml-2 text-xs font-normal text-muted-foreground">{d.type}</span></span>
                    <span className="flex items-center gap-2">
                      <Chip tone="blue">{d.confidence}% confidence</Chip>
                      <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                    </span>
                  </summary>
                  <table className="w-full border-t text-sm">
                    <tbody>
                      {Object.entries(d.extracted_data).map(([k, val]) => (
                        <tr key={k} className="border-b last:border-0">
                          <td className="w-1/3 px-4 py-2 font-mono text-xs text-muted-foreground">{k}</td>
                          <td className="px-4 py-2 text-navy">{String(val)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          </Card>
        ) : <Skeleton />}
      </div>
    </div>
  );
}

/* ---------- Sections ---------- */

type EvFn = (ids: string[]) => Evidence[];

function Recommendation({ a, ev }: { a: Analysis; ev: EvFn }) {
  const s = a.assessment;
  const [open, setOpen] = useState(false);
  const human = s.route === "HUMAN REVIEW";
  const evidence = ev(s.evidence_ids);
  const openDrawer = useEvidenceDrawer();
  const finding: Finding = { title: "AI recommendation (prototype)", badge: { label: s.route, tone: human ? "amber" : "green" }, decision: `${s.route} · ${s.complexity} complexity · prototype score ${s.score}`, reason: s.reason, evidence };
  return (
    <section className="animate-fade-in overflow-hidden rounded-3xl bg-navy p-8 text-primary-foreground shadow-xl">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/60">AI recommendation (prototype)</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`rounded-xl px-4 py-2 text-xl font-bold tracking-wide ${human ? "bg-amber-400 text-navy" : "bg-emerald-400 text-navy"}`}>{s.route}</span>
            <span className="rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-semibold">{s.complexity} complexity</span>
          </div>
          <p className="mt-4 max-w-2xl text-primary-foreground/85">{s.reason}</p>
        </div>
        <ScoreGauge score={s.score} />
      </div>

      <button type="button" onClick={() => openDrawer(finding)} aria-label="Open recommendation evidence" className="mt-8 grid w-full gap-6 rounded-xl border-t text-left transition hover:bg-primary-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 border-primary-foreground/15 pt-6 md:grid-cols-4 md:divide-x md:divide-primary-foreground/15">
        {[
          { icon: Gauge, label: "Decision", body: `${s.route} · ${s.complexity}` },
          { icon: Lightbulb, label: "Reason", body: s.reason },
          { icon: ClipboardList, label: "Evidence", body: `${evidence.length} evidence items linked` },
          { icon: FileText, label: "Source", body: [...new Set(evidence.map((e) => e.source_document ?? "Not submitted"))].join(", ") },
        ].map((c) => (
          <div key={c.label} className="md:px-5 first:md:pl-0">
            <c.icon className="h-5 w-5 text-sky-300" />
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-sky-300">{c.label}</p>
            <p className="mt-1 line-clamp-3 text-sm text-primary-foreground/80">{c.body}</p>
          </div>
        ))}
      </button>

      <button onClick={() => setOpen((o) => !o)} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-300">
        Why this recommendation? <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 animate-fade-in space-y-4">
          <table className="w-full max-w-md text-sm">
            <tbody>
              {s.score_breakdown.map((r) => (
                <tr key={r.factor} className="border-b border-primary-foreground/10">
                  <td className="py-2 text-primary-foreground/80">{r.factor}</td>
                  <td className="py-2 text-right font-semibold">+{r.points}</td>
                </tr>
              ))}
              <tr><td className="py-2 font-semibold">Prototype score</td><td className="py-2 text-right font-bold">{s.score}</td></tr>
            </tbody>
          </table>
          <EvidenceChips items={evidence} dark finding={finding} />
        </div>
      )}
    </section>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} stroke="currentColor" className="text-primary-foreground/15" strokeWidth="10" fill="none" />
        <circle cx="65" cy="65" r={r} stroke="currentColor" className="text-sky-400" strokeWidth="10" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} strokeLinecap="round" transform="rotate(-90 65 65)" />
        <text x="65" y="72" textAnchor="middle" className="fill-current font-display text-3xl">{score}</text>
      </svg>
      <p className="mt-1 max-w-[150px] text-center text-[11px] text-primary-foreground/60">Prototype score, not an official standard</p>
    </div>
  );
}

function CoverageCard({ a, ev }: { a: Analysis; ev: EvFn }) {
  const c = a.coverage;
  const tone = c.coverage_status === "applicable" ? "green" : c.coverage_status === "conflict" ? "red" : "amber";
  const openDrawer = useEvidenceDrawer();
  const finding: Finding = { title: "Policy coverage", badge: { label: c.coverage_status.replace("_", " "), tone }, decision: `Coverage ${c.coverage_status.replace("_", " ")} · ${c.confidence}% confidence`, reason: c.reason, evidence: ev(c.evidence_ids), clauses: c.clauses };
  return (
    <Card icon={ShieldCheck} eyebrow="Coverage · AI assessment (prototype)" title="Policy coverage" anim>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={tone}>{c.coverage_status.replace("_", " ")}</Chip>
        <Chip tone="blue">{c.confidence}% confidence</Chip>
      </div>
      <DRES reason={c.reason} />
      <div className="mt-4 space-y-3">
        {c.clauses.map((cl) => (
          <blockquote key={cl.section} role="button" tabIndex={0} onClick={() => openDrawer({ ...finding, title: cl.section, clauses: [cl] })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDrawer({ ...finding, title: cl.section, clauses: [cl] }))}
            className="cursor-pointer transition hover:ring-2 hover:ring-brand/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-r-lg border-l-4 border-brand bg-brand-lighter p-3 text-sm">
            <Quote className="mb-1 h-4 w-4 text-brand" />
            <p className="italic text-navy">{cl.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">{cl.section} · {cl.source_document} · Page: {cl.page ?? "n/a"}</p>
          </blockquote>
        ))}
      </div>
      <EvidenceChips items={finding.evidence} finding={finding} />
    </Card>
  );
}

function MissingCard({ a, ev }: { a: Analysis; ev: EvFn }) {
  const m = a.missing_info;
  const openDrawer = useEvidenceDrawer();
  const fOf = (i: (typeof m.items)[number]): Finding => ({ title: i.present ? `${i.label} received` : `Missing: ${i.label}`, badge: i.present ? { label: "present", tone: "green" } : { label: "missing", tone: "amber" }, decision: i.present ? "Document present" : "Document required", reason: i.reason ?? (i.present ? "Document found in the submission." : "Not found in submission."), evidence: i.evidence_id ? ev([i.evidence_id]) : [] });
  return (
    <Card icon={ClipboardList} eyebrow="Missing information" title="Document completeness" anim>
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${m.completeness === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${m.completeness}%` }} />
        </div>
        <span className="text-sm font-bold text-navy">{m.completeness}%</span>
      </div>
      <ul className="mt-4 divide-y rounded-xl border">
        {m.items.map((i) => (
          <li key={i.label} role="button" tabIndex={0} onClick={() => openDrawer(fOf(i))} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDrawer(fOf(i)))}
            className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm transition hover:bg-brand-lighter focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {i.present ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
            <div className="flex-1">
              <p className="font-medium text-navy">{i.label}</p>
              {i.reason && <p className="text-xs text-muted-foreground">{i.reason}</p>}
              {!i.present && i.evidence_id && <EvidenceChips items={ev([i.evidence_id])} finding={fOf(i)} />}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AnomalyCard({ a, ev }: { a: Analysis; ev: EvFn }) {
  const icons = { timing: Clock, amount: Gauge, document: FileText, duplicate: ShieldQuestion };
  const openDrawer = useEvidenceDrawer();
  const fOf = (an: Analysis["anomalies"][number]): Finding => ({ title: an.description.split(":")[0] ?? an.description, badge: { label: `${an.severity} severity`, tone: an.severity === "high" ? "red" : an.severity === "medium" ? "amber" : "green" }, decision: `Anomaly detected · ${an.confidence}% confidence`, reason: an.description, evidence: ev(an.evidence_ids), ...(an.comparison ? { comparison: an.comparison } : {}) });
  return (
    <Card icon={ScanSearch} eyebrow="Anomaly detection" title="Anomaly & risk indicators" anim>
      <p className="mb-3 text-xs text-muted-foreground">Indicators only — not a fraud determination.</p>
      {a.anomalies.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> No anomaly detected.</p>
      ) : (
        <ul className="space-y-3">
          {a.anomalies.map((an, i) => {
            const Icon = icons[an.type];
            return (
              <li key={i} role="button" tabIndex={0} onClick={() => openDrawer(fOf(an))} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDrawer(fOf(an)))}
                className="cursor-pointer rounded-xl border p-4 transition hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><Icon className="h-4 w-4" /></span>
                  <div className="flex-1">
                    <p className="text-sm text-navy">{an.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip tone={an.severity === "high" ? "red" : an.severity === "medium" ? "amber" : "green"}>{an.severity} severity</Chip>
                      <Chip tone="blue">{an.confidence}% confidence</Chip>
                    </div>
                    <EvidenceChips items={ev(an.evidence_ids)} finding={fOf(an)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ReviewCard({ a }: { a: Analysis }) {
  const h = a.human_review;
  return (
    <Card icon={UserCheck} eyebrow="Human review" title="Adjuster briefing" anim>
      <p className="text-sm text-muted-foreground">{h.summary}</p>
      <ul className="mt-4 space-y-2">
        {h.key_findings.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-navy"><CheckCircle2 className="mt-0.5 h-4 w-4 text-brand" />{f}</li>
        ))}
      </ul>
      <div className="mt-5 rounded-xl border border-brand/30 bg-brand-light p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand"><ArrowRight className="h-4 w-4" /> Recommended next step</p>
        <p className="mt-1 text-sm font-medium text-navy">{h.next_step}</p>
      </div>
    </Card>
  );
}

/* ---------- Primitives ---------- */

function Card({ icon: Icon, eyebrow, title, children, anim }: { icon: typeof Bot; eyebrow: string; title: string; children: ReactNode; anim?: boolean }) {
  return (
    <section className={`rounded-2xl border bg-card p-6 shadow-sm ${anim ? "animate-fade-in" : ""}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-brand"><Icon className="h-5 w-5" /></span>
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="font-display text-xl text-navy">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{children}</p>
);

function DRES({ reason }: { reason: string }) {
  return <p className="mt-3 text-sm text-navy"><span className="font-semibold">Reason: </span>{reason}</p>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Bot }) {
  return (
    <div className="rounded-xl bg-brand-lighter p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-semibold text-navy">{Icon && <Icon className="h-4 w-4 text-brand" />}{value}</p>
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-brand-light text-brand border-transparent",
  grey: "bg-muted text-muted-foreground border-border",
};
function Chip({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${TONES[tone]}`}>{children}</span>;
}

function EvidenceChips({ items, dark, finding }: { items: Evidence[]; dark?: boolean; finding: Finding }) {
  const openDrawer = useEvidenceDrawer();
  if (!items.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((e) => (
        <button key={e.id} type="button" onClick={(ev) => { ev.stopPropagation(); openDrawer(finding); }} title={`${e.value}${e.source_document ? ` · Page: ${e.page ?? "n/a"}` : ""}`}
          className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${dark ? "border-primary-foreground/25 text-primary-foreground/85 hover:bg-primary-foreground/10" : "border-border bg-card text-navy hover:border-brand hover:text-brand"}`}>
          {e.source_document ? `${e.source_document} · ${e.field}` : `Not submitted · ${e.field}`}
        </button>
      ))}
    </div>
  );
}

function RunIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case "running": return <Loader2 className="h-5 w-5 animate-spin text-teal-500" />;
    case "completed": return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case "warning": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case "error": return <XCircle className="h-5 w-5 text-red-600" />;
    default: return <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />;
  }
}
function RunBadge({ status }: { status: RunStatus }) {
  const tone = { pending: "grey", running: "blue", completed: "green", warning: "amber", error: "red" } as const;
  return <span className="mt-1 inline-block"><Chip tone={tone[status]}>{status}</Chip></span>;
}

function Skeleton({ h = "h-56", dark }: { h?: string; dark?: boolean }) {
  return (
    <div className={`${h} relative overflow-hidden rounded-2xl ${dark ? "bg-navy/90" : "border bg-card"}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent" />
      {!dark && <div className="absolute inset-0 animate-pulse bg-muted/50" />}
    </div>
  );
}
