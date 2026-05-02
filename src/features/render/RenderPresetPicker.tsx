import { ALL_PRESETS, type RenderPreset } from "@/types";

interface Props {
  value: RenderPreset;
  onChange: (preset: RenderPreset) => void;
}

interface PresetMeta {
  label: string;
  description: string;
  warning?: string;
}

const META: Record<string, PresetMeta> = {
  "reel-9-16": {
    label: "Reel 9:16",
    description: "1080×1920 · h264 · 8 Mbit · -16 LUFS",
  },
  "youtube-16-9": {
    label: "YouTube 16:9",
    description: "1920×1080 · h264 · 12 Mbit · -14 LUFS",
  },
  "prores-master": {
    label: "ProRes 4444 master",
    description: "1920×1080 · ProRes 4444 · ~600 Mbit · no loudnorm",
    warning: "Master file — 1 minute is roughly 4 GB on disk.",
  },
};

export function RenderPresetPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      {ALL_PRESETS.map((p) => {
        const meta = META[p.id] ?? { label: p.id, description: "" };
        const selected = p.id === value.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p)}
            className={[
              "flex w-full flex-col gap-0.5 rounded-default border px-3 py-2 text-left transition-colors",
              selected
                ? "border-accent-primary bg-accent-primary/10"
                : "border-border-subtle bg-surface-0 hover:border-border",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-primary">{meta.label}</span>
              <span className="font-mono text-2xs text-text-muted">{p.id}</span>
            </div>
            <span className="text-2xs text-text-muted">{meta.description}</span>
            {meta.warning ? (
              <span className="mt-1 text-2xs text-danger">{meta.warning}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
