import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, FileText, Hash, User, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { claimQueryOptions, formatDate, formatMoney } from "@/lib/api";
import { AgentResultCard } from "@/components/AgentResultCard";
import { PipelineTracker } from "@/components/PipelineTracker";
import { RiskBadge, StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/claims/$claimId")({
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData(claimQueryOptions(params.claimId));
  },
  head: () => ({
    meta: [
      { title: "Claim Detail — ClaimIQ" },
      {
        name: "description",
        content:
          "ClaimIQ claim detail: the 7-agent AI pipeline's decisions, reasons, evidence and sources for a single claim.",
      },
      { property: "og:title", content: "Claim Detail — ClaimIQ" },
      {
        property: "og:description",
        content:
          "The 7-agent AI pipeline's decisions, reasons, evidence and sources for a single claim.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold text-navy">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Link to="/claims" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Back to all claims
      </Link>
    </div>
  ),
  notFoundComponent: ClaimNotFound,
  component: ClaimDetail,
});

function ClaimNotFound() {
  const { claimId } = Route.useParams();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold text-navy">Claim not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No claim with ID <span className="font-semibold text-foreground">{claimId}</span> exists in
        the current data. It may have been closed or the link may be incorrect.
      </p>
      <Link to="/claims" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Back to all claims
      </Link>
    </div>
  );
}

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand">
        {icon}
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function ClaimDetail() {
  const params = Route.useParams();
  const { data: claim } = useSuspenseQuery(claimQueryOptions(params.claimId));

  const flagged = claim.agents.filter((a) => a.status === "flagged").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        to="/claims"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> All claims
      </Link>

      {/* Claim header */}
      <header className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-navy">{claim.id}</h1>
              <StatusBadge status={claim.status} />
              <RiskBadge score={claim.riskScore} />
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{claim.summary}</p>
            {flagged > 0 && (
              <p className="mt-2 text-xs font-medium text-red-700">
                {flagged} agent{flagged > 1 ? "s" : ""} raised a risk indicator — review the
                evidence below before deciding.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem icon={<User className="h-4 w-4" />} label="Claimant" value={claim.claimant} />
          <MetaItem
            icon={<Hash className="h-4 w-4" />}
            label="Policy"
            value={claim.policyNumber}
          />
          <MetaItem
            icon={<CalendarDays className="h-4 w-4" />}
            label="Filed"
            value={formatDate(claim.dateFiled)}
          />
          <MetaItem
            icon={<Wallet className="h-4 w-4" />}
            label="Amount claimed"
            value={formatMoney(claim.amountClaimed)}
          />
        </div>
      </header>

      {/* Pipeline tracker */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-navy">Pipeline status</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seven agents analyse the claim in sequence. A licensed adjuster makes the final decision.
        </p>
        <div className="mt-5 overflow-x-auto pb-1">
          <PipelineTracker agents={claim.agents} />
        </div>
      </section>

      {/* Agent results */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-semibold text-navy">Agent findings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each finding follows the evidence-first format: Decision → Reason → Evidence → Source.
        </p>
        <div className="mt-5 grid gap-4">
          {claim.agents.map((result, i) => (
            <AgentResultCard key={result.agent} result={result} index={i} />
          ))}
        </div>
      </section>

      {/* Human review panel */}
      <section className="mt-6 rounded-2xl border border-brand/30 bg-brand-lighter p-6">
        <div className="flex items-center gap-2.5">
          <FileText className="h-5 w-5 text-brand" />
          <h2 className="font-display text-lg font-semibold text-navy">Adjuster decision</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The AI recommendation is complete and packaged with its full evidence trail. This claim
          is now waiting for a licensed adjuster to review the findings above and record a
          decision — the AI never makes the final call.
        </p>
      </section>
    </div>
  );
}
