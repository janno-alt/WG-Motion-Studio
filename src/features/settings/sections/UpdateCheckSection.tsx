import { SettingsSection } from "./SettingsSection";

export function UpdateCheckSection() {
  return (
    <SettingsSection
      title="Updates"
      description="Manual update check — auto-updater wiring lands in phase 6."
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-text-primary">Current version</div>
          <div className="font-mono text-2xs text-text-muted">0.0.1 · LOCAL</div>
        </div>
        <button
          type="button"
          disabled
          className="rounded-default border border-border-subtle px-3 py-1.5 text-xs text-text-muted disabled:cursor-not-allowed"
        >
          Check for updates
        </button>
      </div>
    </SettingsSection>
  );
}
