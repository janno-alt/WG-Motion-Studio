import { ScreenHeader } from "@/components/ScreenHeader";

export function PresetsScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Presets" />
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Presets — phase 3 &amp; 6.
      </div>
    </div>
  );
}
