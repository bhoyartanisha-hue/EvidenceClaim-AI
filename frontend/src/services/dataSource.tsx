import { useNavigate } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api, DEMO_FALLBACK_ID } from "@/lib/backend";

export type DataMode = "checking" | "live" | "demo";

interface Ctx {
  mode: DataMode;
  backendUp: boolean;
  forceDemo: boolean;
  setForceDemo: (v: boolean) => void;
  recheck: () => void;
}

const DataSourceContext = createContext<Ctx | null>(null);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [forceDemo, setForceDemo] = useState(false);

  const recheck = useCallback(() => {
    api.health().then(() => setBackendUp(true), () => setBackendUp(false));
  }, []);

  useEffect(() => {
    recheck();
    const t = setInterval(recheck, 15000);
    return () => clearInterval(t);
  }, [recheck]);

  const mode: DataMode = forceDemo ? "demo" : backendUp === null ? "checking" : backendUp ? "live" : "demo";
  return (
    <DataSourceContext.Provider value={{ mode, backendUp: !!backendUp, forceDemo, setForceDemo, recheck }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSource(): Ctx {
  const ctx = useContext(DataSourceContext);
  if (!ctx) throw new Error("useDataSource must be used inside DataSourceProvider");
  return ctx;
}

/** "Load Demo Claim": live backend when available, built-in demo otherwise. */
export function useRunDemoClaim() {
  const { mode } = useDataSource();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const goDemo = useCallback(
    (notify: boolean) => {
      if (notify) toast("Backend unavailable — running built-in demo analysis.");
      return navigate({ to: "/claim/$id", params: { id: DEMO_FALLBACK_ID }, search: { run: 1 } });
    },
    [navigate],
  );

  const run = useCallback(async () => {
    if (mode !== "live") return goDemo(false);
    setBusy(true);
    try {
      const { claim } = await api.loadDemo();
      if (!claim?.id) throw new Error("No claim returned");
      await api.analyze(claim.id);
      await navigate({ to: "/claim/$id", params: { id: claim.id }, search: { live: 1 } });
    } catch {
      await goDemo(true);
    } finally {
      setBusy(false);
    }
  }, [mode, goDemo, navigate]);

  return { run, busy };
}
