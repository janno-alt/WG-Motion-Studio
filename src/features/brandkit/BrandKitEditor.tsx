import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import {
  DEFAULT_BRAND_COLORS,
  DEFAULT_BRAND_TYPOGRAPHY,
  DEFAULT_VOICE_PROFILE,
  type BrandKit,
  type VoiceTone,
} from "@/types";

interface Props {
  brandKit: BrandKit;
  onSaved: (k: BrandKit) => void;
  onDeleted: (id: string) => void;
}

const VOICE_TONES: { value: VoiceTone; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
  { value: "energetic", label: "Energetic" },
  { value: "warm", label: "Warm" },
];

const COLOR_KEYS = ["primary", "secondary", "accent", "background"] as const;

export function BrandKitEditor({ brandKit, onSaved, onDeleted }: Props) {
  const [draft, setDraft] = useState<BrandKit>(() => normalise(brandKit));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const next: BrandKit = { ...draft, updatedAt: Date.now() };
      const saved = await commands.saveBrandKit(next);
      onSaved(normalise(saved));
      toast.success("Brand kit saved.");
    } catch (err) {
      toast.error(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const removeKit = async () => {
    setConfirmDelete(false);
    try {
      await commands.deleteBrandKit(draft.id);
      onDeleted(draft.id);
      toast.success("Brand kit deleted.");
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    }
  };

  const pickLogo = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }],
    });
    if (!picked || typeof picked !== "string") return;
    try {
      const dest = await commands.saveBrandKitLogo(draft.id, picked);
      patch("logoPath", dest);
    } catch (err) {
      toast.error(`Logo upload failed: ${String(err)}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-end justify-between gap-3">
        <div className="flex-1">
          <Input
            value={draft.name}
            onChange={(e) => patch("name", e.target.value)}
            placeholder="Brand name"
            className="text-base font-semibold"
          />
          <Input
            value={draft.clientName ?? ""}
            onChange={(e) => patch("clientName", e.target.value || null)}
            placeholder="Client / company"
            className="mt-1.5 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Trash2 size={12} />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Save size={12} />}
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <Section title="Logo">
        <div className="flex items-center gap-3">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-default border border-border-subtle bg-surface-2"
          >
            {draft.logoPath ? (
              <img
                src={convertFileSrc(draft.logoPath)}
                alt="Brand logo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-2xs text-text-muted">No logo</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<ImagePlus size={12} />}
            onClick={() => void pickLogo()}
          >
            {draft.logoPath ? "Replace logo" : "Upload logo"}
          </Button>
        </div>
      </Section>

      <Section title="Colors">
        <div className="grid grid-cols-2 gap-3">
          {COLOR_KEYS.map((key) => (
            <ColorField
              key={key}
              label={cap(key)}
              value={draft.colors[key]}
              onChange={(v) =>
                patch("colors", { ...draft.colors, [key]: v })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="grid grid-cols-2 gap-3">
          <LabelledInput
            label="Headline font"
            value={draft.typography.headlineFont}
            onChange={(v) =>
              patch("typography", { ...draft.typography, headlineFont: v })
            }
            placeholder="Inter"
          />
          <LabelledInput
            label="Body font"
            value={draft.typography.bodyFont}
            onChange={(v) =>
              patch("typography", { ...draft.typography, bodyFont: v })
            }
            placeholder="Inter"
          />
        </div>
      </Section>

      <Section title="Voice profile">
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-text-primary">Tone</label>
            <div className="mt-1 flex gap-1">
              {VOICE_TONES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    patch("voiceProfile", { ...draft.voiceProfile, tone: opt.value })
                  }
                  className={[
                    "rounded-default px-2 py-1 text-xs transition-colors",
                    draft.voiceProfile.tone === opt.value
                      ? "bg-surface-3 text-text-primary"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-primary">Notes</label>
            <textarea
              value={draft.voiceProfile.notes}
              onChange={(e) =>
                patch("voiceProfile", {
                  ...draft.voiceProfile,
                  notes: e.target.value,
                })
              }
              rows={3}
              placeholder="e.g. Address viewer informally, avoid jargon, keep sentences short."
              className="mt-1 w-full rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
            />
          </div>
        </div>
      </Section>

      <Section title="Music styles">
        <TagInput
          values={draft.musicStyles}
          onChange={(v) => patch("musicStyles", v)}
          placeholder="electronic, lo-fi, cinematic…"
        />
      </Section>

      <Section title="Style notes">
        <textarea
          value={draft.styleNotes}
          onChange={(e) => patch("styleNotes", e.target.value)}
          rows={4}
          placeholder="Free-form notes for AI prompts and team reference."
          className="w-full rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
        />
      </Section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete brand kit?"
        description={`"${draft.name}" will be removed. Projects that reference it keep working but lose the colour/font binding.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => void removeKit()}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-1 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h3>
      {children}
    </section>
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
    <div className="flex items-center gap-2">
      <label className="w-20 text-2xs text-text-secondary">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-default border border-border-subtle bg-transparent"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-2xs uppercase"
      />
    </div>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-text-primary">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1"
      />
    </div>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    if (values.includes(t)) return;
    onChange([...values, t]);
    setDraft("");
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-2xs text-text-primary"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-text-muted hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Defensive: missing fields on legacy rows fall back to defaults. */
function normalise(kit: BrandKit): BrandKit {
  return {
    ...kit,
    clientName: kit.clientName ?? null,
    logoPath: kit.logoPath ?? null,
    colors: { ...DEFAULT_BRAND_COLORS, ...(kit.colors ?? {}) },
    typography: { ...DEFAULT_BRAND_TYPOGRAPHY, ...(kit.typography ?? {}) },
    voiceProfile: { ...DEFAULT_VOICE_PROFILE, ...(kit.voiceProfile ?? {}) },
    lottieTemplatePaths: kit.lottieTemplatePaths ?? [],
    musicStyles: kit.musicStyles ?? [],
    styleNotes: kit.styleNotes ?? "",
  };
}
