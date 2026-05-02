import { useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";

import { Button } from "@/components/Button";
import { APP_VERSION } from "@/lib/version";
import {
  checkForUpdate,
  downloadAndInstall,
  relaunch,
  type InstallProgress,
  type UpdateInfo,
} from "@/lib/updater";
import { SettingsSection } from "./SettingsSection";

export function UpdateCheckSection() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const result = await checkForUpdate(APP_VERSION);
      setInfo(result);
      if (!result.available) {
        toast.success(`Up to date (v${APP_VERSION}).`);
      }
    } catch (err) {
      const msg = String(err);
      setError(msg);
      toast.error(`Update check failed: ${msg}`);
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    if (!info?.handle) return;
    setInstalling(true);
    setProgress({ downloaded: 0, total: null });
    try {
      await downloadAndInstall(info.handle, (p) => setProgress(p));
      toast.success("Update installed — relaunching…");
      await relaunch();
    } catch (err) {
      toast.error(`Install failed: ${String(err)}`);
      setInstalling(false);
    }
  };

  const pct =
    progress && progress.total
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <SettingsSection
      title="Updates"
      description="Auto-checked on app start. Updates are signed and verified locally before install."
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-text-secondary">
            Current version{" "}
            <span className="font-mono text-text-primary">v{APP_VERSION}</span>
            {info?.available ? (
              <>
                {" → "}
                <span className="font-mono text-accent-primary">v{info.newVersion}</span>
              </>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw size={12} />}
            onClick={() => void runCheck()}
            disabled={checking || installing}
          >
            {checking ? "Checking…" : "Check now"}
          </Button>
        </div>

        {info?.available ? (
          <div className="rounded-default border border-accent-primary/40 bg-accent-primary/5 p-2.5">
            {info.notes ? (
              <pre className="mb-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-2xs text-text-secondary">
                {info.notes}
              </pre>
            ) : null}
            {progress ? (
              <div className="mb-2">
                <div className="mb-0.5 flex justify-between text-2xs text-text-muted">
                  <span>
                    {(progress.downloaded / 1_048_576).toFixed(1)} MB
                    {progress.total
                      ? ` / ${(progress.total / 1_048_576).toFixed(1)} MB`
                      : ""}
                  </span>
                  <span>{pct != null ? `${pct}%` : "…"}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full bg-accent-primary transition-[width] duration-200"
                    style={{ width: pct != null ? `${pct}%` : "10%" }}
                  />
                </div>
              </div>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Download size={12} />}
              onClick={() => void install()}
              disabled={installing}
            >
              {installing ? "Installing…" : "Download & install"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-default border border-danger/30 bg-danger/5 p-2 text-2xs text-danger">
            {error}
            <div className="mt-1 text-text-muted">
              Updater pubkey may not be configured yet — see RELEASE.md.
            </div>
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}
