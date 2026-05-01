import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useAppStore } from "@/state/appStore";
import { SettingsSection } from "./SettingsSection";

const formatUsd = (usd: number) =>
  usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function BudgetSection() {
  const { monthlyBudgetUsd, setMonthlyBudget } = useAppStore();
  const [draft, setDraft] = useState(String(monthlyBudgetUsd));

  const save = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a non-negative number.");
      return;
    }
    setMonthlyBudget(n);
    toast.success(`Monthly budget set to ${formatUsd(n)}`);
  };

  return (
    <SettingsSection
      title="Monthly budget"
      description="Sidebar widget shows month-to-date API spend vs. this cap. Purely informational."
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
            $
          </span>
          <Input
            type="number"
            min={0}
            step={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="pl-5"
          />
        </div>
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </SettingsSection>
  );
}
