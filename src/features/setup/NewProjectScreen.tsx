import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { FileText, Film, Upload } from "lucide-react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { Field, Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { parseSrt, type ParsedSrt } from "@/lib/srt";
import { formatSeconds } from "@/lib/format";
import { useThemesStore } from "@/state/themesStore";
import { useProjectsStore } from "@/state/projectsStore";
import type {
  Fps,
  GraphicsDensity,
  Project,
  StyleIntensity,
  VideoFormat,
} from "@/types";

interface FormState {
  name: string;
  clientId: string;
  videoFormat: VideoFormat;
  fps: Fps;
  graphicsDensity: GraphicsDensity;
  styleIntensity: StyleIntensity;
  allowedTiers: { tier1: boolean; tier2: boolean; tier3: boolean };
  srtSourcePath: string | null;
  videoPath: string | null;
  srt: ParsedSrt | null;
}

const INITIAL: FormState = {
  name: "",
  clientId: "",
  videoFormat: "9:16",
  fps: 30,
  graphicsDensity: "balanced",
  styleIntensity: "balanced",
  allowedTiers: { tier1: true, tier2: true, tier3: true },
  srtSourcePath: null,
  videoPath: null,
  srt: null,
};

const SOFT_DURATION_CAP_SEC = 5 * 60;

export function NewProjectScreen() {
  const navigate = useNavigate();
  const { themes, load: loadThemes } = useThemesStore();
  const upsertProject = useProjectsStore((s) => s.upsert);

  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadThemes();
  }, [loadThemes]);

  useEffect(() => {
    if (!form.clientId && themes.length > 0) {
      setForm((f) => ({ ...f, clientId: themes[0]!.id }));
    }
  }, [themes, form.clientId]);

  const pickSrt = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "SRT subtitles", extensions: ["srt"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const content = await readTextFile(picked);
      const srt = parseSrt(content);
      if (srt.blocks.length === 0) {
        toast.error("SRT parsed as empty — check the file.");
        return;
      }
      setForm((f) => ({
        ...f,
        srtSourcePath: picked,
        srt,
        name: f.name || suggestNameFrom(picked),
      }));
    } catch (err) {
      toast.error(`Could not read SRT: ${String(err)}`);
    }
  };

  const pickVideo = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "mkv"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    setForm((f) => ({ ...f, videoPath: picked }));
  };

  const canSubmit =
    !!form.name.trim() &&
    !!form.clientId &&
    !!form.srtSourcePath &&
    !!form.srt &&
    (form.allowedTiers.tier1 || form.allowedTiers.tier2 || form.allowedTiers.tier3);

  const submit = async () => {
    if (!canSubmit || !form.srt || !form.srtSourcePath) return;
    setSubmitting(true);
    try {
      const id = nanoid();
      const now = Date.now();
      const project: Project = {
        id,
        name: form.name.trim(),
        clientId: form.clientId,
        srtPath: "",
        videoPath: form.videoPath ?? undefined,
        videoFormat: form.videoFormat,
        videoDuration: form.srt.durationSec,
        fps: form.fps,
        settings: {
          graphicsDensity: form.graphicsDensity,
          styleIntensity: form.styleIntensity,
          allowedTiers: form.allowedTiers,
        },
        status: "draft",
        planItems: [],
        createdAt: now,
        updatedAt: now,
      };

      await commands.ensureProjectDir(id);
      const dest = await commands.copySrtIntoProject(id, form.srtSourcePath);
      project.srtPath = dest;

      const created = await commands.createProject(project);
      upsertProject(created);
      navigate(`/projects/${id}/generating`);
    } catch (err) {
      toast.error(`Could not create project: ${String(err)}`);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="New project" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {/* SRT upload */}
          <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Transcript</h2>
            <div className="flex items-start gap-3">
              <Button variant="secondary" onClick={() => void pickSrt()} leadingIcon={<Upload size={14} />}>
                {form.srtSourcePath ? "Replace SRT" : "Select SRT…"}
              </Button>
              {form.srt ? (
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-2 text-text-primary">
                    <FileText size={12} />
                    <span className="truncate font-mono">{form.srtSourcePath}</span>
                  </div>
                  <div className="mt-1 flex gap-4 text-text-muted">
                    <span>{form.srt.blocks.length} blocks</span>
                    <span>{formatSeconds(form.srt.durationSec)} duration</span>
                  </div>
                  {form.srt.durationSec > SOFT_DURATION_CAP_SEC ? (
                    <div className="mt-1 text-2xs text-warn">
                      Long video — Claude may need chunking (not yet in Phase 2). Results may be truncated.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-text-muted">
                  Drop a cleaned-up SRT of the edited cut.
                </div>
              )}
            </div>
          </section>

          {/* Reference video */}
          <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Reference video (optional)</h2>
            <div className="flex items-start gap-3">
              <Button variant="secondary" onClick={() => void pickVideo()} leadingIcon={<Film size={14} />}>
                {form.videoPath ? "Replace video" : "Select video…"}
              </Button>
              {form.videoPath ? (
                <div className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary">
                  {form.videoPath}
                </div>
              ) : (
                <div className="text-xs text-text-muted">
                  Linked by path, never copied (too big). Used for in-app preview only.
                </div>
              )}
            </div>
          </section>

          {/* Metadata */}
          <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Project</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. MAT-BS Rauchmelder Januar"
                />
              </Field>
              <Field label="Theme">
                <select
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                >
                  {themes.length === 0 ? (
                    <option>— no themes —</option>
                  ) : (
                    themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </Field>
              <Field label="Format">
                <div className="flex gap-1">
                  {(["9:16", "1:1", "16:9"] as VideoFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, videoFormat: fmt }))}
                      className={[
                        "h-8 flex-1 rounded-default border text-xs transition-colors",
                        form.videoFormat === fmt
                          ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                          : "border-border-subtle text-text-secondary hover:bg-surface-2",
                      ].join(" ")}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="FPS">
                <div className="flex gap-1">
                  {([30, 60] as Fps[]).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, fps }))}
                      className={[
                        "h-8 flex-1 rounded-default border text-xs transition-colors",
                        form.fps === fps
                          ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                          : "border-border-subtle text-text-secondary hover:bg-surface-2",
                      ].join(" ")}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Settings */}
          <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Analysis settings</h2>
            <div className="space-y-4">
              <Field label="Graphics density">
                <SegmentedSelect<GraphicsDensity>
                  value={form.graphicsDensity}
                  options={[
                    { value: "sparse", label: "Sparse" },
                    { value: "balanced", label: "Balanced" },
                    { value: "dense", label: "Dense" },
                  ]}
                  onChange={(v) => setForm((f) => ({ ...f, graphicsDensity: v }))}
                />
              </Field>
              <Field label="Style intensity">
                <SegmentedSelect<StyleIntensity>
                  value={form.styleIntensity}
                  options={[
                    { value: "subtle", label: "Subtle" },
                    { value: "balanced", label: "Balanced" },
                    { value: "prominent", label: "Prominent" },
                  ]}
                  onChange={(v) => setForm((f) => ({ ...f, styleIntensity: v }))}
                />
              </Field>
              <Field label="Allowed tiers">
                <div className="flex gap-2">
                  <TierToggle
                    label="1 · Handcoded"
                    checked={form.allowedTiers.tier1}
                    onChange={(checked) =>
                      setForm((f) => ({ ...f, allowedTiers: { ...f.allowedTiers, tier1: checked } }))
                    }
                  />
                  <TierToggle
                    label="2 · SVG"
                    checked={form.allowedTiers.tier2}
                    onChange={(checked) =>
                      setForm((f) => ({ ...f, allowedTiers: { ...f.allowedTiers, tier2: checked } }))
                    }
                  />
                  <TierToggle
                    label="3 · Illustration"
                    checked={form.allowedTiers.tier3}
                    onChange={(checked) =>
                      setForm((f) => ({ ...f, allowedTiers: { ...f.allowedTiers, tier3: checked } }))
                    }
                  />
                </div>
              </Field>
            </div>
          </section>

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-text-muted">
              Analyzing kicks off immediately after create and usually takes 10–30 s.
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="md" onClick={() => navigate("/dashboard")}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!canSubmit || submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Creating…" : "Create & analyze"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentedSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "h-8 flex-1 rounded-default border text-xs transition-colors",
            value === opt.value
              ? "border-accent-primary bg-accent-primary/10 text-text-primary"
              : "border-border-subtle text-text-secondary hover:bg-surface-2",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TierToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-default border px-2 py-1.5 text-xs transition-colors",
        checked
          ? "border-accent-primary bg-accent-primary/10 text-text-primary"
          : "border-border-subtle text-text-secondary hover:bg-surface-2",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function suggestNameFrom(path: string): string {
  const segments = path.split(/[/\\]/);
  const file = segments[segments.length - 1] ?? "";
  return file.replace(/\.srt$/i, "");
}
