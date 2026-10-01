import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — ClaimIQ" },
      {
        name: "description",
        content:
          "About ClaimIQ: an AI decision-support prototype for insurance claims, built for TECHNOVA '26.",
      },
      { property: "og:title", content: "About — ClaimIQ" },
      {
        property: "og:description",
        content: "About ClaimIQ: an AI decision-support prototype for insurance claims.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8">{error instanceof Error ? error.message : String(error)}</div>
  ),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand">
          <ShieldCheck className="h-6 w-6 text-white" />
        </span>
        <h1 className="font-display text-4xl font-bold text-navy">About ClaimIQ</h1>
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          ClaimIQ is an <strong className="text-foreground">evidence-first AI prototype</strong>{" "}
          for insurance claims, built for the TECHNOVA '26 AI Agent track. It runs every claim
          through a seven-agent pipeline — from document intake to human review — and shows each
          finding in a fixed format: <strong className="text-foreground">Decision → Reason →
          Evidence → Source</strong>.
        </p>
        <p>
          The point is trust through transparency. An adjuster should never have to take the AI's
          word for anything: every statement links to the document and page it came from, and
          every claim ends with a licensed human making the final decision.
        </p>
        <p>
          This build is a frontend prototype running entirely on demo data. It is designed to
          connect to a claims-analysis service via a configurable API endpoint — no data leaves
          the demo environment until that connection is configured.
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-brand/30 bg-brand-lighter p-6">
        <h2 className="font-display text-lg font-semibold text-navy">
          Responsible-AI commitments
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
          <li>• Every finding cites a source document; unknown pages are shown as "Page: n/a".</li>
          <li>• Risk findings are labelled "anomaly detected" or "risk indicator", never worse.</li>
          <li>• Coverage results are AI assessments, not decisions.</li>
          <li>• A licensed adjuster always makes the final decision.</li>
        </ul>
      </div>

      <p className="mt-10 rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
        ClaimIQ is an AI decision-support prototype. Outputs are not legally binding insurance
        decisions.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          to="/claims"
          className="inline-flex items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
        >
          Explore demo claims
        </Link>
        <Link
          to="/agents"
          className="inline-flex items-center rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          See the pipeline
        </Link>
      </div>
    </div>
  );
}
