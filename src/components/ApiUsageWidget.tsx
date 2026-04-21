import { useEffect } from "react";

import { useAppStore } from "@/state/appStore";
import { useUsageStore } from "@/state/usageStore";
import { formatUsd } from "@/lib/pricing";

interface Props {
  collapsed: boolean;
}

/**
 * Sidebar footer widget showing month-to-date API spend vs. configured budget.
 * Queries `api_usage` via the Rust `get_usage_since` command.
 */
export function ApiUsageWidget({ collapsed }: Props) {
  const budgetUsd = useAppStore((s) => s.monthlyBudgetUsd);
  const { summary, refresh } = useUsageStore();

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const spendUsd = summary?.totalCostUsd ?? 0;
  const percent = budgetUsd > 0 ? Math.min(100, (spendUsd / budgetUsd) * 100) : 0;
  const over = spendUsd > budgetUsd && budgetUsd > 0;

  if (collapsed) {
    return (
      <div className="flex h-12 items-center justify-center px-2">
        <div
          className="flex h-8 w-1 flex-col-reverse overflow-hidden rounded-full bg-surface-3"
          title={`${formatUsd(spendUsd)} / ${formatUsd(budgetUsd)} this month`}
        >
          <div
            className={over ? "w-full bg-danger" : "w-full bg-accent-primary"}
            style={{ height: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between text-2xs">
        <span className="text-text-muted">API usage · MTD</span>
        <span className="font-mono text-text-secondary">
          {formatUsd(spendUsd)} / {formatUsd(budgetUsd)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={[
            "h-full transition-[width] duration-[200ms] ease-out-expo",
            over ? "bg-danger" : "bg-accent-primary",
          ].join(" ")}
          style={{ width: `${percent}%` }}
        />
      </div>
      {summary ? (
        <div className="mt-1.5 flex justify-between text-2xs text-text-muted">
          <span>Claude {formatUsd(summary.anthropicCostUsd)}</span>
          <span>Gemini {formatUsd(summary.geminiCostUsd)}</span>
        </div>
      ) : null}
    </div>
  );
}
