import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { HexColorPicker } from "react-colorful";
import * as Slider from "@radix-ui/react-slider";
import * as Popover from "@radix-ui/react-popover";
import { Upload, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { Field, Input, Textarea } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { groupPresetsByCategory, usePresetsStore } from "@/state/presetsStore";
import type {
  EntryStyle,
  IconApproach,
  IconFillStyle,
  Theme,
} from "@/types";

interface Props {
  theme: Theme;
  onSave: (theme: Theme) => Promise<void>;
  onDelete: () => void;
}

export function ThemeEditor({ theme, onSave, onDelete }: Props) {
  const [local, setLocal] = useState<Theme>(theme);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(local) !== JSON.stringify(theme);

  useEffect(() => setLocal(theme), [theme]);

  const update = (patch: Partial<Theme>) =>
    setLocal((prev) => ({ ...prev, ...patch }));

  const updateColors = (patch: Partial<Theme["colors"]>) =>
    setLocal((prev) => ({ ...prev, colors: { ...prev.colors, ...patch } }));

  const addReference = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const dest = await commands.saveThemeReferenceImage(local.id, picked);
      setLocal((prev) => ({
        ...prev,
        iconStyle: {
          ...prev.iconStyle,
          referenceImages: [...prev.iconStyle.referenceImages, dest],
        },
      }));
    } catch (err) {
      toast.error(`Upload failed: ${String(err)}`);
    }
  };

  const removeReference = async (path: string) => {
    try {
      await commands.deleteThemeReferenceImage(path);
    } catch {
      /* ignore filesystem errors — still remove from list */
    }
    setLocal((prev) => ({
      ...prev,
      iconStyle: {
        ...prev.iconStyle,
        referenceImages: prev.iconStyle.referenceImages.filter((p) => p !== path),
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(local);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-6 w-6 rounded-full border border-border-subtle"
            style={{ background: local.colors.primary }}
          />
          <input
            value={local.name}
            onChange={(e) => update({ name: e.target.value })}
            className="bg-transparent text-base font-semibold text-text-primary focus:outline-none"
          />
          <span className="font-mono text-2xs text-text-muted">{local.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Trash2 size={14} />}
            onClick={onDelete}
          >
            Delete
          </Button>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Save size={14} />}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5">
          {/* Colors */}
          <Section title="Colors">
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="Primary"
                value={local.colors.primary}
                onChange={(v) => updateColors({ primary: v })}
              />
              <ColorField
                label="Secondary"
                value={local.colors.secondary}
                onChange={(v) => updateColors({ secondary: v })}
              />
              <ColorField
                label="Accent"
                value={local.colors.accent}
                onChange={(v) => updateColors({ accent: v })}
              />
              <ColorField
                label="Background"
                value={local.colors.background}
                onChange={(v) => updateColors({ background: v })}
              />
            </div>
          </Section>

          {/* Typography */}
          <Section title="Typography">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Headline font">
                <Input
                  value={local.typography.headlineFont}
                  onChange={(e) =>
                    update({
                      typography: { ...local.typography, headlineFont: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Body font">
                <Input
                  value={local.typography.bodyFont}
                  onChange={(e) =>
                    update({
                      typography: { ...local.typography, bodyFont: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          {/* Icon style */}
          <Section title="Icon style">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Approach">
                <select
                  value={local.iconStyle.approach}
                  onChange={(e) =>
                    update({
                      iconStyle: {
                        ...local.iconStyle,
                        approach: e.target.value as IconApproach,
                      },
                    })
                  }
                  className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                >
                  <option value="angular">Angular</option>
                  <option value="rounded">Rounded</option>
                  <option value="organic">Organic</option>
                </select>
              </Field>
              <Field label="Fill style">
                <select
                  value={local.iconStyle.fillStyle}
                  onChange={(e) =>
                    update({
                      iconStyle: {
                        ...local.iconStyle,
                        fillStyle: e.target.value as IconFillStyle,
                      },
                    })
                  }
                  className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                >
                  <option value="solid">Solid</option>
                  <option value="outline">Outline</option>
                  <option value="duotone">Duotone</option>
                </select>
              </Field>
              <Field label="Stroke weight">
                <Input
                  type="number"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={local.iconStyle.strokeWeight}
                  onChange={(e) =>
                    update({
                      iconStyle: {
                        ...local.iconStyle,
                        strokeWeight: Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          {/* References */}
          <Section title="Reference images">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {local.iconStyle.referenceImages.map((path) => (
                  <div
                    key={path}
                    className="group relative h-20 w-20 overflow-hidden rounded-default border border-border-subtle bg-surface-0"
                    title={path}
                  >
                    <img
                      src={convertFileSrc(path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => void removeReference(path)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-0/80 text-danger opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void addReference()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-default border border-dashed border-border-subtle text-text-muted hover:border-accent-primary hover:text-text-primary"
                >
                  <Upload size={14} />
                  <span className="text-2xs">Upload</span>
                </button>
              </div>
            </div>
          </Section>

          {/* Animation personality */}
          <Section title="Animation personality">
            <div className="space-y-4">
              <SliderField
                label="Speed"
                value={local.animationPersonality.speed}
                min={0}
                max={100}
                onChange={(speed) =>
                  update({
                    animationPersonality: { ...local.animationPersonality, speed },
                  })
                }
              />
              <SliderField
                label="Springiness"
                value={local.animationPersonality.springiness}
                min={0}
                max={100}
                onChange={(springiness) =>
                  update({
                    animationPersonality: {
                      ...local.animationPersonality,
                      springiness,
                    },
                  })
                }
              />
              <Field label="Entry style">
                <select
                  value={local.animationPersonality.entryStyle}
                  onChange={(e) =>
                    update({
                      animationPersonality: {
                        ...local.animationPersonality,
                        entryStyle: e.target.value as EntryStyle,
                      },
                    })
                  }
                  className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                >
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="pop">Pop</option>
                  <option value="mixed">Mixed</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Preferred presets */}
          <Section title="Preferred presets">
            <PreferredPresetsPicker
              selected={local.preferredPresets}
              onChange={(preferredPresets) => update({ preferredPresets })}
            />
          </Section>

          {/* Style notes */}
          <Section title="Style notes (for Claude)">
            <Textarea
              rows={5}
              value={local.styleNotes}
              onChange={(e) => update({ styleNotes: e.target.value })}
              placeholder="e.g. Industrial, authoritative. Favor hard edges; avoid playful springs."
            />
          </Section>
        </div>

        {/* Preview panel */}
        <aside className="sticky top-0 self-start rounded-card border border-border-subtle bg-surface-1 p-4 shadow-panel">
          <div className="mb-3 text-xs font-medium text-text-primary">Live preview</div>
          <div
            className="mb-3 flex h-40 flex-col items-center justify-center gap-2 rounded-default"
            style={{ background: local.colors.background }}
          >
            <div
              style={{ color: local.colors.primary, fontFamily: local.typography.headlineFont }}
              className="text-2xl font-semibold"
            >
              Aa — {local.colors.primary}
            </div>
            <div
              style={{ color: local.colors.accent, fontFamily: local.typography.bodyFont }}
              className="text-xs"
            >
              Body sample in {local.typography.bodyFont}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[
              local.colors.primary,
              local.colors.secondary,
              local.colors.accent,
              local.colors.background,
            ].map((c) => (
              <div
                key={c}
                className="h-6 rounded-sm border border-border-subtle"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
          <div className="mt-3 text-2xs text-text-muted">
            Graphic preview wires up in phase 3.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-panel">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-default border border-border-subtle bg-surface-0 px-2 text-left text-xs text-text-primary hover:border-accent-primary focus:outline-none"
          >
            <span
              className="h-4 w-4 shrink-0 rounded-sm border border-border-subtle"
              style={{ background: value }}
            />
            <span className="font-mono">{value}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 rounded-card border border-border bg-surface-1 p-3 shadow-popover"
          >
            <HexColorPicker color={value} onChange={onChange} />
            <Input
              className="mt-2 w-full font-mono text-xs"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Field>
  );
}

function PreferredPresetsPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const presets = usePresetsStore((s) => s.presets);
  const grouped = groupPresetsByCategory(presets);
  const selectedSet = new Set(selected);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  if (presets.length === 0) {
    return <div className="text-xs text-text-muted">Presets are still loading…</div>;
  }

  return (
    <div className="space-y-3">
      {(["enter", "idle", "exit", "mask"] as const).map((cat) => (
        <div key={cat}>
          <div className="mb-1.5 text-2xs uppercase tracking-wide text-text-muted">
            {cat}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {grouped[cat].map((p) => {
              const on = selectedSet.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={[
                    "rounded-default border px-2 py-1 text-xs transition-colors",
                    on
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-subtle text-text-secondary hover:bg-surface-2",
                  ].join(" ")}
                  title={p.tags.join(" · ")}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="text-2xs text-text-muted">
        {selected.length === 0
          ? "None selected — Claude will pick from the full library."
          : `${selected.length} preset${selected.length === 1 ? "" : "s"} preferred.`}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label} — ${value}`}>
      <Slider.Root
        className="relative flex h-5 w-full items-center"
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={(v) => onChange(v[0] ?? value)}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
          <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
        </Slider.Track>
        <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary shadow-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50" />
      </Slider.Root>
    </Field>
  );
}

