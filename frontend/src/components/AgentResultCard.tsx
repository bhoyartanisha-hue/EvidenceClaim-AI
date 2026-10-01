import { AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";

import type { AgentResult } from "@/lib/types";

const statusIcon = {
  complete: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  flagged: <AlertTriangle className="h-4 w-4 text-red-600" />,
  pending: <Clock className="h-4 w-4 text-amber-500" />,
};

const statusLabel = {
  complete: "Complete",
  flagged: "Risk indicator",
  pending: "Pending",
};

export function AgentResultCard({ result, index }: { result: AgentResult; index: number }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-sm font-bold text-brand">
            {index + 1}
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold text-navy">{result.name}</h3>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {statusIcon[result.status]}
              {statusLabel[result.status]} · {result.confidence}% confidence
            </p>
          </div>
        </div>
      </header>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-brand uppercase">Decision</dt>
          <dd className="mt-0.5 font-medium text-foreground">{result.decision}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-brand uppercase">Reason</dt>
          <dd className="mt-0.5 text-muted-foreground">{result.reason}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-brand uppercase">Evidence</dt>
          <dd className="mt-0.5 text-muted-foreground">{result.evidence}</dd>
        </div>
        <div className="rounded-lg bg-brand-lighter px-3 py-2">
          <dt className="text-xs font-semibold tracking-wide text-brand uppercase">Source</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span>
              {result.source.document} ·{" "}
              {result.source.page === null ? "Page: n/a" : `Page ${result.source.page}`}
            </span>
          </dd>
        </div>
      </dl>
    </article>
  );
}
