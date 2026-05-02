import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Wand2, X, Zap } from "lucide-react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { useTimelineStore } from "@/state/timelineStore";
import type { VibeAdjustment } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PRESETS = ["energetisch", "ruhig & cinematic", "verspielt", "professionell"];

export function VibeModeDialog({ open, onClose }: Props) {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const setTrackVolume = useTimelineStore((s) => s.setTrackVolume);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);

  const [vibe, setVibe] = useState("energetisch");
  const [running, setRunning] = useState(false);
  const [adjustment, setAdjustment] = useState<VibeAdjustment | null>(null);

  const videoClips = clips.filter((c) => c.kind === "video");
  const avgClipDur =
    videoClips.length > 0
      ? videoClips.reduce((s, c) => s + c.durationSec, 0) / videoClips.length
      : 0;

  const compute = async () => {
    if (!projectId) return;
    if (!vibe.trim()) {
      toast.error("Describe the vibe.");
      return;
    }
    setRunning(true);
    try {
      const out = await commands.vibeMode({
        projectId,
        vibe,
        currentClipCount: videoClips.length,
        avgClipDurationSec: Number(avgClipDur.toFixed(2)),
      });
      setAdjustment(out);
    } catch (err) {
      toast.error(`Vibe-Mode failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    if (!adjustment) return;
    // Currently-applicable: music volume on the audio tracks.
    let touched = 0;
    for (const t of tracks) {
      if (t.kind === "audio") {
        const next = Math.max(0, Math.min(2, t.volume * adjustment.musicVolumeMultiplier));
        setTrackVolume(t.id, next);
        touched++;
      }
    }
    await saveSnapshot();
    const cutHint =
      adjustment.cutFrequencyMultiplier < 1
        ? `Try splitting clips ${(1 / adjustment.cutFrequencyMultiplier).toFixed(1)}× more often.`
        : adjustment.cutFrequencyMultiplier > 1
          ? `Try ${adjustment.cutFrequencyMultiplier.toFixed(1)}× longer clips.`
          : "Cut frequency stays as-is.";
    toast.success(`Music volume adjusted on ${touched} track(s). ${cutHint}`);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Zap size={14} /> Vibe-Mode
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>

          <Dialog.Description className="mb-3 text-2xs text-text-muted">
            Describe the vibe in natural language. Gemini maps it to cut frequency,
            music energy and volume, and color saturation. Music-volume changes can be
            applied immediately; the rest are advisory for now.
          </Dialog.Description>

          <div className="space-y-3">
            <Input
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="z.B. energetisch und schnell geschnitten"
            />
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setVibe(p)}
                  className="rounded-default bg-surface-3 px-2 py-0.5 text-2xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                >
                  {p}
                </button>
              ))}
            </div>

            {adjustment ? (
              <div className="rounded-default border border-border-subtle bg-surface-0 p-3 text-2xs">
                <Row label="Cut frequency">
                  <span className="font-mono text-text-primary">
                    {adjustment.cutFrequencyMultiplier.toFixed(2)}×
                  </span>
                </Row>
                <Row label="Music energy">
                  <span className="font-mono text-text-primary">
                    {adjustment.musicEnergy}
                  </span>
                </Row>
                <Row label="Music volume">
                  <span className="font-mono text-text-primary">
                    {adjustment.musicVolumeMultiplier.toFixed(2)}×
                  </span>
                </Row>
                <Row label="Saturation">
                  <span className="font-mono text-text-primary">
                    {adjustment.colorSaturation}
                  </span>
                </Row>
                <p className="mt-2 italic text-text-secondary">{adjustment.rationale}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {adjustment ? (
              <Button variant="primary" size="sm" onClick={() => void apply()}>
                Apply music volume
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Wand2 size={12} />}
                onClick={() => void compute()}
                disabled={running}
              >
                {running ? "Mapping…" : "Compute vibe"}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between py-0.5 text-text-secondary">
      <span>{label}</span>
      {children}
    </div>
  );
}
