import { Lottie } from "@remotion/lottie";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { AbsoluteFill } from "remotion";

import type { LottieData } from "@/types";
import { DEFAULT_LOTTIE, readClipData } from "@/types";

export function LottieClip({
  data,
}: {
  data: Record<string, unknown> | null;
}) {
  const d = readClipData<LottieData>(data, DEFAULT_LOTTIE);
  const [animation, setAnimation] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!d.templatePath) {
        setAnimation(null);
        return;
      }
      try {
        const url = convertFileSrc(d.templatePath);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          const overridden = applyColorOverrides(json, d.colorOverrides);
          setAnimation(overridden);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [d.templatePath, d.colorOverrides]);

  if (error) {
    return (
      <AbsoluteFill
        style={{
          background: "#1A1A1A",
          color: "#FF7F50",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          fontSize: 24,
        }}
      >
        Lottie load failed
      </AbsoluteFill>
    );
  }

  if (!animation) {
    return (
      <AbsoluteFill
        style={{ background: "transparent", alignItems: "center", justifyContent: "center" }}
      />
    );
  }

  return (
    <AbsoluteFill>
      <Lottie animationData={animation as never} loop={false} />
    </AbsoluteFill>
  );
}

/**
 * Walks a Lottie JSON tree and replaces hex colour overrides on shape fills
 * and strokes. Lottie stores colour as a 4-element [r,g,b,a] float array
 * (0..1). We map "#RRGGBB" → matching float triple and replace.
 *
 * This is a soft override: if no key matches, the original colour stays.
 */
function applyColorOverrides(
  json: unknown,
  overrides: Record<string, string>,
): unknown {
  if (Object.keys(overrides).length === 0) return json;
  const fromMap = new Map(
    Object.entries(overrides).map(([from, to]) => [normalizeHex(from), to] as const),
  );

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const keys = Object.keys(obj);
      const next: Record<string, unknown> = {};
      for (const k of keys) {
        next[k] = walk(obj[k]);
      }
      // Replace shape-fill / stroke colours: { ty: 'fl' | 'st', c: { k: [r,g,b,a] } }
      if ((next.ty === "fl" || next.ty === "st") && typeof next.c === "object" && next.c) {
        const c = next.c as Record<string, unknown>;
        if (Array.isArray(c.k) && c.k.length >= 3) {
          const hex = floatRgbToHex(c.k as number[]);
          const replacement = fromMap.get(hex);
          if (replacement) {
            const [r, g, b] = hexToFloatRgb(replacement);
            const alpha = (c.k[3] as number) ?? 1;
            next.c = { ...c, k: [r, g, b, alpha] };
          }
        }
      }
      return next;
    }
    return node;
  }

  return walk(json);
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().toLowerCase();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function floatRgbToHex(rgb: number[]): string {
  const [r, g, b] = rgb;
  if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return "";
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (
    "#" +
    toByte(r).toString(16).padStart(2, "0") +
    toByte(g).toString(16).padStart(2, "0") +
    toByte(b).toString(16).padStart(2, "0")
  );
}

function hexToFloatRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}
