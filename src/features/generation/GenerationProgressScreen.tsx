import { ScreenHeader } from "@/components/ScreenHeader";

export function GenerationProgressScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Generating assets" />
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Generation progress — phase 5.
      </div>
    </div>
  );
}
