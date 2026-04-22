import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Slider from "@radix-ui/react-slider";
import { Player } from "@remotion/player";
import { X } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { Field, Input, Textarea } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { usePresetsStore } from "@/state/presetsStore";
import { useThemesStore } from "@/state/themesStore";
import { SingleGraphicComposition } from "@remotion-project/compositions/SingleGraphicComposition";
import type {
  AnimatedProperty,
  AnimatedPropertyName,
  BuiltInEasing,
  Direction8,
  LoopKind,
  PlanItem,
  Preset,
  PresetCategory,
  Theme,
} from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Preset | null;
  /** Optional: plan-item + theme for the live preview. Falls back to a dummy. */
  contextTheme?: Theme | null;
}

const PROPERTY_CHOICES: AnimatedPropertyName[] = [
  "positionX",
  "positionY",
  "rotation",
  "scale",
  "opacity",
];

const EASING_CHOICES: BuiltInEasing[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "spring",
  "bounce",
  "back",
];

const DIRECTION_CHOICES: Direction8[] = [
  "up",
  "upRight",
  "right",
  "downRight",
  "down",
  "downLeft",
  "left",
  "upLeft",
];

type Draft = {
  id: string;
  name: string;
  category: PresetCategory;
  tags: string;
  loopKind: LoopKind | "";
  duration: number;
  intensity: number;
  direction: Direction8 | "";
  easing: BuiltInEasing;
  properties: Record<AnimatedPropertyName, { enabled: boolean; start: number; end: number | "base" }>;
  notes: string;
};

const DEFAULT_PROPS: Draft["properties"] = {
  positionX: { enabled: false, start: 0, end: "base" },
  positionY: { enabled: false, start: 0, end: "base" },
  rotation: { enabled: false, start: 0, end: "base" },
  scale: { enabled: false, start: 0, end: "base" },
  scaleX: { enabled: false, start: 0, end: "base" },
  scaleY: { enabled: false, start: 0, end: "base" },
  opacity: { enabled: false, start: 0, end: "base" },
  color: { enabled: false, start: 0, end: 0 },
};

function blankDraft(): Draft {
  return {
    id: `user-${nanoid(8)}`,
    name: "",
    category: "enter",
    tags: "",
    loopKind: "",
    duration: 0.4,
    intensity: 100,
    direction: "",
    easing: "easeOut",
    properties: { ...DEFAULT_PROPS },
    notes: "",
  };
}

function fromPreset(p: Preset): Draft {
  const props = { ...DEFAULT_PROPS };
  for (const ap of p.animatedProperties) {
    const end = ap.endValue === "baseState" ? "base" : Number(ap.endValue);
    const start = Number(ap.startValue);
    props[ap.property] = {
      enabled: true,
      start: Number.isFinite(start) ? start : 0,
      end: end as number | "base",
    };
  }
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    tags: p.tags.join(", "),
    loopKind: p.loopKind ?? "",
    duration: p.defaults.duration,
    intensity: p.defaults.intensity,
    direction: p.defaults.direction ?? "",
    easing: typeof p.defaults.easing === "string" ? p.defaults.easing : "easeOut",
    properties: props,
    notes: "",
  };
}

function toPreset(d: Draft): Preset {
  const animatedProperties: AnimatedProperty[] = PROPERTY_CHOICES.filter(
    (p) => d.properties[p]?.enabled,
  ).map((p) => ({
    property: p,
    startValue: d.properties[p]!.start,
    endValue: d.properties[p]!.end === "base" ? "baseState" : (d.properties[p]!.end as number),
  }));

  const preset: Preset = {
    id: d.id,
    name: d.name.trim() || "Untitled preset",
    category: d.category,
    tags: d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    builtIn: false,
    animatedProperties,
    defaults: {
      duration: d.duration,
      intensity: d.intensity,
      easing: d.easing,
      ...(d.direction ? { direction: d.direction } : {}),
    },
  };
  if (d.category === "idle" && d.loopKind) preset.loopKind = d.loopKind;
  return preset;
}

export function PresetBuilderModal({ open, onOpenChange, editing, contextTheme }: Props) {
  const upsert = usePresetsStore((s) => s.upsert);
  const allPresets = usePresetsStore((s) => s.presets);
  const themes = useThemesStore((s) => s.themes);
  const fallbackTheme = contextTheme ?? themes[0];

  const [draft, setDraft] = useState<Draft>(() => (editing ? fromPreset(editing) : blankDraft()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(editing ? fromPreset(editing) : blankDraft());
  }, [open, editing]);

  const validationError = (() => {
    if (!draft.name.trim()) return "Name is required.";
    const anyEnabled = PROPERTY_CHOICES.some((p) => draft.properties[p]?.enabled);
    if (!anyEnabled) return "Enable at least one animated property.";
    if (draft.duration <= 0) return "Duration must be greater than zero.";
    return null;
  })();

  const preview = useMemo(() => buildPreviewItem(draft), [draft]);
  const presetMap = useMemo(() => {
    const m: Record<string, Preset> = {};
    for (const p of allPresets) m[p.id] = p;
    m[draft.id] = toPreset(draft);
    return m;
  }, [allPresets, draft]);

  const save = async () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const preset = toPreset(draft);
      const saved = await commands.savePreset(preset);
      upsert(saved);
      toast.success(editing ? "Preset updated" : "Preset saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!fallbackTheme) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[85vh] w-[min(1100px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface-1 shadow-popover">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              {editing ? "Edit preset" : "New preset"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-default text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </header>

          <div className="grid flex-1 grid-cols-[1fr_360px] overflow-hidden">
            <div className="space-y-4 overflow-auto p-4">
              <Section title="Basics">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name">
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="My spring-in"
                      className="h-8"
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      value={draft.category}
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value as PresetCategory })
                      }
                      className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary"
                    >
                      {(["enter", "idle", "exit", "mask"] as PresetCategory[]).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Tags (comma-separated)">
                  <Input
                    value={draft.tags}
                    onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                    placeholder="snappy, energetic"
                    className="h-8"
                  />
                </Field>
              </Section>

              <Section title="Defaults">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Duration — ${draft.duration.toFixed(2)}s`}>
                    <Slider.Root
                      className="relative flex h-5 w-full items-center"
                      value={[draft.duration]}
                      min={0.05}
                      max={5}
                      step={0.05}
                      onValueChange={(v) => setDraft({ ...draft, duration: v[0] ?? 0.4 })}
                    >
                      <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
                        <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
                      </Slider.Track>
                      <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
                    </Slider.Root>
                  </Field>
                  <Field label={`Intensity — ${draft.intensity}`}>
                    <Slider.Root
                      className="relative flex h-5 w-full items-center"
                      value={[draft.intensity]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => setDraft({ ...draft, intensity: v[0] ?? 100 })}
                    >
                      <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
                        <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
                      </Slider.Track>
                      <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
                    </Slider.Root>
                  </Field>
                  <Field label="Easing">
                    <select
                      value={draft.easing}
                      onChange={(e) =>
                        setDraft({ ...draft, easing: e.target.value as BuiltInEasing })
                      }
                      className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary"
                    >
                      {EASING_CHOICES.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Default direction">
                    <select
                      value={draft.direction}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          direction: (e.target.value as Direction8) || ("" as Direction8 | ""),
                        })
                      }
                      className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary"
                    >
                      <option value="">—</option>
                      {DIRECTION_CHOICES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {draft.category === "idle" ? (
                    <Field label="Loop kind">
                      <select
                        value={draft.loopKind}
                        onChange={(e) =>
                          setDraft({ ...draft, loopKind: (e.target.value as LoopKind) || "" })
                        }
                        className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary"
                      >
                        <option value="">—</option>
                        {(["sine", "linear", "easeInOut"] as LoopKind[]).map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                </div>
              </Section>

              <Section title="Animated properties">
                <div className="space-y-2">
                  {PROPERTY_CHOICES.map((prop) => {
                    const cfg = draft.properties[prop]!;
                    return (
                      <div key={prop} className="rounded-default border border-border-subtle bg-surface-0/60 p-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={cfg.enabled}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                properties: {
                                  ...draft.properties,
                                  [prop]: { ...cfg, enabled: e.target.checked },
                                },
                              })
                            }
                            className="accent-accent-primary"
                          />
                          <span className="font-mono text-text-primary">{prop}</span>
                        </label>
                        {cfg.enabled ? (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <Field label="Start">
                              <Input
                                type="number"
                                step={0.05}
                                value={cfg.start}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    properties: {
                                      ...draft.properties,
                                      [prop]: { ...cfg, start: Number(e.target.value) || 0 },
                                    },
                                  })
                                }
                                className="h-7 text-xs"
                              />
                            </Field>
                            <Field label="End">
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step={0.05}
                                  value={cfg.end === "base" ? "" : cfg.end}
                                  placeholder="base"
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const next = raw === "" ? "base" : Number(raw);
                                    setDraft({
                                      ...draft,
                                      properties: {
                                        ...draft.properties,
                                        [prop]: { ...cfg, end: next as number | "base" },
                                      },
                                    });
                                  }}
                                  className="h-7 flex-1 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft({
                                      ...draft,
                                      properties: {
                                        ...draft.properties,
                                        [prop]: { ...cfg, end: "base" },
                                      },
                                    })
                                  }
                                  className={[
                                    "rounded-default border px-2 py-0.5 text-2xs transition-colors",
                                    cfg.end === "base"
                                      ? "border-accent-primary text-accent-primary"
                                      : "border-border-subtle text-text-muted",
                                  ].join(" ")}
                                  title="Converge to base state"
                                >
                                  base
                                </button>
                              </div>
                            </Field>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="Notes">
                <Textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="For your future self: when to reach for this preset"
                  className="text-xs"
                />
              </Section>
            </div>

            <aside className="flex flex-col gap-3 border-l border-border-subtle bg-surface-0/60 p-4">
              <div className="text-2xs uppercase tracking-wide text-text-muted">Live preview</div>
              <div className="aspect-[9/16] w-full overflow-hidden rounded-card border border-border-subtle bg-surface-0">
                <Player
                  component={SingleGraphicComposition}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  durationInFrames={Math.max(60, Math.round((preview.duration + 0.6) * 30))}
                  fps={30}
                  inputProps={{ item: preview, theme: fallbackTheme, presets: presetMap }}
                  style={{ width: "100%", height: "100%" }}
                  loop
                  autoPlay
                  controls={false}
                  clickToPlay={false}
                />
              </div>
              {validationError ? (
                <div className="text-2xs text-warn">{validationError}</div>
              ) : null}
            </aside>
          </div>

          <footer className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!!validationError || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : editing ? "Update" : "Save preset"}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border-subtle bg-surface-1 p-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Builds a dummy plan item that exercises the preset in its category's slot
 * so the live-preview Player actually shows it running.
 */
function buildPreviewItem(draft: Draft): PlanItem {
  const instance = {
    presetId: draft.id,
    duration: draft.duration,
    intensity: draft.intensity,
    ...(draft.direction ? { direction: draft.direction } : {}),
    easing: draft.easing,
  };

  const animation: PlanItem["animation"] = {
    enter: {
      motion: draft.category === "enter" ? instance : null,
      mask: draft.category === "mask" ? instance : null,
    },
    idle: { motion: draft.category === "idle" ? [instance] : [], mask: null },
    exit: { motion: draft.category === "exit" ? instance : null, mask: null },
  };

  return {
    id: "__preset-preview",
    timestamp: 0,
    duration: Math.max(2, draft.duration + 0.5),
    tier: 1,
    componentType: "IconPopIn",
    brief: "Preview",
    srtContext: "",
    status: "proposed",
    baseState: {
      position: { x: 540, y: 960 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      opacity: 1,
      anchorPoint: { x: 0.5, y: 0.5 },
    },
    animation,
  };
}
