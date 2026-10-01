import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Car,
  CheckCircle2,
  FileCheck2,
  FileText,
  Gauge,
  Headset,
  HeartPulse,
  Home,
  Lock,
  Mail,
  ScanSearch,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { claimsQueryOptions, formatDate, formatMoney } from "@/lib/api";
import { PIPELINE_AGENTS, needsHumanReview, prototypeScore } from "@/lib/demo-data";
import { RiskBadge, StatusBadge } from "@/components/StatusBadge";
import heroFamily from "@/assets/hero-family.jpg";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(claimsQueryOptions),
  head: () => ({
    meta: [
      { title: "Dashboard — ClaimIQ" },
      {
        name: "description",
        content:
          "ClaimIQ dashboard: claim volumes, risk indicators and the 7-agent AI pipeline at a glance.",
      },
      { property: "og:title", content: "Dashboard — ClaimIQ" },
      {
        property: "og:description",
        content:
          "ClaimIQ dashboard: claim volumes, risk indicators and the 7-agent AI pipeline at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8">{error instanceof Error ? error.message : String(error)}</div>
  ),
  component: Dashboard,
});

function HeroStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-brand-accent">
        {icon}
      </span>
      <div>
        <p className="text-sm font-bold text-white">{value}</p>
        <p className="text-[11px] text-white/60">{label}</p>
      </div>
    </div>
  );
}

const CLAIM_TYPES = [
  { icon: Car, name: "Auto Insurance", desc: "Reliable coverage for you and your vehicle on the road." },
  { icon: Home, name: "Home Insurance", desc: "Protect your home and belongings from life's unexpected events." },
  { icon: HeartPulse, name: "Health Insurance", desc: "Quality healthcare coverage for you and your family." },
  { icon: Users, name: "Life Insurance", desc: "Secure your family's future with financial protection." },
];

const PIPELINE_FEATURES = [
  { icon: UserCheck, name: "Personalized Coverage", desc: "Tailored insurance plans that fit your unique needs and budget." },
  { icon: FileText, name: "Fast & Easy Claims", desc: "Simple claims process with quick settlements when you need it most." },
  { icon: Headset, name: "Expert Support", desc: "Our insurance experts are here to guide you at every step." },
  { icon: ShieldCheck, name: "Strong & Reliable", desc: "Backed by financial strength and years of industry experience." },
];

function Dashboard() {
  const { data: claims } = useSuspenseQuery(claimsQueryOptions);
  const reviewCount = claims.filter(needsHumanReview).length;
  const investigationCount = claims.filter((c) => c.status === "Anomaly Detected").length;
  const avgScore = Math.round(claims.reduce((s, c) => s + prototypeScore(c), 0) / claims.length);

  return (
    <div>
      {/* Hero — photo background with navy overlay */}
      <section className="relative">
        <img
          src={heroFamily}
          alt="Family in front of their home at dusk"
          className="absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={1088}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/40" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pt-16 pb-14 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-semibold tracking-widest text-brand-accent uppercase">
              Protect what matters most
            </p>
            <h1 className="mt-3 max-w-xl font-display text-4xl font-bold text-white sm:text-5xl">
              Claims You Can Trust.
              <br />
              <span className="text-brand-accent">Evidence You Can Inspect.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
              ClaimIQ runs each claim through a 7-agent pipeline — from document intake to human
              review — and presents every finding as Decision, Reason, Evidence and Source.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/claim/$id"
                params={{ id: "CLM-1001" }}
                search={{ run: 1 }}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
              >
                Load Demo Claim <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/new-claim"
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                New Claim <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
              <HeroStat icon={<FileCheck2 className="h-4 w-4" />} value={String(claims.length)} label="Total claims" />
              <HeroStat icon={<UserCheck className="h-4 w-4" />} value={String(reviewCount)} label="Need human review" />
              <HeroStat icon={<ScanSearch className="h-4 w-4" />} value={String(investigationCount)} label="Investigation required" />
              <HeroStat icon={<Gauge className="h-4 w-4" />} value={String(avgScore)} label="Avg prototype score" />
            </div>
          </div>

          {/* Quote-style card */}
          <div className="self-start rounded-2xl bg-card p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-navy">Run a Demo Analysis</h2>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {CLAIM_TYPES.map((t, i) => (
                <div
                  key={t.name}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-3 ${
                    i === 0 ? "border-brand bg-brand-lighter" : "border-border"
                  }`}
                >
                  <t.icon className="h-5 w-5 text-brand" />
                  <span className="text-[11px] font-medium text-foreground">{t.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground">
                Claim ID — CLM-1001
              </div>
              <div className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground">
                Policy — POL-AU-77120
              </div>
              <div className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground">
                Claimant — Rahul Mehta
              </div>
            </div>
            <Link
              to="/claim/$id"
              params={{ id: "CLM-1001" }}
              search={{ run: 1 }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
            >
              Run the 7-Agent Pipeline <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>It only takes 2 minutes!</span>
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Secure & Private
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Claim type cards */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">
            Insurance for every stage of life
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-navy">Our Insurance Solutions</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Comprehensive coverage options designed to protect you and your loved ones.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CLAIM_TYPES.map((t) => (
            <div key={t.name} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand/30 text-brand">
                <t.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-navy">{t.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
              <Link to="/claims" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                Learn More <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Navy feature band */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-2xl bg-navy px-6 py-12 sm:px-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="text-xs font-semibold tracking-widest text-brand-accent uppercase">
                We've got you covered
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-white">
                Helping You Through Life's Uncertainties
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                From everyday risks to life's biggest moments, we're here to protect you every step of the way.
              </p>
              <Link
                to="/agents"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
              >
                Why Choose Us <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_FEATURES.map((f) => (
                <div key={f.name}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-brand-accent">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-white">{f.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Dual action cards */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-navy">Need to File a Claim?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We're here to make the process simple and stress-free.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /> Quick claim initiation</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /> Track your claim in real-time</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /> Get support 24/7</li>
          </ul>
          <Link
            to="/new-claim"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
          >
            File a Claim <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-navy">Already Reviewing?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Access the review queue and manage pending claims anytime.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /> View flagged claims</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /> Inspect agent evidence</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand" /> Approve or escalate decisions</li>
          </ul>
          <Link
            to="/review"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
          >
            Open Review Queue <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Recent claims */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="rounded-2xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display text-xl font-semibold text-navy">Recent claims</h2>
            <Link to="/claims" className="text-sm font-semibold text-brand hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {claims.slice(0, 4).map((claim) => (
              <li key={claim.id}>
                <Link
                  to="/claims/$claimId"
                  params={{ claimId: claim.id }}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 transition-colors hover:bg-brand-lighter"
                >
                  <div className="min-w-40">
                    <p className="text-sm font-semibold text-foreground">{claim.id}</p>
                    <p className="text-xs text-muted-foreground">{claim.claimant}</p>
                  </div>
                  <div className="min-w-32">
                    <p className="text-sm text-foreground">{claim.type}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(claim.dateFiled)}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatMoney(claim.amountClaimed)}
                  </p>
                  <div className="ml-auto flex items-center gap-2">
                    <RiskBadge score={claim.riskScore} />
                    <StatusBadge status={claim.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pipeline strip */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">
            How ClaimIQ works
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-navy">
            A 7-agent pipeline, evidence first
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Each agent does one job and cites its sources. Nothing reaches an adjuster without a
            visible evidence trail.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_AGENTS.slice(0, 4).map((agent, i) => (
            <div key={agent.key} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-brand">
                <Bot className="h-5 w-5" />
              </span>
              <p className="mt-3 text-xs font-semibold text-brand">Agent {i + 1}</p>
              <h3 className="font-display text-lg font-semibold text-navy">{agent.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{agent.tagline}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link to="/agents" className="text-sm font-semibold text-brand hover:underline">
            Explore all seven agents →
          </Link>
        </div>
      </section>

      {/* Newsletter band */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-brand-lighter px-6 py-6 sm:flex-row sm:px-10">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-brand" />
            <div>
              <p className="font-display text-lg font-semibold text-navy">Stay Protected. Stay Informed.</p>
              <p className="text-xs text-muted-foreground">Subscribe to get helpful insurance tips and exclusive offers.</p>
            </div>
          </div>
          <div className="flex w-full max-w-md gap-2">
            <input
              type="email"
              placeholder="Enter your email address"
              className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90">
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
