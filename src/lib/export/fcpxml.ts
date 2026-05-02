/**
 * FCPXML 1.10 builder for the new NLE timeline schema. Output round-trips
 * through Final Cut Pro X and DaVinci Resolve.
 *
 * Time encoding: FCP uses rational time `N/Ds`. Timebase D = fps × 100 keeps
 * frame boundaries clean for both 30 and 29.97 fps. Sub-frame seconds round
 * to the nearest frame. Negative lanes carry audio; positive lanes carry
 * connected (V2+) video.
 */

import type { Asset, BrandKit, Clip, Timeline, Track } from "@/types";

export interface FcpxmlInput {
  timeline: Timeline;
  assets: Asset[];
  brandKit: BrandKit | null;
  fps: number;
  format: { width: number; height: number };
  projectName: string;
}

export function buildFcpxml(input: FcpxmlInput): string {
  const tb = input.fps * 100;

  // Asset id allocation
  const formatId = "r0";
  const assetIds = new Map<string, string>();
  let nextId = 1;
  for (const a of input.assets) {
    if (!assetIds.has(a.id)) {
      assetIds.set(a.id, `r${nextId++}`);
    }
  }

  // Timeline duration in seconds (max clip end)
  const totalDur = input.timeline.clips.reduce(
    (m, c) => Math.max(m, c.startSec + c.durationSec),
    0,
  );

  const tracksByKind = (kind: Track["kind"]) =>
    input.timeline.tracks
      .filter((t) => t.kind === kind)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const videoTracks = tracksByKind("video");
  const audioTracks = tracksByKind("audio");
  const captionsTrack = input.timeline.tracks.find((t) => t.kind === "captions");

  const v1 = videoTracks[0];

  /* ---------------- resources ---------------- */
  const formatLine = `      <format id="${formatId}" name="WG-${input.format.width}x${input.format.height}-${input.fps}p" frameDuration="${rational(1, input.fps, tb)}" width="${input.format.width}" height="${input.format.height}"/>`;

  const assetLines: string[] = input.assets.map((a) => {
    const dur = a.durationSec ?? 0;
    const hasVideo = a.kind === "video" || a.kind === "image" ? "1" : "0";
    const hasAudio = a.kind === "video" || a.kind === "audio" ? "1" : "0";
    return `      <asset id="${assetIds.get(a.id)}" name="${escapeXml(a.name)}" src="${pathToUrl(a.path)}" duration="${rationalSec(dur, tb)}" hasVideo="${hasVideo}" hasAudio="${hasAudio}" format="${formatId}" start="0s"/>`;
  });

  /* ---------------- spine: V1 sequential clips + connected V2+/audio/captions ---------------- */
  const v1Clips = v1
    ? input.timeline.clips
        .filter((c) => c.trackId === v1.id && (c.kind === "video" || c.kind === "image"))
        .sort((a, b) => a.startSec - b.startSec)
    : [];

  const spineEntries: string[] = v1Clips.map((c) => {
    const ref = assetIds.get(c.assetId ?? "");
    if (!ref) return "";
    const offset = rationalSec(c.startSec, tb);
    const duration = rationalSec(c.durationSec, tb);
    const start = rationalSec(c.inPointSec, tb);
    const inner = collectConnectedFor(c, input, assetIds, tb, videoTracks, audioTracks);
    return `        <asset-clip ref="${ref}" offset="${offset}" duration="${duration}" start="${start}" name="${escapeXml(c.id)}">
${inner}        </asset-clip>`;
  });

  // If V1 has no clips but other tracks have content, emit a placeholder gap
  // so the connected clips still anchor to a spine entry.
  if (spineEntries.length === 0 && totalDur > 0) {
    const allConnected = collectAllConnected(input, assetIds, tb, videoTracks, audioTracks, true);
    spineEntries.push(
      `        <gap offset="0s" duration="${rationalSec(totalDur, tb)}" start="0s">
${allConnected}        </gap>`,
    );
  }

  // Caption clips become <title> elements connected to the spine.
  const captionEntries: string[] = (captionsTrack
    ? input.timeline.clips.filter((c) => c.trackId === captionsTrack.id)
    : []
  ).map((c) => {
    const text =
      c.data && typeof c.data["text"] === "string" ? (c.data["text"] as string) : "";
    return `        <title offset="${rationalSec(c.startSec, tb)}" duration="${rationalSec(c.durationSec, tb)}" lane="3" start="0s" name="caption">
          <text>
            <text-style ref="ts1">${escapeXml(text)}</text-style>
          </text>
          <text-style-def id="ts1"><text-style font="${escapeXml(input.brandKit?.typography.bodyFont ?? "Inter")}" fontSize="56" fontColor="1 1 1 1"/></text-style-def>
        </title>`;
  });

  const spine = [...spineEntries, ...captionEntries].filter((s) => s.length > 0).join("\n");

  /* ---------------- assemble ---------------- */
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
${formatLine}
${assetLines.join("\n")}
  </resources>
  <library>
    <event name="${escapeXml(input.projectName)}">
      <project name="${escapeXml(input.projectName)}">
        <sequence format="${formatId}" duration="${rationalSec(totalDur, tb)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;

  return xml;
}

/* -------------------------------------------------------------- helpers -- */

function collectConnectedFor(
  primary: Clip,
  input: FcpxmlInput,
  assetIds: Map<string, string>,
  tb: number,
  videoTracks: Track[],
  audioTracks: Track[],
): string {
  const lines: string[] = [];

  // V2+ video clips that overlap the primary's [start, start+dur] window
  videoTracks.slice(1).forEach((t, idx) => {
    const lane = idx + 1;
    const overlapping = input.timeline.clips.filter(
      (c) =>
        c.trackId === t.id &&
        (c.kind === "video" || c.kind === "image") &&
        rangesOverlap(c.startSec, c.durationSec, primary.startSec, primary.durationSec),
    );
    for (const c of overlapping) {
      const ref = assetIds.get(c.assetId ?? "");
      if (!ref) continue;
      // Connected clip offset is relative to the primary's start.
      const relOffset = c.startSec - primary.startSec;
      lines.push(
        `          <asset-clip ref="${ref}" offset="${rationalSec(relOffset, tb)}" duration="${rationalSec(c.durationSec, tb)}" start="${rationalSec(c.inPointSec, tb)}" lane="${lane}" name="${escapeXml(c.id)}"/>`,
      );
    }
  });

  // Audio tracks → negative lanes
  audioTracks.forEach((t, idx) => {
    const lane = -(idx + 1);
    const overlapping = input.timeline.clips.filter(
      (c) =>
        c.trackId === t.id &&
        c.kind === "audio" &&
        rangesOverlap(c.startSec, c.durationSec, primary.startSec, primary.durationSec),
    );
    for (const c of overlapping) {
      const ref = assetIds.get(c.assetId ?? "");
      if (!ref) continue;
      const relOffset = c.startSec - primary.startSec;
      lines.push(
        `          <asset-clip ref="${ref}" offset="${rationalSec(relOffset, tb)}" duration="${rationalSec(c.durationSec, tb)}" start="${rationalSec(c.inPointSec, tb)}" lane="${lane}" name="${escapeXml(c.id)}" srcEnable="audio"/>`,
      );
    }
  });

  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

function collectAllConnected(
  input: FcpxmlInput,
  assetIds: Map<string, string>,
  tb: number,
  videoTracks: Track[],
  audioTracks: Track[],
  _includeV1: boolean,
): string {
  const lines: string[] = [];
  const allVideo = [...videoTracks];
  allVideo.forEach((t, idx) => {
    const lane = idx + 1;
    const clips = input.timeline.clips
      .filter((c) => c.trackId === t.id && (c.kind === "video" || c.kind === "image"))
      .sort((a, b) => a.startSec - b.startSec);
    for (const c of clips) {
      const ref = assetIds.get(c.assetId ?? "");
      if (!ref) continue;
      lines.push(
        `          <asset-clip ref="${ref}" offset="${rationalSec(c.startSec, tb)}" duration="${rationalSec(c.durationSec, tb)}" start="${rationalSec(c.inPointSec, tb)}" lane="${lane}" name="${escapeXml(c.id)}"/>`,
      );
    }
  });
  audioTracks.forEach((t, idx) => {
    const lane = -(idx + 1);
    const clips = input.timeline.clips
      .filter((c) => c.trackId === t.id && c.kind === "audio")
      .sort((a, b) => a.startSec - b.startSec);
    for (const c of clips) {
      const ref = assetIds.get(c.assetId ?? "");
      if (!ref) continue;
      lines.push(
        `          <asset-clip ref="${ref}" offset="${rationalSec(c.startSec, tb)}" duration="${rationalSec(c.durationSec, tb)}" start="${rationalSec(c.inPointSec, tb)}" lane="${lane}" name="${escapeXml(c.id)}" srcEnable="audio"/>`,
      );
    }
  });
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

function rangesOverlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

/** Rational seconds: rounds to nearest frame on the given timebase. */
export function rationalSec(seconds: number, timebase: number): string {
  if (seconds <= 0) return "0s";
  const num = Math.round(seconds * timebase);
  return rational(num, timebase, timebase);
}

export function rational(num: number, den: number, timebase: number): string {
  // Force the timebase to exactly D so FCP doesn't rebase. We always emit
  // `<num>/<timebase>s` even when the fraction is reducible.
  if (timebase === den) return `${num}/${den}s`;
  // Convert num/den into the common timebase by scaling.
  const scaled = Math.round((num / den) * timebase);
  return `${scaled}/${timebase}s`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pathToUrl(path: string): string {
  if (path.startsWith("file://")) return path;
  // Encode URI components but keep slashes
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded.startsWith("/") ? "" : "/"}${encoded}`;
}
