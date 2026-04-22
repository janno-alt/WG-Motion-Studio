import { useMemo } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

import { TierBadge } from "@/components/TierBadge";
import { formatTimestamp, type SrtBlock } from "@/lib/srt";
import type { PlanItem } from "@/types";

interface Props {
  duration: number;
  planItems: PlanItem[];
  srtBlocks: SrtBlock[];
  themePrimary: string;
  onItemClick?: (item: PlanItem) => void;
  onItemDoubleClick?: (item: PlanItem) => void;
  selectedItemId?: string | null;
}

const PX_PER_SECOND = 40;
const MIN_WIDTH = 800;

export function Timeline({
  duration,
  planItems,
  srtBlocks,
  themePrimary,
  onItemClick,
  onItemDoubleClick,
  selectedItemId,
}: Props) {
  const width = Math.max(MIN_WIDTH, duration * PX_PER_SECOND + 80);

  const ticks = useMemo(() => {
    const interval = duration > 120 ? 10 : duration > 30 ? 5 : 1;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += interval) out.push(t);
    return out;
  }, [duration]);

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="flex-1 overflow-auto bg-surface-0 p-4">
        <div
          className="relative rounded-card border border-border-subtle bg-surface-1"
          style={{ width, minWidth: "100%", height: 220 }}
        >
          {/* Ticks row */}
          <div className="absolute inset-x-0 top-0 h-8 border-b border-border-subtle">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full border-l border-border-subtle"
                style={{ left: t * PX_PER_SECOND + 40 }}
              >
                <div className="pl-1.5 pt-1 font-mono text-2xs text-text-muted">
                  {formatTimestamp(t)}
                </div>
              </div>
            ))}
          </div>

          {/* Pins */}
          <div className="absolute inset-x-0 top-8 h-[120px] border-b border-border-subtle">
            {planItems.map((item) => (
              <PlanPin
                key={item.id}
                item={item}
                themePrimary={themePrimary}
                onClick={onItemClick}
                onDoubleClick={onItemDoubleClick}
                selected={selectedItemId === item.id}
              />
            ))}
          </div>

          {/* SRT strip */}
          <div className="absolute inset-x-0 bottom-0 h-[50px] overflow-hidden bg-surface-2">
            {srtBlocks.map((b) => (
              <div
                key={b.index}
                className="absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded-sm border border-border-subtle bg-surface-3 px-1.5 text-2xs text-text-secondary"
                style={{
                  left: b.startSec * PX_PER_SECOND + 40,
                  width: Math.max(4, (b.endSec - b.startSec) * PX_PER_SECOND),
                }}
                title={b.text}
              >
                <span className="truncate">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

function PlanPin({
  item,
  themePrimary,
  onClick,
  onDoubleClick,
  selected,
}: {
  item: PlanItem;
  themePrimary: string;
  onClick?: (item: PlanItem) => void;
  onDoubleClick?: (item: PlanItem) => void;
  selected?: boolean;
}) {
  const left = item.timestamp * PX_PER_SECOND + 40;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          onClick={() => onClick?.(item)}
          onDoubleClick={() => onDoubleClick?.(item)}
          className={[
            "group absolute flex h-full flex-col items-center",
            selected ? "z-10" : "",
          ].join(" ")}
          style={{
            left: left - 10,
            width: 20,
            outline: selected ? `1px solid ${themePrimary}` : undefined,
            outlineOffset: selected ? 2 : undefined,
          }}
        >
          <div
            className="h-full w-0.5 rounded-full bg-border-subtle transition-colors group-hover:bg-text-primary"
            style={{ background: themePrimary, opacity: 0.35 }}
          />
          <div className="absolute top-2 flex -translate-x-1/2 items-center justify-center">
            <TierBadge tier={item.tier} />
          </div>
          <div
            className="absolute top-8 h-2 w-2 -translate-x-1/2 rounded-full border border-surface-0"
            style={{ background: themePrimary }}
          />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          className="z-50 max-w-xs rounded-default border border-border-subtle bg-surface-2 p-2 text-xs text-text-primary shadow-popover"
          sideOffset={6}
        >
          <div className="font-mono text-2xs text-text-muted">
            {formatTimestamp(item.timestamp)} · {item.duration.toFixed(2)}s · Tier {item.tier}
          </div>
          <div className="mt-1 leading-snug">{item.brief}</div>
          <Tooltip.Arrow className="fill-border-subtle" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
