import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Search,
  ShieldCheck,
  UserCheck,
  Upload,
} from "lucide-react";

import { PIPELINE_AGENTS } from "@/lib/demo-data";

const agentIcons = [Upload, Search, ShieldCheck, AlertTriangle, Bot, CheckCircle2, UserCheck];

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents Pipeline — ClaimIQ" },
      {
        name: "description",
        content:
          "The seven ClaimIQ agents: document intake, policy retrieval, coverage analysis, missing info, anomaly detection, assessment and human review.",
      },
      { property: "og:title", content: "Agents Pipeline — ClaimIQ" },
      {
        property: "og:description",
        content:
          "The seven ClaimIQ agents: document intake, policy retrieval, coverage analysis, missing info, anomaly detection, assessment and human review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8">{error instanceof Error ? error.message : String(error)}</div>
  ),
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <div>
      {/* Navy hero band */}
      <section className="bg-navy">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold tracking-widest text-brand-light uppercase">
            The 7-agent pipeline
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold text-white sm:text-5xl">
            Seven specialists. One evidence trail.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70">
            Each agent does one job and cites its sources. Their findings flow downstream, so the
            final recommendation always traces back to the documents it came from.
          </p>
        </div>
      </section>

      {/* Agent cards */}
      <section className="mx-auto -mt-8 max-w-7xl px-4 pb-16 sm:px-6">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_AGENTS.map((agent, i) => {
            const Icon = agentIcons[i] ?? Bot;
            return (
              <li
                key={agent.key}
                className={`rounded-xl border border-border bg-card p-6 shadow-sm ${
                  agent.key === "human_review" ? "border-brand/40 bg-brand-lighter" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light text-brand">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">
                    Step {i + 1}/7
                  </span>
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-navy">
                  {agent.name}
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-brand">{agent.tagline}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {agent.description}
                </p>
              </li>
            );
          })}
          <li className="flex flex-col items-start justify-center rounded-xl border border-dashed border-brand/50 bg-card p-6">
            <h2 className="font-display text-xl font-semibold text-navy">See it in action</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Open a claim to watch the pipeline's decisions, evidence and sources side by side.
            </p>
            <Link
              to="/claims"
              className="mt-4 inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
            >
              Browse claims
            </Link>
          </li>
        </ol>
      </section>

      {/* Legend */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-navy">How to read the pipeline</h2>
          <ul className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Complete — finding
              backed by evidence
            </li>
            <li className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> Risk indicator — needs
              adjuster attention
            </li>
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-amber-500" /> Pending — waiting on upstream
              results or a human
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
