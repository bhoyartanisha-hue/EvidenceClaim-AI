import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { EvidenceDrawerProvider } from "@/components/EvidenceDrawer";
import { DataSourcePill } from "@/components/DataSourcePill";
import { Toaster } from "@/components/ui/sonner";
import { DataSourceProvider } from "@/services/dataSource";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-navy">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ClaimIQ — AI Claims Intelligence" },
      {
        name: "description",
        content:
          "ClaimIQ is an AI decision-support prototype for insurance claims: a 7-agent pipeline that turns claim documents into evidence-backed recommendations for human adjusters.",
      },
      { name: "author", content: "ClaimIQ" },
      { property: "og:title", content: "ClaimIQ — AI Claims Intelligence" },
      {
        property: "og:description",
        content:
          "A 7-agent AI pipeline that turns claim documents into evidence-backed recommendations for human adjusters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const navLinkClass =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";

function AppNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-navy-light bg-navy">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand">
            <ShieldCheck className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-xl font-bold text-white">ClaimIQ</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className={navLinkClass}
            activeProps={{ className: `${navLinkClass} bg-navy-light text-white` }}
            inactiveProps={{ className: `${navLinkClass} text-white/70 hover:text-white` }}
          >
            Dashboard
          </Link>
          <Link
            to="/new-claim"
            className={navLinkClass}
            activeProps={{ className: `${navLinkClass} bg-navy-light text-white` }}
            inactiveProps={{ className: `${navLinkClass} text-white/70 hover:text-white` }}
          >
            New Claim
          </Link>
          <Link
            to="/review"
            className={navLinkClass}
            activeProps={{ className: `${navLinkClass} bg-navy-light text-white` }}
            inactiveProps={{ className: `${navLinkClass} text-white/70 hover:text-white` }}
          >
            Review Queue
          </Link>
          <span className="ml-2"><DataSourcePill /></span>
          <Link
            to="/claim/$id"
            params={{ id: "CLM-1001" }}
            search={{ run: 1 }}
            className="ml-2 rounded-md border border-white/15 bg-navy-deep px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
          >
            Load Demo Claim
          </Link>
        </nav>
      </div>
    </header>
  );
}

function AppFooter() {
  return (
    <footer className="border-t border-navy-light bg-navy">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
            <span className="font-display text-lg font-bold text-white">ClaimIQ</span>
          </div>
          <p className="text-xs text-white/50">TECHNOVA '26 · AI Claims Intelligence</p>
        </div>
        <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/60">
          ClaimIQ is an AI decision-support prototype. Outputs are not legally binding insurance
          decisions.
        </p>
      </div>
    </footer>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <DataSourceProvider>
        <div className="flex min-h-screen flex-col">
          <AppNav />
          <main className="flex-1">
            <EvidenceDrawerProvider><Outlet /></EvidenceDrawerProvider>
          </main>
          <AppFooter />
        </div>
        <Toaster />
      </DataSourceProvider>
    </QueryClientProvider>
  );
}
