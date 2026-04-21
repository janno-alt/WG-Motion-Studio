import { ScreenHeader } from "@/components/ScreenHeader";

export function PlanReviewScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Plan review" />
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Plan review — phase 2.
      </div>
    </div>
  );
}
