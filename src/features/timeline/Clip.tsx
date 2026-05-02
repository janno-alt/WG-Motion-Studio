import { useCallback, useRef } from "react";

import type { Clip as ClipModel } from "@/types";
import { useTimelineStore } from "@/state/timelineStore";

interface Props {
  clip: ClipModel;
  pxPerSec: number;
}

const TRIM_HANDLE_PX = 6;

export function Clip({ clip, pxPerSec }: Props) {
  const selected = useTimelineStore((s) => s.selectedClipIds.has(clip.id));
  const selectClip = useTimelineStore((s) => s.selectClip);
  const moveClip = useTimelineStore((s) => s.moveClip);
  const trimStart = useTimelineStore((s) => s.trimClipStart);
  const trimEnd = useTimelineStore((s) => s.trimClipEnd);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);

  const dragStateRef = useRef<{ kind: "move" | "trim-start" | "trim-end"; lastSec: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, kind: "move" | "trim-start" | "trim-end") => {
      e.stopPropagation();
      e.preventDefault();
      selectClip(clip.id, e.shiftKey);
      const startX = e.clientX;
      let lastSec = 0;
      dragStateRef.current = { kind, lastSec: 0 };
      const target = e.currentTarget as Element;
      target.setPointerCapture?.(e.pointerId);

      const onMove = (m: PointerEvent) => {
        const dx = m.clientX - startX;
        const sec = dx / pxPerSec;
        const delta = sec - lastSec;
        lastSec = sec;
        if (kind === "move") moveClip(clip.id, delta);
        if (kind === "trim-start") trimStart(clip.id, delta);
        if (kind === "trim-end") trimEnd(clip.id, delta);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        target.releasePointerCapture?.(e.pointerId);
        dragStateRef.current = null;
        void saveSnapshot();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clip.id, pxPerSec, moveClip, trimStart, trimEnd, selectClip, saveSnapshot],
  );

  const left = clip.startSec * pxPerSec;
  const width = Math.max(8, clip.durationSec * pxPerSec);
  const isCaption = clip.kind === "caption";
  const text =
    clip.data && typeof clip.data["text"] === "string" ? (clip.data["text"] as string) : "";

  return (
    <div
      className={[
        "absolute top-1 bottom-1 flex items-center overflow-hidden rounded-default border text-2xs select-none",
        selected
          ? "border-accent-primary bg-accent-primary/20 shadow-[0_0_0_1px_var(--tw-shadow-color)] shadow-accent-primary"
          : "border-border-subtle",
        clip.kind === "video"
          ? "bg-status-rendered/30"
          : clip.kind === "audio"
            ? "bg-status-review/30"
            : isCaption
              ? "bg-status-exported/25"
              : "bg-surface-2",
      ].join(" ")}
      style={{ left, width }}
      onPointerDown={(e) => onPointerDown(e, "move")}
    >
      <div
        className="absolute left-0 top-0 h-full cursor-ew-resize bg-transparent hover:bg-accent-primary/40"
        style={{ width: TRIM_HANDLE_PX }}
        onPointerDown={(e) => onPointerDown(e, "trim-start")}
      />
      <div
        className="absolute right-0 top-0 h-full cursor-ew-resize bg-transparent hover:bg-accent-primary/40"
        style={{ width: TRIM_HANDLE_PX }}
        onPointerDown={(e) => onPointerDown(e, "trim-end")}
      />
      <div className="pointer-events-none flex w-full items-center px-2 text-text-primary">
        <span className="truncate font-mono">
          {isCaption && text ? `"${text.slice(0, 32)}${text.length > 32 ? "…" : ""}"` : labelFor(clip)}
        </span>
      </div>
    </div>
  );
}

function labelFor(clip: ClipModel): string {
  return `${clip.kind} ${clip.durationSec.toFixed(1)}s`;
}
