import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Scissors, X } from "lucide-react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { useAssetsStore } from "@/state/assetsStore";
import { useTimelineStore } from "@/state/timelineStore";

const EMPTY_ASSETS: Asset[] = [];
import {
  DEFAULT_SILENCE_PARAMS,
  type Asset,
  type SilenceParams,
  type SilenceRange,
} from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AutoCutDialog({ open, onClose }: Props) {
  const projectId = useTimelineStore((s) => s.projectId);
  const clips = useTimelineStore((s) => s.clips);
  const tracks = useTimelineStore((s) => s.tracks);
  const applyRippleAutoCut = useTimelineStore((s) => s.applyRippleAutoCut);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const assets = useAssetsStore((s) =>
    projectId ? s.byProject[projectId] ?? EMPTY_ASSETS : EMPTY_ASSETS,
  );

  const [params, setParams] = useState<SilenceParams>(DEFAULT_SILENCE_PARAMS);
  const [ranges, setRanges] = useState<SilenceRange[] | null>(null);
  const [running, setRunning] = useState(false);

  // Pick the longest video clip on V1 as the auto-cut target.
  const v1 = tracks.find((t) => t.kind === "video");
  const target = v1
    ? [...clips]
        .filter((c) => c.trackId === v1.id && c.kind === "video" && c.assetId)
        .sort((a, b) => b.durationSec - a.durationSec)[0]
    : undefined;
  const targetAsset: Asset | undefined = target?.assetId
    ? assets.find((a) => a.id === target.assetId)
    : undefined;

  useEffect(() => {
    if (!open) {
      setRanges(null);
    }
  }, [open]);

  const detect = async () => {
    if (!target || !targetAsset) {
      toast.error("Add a video clip on V1 first.");
      return;
    }
    setRunning(true);
    try {
      const r = await commands.detectSilenceInAsset(targetAsset.id, params);
      setRanges(r);
    } catch (err) {
      toast.error(`Detection failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    if (!target || !ranges) return;
    const removed = applyRippleAutoCut(target.id, ranges);
    await saveSnapshot();
    toast.success(`Removed ${removed.toFixed(1)}s of silence.`);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-1 p-4 shadow-popover">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Scissors size={14} /> Auto-cut silences
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
            Runs FFmpeg silencedetect on the longest V1 clip's source asset, then
            ripple-deletes any silent ranges.
          </Dialog.Description>

          <div className="space-y-3">
            <ParamRow
              label="Threshold (dB)"
              value={params.thresholdDb}
              onChange={(v) => setParams((p) => ({ ...p, thresholdDb: v }))}
              step={1}
              min={-60}
              max={-10}
            />
            <ParamRow
              label="Min duration (s)"
              value={params.minDurationSec}
              onChange={(v) => setParams((p) => ({ ...p, minDurationSec: v }))}
              step={0.1}
              min={0.1}
              max={5}
            />

            <div className="rounded-default border border-border-subtle bg-surface-0 px-3 py-2 text-2xs text-text-secondary">
              {target && targetAsset ? (
                <>
                  Target: <span className="text-text-primary">{targetAsset.name}</span>
                  {" — "}
                  {target.durationSec.toFixed(1)}s on V1
                </>
              ) : (
                <span className="text-text-muted">No V1 video clip yet.</span>
              )}
            </div>

            {ranges ? (
              <div className="rounded-default border border-border-subtle bg-surface-0 px-3 py-2 text-2xs">
                <div className="text-text-secondary">
                  Found <span className="text-text-primary">{ranges.length}</span> silent range
                  {ranges.length === 1 ? "" : "s"}
                  {" — "}
                  {ranges.reduce((s, r) => s + (r.endSec - r.startSec), 0).toFixed(1)}s total.
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {ranges && ranges.length > 0 ? (
              <Button variant="primary" size="sm" onClick={() => void apply()}>
                Apply ripple cut
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void detect()}
                disabled={running || !target}
              >
                {running ? "Detecting…" : "Detect silences"}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ParamRow({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-32 text-xs text-text-secondary">{label}</label>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 w-16 font-mono text-xs"
      />
    </div>
  );
}
