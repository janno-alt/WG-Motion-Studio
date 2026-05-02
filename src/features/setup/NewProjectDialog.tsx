import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { Palette, Plus, X } from "lucide-react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { useBrandKitsStore } from "@/state/brandKitsStore";
import { useProjectsStore } from "@/state/projectsStore";
import type { Project, VideoFormat } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FORMATS: { value: VideoFormat; label: string; hint: string }[] = [
  { value: "9:16", label: "9:16", hint: "Reels / TikTok / Shorts" },
  { value: "16:9", label: "16:9", hint: "YouTube / Web" },
  { value: "1:1", label: "1:1", hint: "Feed posts" },
];

export function NewProjectDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { brandKits, load: loadKits } = useBrandKitsStore();
  const upsertProject = useProjectsStore((s) => s.upsert);

  const [name, setName] = useState("");
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [fps, setFps] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      void loadKits();
      setName("");
      setBrandKitId(null);
      setFormat("9:16");
      setFps(30);
    }
  }, [open, loadKits]);

  // Default to the first kit once they're loaded.
  useEffect(() => {
    if (open && brandKits.length > 0 && !brandKitId) {
      setBrandKitId(brandKits[0]?.id ?? null);
    }
  }, [open, brandKits, brandKitId]);

  const noBrandKits = brandKits.length === 0;

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give the project a name.");
      return;
    }
    if (!brandKitId) {
      toast.error("Pick a brand kit.");
      return;
    }
    setSubmitting(true);
    try {
      const id = `proj-${nanoid(10)}`;
      const now = Date.now();
      const project: Project = {
        id,
        name: name.trim(),
        clientId: brandKitId,
        srtPath: "",
        videoPath: null,
        videoFormat: format,
        videoDuration: 0,
        fps,
        settings: {},
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
      const saved = await commands.createProject(project);
      await commands.ensureProjectDir(saved.id);
      upsertProject(saved);
      toast.success(`Created "${saved.name}".`);
      onClose();
      navigate(`/projects/${saved.id}`);
    } catch (err) {
      toast.error(`Create failed: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const goToBrandKits = () => {
    onClose();
    navigate("/brand-kits");
  };

  const selectedKit = useMemo(
    () => brandKits.find((k) => k.id === brandKitId) ?? null,
    [brandKits, brandKitId],
  );

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v && !submitting ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              New project
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary"
              disabled={submitting}
            >
              <X size={14} />
            </button>
          </div>

          {noBrandKits ? (
            <div className="rounded-default border border-danger/30 bg-danger/5 p-3 text-2xs">
              <div className="text-text-primary">
                No brand kits yet — every project belongs to one.
              </div>
              <div className="mt-1 text-text-muted">
                Create your first brand kit (logo, colours, fonts, voice profile),
                then come back here.
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<Palette size={12} />}
                  onClick={goToBrandKits}
                >
                  Open brand kits
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Project name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q1 launch reel"
                  autoFocus
                />
              </Field>

              <Field label="Brand kit">
                <select
                  value={brandKitId ?? ""}
                  onChange={(e) => setBrandKitId(e.target.value || null)}
                  className="h-8 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
                >
                  {brandKits.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                      {k.clientName ? ` — ${k.clientName}` : ""}
                    </option>
                  ))}
                </select>
                {selectedKit ? (
                  <div className="mt-1 flex items-center gap-1.5 text-2xs text-text-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-border-subtle"
                      style={{ background: selectedKit.colors.primary }}
                    />
                    <span>{selectedKit.colors.primary}</span>
                    <span
                      className="ml-2 h-2.5 w-2.5 rounded-full border border-border-subtle"
                      style={{ background: selectedKit.colors.accent }}
                    />
                    <span>{selectedKit.colors.accent}</span>
                  </div>
                ) : null}
              </Field>

              <Field label="Format">
                <div className="flex gap-1">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFormat(f.value)}
                      className={[
                        "flex flex-1 flex-col items-center gap-0.5 rounded-default border px-2 py-1.5 transition-colors",
                        format === f.value
                          ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                          : "border-border-subtle bg-surface-0 text-text-secondary hover:border-border",
                      ].join(" ")}
                    >
                      <span className="font-mono text-xs">{f.label}</span>
                      <span className="text-2xs text-text-muted">{f.hint}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="FPS">
                <div className="flex gap-1">
                  {[24, 30, 60].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFps(n)}
                      className={[
                        "rounded-default px-3 py-1 font-mono text-xs transition-colors",
                        fps === n
                          ? "bg-surface-3 text-text-primary"
                          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                      ].join(" ")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            {!noBrandKits ? (
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Plus size={12} />}
                onClick={() => void create()}
                disabled={submitting || !name.trim() || !brandKitId}
              >
                {submitting ? "Creating…" : "Create project"}
              </Button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-primary">{label}</label>
      {children}
    </div>
  );
}
