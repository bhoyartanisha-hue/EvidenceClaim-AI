import type { ClaimStatus } from "@/lib/types";

const styles: Record<ClaimStatus, string> = {
  "In Review": "bg-brand-light text-brand",
  "Needs Info": "bg-amber-50 text-amber-700 border-amber-200",
  "Ready for Decision": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Anomaly Detected": "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function RiskBadge({ score }: { score: number }) {
  const tone =
    score >= 60
      ? "bg-red-50 text-red-700 border-red-200"
      : score >= 35
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      Risk {score}
    </span>
  );
}
