import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilePlus2, Search } from "lucide-react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { useAssetsStore } from "@/state/assetsStore";
import { useTimelineStore } from "@/state/timelineStore";
import type { Asset, ClipKind } from "@/types";
import { AssetCard } from "./AssetCard";
import { useAssetSearch } from "./useAssetSearch";

export function AssetBrowser() {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const addClip = useTimelineStore((s) => s.addClip);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const upsertAsset = useAssetsStore((s) => s.upsert);
  const removeAsset = useAssetsStore((s) => s.remove);

  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const { results, loading } = useAssetSearch(projectId, query);
  const [tagOverrides, setTagOverrides] = useState<Record<string, string[]>>({});

  // Initial load — populates default `assets` listing in the store too.
  useEffect(() => {
    if (!projectId) return;
    void useAssetsStore.getState().load(projectId);
  }, [projectId]);

  const merged = useMemo(
    () =>
      results.map((r) => ({
        asset: r.asset,
        tags: tagOverrides[r.asset.id] ?? r.tags,
      })),
    [results, tagOverrides],
  );

  const importMore = async () => {
    if (!projectId) return;
    const picked = await open({
      multiple: true,
      filters: [
        {
          name: "Media",
          extensions: [
            "mp4", "mov", "m4v", "mkv", "webm",
            "mp3", "wav", "m4a", "aac", "flac",
            "jpg", "jpeg", "png", "gif", "webp",
          ],
        },
      ],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    setImporting(true);
    try {
      for (const p of paths) {
        if (typeof p !== "string") continue;
        try {
          const asset = await commands.importAsset(projectId, p);
          upsertAsset(asset);
        } catch (err) {
          toast.error(`Import failed for ${p}: ${String(err)}`);
        }
      }
      // Force search refresh
      setQuery((q) => q);
      toast.success(`${paths.length} asset${paths.length === 1 ? "" : "s"} imported.`);
    } finally {
      setImporting(false);
    }
  };

  const addToTimeline = async (asset: Asset) => {
    const targetKind: "video" | "audio" =
      asset.kind === "audio" ? "audio" : "video";
    const targetTrack = tracks.find((t) => t.kind === targetKind);
    if (!targetTrack) {
      toast.error(`No ${targetKind} track available.`);
      return;
    }
    const dur = asset.durationSec ?? 5;
    const lastEnd = clips
      .filter((c) => c.trackId === targetTrack.id)
      .reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0);
    const clipKind: ClipKind =
      asset.kind === "audio" ? "audio" : asset.kind === "image" ? "image" : "video";
    addClip({
      trackId: targetTrack.id,
      assetId: asset.id,
      kind: clipKind,
      startSec: lastEnd,
      durationSec: dur,
      inPointSec: 0,
      outPointSec: dur,
      data: null,
    });
    await saveSnapshot();
    toast.success(`${asset.name} added to ${targetTrack.name}.`);
  };

  const removeAssetFully = async (asset: Asset) => {
    try {
      await commands.deleteAsset(asset.id);
      removeAsset(asset.id);
      setQuery((q) => q);
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    }
  };

  const handleTagsChange = (assetId: string, next: string[]) => {
    setTagOverrides((o) => ({ ...o, [assetId]: next }));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-3 py-2">
        <Search size={14} className="text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets, tags…"
          className="h-7 flex-1 text-xs"
        />
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<FilePlus2 size={12} />}
          onClick={() => void importMore()}
          disabled={importing}
        >
          Import
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-surface-0 p-3">
        {loading && merged.length === 0 ? (
          <div className="text-2xs text-text-muted">Loading…</div>
        ) : merged.length === 0 ? (
          <div className="text-2xs text-text-muted">
            {query
              ? "No assets match this query."
              : "No assets yet. Click Import to add video, audio, or image files."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {merged.map(({ asset, tags }) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                tags={tags}
                onAdd={(a) => void addToTimeline(a)}
                onDelete={(a) => void removeAssetFully(a)}
                onTagsChange={handleTagsChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
