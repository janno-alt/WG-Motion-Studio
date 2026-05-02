import { useCallback, useMemo, useRef } from "react";

import { useTimelineStore } from "@/state/timelineStore";

interface Props {
  width: number;
  durationSec: number;
}

export function TimelineRuler({ width, durationSec }: Props) {
  const playheadSec = useTimelineStore((s) => s.playheadSec);
  const zoom = useTimelineStore((s) => s.zoomPxPerSec);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const ref = useRef<HTMLDivElement>(null);

  const ticks = useMemo(() => {
    const stepSec = stepFor(zoom);
    const out: number[] = [];
    for (let s = 0; s <= durationSec; s += stepSec) {
      out.push(s);
    }
    return out;
  }, [zoom, durationSec]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const update = (clientX: number) => {
        const x = clientX - rect.left;
        const sec = Math.max(0, Math.min(durationSec, x / zoom));
        setPlayhead(sec);
      };
      update(e.clientX);
      const onMove = (m: PointerEvent) => update(m.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [durationSec, zoom, setPlayhead],
  );

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className="relative h-7 cursor-pointer select-none border-b border-border-subtle bg-surface-1"
      style={{ width }}
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 flex h-full items-end pb-0.5 text-2xs text-text-muted"
          style={{ left: t * zoom }}
        >
          <div className="absolute top-0 h-2 w-px bg-border" />
          <span className="ml-1 font-mono">{formatTick(t)}</span>
        </div>
      ))}
      <div
        className="pointer-events-none absolute top-0 h-full w-0.5 bg-accent-primary"
        style={{ left: playheadSec * zoom }}
      />
    </div>
  );
}

function stepFor(pxPerSec: number): number {
  if (pxPerSec >= 120) return 1;
  if (pxPerSec >= 60) return 2;
  if (pxPerSec >= 30) return 5;
  if (pxPerSec >= 15) return 10;
  return 30;
}

function formatTick(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}
