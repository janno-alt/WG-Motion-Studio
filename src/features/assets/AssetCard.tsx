import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import { Film, Image as ImageIcon, Music, Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { formatSeconds } from "@/lib/format";
import type { Asset } from "@/types";

interface Props {
  asset: Asset;
  tags: string[];
  onAdd: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onTagsChange: (assetId: string, tags: string[]) => void;
}

export function AssetCard({ asset, tags, onAdd, onDelete, onTagsChange }: Props) {
  const [draftTag, setDraftTag] = useState("");
  const [busyTags, setBusyTags] = useState(false);

  const commitTag = async () => {
    const t = draftTag.trim().toLowerCase();
    if (!t || tags.includes(t)) {
      setDraftTag("");
      return;
    }
    setBusyTags(true);
    try {
      const next = await commands.setAssetTags(asset.id, [...tags, t]);
      onTagsChange(asset.id, next);
      setDraftTag("");
    } catch (err) {
      toast.error(`Tag failed: ${String(err)}`);
    } finally {
      setBusyTags(false);
    }
  };

  const removeTag = async (tag: string) => {
    setBusyTags(true);
    try {
      const next = await commands.setAssetTags(asset.id, tags.filter((t) => t !== tag));
      onTagsChange(asset.id, next);
    } catch (err) {
      toast.error(`Tag remove failed: ${String(err)}`);
    } finally {
      setBusyTags(false);
    }
  };

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-wg-asset-id", asset.id);
    e.dataTransfer.setData("text/plain", asset.name);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <article
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-1 shadow-panel active:cursor-grabbing"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        {asset.thumbnailPath ? (
          <img
            src={convertFileSrc(asset.thumbnailPath)}
            alt={asset.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            <KindIcon kind={asset.kind} />
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-surface-0/80 px-1.5 py-0.5 text-2xs text-text-secondary">
          <KindIcon kind={asset.kind} small />
          <span>{asset.kind}</span>
        </div>
        {asset.durationSec != null ? (
          <div className="absolute right-1.5 top-1.5 rounded-full bg-surface-0/80 px-1.5 py-0.5 font-mono text-2xs text-text-secondary">
            {formatSeconds(asset.durationSec)}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onAdd(asset)}
          title="Add to timeline"
          className="absolute right-1.5 bottom-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-surface-0 shadow-popover transition-transform hover:scale-105"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 py-2">
        <div className="truncate text-xs text-text-primary" title={asset.name}>
          {asset.name}
        </div>
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void removeTag(t)}
              disabled={busyTags}
              className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-2xs text-text-secondary hover:bg-surface-2 hover:text-danger"
            >
              {t}
            </button>
          ))}
          <Input
            value={draftTag}
            onChange={(e) => setDraftTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                void commitTag();
              }
            }}
            placeholder="+ tag"
            className="h-5 w-20 px-1.5 text-2xs"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(asset)}
        title="Remove asset"
        className="border-t border-border-subtle px-2 py-1 text-2xs text-text-muted hover:bg-surface-2 hover:text-danger"
      >
        <Trash2 size={11} className="inline" /> Remove
      </button>
    </article>
  );
}

function KindIcon({ kind, small }: { kind: string; small?: boolean }) {
  const size = small ? 11 : 28;
  if (kind === "video") return <Film size={size} />;
  if (kind === "audio") return <Music size={size} />;
  if (kind === "image") return <ImageIcon size={size} />;
  return <Film size={size} />;
}
