export interface SrtBlock {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface ParsedSrt {
  blocks: SrtBlock[];
  durationSec: number;
}

/**
 * Minimal tolerant SRT parser. Handles both `hh:mm:ss,mmm` and `hh:mm:ss.mmm`
 * timestamp forms, BOM, `\r\n` / `\n` line endings, and extra whitespace.
 * Not a full WebVTT parser — we only need SRT.
 */
export function parseSrt(raw: string): ParsedSrt {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  if (!text) return { blocks: [], durationSec: 0 };

  const entries = text.split(/\n{2,}/);
  const blocks: SrtBlock[] = [];
  let running = 0;

  for (const entry of entries) {
    const lines = entry.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    // First line may be the numeric index; if so, drop it.
    let i = 0;
    const isIndex = /^\d+$/.test(lines[0] ?? "");
    const indexLine = isIndex ? lines[i++] : null;
    const timingLine = lines[i++];
    if (!timingLine || !/-->/.test(timingLine)) continue;

    const [startRaw, endRaw] = timingLine.split(/\s*-->\s*/);
    if (!startRaw || !endRaw) continue;

    const startSec = parseTimestamp(startRaw);
    const endSec = parseTimestamp(endRaw);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;

    const body = lines.slice(i).join(" ").trim();
    if (!body) continue;

    running += 1;
    blocks.push({
      index: indexLine ? Number(indexLine) : running,
      startSec,
      endSec,
      text: body,
    });
  }

  const durationSec = blocks.length ? (blocks[blocks.length - 1]?.endSec ?? 0) : 0;
  return { blocks, durationSec };
}

function parseTimestamp(s: string): number {
  const m = s.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] ?? "0").padEnd(3, "0"));
  return h * 3600 + min * 60 + sec + ms / 1000;
}

export function formatTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function blockAt(blocks: SrtBlock[], t: number): SrtBlock | null {
  return blocks.find((b) => t >= b.startSec && t <= b.endSec) ?? null;
}
