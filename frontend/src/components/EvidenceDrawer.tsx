import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, FileText, FileX, Quote, X, Gauge, Lightbulb, ClipboardList, Bot } from "lucide-react";
import type { Evidence, PolicyClause } from "@/types/analysis";

export type Tone = "green" | "amber" | "red" | "blue" | "grey";

export interface Finding {
  title: string;
  badge: { label: string; tone: Tone };
  decision: string;
  reason: string;
  evidence: Evidence[];
  comparison?: { left: string; right: string; difference: string };
  clauses?: PolicyClause[];
}

const Ctx = createContext<(f: Finding) => void>(() => {});
export const useEvidenceDrawer = () => useContext(Ctx);

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-brand-light text-brand border-transparent",
  grey: "bg-muted text-muted-foreground border-border",
};

/** DD/MM/YYYY for ISO dates, ₹ grouping for bare numbers; pass-through otherwise. */
export function formatValue(field: string, v: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/amount|total|price|cost/i.test(field) && /^\d+(\.\d+)?$/.test(v)) return `₹${Number(v).toLocaleString("en-IN")}`;
  return v;
}

export function EvidenceDrawerProvider({ children }: { children: ReactNode }) {
  const [finding, setFinding] = useState<Finding | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const open = useCallback((f: Finding) => {
    lastFocus.current = document.activeElement as HTMLElement;
    setFinding(f);
  }, []);
  const close = useCallback(() => {
    setFinding(null);
    lastFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!finding) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [finding, close]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {finding && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 animate-fade-in bg-navy-deep/60 backdrop-blur-sm" onClick={close} aria-hidden />
          <aside role="dialog" aria-modal="true" aria-labelledby="ev-drawer-title"
            className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-background shadow-2xl animate-in slide-in-from-right duration-300">
            <header className="bg-navy-deep px-6 py-5 text-primary-foreground">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">Evidence</p>
                  <h2 id="ev-drawer-title" className="mt-1 font-display text-2xl">{finding.title}</h2>
                  <span className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${TONES[finding.badge.tone]}`}>{finding.badge.label}</span>
                </div>
                <button ref={closeRef} onClick={close} aria-label="Close evidence panel"
                  className="rounded-md p-1.5 text-primary-foreground/80 hover:bg-primary-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <ol className="relative space-y-4 border-l-2 border-brand-light pl-6">
                {[
                  { icon: Gauge, label: "Decision", body: finding.decision },
                  { icon: Lightbulb, label: "Reason", body: finding.reason },
                  { icon: ClipboardList, label: "Evidence", body: `${finding.evidence.length} evidence item${finding.evidence.length === 1 ? "" : "s"} linked` },
                  { icon: FileText, label: "Source", body: [...new Set(finding.evidence.map((e) => e.source_document ?? "Not submitted"))].join(", ") || "n/a" },
                ].map((s) => (
                  <li key={s.label} className="relative">
                    <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-light text-brand"><s.icon className="h-3.5 w-3.5" /></span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
                    <p className="text-sm text-navy">{s.body}</p>
                  </li>
                ))}
              </ol>

              {finding.comparison && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Comparison</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="rounded-xl border bg-card p-3 text-sm text-navy">{finding.comparison.left}</div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-navy">{finding.comparison.right}</div>
                  </div>
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{finding.comparison.difference}</p>
                </section>
              )}

              {finding.clauses?.map((cl) => (
                <blockquote key={cl.section} className="rounded-r-lg border-l-4 border-brand bg-brand-lighter p-3 text-sm">
                  <Quote className="mb-1 h-4 w-4 text-brand" />
                  <p className="italic text-navy">{cl.text}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{cl.section} · {cl.source_document} · Page: {cl.page ?? "n/a"}</p>
                </blockquote>
              ))}

              <section className="space-y-3">
                {finding.evidence.map((e) => <EvidenceCard key={e.id} e={e} />)}
                {finding.evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence items linked.</p>}
              </section>
            </div>

            <footer className="border-t px-6 py-3 text-[11px] text-muted-foreground">
              ClaimIQ is an AI decision-support prototype. Outputs are not legally binding insurance decisions.
            </footer>
          </aside>
        </div>
      )}
    </Ctx.Provider>
  );
}

function EvidenceCard({ e }: { e: Evidence }) {
  const conf = e.confidence ?? 0;
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-navy">
          {e.source_document ? <FileText className="h-4 w-4 text-brand" /> : <FileX className="h-4 w-4 text-amber-600" />}
          {e.source_document ?? "Not submitted"}
        </span>
        <span className="text-xs text-muted-foreground">Page: {e.page ?? "n/a"}</span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-mono text-xs text-muted-foreground">field</dt><dd className="font-mono text-xs text-navy">{e.field}</dd>
        <dt className="font-mono text-xs text-muted-foreground">value</dt><dd className="font-semibold tabular-nums text-navy">{formatValue(e.field, e.value)}</dd>
      </dl>
      {e.description && <p className="mt-2 text-xs text-muted-foreground">{e.description}</p>}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${conf}%` }} /></div>
        <span className="text-xs font-semibold text-navy">{e.confidence != null ? `${conf}%` : "n/a"}</span>
      </div>
      {e.agent && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" /> {e.agent}</p>}
    </article>
  );
}
