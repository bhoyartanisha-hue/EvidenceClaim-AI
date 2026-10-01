import { ChevronDown, HelpCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { API_BASE } from "@/lib/backend";
import { useDataSource } from "@/services/dataSource";

export function DataSourcePill() {
  const { mode, backendUp, forceDemo, setForceDemo, recheck } = useDataSource();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = mode === "live" ? "Live API" : mode === "checking" ? "Checking…" : "Demo mode";
  const dot = mode === "live" ? "bg-emerald-400" : mode === "checking" ? "bg-white/50" : "bg-amber-400";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-xl border bg-card p-4 text-sm text-foreground shadow-xl">
          <p className="font-semibold text-navy">Data source</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Backend at <span className="font-mono">{API_BASE}</span>:{" "}
            <span className={backendUp ? "text-emerald-700" : "text-amber-700"}>{backendUp ? "reachable" : "not reachable"}</span>
          </p>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-sm font-medium">Force demo mode</span>
            <input type="checkbox" checked={forceDemo} onChange={(e) => setForceDemo(e.target.checked)} className="h-4 w-4 accent-brand" />
          </label>
          <button onClick={recheck} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
            <RefreshCw className="h-3 w-3" /> Check connection again
          </button>
          <details className="mt-3 rounded-lg border px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-navy">
              <HelpCircle className="h-3.5 w-3.5" /> Connection help
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Backend not reachable. Start it with{" "}
              <code className="rounded bg-muted px-1">uvicorn main:app --reload --port 8000</code>. If this preview is
              served over https and your browser blocks http://localhost, run the frontend locally with{" "}
              <code className="rounded bg-muted px-1">npm run dev</code>.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
