import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Slider from "@radix-ui/react-slider";
import { MoreVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useEditorStore, instanceFromDefaults } from "@/state/editorStore";
import type {
  Direction8,
  EasingType,
  Preset,
  PresetCategory,
  PresetInstance,
} from "@/types";

export const DRAG_DATA = "application/x-wg-preset";

interface Props {
  presets: Preset[];
  itemDuration: number;
  onPlayheadChange?: (seconds: number) => void;
  playheadSec: number;
}

type LaneKey =
  | "enter-motion"
  | "enter-mask"
  | "idle-motion"
  | "exit-motion"
  | "exit-mask";

interface LaneDef {
  key: LaneKey;
  label: string;
  category: PresetCategory;
  lane: "motion" | "mask";
  tint: string;
}

const LANES: LaneDef[] = [
  { key: "enter-motion", label: "ENTER · Motion", category: "enter", lane: "motion", tint: "bg-success/10" },
  { key: "enter-mask", label: "ENTER · Mask", category: "mask", lane: "mask", tint: "bg-success/5" },
  { key: "idle-motion", label: "IDLE · Motion", category: "idle", lane: "motion", tint: "bg-surface-2" },
  { key: "exit-motion", label: "EXIT · Motion", category: "exit", lane: "motion", tint: "bg-danger/10" },
  { key: "exit-mask", label: "EXIT · Mask", category: "mask", lane: "mask", tint: "bg-danger/5" },
];

const CATEGORY_COLOR: Record<PresetCategory, string> = {
  enter: "bg-success",
  idle: "bg-info",
  exit: "bg-danger",
  mask: "bg-warn",
};

export function SlotTimeline({
  presets,
  itemDuration,
  onPlayheadChange,
  playheadSec,
}: Props) {
  const animation = useEditorStore((s) => s.animation);
  const selected = useEditorStore((s) => s.selectedInstance);
  const select = useEditorStore((s) => s.select);
  const upsertEnter = useEditorStore((s) => s.upsertEnterMotion);
  const upsertExit = useEditorStore((s) => s.upsertExitMotion);
  const upsertEnterMask = useEditorStore((s) => s.upsertEnterMask);
  const upsertExitMask = useEditorStore((s) => s.upsertExitMask);
  const addIdle = useEditorStore((s) => s.addIdleMotion);
  const updateIdle = useEditorStore((s) => s.updateIdleMotion);
  const removeIdle = useEditorStore((s) => s.removeIdleMotion);
  const clearAll = useEditorStore((s) => s.clearAnimations);

  const [zoom, setZoom] = useState<1 | 2 | 0.5>(1);
  const [confirmClear, setConfirmClear] = useState(false);

  const presetById = useMemo(() => {
    const m = new Map<string, Preset>();
    for (const p of presets) m.set(p.id, p);
    return m;
  }, [presets]);

  // 200 base pixels per second, modulated by zoom.
  const pxPerSec = 200 * zoom;
  const width = Math.max(600, itemDuration * pxPerSec + 80);

  const ticks = useMemo(() => {
    const step = itemDuration > 6 ? 1 : 0.5;
    const out: number[] = [];
    for (let t = 0; t <= itemDuration + 0.001; t += step) out.push(Number(t.toFixed(2)));
    return out;
  }, [itemDuration]);

  const handleDropOn = (laneDef: LaneDef, relativeSec: number, presetId: string) => {
    const preset = presetById.get(presetId);
    if (!preset) return;
    if (preset.category !== laneDef.category) return;

    const defaultDur = preset.defaults.duration;
    const instance: PresetInstance = instanceFromDefaults(preset.id, defaultDur, preset.defaults.intensity);
    if (preset.defaults.direction) instance.direction = preset.defaults.direction;
    if (preset.defaults.easing) instance.easing = preset.defaults.easing;

    switch (laneDef.key) {
      case "enter-motion":
        upsertEnter(instance);
        select({ channel: "enter", lane: "motion" });
        break;
      case "exit-motion":
        upsertExit(instance);
        select({ channel: "exit", lane: "motion" });
        break;
      case "enter-mask":
        upsertEnterMask(instance);
        select({ channel: "enter", lane: "mask" });
        break;
      case "exit-mask":
        upsertExitMask(instance);
        select({ channel: "exit", lane: "mask" });
        break;
      case "idle-motion": {
        addIdle(instance);
        select({ channel: "idle", lane: "motion", index: animation.idle.motion.length });
        break;
      }
    }
    void relativeSec;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-1">
      {/* Toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border-subtle px-3 text-2xs">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-text-muted">Timeline</span>
          <div className="flex items-center gap-0.5">
            {[
              { v: 0.5 as const, label: "50%" },
              { v: 1 as const, label: "100%" },
              { v: 2 as const, label: "200%" },
            ].map((z) => (
              <button
                key={z.label}
                type="button"
                onClick={() => setZoom(z.v)}
                className={[
                  "rounded-default px-1.5 py-0.5",
                  zoom === z.v
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:bg-surface-2",
                ].join(" ")}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Trash2 size={12} />}
          onClick={() => setConfirmClear(true)}
        >
          Clear all
        </Button>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        <div style={{ width: width + 90, minWidth: "100%" }}>
          {/* Ruler */}
          <div className="flex h-6 border-b border-border-subtle">
            <div className="w-[90px] shrink-0 border-r border-border-subtle" />
            <div className="relative flex-1">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-full border-l border-border-subtle pl-1 font-mono text-2xs text-text-muted"
                  style={{ left: t * pxPerSec }}
                >
                  {t.toFixed(1)}s
                </div>
              ))}
              {/* Playhead */}
              <div
                className="absolute top-0 h-full w-[2px] bg-accent-primary"
                style={{ left: playheadSec * pxPerSec, zIndex: 20 }}
              />
            </div>
          </div>

          {/* Lanes */}
          {LANES.map((laneDef) => (
            <LaneRow
              key={laneDef.key}
              laneDef={laneDef}
              pxPerSec={pxPerSec}
              totalWidth={width}
              animation={animation}
              presetById={presetById}
              selectedInstance={selected}
              onDrop={handleDropOn}
              onPlayheadClick={(sec) => onPlayheadChange?.(sec)}
              onSelect={(sel) => select(sel)}
              onRemoveIdle={removeIdle}
              playheadSec={playheadSec}
            />
          ))}
        </div>
      </div>

      {/* Selected-block properties popover (dockable below). */}
      {selected ? (
        <SelectedInstanceProps
          presets={presets}
          presetById={presetById}
          onChange={(next) => {
            if (selected.channel === "enter" && selected.lane === "motion") upsertEnter(next);
            else if (selected.channel === "exit" && selected.lane === "motion") upsertExit(next);
            else if (selected.channel === "enter" && selected.lane === "mask") upsertEnterMask(next);
            else if (selected.channel === "exit" && selected.lane === "mask") upsertExitMask(next);
            else if (selected.channel === "idle" && selected.lane === "motion" && selected.index != null) {
              updateIdle(selected.index, next);
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all animations?"
        description="Removes every enter / idle / exit preset on this graphic."
        confirmLabel="Clear"
        danger
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Lane row                                                                   */
/* -------------------------------------------------------------------------- */

function LaneRow({
  laneDef,
  pxPerSec,
  totalWidth,
  animation,
  presetById,
  selectedInstance,
  onDrop,
  onPlayheadClick,
  onSelect,
  onRemoveIdle,
  playheadSec,
}: {
  laneDef: LaneDef;
  pxPerSec: number;
  totalWidth: number;
  animation: ReturnType<typeof useEditorStore.getState>["animation"];
  presetById: Map<string, Preset>;
  selectedInstance: ReturnType<typeof useEditorStore.getState>["selectedInstance"];
  onDrop: (lane: LaneDef, relativeSec: number, presetId: string) => void;
  onPlayheadClick: (sec: number) => void;
  onSelect: (sel: ReturnType<typeof useEditorStore.getState>["selectedInstance"]) => void;
  onRemoveIdle: (index: number) => void;
  playheadSec: number;
}) {
  const [hover, setHover] = useState(false);

  const blocks = useMemo(() => {
    if (laneDef.key === "enter-motion" && animation.enter.motion) {
      return [{ instance: animation.enter.motion, start: 0, idx: undefined }];
    }
    if (laneDef.key === "enter-mask" && animation.enter.mask) {
      return [{ instance: animation.enter.mask, start: 0, idx: undefined }];
    }
    if (laneDef.key === "exit-motion" && animation.exit.motion) {
      return [{ instance: animation.exit.motion, start: 0, idx: undefined }];
    }
    if (laneDef.key === "exit-mask" && animation.exit.mask) {
      return [{ instance: animation.exit.mask, start: 0, idx: undefined }];
    }
    if (laneDef.key === "idle-motion") {
      return animation.idle.motion.map((instance, idx) => ({ instance, start: 0, idx }));
    }
    return [];
  }, [laneDef.key, animation]);

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_DATA)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDropHere = (e: React.DragEvent) => {
    e.preventDefault();
    const presetId = e.dataTransfer.getData(DRAG_DATA);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relSec = (e.clientX - rect.left) / pxPerSec;
    onDrop(laneDef, Math.max(0, relSec), presetId);
  };

  const onLaneClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const sec = (e.clientX - rect.left) / pxPerSec;
    onPlayheadClick(Math.max(0, sec));
  };

  return (
    <div className="flex h-12 border-b border-border-subtle">
      <div className="w-[90px] shrink-0 border-r border-border-subtle px-2 py-1.5 text-2xs font-medium text-text-secondary">
        {laneDef.label}
      </div>
      <div
        className={[
          "relative flex-1 transition-colors",
          laneDef.tint,
          hover ? "outline outline-1 outline-accent-primary" : "",
        ].join(" ")}
        style={{ width: totalWidth }}
        onDragOver={onDragOver}
        onDragEnter={() => setHover(true)}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          setHover(false);
          onDropHere(e);
        }}
        onClick={onLaneClick}
      >
        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 h-full w-[1px] bg-accent-primary/60"
          style={{ left: playheadSec * pxPerSec }}
        />
        {blocks.map((b, i) => {
          const preset = presetById.get(b.instance.presetId);
          const selected =
            selectedInstance?.channel === laneDef.category.replace("mask", laneDef.category) &&
            selectedInstance.lane === laneDef.lane &&
            (laneDef.key !== "idle-motion" || selectedInstance.index === b.idx);
          const isSelected =
            selectedInstance &&
            (() => {
              if (laneDef.key === "enter-motion")
                return selectedInstance.channel === "enter" && selectedInstance.lane === "motion";
              if (laneDef.key === "enter-mask")
                return selectedInstance.channel === "enter" && selectedInstance.lane === "mask";
              if (laneDef.key === "exit-motion")
                return selectedInstance.channel === "exit" && selectedInstance.lane === "motion";
              if (laneDef.key === "exit-mask")
                return selectedInstance.channel === "exit" && selectedInstance.lane === "mask";
              if (laneDef.key === "idle-motion")
                return (
                  selectedInstance.channel === "idle" &&
                  selectedInstance.lane === "motion" &&
                  selectedInstance.index === b.idx
                );
              return false;
            })();
          return (
            <div
              key={`${laneDef.key}-${i}`}
              className={[
                "absolute top-1 flex h-[calc(100%-8px)] items-center gap-1.5 rounded-default px-2 text-xs shadow-panel transition-colors",
                CATEGORY_COLOR[laneDef.category] + "/80",
                isSelected ? "ring-2 ring-accent-primary" : "",
              ].join(" ")}
              style={{
                left: b.start * pxPerSec,
                width: Math.max(40, b.instance.duration * pxPerSec),
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({
                  channel:
                    laneDef.key === "enter-motion" || laneDef.key === "enter-mask"
                      ? "enter"
                      : laneDef.key === "exit-motion" || laneDef.key === "exit-mask"
                      ? "exit"
                      : "idle",
                  lane: laneDef.lane,
                  ...(laneDef.key === "idle-motion" ? { index: b.idx } : {}),
                });
              }}
              title={preset?.name ?? b.instance.presetId}
            >
              <span className="min-w-0 truncate font-medium text-white">
                {preset?.name ?? b.instance.presetId}
              </span>
              <span className="font-mono text-2xs text-white/70">
                {b.instance.duration.toFixed(2)}s
              </span>
              {laneDef.key === "idle-motion" && b.idx != null ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveIdle(b.idx!);
                  }}
                  className="ml-auto flex h-4 w-4 items-center justify-center rounded-sm text-white/70 hover:bg-black/30 hover:text-white"
                  title="Remove"
                >
                  <MoreVertical size={10} />
                </button>
              ) : null}
              {void selected}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Selection properties popover                                               */
/* -------------------------------------------------------------------------- */

function SelectedInstanceProps({
  presets,
  presetById,
  onChange,
}: {
  presets: Preset[];
  presetById: Map<string, Preset>;
  onChange: (next: PresetInstance) => void;
}) {
  const selected = useEditorStore((s) => s.selectedInstance);
  const animation = useEditorStore((s) => s.animation);

  const instance = useMemo(() => {
    if (!selected) return null;
    if (selected.channel === "enter" && selected.lane === "motion") return animation.enter.motion;
    if (selected.channel === "exit" && selected.lane === "motion") return animation.exit.motion;
    if (selected.channel === "enter" && selected.lane === "mask") return animation.enter.mask;
    if (selected.channel === "exit" && selected.lane === "mask") return animation.exit.mask;
    if (selected.channel === "idle" && selected.lane === "motion" && selected.index != null)
      return animation.idle.motion[selected.index] ?? null;
    return null;
  }, [selected, animation]);

  if (!instance) return null;
  const preset = presetById.get(instance.presetId);

  const update = (patch: Partial<PresetInstance>) => onChange({ ...instance, ...patch });

  return (
    <div className="flex h-28 shrink-0 items-start gap-4 border-t border-border-subtle bg-surface-2 px-4 py-2">
      <div className="min-w-[160px]">
        <div className="text-2xs uppercase tracking-wide text-text-muted">Selected preset</div>
        <div className="text-sm font-medium text-text-primary">{preset?.name ?? instance.presetId}</div>
        <div className="text-2xs text-text-muted">{preset?.category}</div>
      </div>

      <Field label={`Duration — ${instance.duration.toFixed(2)}s`}>
        <Slider.Root
          className="relative flex h-5 w-40 items-center"
          value={[instance.duration]}
          min={0.1}
          max={10}
          step={0.05}
          onValueChange={(v) => update({ duration: v[0] ?? instance.duration })}
        >
          <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
            <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
          </Slider.Track>
          <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
        </Slider.Root>
      </Field>

      <Field label={`Intensity — ${instance.intensity}`}>
        <Slider.Root
          className="relative flex h-5 w-32 items-center"
          value={[instance.intensity]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => update({ intensity: v[0] ?? instance.intensity })}
        >
          <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
            <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
          </Slider.Track>
          <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
        </Slider.Root>
      </Field>

      <Field label="Easing">
        <select
          value={typeof instance.easing === "string" ? instance.easing : "linear"}
          onChange={(e) => update({ easing: e.target.value as EasingType })}
          className="h-7 w-28 rounded-default border border-border-subtle bg-surface-0 px-1 text-xs text-text-primary"
        >
          {["linear", "easeIn", "easeOut", "easeInOut", "spring", "bounce", "back"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>

      {preset?.defaults.direction || /slide/i.test(preset?.name ?? "") ? (
        <Field label="Direction">
          <select
            value={instance.direction ?? "right"}
            onChange={(e) => update({ direction: e.target.value as Direction8 })}
            className="h-7 w-24 rounded-default border border-border-subtle bg-surface-0 px-1 text-xs"
          >
            {["up", "upRight", "right", "downRight", "down", "downLeft", "left", "upLeft"].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label={`Delay — ${(instance.delay ?? 0).toFixed(2)}s`}>
        <Slider.Root
          className="relative flex h-5 w-28 items-center"
          value={[instance.delay ?? 0]}
          min={0}
          max={2}
          step={0.05}
          onValueChange={(v) => update({ delay: v[0] ?? 0 })}
        >
          <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
            <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
          </Slider.Track>
          <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
        </Slider.Root>
      </Field>

      <div className="ml-auto">
        <PresetSwap presets={presets} currentId={instance.presetId} onPick={(id) => update({ presetId: id })} />
      </div>
    </div>
  );
}

function PresetSwap({
  presets,
  currentId,
  onPick,
}: {
  presets: Preset[];
  currentId: string;
  onPick: (id: string) => void;
}) {
  const current = presets.find((p) => p.id === currentId);
  if (!current) return null;
  const siblings = presets.filter((p) => p.category === current.category);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rounded-default border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          Replace…
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 max-h-72 w-56 overflow-auto rounded-card border border-border bg-surface-1 p-1 shadow-popover"
        >
          {siblings.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className={[
                "flex w-full items-center gap-2 rounded-default px-2 py-1 text-left text-xs",
                p.id === currentId
                  ? "bg-surface-3 text-text-primary"
                  : "text-text-secondary hover:bg-surface-2",
              ].join(" ")}
            >
              {p.name}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

void Input;
