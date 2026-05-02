import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Pro-Mode wrapper around Theatre.js studio. The studio bundle is ~1 MB,
 * so we lazy-load both `@theatre/core` and `@theatre/studio` on first
 * activation. Once initialised, Theatre attaches a global panel UI to the
 * body and the user keyframes via that panel directly.
 *
 * Wave 4 ships the lazy-load + a single demo project so the user can
 * verify the integration works. Wire up Sheet objects per graphic clip in
 * Wave 5+ when the editing UX is fleshed out.
 */

interface Props {
  enabled: boolean;
  onClose: () => void;
}

let theatreInitialised = false;

export function TheatreStudio({ enabled, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || theatreInitialised) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [core, studio] = await Promise.all([
          import("@theatre/core"),
          import("@theatre/studio"),
        ]);
        if (cancelled) return;
        const project = core.getProject("WG Video Studio (preview)");
        const sheet = project.sheet("Demo");
        sheet.object("Logo intro", { x: 0, scale: 1, opacity: 1 });
        studio.default.initialize();
        theatreInitialised = true;
        toast.success("Theatre.js studio loaded.");
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          toast.error(`Theatre.js failed to load: ${e}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-30 rounded-card border border-border bg-surface-1 p-2 text-2xs text-text-secondary shadow-popover">
      <div className="pointer-events-auto flex items-center gap-2">
        <span className="font-mono text-text-primary">Pro mode</span>
        {loading ? <span>loading studio…</span> : error ? <span className="text-danger">{error}</span> : <span>active</span>}
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
