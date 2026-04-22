import { useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Popover from "@radix-ui/react-popover";
import { HexColorPicker } from "react-colorful";
import { Info, Link2, Link2Off, ChevronDown, ChevronUp } from "lucide-react";

import { Field, Input } from "@/components/Input";
import { TierBadge } from "@/components/TierBadge";
import { useEditorStore } from "@/state/editorStore";
import { formatTimestamp } from "@/lib/srt";
import type { PlanItem, StyleVariant, Tier1ComponentType } from "@/types";

interface Props {
  item: PlanItem;
  onJumpToFrame?: () => void;
}

const TIER1_TYPES: Tier1ComponentType[] = [
  "IconPopIn",
  "HighlightCircle",
  "SlideInIllustration",
  "TextCallout",
  "NumberEmphasis",
  "ProgressBar",
  "LowerThird",
  "ArrowPointer",
];

export function PropertyPanel({ item, onJumpToFrame }: Props) {
  const baseState = useEditorStore((s) => s.baseState);
  const tier = useEditorStore((s) => s.tier);
  const componentType = useEditorStore((s) => s.componentType);
  const styleVariant = useEditorStore((s) => s.styleVariant);
  const setPosition = useEditorStore((s) => s.setPosition);
  const setRotation = useEditorStore((s) => s.setRotation);
  const setScale = useEditorStore((s) => s.setScale);
  const setOpacity = useEditorStore((s) => s.setOpacity);
  const setColor = useEditorStore((s) => s.setColor);
  const setAnchorPoint = useEditorStore((s) => s.setAnchorPoint);
  const setStyleVariant = useEditorStore((s) => s.setStyleVariant);
  const setComponentType = useEditorStore((s) => s.setComponentType);
  const setTier = useEditorStore((s) => s.setTier);

  const [scaleLocked, setScaleLocked] = useState(
    Math.abs(baseState.scale.x - baseState.scale.y) < 0.001,
  );
  const [briefOpen, setBriefOpen] = useState(false);

  const updateScale = (axis: "x" | "y", v: number) => {
    if (scaleLocked) setScale(v, v);
    else if (axis === "x") setScale(v, baseState.scale.y);
    else setScale(baseState.scale.x, v);
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-surface-1">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3 text-2xs uppercase tracking-wide text-text-muted">
        Properties
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-4">
        <Section title="Transform">
          <div className="grid grid-cols-2 gap-2">
            <Field label="X">
              <Input
                type="number"
                value={Math.round(baseState.position.x)}
                onChange={(e) =>
                  setPosition(Number(e.target.value) || 0, baseState.position.y)
                }
                className="h-7 text-xs"
              />
            </Field>
            <Field label="Y">
              <Input
                type="number"
                value={Math.round(baseState.position.y)}
                onChange={(e) =>
                  setPosition(baseState.position.x, Number(e.target.value) || 0)
                }
                className="h-7 text-xs"
              />
            </Field>
          </div>

          <Field label="Rotation">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={Math.round(baseState.rotation)}
                onChange={(e) => setRotation(Number(e.target.value) || 0)}
                className="h-7 w-20 text-xs"
              />
              <span className="text-2xs text-text-muted">°</span>
              <div className="relative ml-auto h-6 w-6">
                <div
                  className="absolute inset-0 rounded-full border border-border-subtle"
                  style={{ transform: `rotate(${baseState.rotation}deg)` }}
                >
                  <div className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 bg-accent-primary" />
                </div>
              </div>
            </div>
          </Field>

          <Field
            label={`Scale — ${baseState.scale.x.toFixed(2)}x`}
          >
            <div className="flex items-center gap-2">
              <Slider.Root
                className="relative flex h-5 flex-1 items-center"
                value={[baseState.scale.x]}
                min={0.1}
                max={4}
                step={0.01}
                onValueChange={(v) => updateScale("x", v[0] ?? 1)}
              >
                <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
                  <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
                </Slider.Track>
                <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
              </Slider.Root>
              <button
                type="button"
                onClick={() => setScaleLocked((l) => !l)}
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-default border",
                  scaleLocked
                    ? "border-accent-primary text-accent-primary"
                    : "border-border-subtle text-text-secondary",
                ].join(" ")}
                title={scaleLocked ? "Lock X = Y" : "Independent X/Y"}
              >
                {scaleLocked ? <Link2 size={12} /> : <Link2Off size={12} />}
              </button>
            </div>
            {!scaleLocked ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step={0.05}
                  value={baseState.scale.x.toFixed(2)}
                  onChange={(e) => updateScale("x", Number(e.target.value) || 0)}
                  className="h-7 text-xs"
                />
                <Input
                  type="number"
                  step={0.05}
                  value={baseState.scale.y.toFixed(2)}
                  onChange={(e) => updateScale("y", Number(e.target.value) || 0)}
                  className="h-7 text-xs"
                />
              </div>
            ) : null}
          </Field>
        </Section>

        <Section title="Anchor point">
          <AnchorGrid
            value={baseState.anchorPoint}
            onChange={(x, y) => setAnchorPoint(x, y)}
          />
        </Section>

        <Section title="Appearance">
          <Field label={`Opacity — ${Math.round(baseState.opacity * 100)}%`}>
            <Slider.Root
              className="relative flex h-5 w-full items-center"
              value={[baseState.opacity]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(v) => setOpacity(v[0] ?? 1)}
            >
              <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
                <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
              </Slider.Track>
              <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
            </Slider.Root>
          </Field>

          <Field label="Color">
            {tier === 3 ? (
              <div className="flex items-center gap-1.5 rounded-default border border-border-subtle bg-surface-0 px-2 py-1.5 text-2xs text-text-muted">
                <Info size={12} />
                Color animation disabled for Tier 3 rasters.
              </div>
            ) : (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="flex h-7 w-full items-center gap-2 rounded-default border border-border-subtle bg-surface-0 px-2 text-left text-xs"
                  >
                    <span
                      className="h-4 w-4 rounded-sm border border-border-subtle"
                      style={{ background: baseState.color ?? "transparent" }}
                    />
                    <span className="font-mono">{baseState.color ?? "— none —"}</span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={6}
                    className="z-50 rounded-card border border-border bg-surface-1 p-3 shadow-popover"
                  >
                    <HexColorPicker
                      color={baseState.color ?? "#C8FF00"}
                      onChange={setColor}
                    />
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={baseState.color ?? ""}
                        placeholder="#hex"
                        onChange={(e) => setColor(e.target.value || undefined)}
                        className="h-7 flex-1 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setColor(undefined)}
                        className="rounded-default border border-border-subtle px-2 text-2xs text-text-muted hover:text-danger"
                      >
                        Clear
                      </button>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
          </Field>
        </Section>

        <Section title="Content">
          <Field label="Tier">
            <div className="flex gap-1">
              {[1, 2, 3].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t as 1 | 2 | 3)}
                  className={[
                    "h-7 flex-1 rounded-default border text-xs transition-colors",
                    tier === t
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-subtle text-text-secondary hover:bg-surface-2",
                  ].join(" ")}
                >
                  Tier {t}
                </button>
              ))}
            </div>
          </Field>

          {tier === 1 ? (
            <Field label="Component">
              <select
                value={componentType ?? ""}
                onChange={(e) => setComponentType(e.target.value as Tier1ComponentType)}
                className="h-7 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary"
              >
                {TIER1_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Style variant">
            <div className="flex gap-1">
              {(["A", "B", "C", "D"] as StyleVariant[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStyleVariant(v)}
                  className={[
                    "h-7 flex-1 rounded-default border text-xs transition-colors",
                    styleVariant === v
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-subtle text-text-secondary hover:bg-surface-2",
                  ].join(" ")}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Info">
          <div className="flex items-center gap-2 text-xs">
            <TierBadge tier={item.tier} />
            <span className="font-mono text-text-muted">
              {formatTimestamp(item.timestamp)}
            </span>
            {onJumpToFrame ? (
              <button
                type="button"
                onClick={onJumpToFrame}
                className="ml-auto rounded-default border border-border-subtle px-2 py-0.5 text-2xs text-text-secondary hover:border-accent-primary hover:text-accent-primary"
              >
                Jump
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setBriefOpen((o) => !o)}
            className="flex w-full items-center gap-1.5 py-1 text-2xs uppercase tracking-wide text-text-muted hover:text-text-primary"
          >
            {briefOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Source brief
          </button>
          {briefOpen ? (
            <div className="selectable rounded-default border border-border-subtle bg-surface-0 p-2 font-mono text-2xs leading-relaxed text-text-secondary">
              {item.brief || "(empty)"}
            </div>
          ) : null}
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border-subtle bg-surface-0/60 p-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

function AnchorGrid({
  value,
  onChange,
}: {
  value: { x: number; y: number };
  onChange: (x: number, y: number) => void;
}) {
  const cells = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [0, 0.5],
    [0.5, 0.5],
    [1, 0.5],
    [0, 1],
    [0.5, 1],
    [1, 1],
  ] as const;
  return (
    <div className="grid w-20 grid-cols-3 gap-0.5 rounded-default border border-border-subtle p-1">
      {cells.map(([x, y], i) => {
        const active = Math.abs(value.x - x) < 0.01 && Math.abs(value.y - y) < 0.01;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(x, y)}
            className={[
              "h-4 w-4 rounded-sm transition-colors",
              active ? "bg-accent-primary" : "bg-surface-3 hover:bg-border",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
