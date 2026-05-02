import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Film, Wand2 } from "lucide-react";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import { useAssetsStore } from "@/state/assetsStore";
import { useTimelineStore } from "@/state/timelineStore";
import type { BRollResult, ClipKind, StockClip, StockSource } from "@/types";

const SOURCE_OPTIONS: { value: StockSource; label: string }[] = [
  { value: "both", label: "Pexels + Pixabay" },
  { value: "pexels", label: "Pexels only" },
  { value: "pixabay", label: "Pixabay only" },
];

export function AutoBRollPanel() {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const addClip = useTimelineStore((s) => s.addClip);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const upsertAsset = useAssetsStore((s) => s.upsert);

  const [results, setResults] = useState<BRollResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<StockSource>("both");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const captionsTrack = tracks.find((t) => t.kind === "captions");
  const sourceCaption = useMemo(() => {
    if (!captionsTrack) return null;
    const captionClips = clips.filter((c) => c.trackId === captionsTrack.id);
    const selected = captionClips.find((c) => selectedIds.has(c.id));
    const pick = selected ?? [...captionClips].sort((a, b) => a.startSec - b.startSec)[0];
    if (!pick) return null;
    const text = pick.data && typeof pick.data["text"] === "string" ? (pick.data["text"] as string) : "";
    return text || null;
  }, [captionsTrack, clips, selectedIds]);

  const v2Track = tracks.find((t) => t.kind === "video" && t.name === "V2") ?? tracks.find((t) => t.kind === "video");

  const search = async () => {
    if (!projectId) return;
    if (!sourceCaption) {
      toast.error("Generate or select a caption first.");
      return;
    }
    setRunning(true);
    try {
      const out = await commands.autoBrollSearch({
        projectId,
        captionText: sourceCaption,
        source,
      });
      setResults(out);
      if (out.length === 0) {
        toast.message("Gemini returned queries but no clips were found. Check your stock keys.");
      }
    } catch (err) {
      toast.error(`Auto-B-Roll failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const useClip = async (clip: StockClip) => {
    if (!projectId || !v2Track) return;
    const key = `${clip.source}-${clip.sourceId}`;
    setDownloadingKey(key);
    try {
      const localPath = await commands.downloadStockClip({ projectId, clip });
      const asset = await commands.importAsset(projectId, localPath);
      upsertAsset(asset);
      const dur = clip.durationSec ?? asset.durationSec ?? 5;
      const lastEnd = clips
        .filter((c) => c.trackId === v2Track.id)
        .reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0);
      addClip({
        trackId: v2Track.id,
        assetId: asset.id,
        kind: "video" as ClipKind,
        startSec: lastEnd,
        durationSec: dur,
        inPointSec: 0,
        outPointSec: dur,
        data: null,
      });
      await saveSnapshot();
      toast.success(`B-roll added to ${v2Track.name}.`);
    } catch (err) {
      toast.error(`Download failed: ${String(err)}`);
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-3 py-2">
        <Film size={14} className="text-text-muted" />
        <span className="text-xs font-medium text-text-primary">Auto-B-Roll</span>
      </div>
      <div className="space-y-2 border-b border-border-subtle bg-surface-1 px-3 py-2">
        <div className="text-2xs text-text-muted">
          Source caption:{" "}
          <span className="text-text-primary">
            {sourceCaption ? `"${sourceCaption.slice(0, 80)}${sourceCaption.length > 80 ? "…" : ""}"` : "(none)"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as StockSource)}
            className="h-7 rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Wand2 size={12} />}
            onClick={() => void search()}
            disabled={running || !sourceCaption}
          >
            {running ? "Searching…" : "Find B-roll"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-surface-0 p-3">
        {!results ? (
          <div className="text-2xs text-text-muted">
            Pick a caption clip or use the first one. Gemini extracts visual concepts,
            then Pexels/Pixabay search returns vertical-oriented stock clips. Click "Use"
            to download into the project and append to V2.
          </div>
        ) : results.length === 0 ? (
          <div className="text-2xs text-text-muted">No clips found for any query.</div>
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <section key={r.query}>
                <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {r.query}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {r.clips.map((c) => {
                    const key = `${c.source}-${c.sourceId}`;
                    const downloading = downloadingKey === key;
                    return (
                      <div
                        key={key}
                        className="overflow-hidden rounded-default border border-border-subtle bg-surface-1"
                      >
                        <div className="aspect-video overflow-hidden bg-black">
                          <img
                            src={c.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-1">
                          <span className="font-mono text-2xs text-text-muted">
                            {c.source}
                          </span>
                          <button
                            type="button"
                            onClick={() => void useClip(c)}
                            disabled={downloading}
                            className="rounded-default bg-accent-primary px-1.5 py-0.5 text-2xs font-medium text-surface-0 hover:bg-accent-primary-hover disabled:opacity-50"
                          >
                            {downloading ? "…" : "Use"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
