import { AlertTriangle, Check, Clock } from "lucide-react";

import { PIPELINE_AGENTS } from "@/lib/demo-data";
import type { AgentResult } from "@/lib/types";

export function PipelineTracker({ agents }: { agents: AgentResult[] }) {
  const byKey = new Map(agents.map((a) => [a.agent, a]));
  return (
    <ol className="flex flex-wrap items-center gap-y-4">
      {PIPELINE_AGENTS.map((agent, i) => {
        const result = byKey.get(agent.key);
        const status = result?.status ?? "pending";
        return (
          <li key={agent.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  status === "complete"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                    : status === "flagged"
                      ? "border-red-500 bg-red-50 text-red-600"
                      : "border-amber-400 bg-amber-50 text-amber-500"
                }`}
              >
                {status === "complete" ? (
                  <Check className="h-4 w-4" />
                ) : status === "flagged" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
              </span>
              <span className="w-20 text-center text-[11px] leading-tight font-medium text-muted-foreground">
                {agent.name}
              </span>
            </div>
            {i < PIPELINE_AGENTS.length - 1 && (
              <span className="mx-1 mb-5 h-0.5 w-6 bg-border sm:w-10" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
