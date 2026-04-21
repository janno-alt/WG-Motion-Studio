import { SettingsSection } from "./SettingsSection";

export function ExportPathsSection() {
  return (
    <SettingsSection
      title="Export paths"
      description="Where rendered assets and FCPXML files are written. Wired up in phase 6."
    >
      <div className="space-y-2">
        <div>
          <label className="text-xs font-medium text-text-primary">Projects directory</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              disabled
              value="~/Movies/WG Motion Studio"
              className="min-w-0 flex-1 rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 font-mono text-xs text-text-muted"
            />
            <button
              type="button"
              disabled
              className="rounded-default border border-border-subtle px-3 py-1.5 text-xs text-text-muted disabled:cursor-not-allowed"
            >
              Change…
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
