import * as Dialog from "@radix-ui/react-dialog";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { FilePlus2, Globe, ImageIcon, Sparkles, X } from "lucide-react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import type { BrandKitDraft } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the AI-generated draft when the user clicks "Apply". */
  onApply: (draft: BrandKitDraft) => void;
}

type Mode = "url" | "images";

export function AiBrandKitDialog({ open, onClose, onApply }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState<BrandKitDraft | null>(null);

  const reset = () => {
    setUrl("");
    setPaths([]);
    setInstructions("");
    setDraft(null);
  };

  const close = () => {
    if (running) return;
    reset();
    onClose();
  };

  const pickFiles = async () => {
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!picked) return;
    const arr = Array.isArray(picked) ? picked : [picked];
    setPaths((prev) => {
      const next = [...prev];
      for (const p of arr) {
        if (typeof p === "string" && !next.includes(p)) next.push(p);
      }
      return next.slice(0, 8);
    });
  };

  const generate = async () => {
    setRunning(true);
    setDraft(null);
    try {
      let out: BrandKitDraft;
      if (mode === "url") {
        if (!url.trim()) {
          toast.error("Enter a URL.");
          setRunning(false);
          return;
        }
        out = await commands.aiBrandKitFromUrl({
          url: url.trim(),
          instructions: instructions.trim() || undefined,
        });
      } else {
        if (paths.length === 0) {
          toast.error("Add at least one image.");
          setRunning(false);
          return;
        }
        out = await commands.aiBrandKitFromImages({
          paths,
          instructions: instructions.trim() || undefined,
        });
      }
      setDraft(out);
    } catch (err) {
      toast.error(`Generation failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const apply = () => {
    if (!draft) return;
    onApply(draft);
    reset();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Sparkles size={14} /> Generate brand kit with AI
            </Dialog.Title>
            <button
              type="button"
              onClick={close}
              className="text-text-muted hover:text-text-primary"
              disabled={running}
            >
              <X size={14} />
            </button>
          </div>

          <Dialog.Description className="mb-3 text-2xs text-text-muted">
            Gemini 2.5 Flash reads a website's metadata + favicon, or one or more
            uploaded brand visuals, and proposes colours, fonts, voice tone, and
            music styles. You review the draft before it lands in the editor.
          </Dialog.Description>

          {!draft ? (
            <>
              <div className="mb-3 flex gap-1 rounded-default bg-surface-3 p-0.5">
                <ModeChip
                  active={mode === "url"}
                  onClick={() => setMode("url")}
                  icon={<Globe size={12} />}
                  label="From website"
                />
                <ModeChip
                  active={mode === "images"}
                  onClick={() => setMode("images")}
                  icon={<ImageIcon size={12} />}
                  label="From images"
                />
              </div>

              {mode === "url" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-primary">URL</label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://stripe.com"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-primary">
                    Images ({paths.length}/8)
                  </label>
                  {paths.length > 0 ? (
                    <ul className="space-y-1">
                      {paths.map((p, i) => (
                        <li
                          key={p}
                          className="flex items-center justify-between gap-2 rounded-default border border-border-subtle bg-surface-0 px-2 py-1"
                        >
                          <span className="truncate font-mono text-2xs text-text-secondary" title={p}>
                            {p.split("/").pop()}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPaths(paths.filter((_, j) => j !== i))}
                            className="text-2xs text-text-muted hover:text-danger"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    leadingIcon={<FilePlus2 size={12} />}
                    onClick={() => void pickFiles()}
                    disabled={paths.length >= 8}
                  >
                    Add images
                  </Button>
                </div>
              )}

              <div className="mt-3 space-y-1">
                <label className="text-xs font-medium text-text-primary">
                  Optional context
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={2}
                  placeholder="z.B. Brand für Reels, junges Publikum, Energy-Drink-Vibe"
                  className="w-full rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
                />
              </div>
            </>
          ) : (
            <DraftPreview draft={draft} />
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={close} disabled={running}>
              Cancel
            </Button>
            {draft ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
                  Try again
                </Button>
                <Button variant="primary" size="sm" onClick={apply}>
                  Apply
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Sparkles size={12} />}
                onClick={() => void generate()}
                disabled={running}
              >
                {running ? "Generating…" : "Generate"}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModeChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 items-center justify-center gap-1 rounded-default px-2 py-1 text-xs transition-colors",
        active
          ? "bg-surface-1 text-text-primary"
          : "text-text-secondary hover:text-text-primary",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function DraftPreview({ draft }: { draft: BrandKitDraft }) {
  return (
    <div className="space-y-3">
      {draft.name || draft.clientName ? (
        <div className="rounded-default border border-border-subtle bg-surface-0 p-2.5">
          <div className="text-xs font-medium text-text-primary">
            {draft.name ?? "Untitled"}
          </div>
          {draft.clientName ? (
            <div className="text-2xs text-text-muted">{draft.clientName}</div>
          ) : null}
        </div>
      ) : null}

      {draft.colors ? (
        <div>
          <div className="mb-1 text-2xs uppercase tracking-wide text-text-muted">
            Colours
          </div>
          <div className="flex gap-2">
            {(["primary", "secondary", "accent", "background"] as const).map((k) => {
              const v = draft.colors?.[k];
              return v ? (
                <div key={k} className="flex flex-col items-center gap-0.5">
                  <span
                    className="h-7 w-7 rounded-default border border-border-subtle"
                    style={{ background: v }}
                  />
                  <span className="font-mono text-2xs text-text-muted">{v}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      ) : null}

      {draft.typography?.headlineFont || draft.typography?.bodyFont ? (
        <div>
          <div className="mb-1 text-2xs uppercase tracking-wide text-text-muted">
            Typography
          </div>
          <div className="flex gap-3 text-xs text-text-secondary">
            {draft.typography?.headlineFont ? (
              <span>Headline: <span className="text-text-primary">{draft.typography.headlineFont}</span></span>
            ) : null}
            {draft.typography?.bodyFont ? (
              <span>Body: <span className="text-text-primary">{draft.typography.bodyFont}</span></span>
            ) : null}
          </div>
        </div>
      ) : null}

      {draft.voiceProfile?.tone ? (
        <div>
          <div className="mb-1 text-2xs uppercase tracking-wide text-text-muted">
            Voice
          </div>
          <span className="inline-block rounded-full bg-surface-3 px-2 py-0.5 text-2xs text-text-primary">
            {draft.voiceProfile.tone}
          </span>
          {draft.voiceProfile.notes ? (
            <div className="mt-1 text-2xs text-text-muted">{draft.voiceProfile.notes}</div>
          ) : null}
        </div>
      ) : null}

      {draft.musicStyles && draft.musicStyles.length > 0 ? (
        <div>
          <div className="mb-1 text-2xs uppercase tracking-wide text-text-muted">
            Music styles
          </div>
          <div className="flex flex-wrap gap-1">
            {draft.musicStyles.map((m) => (
              <span
                key={m}
                className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs text-text-secondary"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {draft.styleNotes ? (
        <div>
          <div className="mb-1 text-2xs uppercase tracking-wide text-text-muted">
            Style notes
          </div>
          <div className="text-2xs text-text-secondary">{draft.styleNotes}</div>
        </div>
      ) : null}

      <div className="rounded-default border border-accent-primary/20 bg-accent-primary/5 p-2 text-2xs italic text-text-secondary">
        {draft.rationale}
      </div>
    </div>
  );
}
