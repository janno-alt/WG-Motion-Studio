import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { APP_VERSION } from "@/lib/version";
import { SettingsSection } from "./SettingsSection";

const GH_LATEST = "https://api.github.com/repos/janno-alt/wg-motion-studio/releases/latest";

export function UpdateCheckSection() {
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      const res = await fetch(GH_LATEST, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { tag_name?: string };
      const tag = (data.tag_name ?? "").replace(/^v/, "");
      setLatest(tag || null);
      if (!tag) {
        toast.info("No releases yet.");
      } else if (tag === APP_VERSION) {
        toast.success(`Up to date (v${APP_VERSION}).`);
      } else {
        toast.info(`Latest release: v${tag}. You're on v${APP_VERSION}.`);
      }
    } catch (err) {
      toast.error(`Update check failed: ${String(err)}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <SettingsSection
      title="Updates"
      description="Manual version check against the GitHub release feed."
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-text-primary">Current version</div>
          <div className="font-mono text-2xs text-text-muted">
            {APP_VERSION} · LOCAL
            {latest && latest !== APP_VERSION ? (
              <span className="text-warn"> · latest {latest}</span>
            ) : null}
          </div>
        </div>
        <Button variant="secondary" size="sm" disabled={checking} onClick={() => void check()}>
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      </div>
    </SettingsSection>
  );
}
