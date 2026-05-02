import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/Button";
import { commands } from "@/lib/tauri";
import { useTimelineStore } from "@/state/timelineStore";
import type { HookSuggestion } from "@/types";

export function AutoHookPanel() {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);

  const [suggestions, setSuggestions] = useState<HookSuggestion[] | null>(null);
  const [running, setRunning] = useState(false);

  const captionsTrack = tracks.find((t) => t.kind === "captions");
  const captionClips = captionsTrack
    ? [...clips]
        .filter((c) => c.trackId === captionsTrack.id)
        .sort((a, b) => a.startSec - b.startSec)
    : [];
  const captionsJoined = captionClips
    .map((c) => (c.data && typeof c.data["text"] === "string" ? (c.data["text"] as string) : ""))
    .filter(Boolean)
    .join(" ");

  const generate = async () => {
    if (!projectId) return;
    if (!captionsJoined) {
      toast.error("Generate captions first.");
      return;
    }
    setRunning(true);
    try {
      const out = await commands.autoHook({
        projectId,
        captionsJoined,
        voiceTone: null,
      });
      setSuggestions(out);
    } catch (err) {
      toast.error(`Auto-Hook failed: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const apply = async (hook: HookSuggestion) => {
    const first = captionClips[0];
    if (!first) {
      toast.error("No caption to replace.");
      return;
    }
    const next = clips.map((c) =>
      c.id === first.id
        ? { ...c, data: { ...(c.data ?? {}), text: hook.text } }
        : c,
    );
    useTimelineStore.setState({ clips: next });
    await saveSnapshot();
    toast.success("Hook applied to first caption.");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-3 py-2">
        <Sparkles size={14} className="text-text-muted" />
        <span className="text-xs font-medium text-text-primary">Auto-Hook</span>
      </div>
      <div className="border-b border-border-subtle bg-surface-1 px-3 py-2">
        <Button
          variant="primary"
          size="sm"
          leadingIcon={<Wand2 size={12} />}
          onClick={() => void generate()}
          disabled={running || captionsJoined.length === 0}
        >
          {running ? "Generating…" : "Generate 3 hooks"}
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-surface-0 p-3">
        {!suggestions ? (
          <div className="text-2xs text-text-muted">
            Reads your existing captions, asks Gemini for 3 alternative opening
            hooks, then lets you replace the first caption with the one you pick.
          </div>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="rounded-card border border-border-subtle bg-surface-1 p-2.5"
              >
                <div className="text-sm font-medium text-text-primary">{s.text}</div>
                <div className="mt-1 text-2xs text-text-muted">{s.rationale}</div>
                <div className="mt-2 flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => void apply(s)}>
                    Apply
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
