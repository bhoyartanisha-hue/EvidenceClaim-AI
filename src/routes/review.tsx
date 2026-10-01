import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, UserCheck } from "lucide-react";

import { claimsQueryOptions, formatDate, formatMoney } from "@/lib/api";
import { mockAnalysisFor } from "@/mocks/analysis";
import type { Analysis } from "@/types/analysis";

const COMPLEXITY_FILTERS = ["All", "High", "Medium", "Low"] as const;
type Complexity = (typeof COMPLEXITY_FILTERS)[number];

type SortKey = "complexity" | "amount" | "newest";

const COMPLEXITY_TONES: Record<Analysis["assessment"]["complexity"], string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Human Review Queue — ClaimIQ" },
      {
        name: "description",
        content:
          "Claims routed to licensed adjusters, ranked by AI-assessed complexity, with the recommended next step for each.",
      },
      { property: "og:title", content: "Human Review Queue — ClaimIQ" },
      {
        property: "og:description",
        content:
          "Claims routed to licensed adjusters, ranked by AI-assessed complexity, with the recommended next step for each.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewQueuePage,
});

interface QueueRow {
  id: string;
  claimant: string;
  type: string;
  dateFiled: string;
  amountClaimed: number;
  route: Analysis["assessment"]["route"];
  complexity: Analysis["assessment"]["complexity"];
  score: number;
  reason: string;
  nextStep: string;
}

function ReviewQueuePage() {
  const { data: claims } = useSuspenseQuery(claimsQueryOptions);
  const [complexity, setComplexity] = useState<Complexity>("All");
  const [sort, setSort] = useState<SortKey>("complexity");

  const rows = useMemo<QueueRow[]>(
    () =>
      claims.flatMap((claim) => {
        const analysis = mockAnalysisFor(claim.id);
        if (!analysis) return [];
        const { assessment, human_review } = analysis;
        return [
          {
            id: claim.id,
            claimant: claim.claimant,
            type: claim.type,
            dateFiled: claim.dateFiled,
            amountClaimed: claim.amountClaimed,
            route: assessment.route,
            complexity: assessment.complexity,
            score: assessment.score,
            reason: assessment.reason,
            nextStep: human_review.next_step,
          },
        ];
      }),
    [claims],
  );

  const inQueue = rows.filter((r) => r.route === "HUMAN REVIEW");
  const filtered =
    complexity === "All"
      ? inQueue
      : inQueue.filter((r) => r.complexity === complexity);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "complexity") return b.score - a.score;
    if (sort === "amount") return b.amountClaimed - a.amountClaimed;
    return b.dateFiled.localeCompare(a.dateFiled);
  });
  const totalValue = sorted.reduce((sum, r) => sum + r.amountClaimed, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
          <UserCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">
            Human Review Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Claims the AI routed to a licensed adjuster, ranked by complexity. The human always
            has the final word.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="In queue" value={String(inQueue.length)} />
        <StatCard
          label="High complexity"
          value={String(inQueue.filter((r) => r.complexity === "High").length)}
        />
        <StatCard label="Total value in queue" value={formatMoney(totalValue)} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {COMPLEXITY_FILTERS.map((c) => (
            <button
              key={c}
              onClick={() => setComplexity(c)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                complexity === c
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-card text-muted-foreground hover:border-brand hover:text-brand"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <option value="complexity">Complexity (high first)</option>
            <option value="amount">Amount (high first)</option>
            <option value="newest">Newest filed</option>
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-brand-lighter text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Claim</th>
              <th className="px-5 py-3 font-semibold">Filed</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Complexity</th>
              <th className="px-5 py-3 font-semibold">Next step</th>
              <th className="px-5 py-3 font-semibold sr-only">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => (
              <tr key={row.id} className="align-top transition-colors hover:bg-brand-lighter">
                <td className="px-5 py-4">
                  <Link
                    to="/claims/$claimId"
                    params={{ claimId: row.id }}
                    className="font-semibold text-brand hover:underline"
                  >
                    {row.id}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {row.claimant} · {row.type}
                  </p>
                </td>
                <td className="px-5 py-4 text-muted-foreground">{formatDate(row.dateFiled)}</td>
                <td className="px-5 py-4 font-semibold tabular-nums text-foreground">
                  {formatMoney(row.amountClaimed)}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${COMPLEXITY_TONES[row.complexity]}`}
                  >
                    {row.complexity} · {row.score}
                  </span>
                </td>
                <td className="max-w-xs px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                  {row.nextStep}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    to="/claim/$id"
                    params={{ id: row.id }}
                    search={{ run: 1 }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-light"
                  >
                    Open analysis
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  No claims match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}
