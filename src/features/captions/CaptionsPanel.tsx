import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Captions } from "lucide-react";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import type { Asset, WhisperProgressEvent } from "@/types";
import { useAssetsStore } from "@/state/assetsStore";
import { useTimelineStore } from "@/state/timelineStore";

export function CaptionsPanel() {
  const projectId = useTimelineStore((s) => s.projectId);
  const clips = useTimelineStore((s) => s.clips);
  const tracks = useTimelineStore((s) => s.tracks);
  const addCaptionsFromSegments = useTimelineStore((s) => s.addCaptionsFromSegments);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const assets = useAssetsStore((s) => (projectId ? s.byProject[projectId] ?? [] : []));

  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [modelInstalled, setModelInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const status = await commands.whisperModelStatus("medium");
        setModelInstalled(status.installed);
      } catch {
        setModelInstalled(false);
      }
    })();
  }, []);

  const captionsTrack = tracks.find((t) => t.kind === "captions");
  const captionClips = captionsTrack ? clips.filter((c) => c.trackId === captionsTrack.id) : [];

  const sourceAsset = pickPrimaryVideoAsset(clips, assets);

  const transcribe = async () => {
    if (!sourceAsset) {
      toast.error("Add a video clip first.");
      return;
    }
    if (modelInstalled === false) {
      toast.error("Download the Whisper model in Settings → Captions first.");
      return;
    }
    setRunning(true);
    setStage("Starting…");
    try {
      const segments = await commands.whisperTranscribe(
        sourceAsset.path,
        "medium",
        null,
        (e: WhisperProgressEvent) => {
          if (e.stage === "extracting") setStage("Extracting audio…");
          else if (e.stage === "transcribing")
            setStage(e.percent != null ? `Transcribing ${Math.round(e.percent)}%` : "Transcribing…");
          else if (e.stage === "parsing") setStage("Parsing segments…");
          else if (e.stage === "done") setStage(`Done — ${e.segments} segments`);
          else if (e.stage === "error") setStage(`Error: ${e.message}`);
        },
      );
      addCaptionsFromSegments(segments);
      await saveSnapshot();
      toast.success(`${segments.length} caption clips added.`);
    } catch (err) {
      toast.error(`Transcribe failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-3 py-2">
        <Captions size={14} className="text-text-muted" />
        <span className="text-xs font-medium text-text-primary">Captions</span>
        <span className="ml-auto text-2xs text-text-muted">
          {captionClips.length} clip{captionClips.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-3 py-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void transcribe()}
          disabled={running || !sourceAsset || modelInstalled === false}
        >
          {running ? stage : "Generate Captions"}
        </Button>
        {modelInstalled === false ? (
          <span className="text-2xs text-text-muted">
            Model not installed — Settings → Captions
          </span>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto bg-surface-0 p-3">
        {captionClips.length === 0 ? (
          <div className="text-2xs text-text-muted">
            Run "Generate Captions" to transcribe the first video clip on V1 with Whisper.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {[...captionClips]
              .sort((a, b) => a.startSec - b.startSec)
              .map((c) => {
                const t =
                  c.data && typeof c.data["text"] === "string" ? (c.data["text"] as string) : "";
                return (
                  <li key={c.id} className="flex gap-2 text-xs">
                    <span className="w-12 shrink-0 font-mono text-text-muted">
                      {c.startSec.toFixed(1)}s
                    </span>
                    <span className="text-text-primary">{t}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}

function pickPrimaryVideoAsset(
  clips: ReturnType<typeof useTimelineStore.getState>["clips"],
  assets: Asset[],
): Asset | null {
  for (const c of [...clips].sort((a, b) => a.startSec - b.startSec)) {
    if (c.kind === "video" && c.assetId) {
      const a = assets.find((x) => x.id === c.assetId);
      if (a) return a;
    }
  }
  return null;
}
