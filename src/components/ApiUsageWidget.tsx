interface Props {
  collapsed: boolean;
}

/**
 * Sidebar footer widget showing month-to-date API spend.
 * Dummy values in phase 1 — wired to api_usage table in phase 2.
 */
export function ApiUsageWidget({ collapsed }: Props) {
  // Phase 1 dummy data; replaced by real telemetry in phase 2.
  const spendUsd = 0;
  const budgetUsd = 50;
  const percent = Math.min(100, (spendUsd / budgetUsd) * 100);

  if (collapsed) {
    return (
      <div className="flex h-12 items-center justify-center px-2">
        <div
          className="h-8 w-1 rounded-full bg-surface-3"
          title={`$${spendUsd.toFixed(2)} / $${budgetUsd} this month`}
        >
          <div
            className="w-full rounded-full bg-accent-primary"
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
          ${spendUsd.toFixed(2)} / ${budgetUsd}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full bg-accent-primary transition-[width] duration-[200ms] ease-out-expo"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
