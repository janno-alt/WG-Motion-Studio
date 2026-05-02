import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import type { DownloadProgressEvent, WhisperModel, WhisperModelStatus } from "@/types";
import { SettingsSection } from "./SettingsSection";

interface ModelRow {
  model: WhisperModel;
  label: string;
  description: string;
}

const ROWS: ModelRow[] = [
  { model: "medium", label: "Whisper Medium", description: "1.5 GB · solid German + English quality" },
  { model: "largeV3", label: "Whisper Large v3", description: "3.1 GB · highest accuracy" },
];

export function CaptionsSection() {
  const [statuses, setStatuses] = useState<Record<WhisperModel, WhisperModelStatus | null>>({
    medium: null,
    largeV3: null,
  });
  const [busy, setBusy] = useState<WhisperModel | null>(null);
  const [progress, setProgress] = useState<Record<WhisperModel, number>>({
    medium: 0,
    largeV3: 0,
  });

  const refresh = async () => {
    const [m, l] = await Promise.all([
      commands.whisperModelStatus("medium"),
      commands.whisperModelStatus("largeV3"),
    ]);
    setStatuses({ medium: m, largeV3: l });
  };

  useEffect(() => {
    void refresh();
  }, []);

  const download = async (model: WhisperModel) => {
    setBusy(model);
    setProgress((p) => ({ ...p, [model]: 0 }));
    try {
      await commands.whisperDownloadModel(model, (e: DownloadProgressEvent) => {
        if (e.stage === "progress" && e.total) {
          setProgress((p) => ({ ...p, [model]: (e.downloaded / e.total!) * 100 }));
        } else if (e.stage === "done") {
          setProgress((p) => ({ ...p, [model]: 100 }));
        } else if (e.stage === "error") {
          toast.error(`Download failed: ${e.message}`);
        }
      });
      await refresh();
      toast.success(`${model} model installed.`);
    } catch (err) {
      toast.error(`Download failed: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection
      title="Captions (Whisper)"
      description="Local speech-to-text via whisper.cpp. Download a model once, then use Generate Captions inside any project."
    >
      <div className="space-y-3">
        {ROWS.map((row) => {
          const status = statuses[row.model];
          const installed = status?.installed ?? false;
          const downloadingThis = busy === row.model;
          const pct = progress[row.model];
          return (
            <div key={row.model} className="rounded-default border border-border-subtle bg-surface-0 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-text-primary">{row.label}</div>
                  <div className="text-2xs text-text-muted">{row.description}</div>
                </div>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-2xs font-medium",
                    installed ? "bg-success/10 text-success" : "bg-surface-3 text-text-muted",
                  ].join(" ")}
                >
                  {installed ? "Installed" : "Not installed"}
                </span>
              </div>
              {downloadingThis ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full bg-accent-primary transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                {!installed ? (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void download(row.model)}
                  >
                    {downloadingThis ? `Downloading ${Math.round(pct)}%` : "Download"}
                  </Button>
                ) : (
                  <span className="font-mono text-2xs text-text-muted">
                    {((status?.sizeBytes ?? 0) / 1_000_000).toFixed(0)} MB
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
