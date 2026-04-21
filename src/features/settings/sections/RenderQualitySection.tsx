import { SettingsSection } from "./SettingsSection";

export function RenderQualitySection() {
  return (
    <SettingsSection
      title="Render defaults"
      description="Default codec and quality for overlay and full renders. Wired up in phase 5."
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-text-primary">Overlay codec</label>
          <select
            disabled
            className="mt-1 w-full rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-xs text-text-muted disabled:cursor-not-allowed"
          >
            <option>WebM (VP9 + alpha)</option>
            <option>ProRes 4444</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-text-primary">Quality</label>
          <select
            disabled
            className="mt-1 w-full rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-xs text-text-muted disabled:cursor-not-allowed"
          >
            <option>Preview (fast)</option>
            <option>Final (slow)</option>
          </select>
        </div>
      </div>
    </SettingsSection>
  );
}
