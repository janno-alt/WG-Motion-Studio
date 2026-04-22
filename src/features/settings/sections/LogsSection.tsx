import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands } from "@/lib/tauri";
import { SettingsSection } from "./SettingsSection";

export function LogsSection() {
  const [logPath, setLogPath] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void commands.getLogPath().then((p) => setLogPath(p ?? null));
  }, []);

  const reveal = async () => {
    if (!logPath) return;
    try {
      await commands.revealInFinder(logPath);
    } catch (err) {
      toast.error(`Could not reveal: ${String(err)}`);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    try {
      await commands.clearLogs();
      toast.success("Logs cleared");
    } catch (err) {
      toast.error(`Clear failed: ${String(err)}`);
    }
  };

  return (
    <SettingsSection
      title="Logs"
      description="App events, API errors, and render diagnostics written to a local file."
    >
      <div className="space-y-2">
        <div className="rounded-default border border-border-subtle bg-surface-0 p-2 font-mono text-2xs text-text-secondary">
          {logPath ?? "(not initialized)"}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!logPath} onClick={() => void reveal()}>
            Open in Finder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!logPath}
            onClick={() => setConfirmClear(true)}
          >
            Clear logs
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear log file?"
        description="The current log file will be truncated. Older events cannot be recovered."
        confirmLabel="Clear"
        danger
        onConfirm={() => void clear()}
      />
    </SettingsSection>
  );
}
