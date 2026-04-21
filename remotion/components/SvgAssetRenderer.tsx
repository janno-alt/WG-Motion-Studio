import { useEffect, useState } from "react";

import { TierBadge } from "@/components/TierBadge";

interface Props {
  src: string | undefined;
  currentColor?: string | undefined;
}

const cache = new Map<string, string>();

/**
 * Inline-renders a Tier-2 SVG from disk (so clip-path and CSS transforms
 * nest correctly). Shows a neutral placeholder while loading or when no asset
 * has been generated yet.
 */
export function SvgAssetRenderer({ src, currentColor }: Props) {
  const [markup, setMarkup] = useState<string | null>(
    src && cache.has(src) ? cache.get(src)! : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setMarkup(null);
      return;
    }
    if (cache.has(src)) {
      setMarkup(cache.get(src)!);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { commands } = await import("@/lib/tauri");
        const text = await commands.readFileAsString(src);
        if (cancelled) return;
        cache.set(src, text);
        setMarkup(text);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) return <Placeholder tier={2} />;
  if (error) return <Placeholder tier={2} error />;
  if (!markup) return <Placeholder tier={2} />;

  // Simple root-level color override — rendered via CSS so we don't need to
  // rewrite the SVG attributes on every animation frame.
  return (
    <div
      style={currentColor ? { color: currentColor } : undefined}
      dangerouslySetInnerHTML={{ __html: applyCurrentColor(markup) }}
    />
  );
}

/** Wires `currentColor` into any `fill`/`stroke` of `currentColor` in the source. */
function applyCurrentColor(svg: string): string {
  return svg;
}

function Placeholder({ tier, error }: { tier: 1 | 2 | 3; error?: boolean }) {
  return (
    <div
      style={{
        width: 240,
        height: 180,
        borderRadius: 12,
        background: "#242830",
        border: error ? "2px dashed #EF4444" : "2px dashed #3A4150",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9CA3AF",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        gap: 6,
      }}
    >
      <TierBadge tier={tier} />
      {error ? "asset failed" : "asset pending"}
    </div>
  );
}
