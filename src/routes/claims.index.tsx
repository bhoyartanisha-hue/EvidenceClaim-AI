import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { claimsQueryOptions, formatDate, formatMoney } from "@/lib/api";
import type { ClaimStatus } from "@/lib/types";
import { RiskBadge, StatusBadge } from "@/components/StatusBadge";

const STATUS_FILTERS: Array<ClaimStatus | "All"> = [
  "All",
  "In Review",
  "Needs Info",
  "Ready for Decision",
  "Anomaly Detected",
];

export const Route = createFileRoute("/claims/")({
  validateSearch: (search: Record<string, unknown>): { status?: ClaimStatus | "All" } => {
    const s = search["status"];
    return typeof s === "string" ? { status: s as ClaimStatus | "All" } : {};
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(claimsQueryOptions),
  head: () => ({
    meta: [
      { title: "Claims — ClaimIQ" },
      {
        name: "description",
        content: "All claims in the ClaimIQ pipeline with status and risk indicators.",
      },
      { property: "og:title", content: "Claims — ClaimIQ" },
      {
        property: "og:description",
        content: "All claims in the ClaimIQ pipeline with status and risk indicators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8">{error instanceof Error ? error.message : String(error)}</div>
  ),
  component: ClaimsPage,
});

function ClaimsPage() {
  const { data: claims } = useSuspenseQuery(claimsQueryOptions);
  const { status = "All" } = Route.useSearch();
  const filtered = status === "All" ? claims : claims.filter((c) => c.status === status);
  const navigate = useNavigate({ from: "/claims/" });


  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">Claims</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} of {claims.length} claims shown
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => navigate({ search: { status: s } })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                status === s
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-card text-muted-foreground hover:border-brand hover:text-brand"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-brand-lighter text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-5 py-3 font-semibold">Claim</th>
              <th className="px-5 py-3 font-semibold">Type</th>
              <th className="px-5 py-3 font-semibold">Filed</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Risk</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((claim) => (
              <tr key={claim.id} className="transition-colors hover:bg-brand-lighter">
                <td className="px-5 py-4">
                  <Link
                    to="/claims/$claimId"
                    params={{ claimId: claim.id }}
                    className="font-semibold text-brand hover:underline"
                  >
                    {claim.id}
                  </Link>
                  <p className="text-xs text-muted-foreground">{claim.claimant}</p>
                </td>
                <td className="px-5 py-4 text-foreground">{claim.type}</td>
                <td className="px-5 py-4 text-muted-foreground">{formatDate(claim.dateFiled)}</td>
                <td className="px-5 py-4 font-semibold text-foreground">
                  {formatMoney(claim.amountClaimed)}
                </td>
                <td className="px-5 py-4">
                  <RiskBadge score={claim.riskScore} />
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={claim.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
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
