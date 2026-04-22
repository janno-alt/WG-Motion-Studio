/**
 * FCPXML v1.10 builder for DaVinci Resolve import.
 *
 * Resolve is strict about the rational time format: values must be
 * `N/Ds` where D is the timebase (usually `fps × 100` or the fps denominator
 * × 100 for drop-frame). We emit `N/{fps * 100}s` for simplicity; Resolve
 * accepts and normalizes these transparently.
 */

import type { PlanItem, Project } from "@/types";

export interface FcpxmlAsset {
  id: string;
  /** Absolute path to an overlay WebM (or ProRes MOV). */
  path: string;
  durationSec: number;
}

export interface FcpxmlInput {
  project: Project;
  /** One entry per plan item that has a rendered overlay. */
  assets: Map<string, FcpxmlAsset>;
}

export function buildFcpxml(input: FcpxmlInput): string {
  const { project } = input;
  const fps = project.fps;
  const tb = fps * 100;

  const items = project.planItems.filter((p) => input.assets.has(p.id));

  const width = formatDims(project.videoFormat).w;
  const height = formatDims(project.videoFormat).h;

  const resources = [
    `<format id="r1" name="FFVideoFormat${height}p" frameDuration="${rationalFrame(fps)}" width="${width}" height="${height}"/>`,
    ...items.map((item) => {
      const asset = input.assets.get(item.id)!;
      return assetElement(asset, fps, tb);
    }),
  ].join("\n    ");

  const durationFrames = secondsToFrames(project.videoDuration, fps);

  const spine = items
    .map((item) => spineEntry(item, input.assets.get(item.id)!, fps, tb))
    .join("\n          ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    ${resources}
  </resources>
  <library>
    <event name="${esc(project.name)}">
      <project name="${esc(project.name)}">
        <sequence format="r1" duration="${rational(durationFrames, tb, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
          ${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

/* -------------------------------------------------------------------------- */
/*  Elements                                                                   */
/* -------------------------------------------------------------------------- */

function assetElement(asset: FcpxmlAsset, fps: number, tb: number): string {
  const durationFrames = secondsToFrames(asset.durationSec, fps);
  const src = `file://${encodeURI(asset.path)}`;
  return `<asset id="${esc(resourceId(asset.id))}" name="${esc(asset.id)}" src="${esc(src)}" start="0s" duration="${rational(durationFrames, tb, fps)}" hasVideo="1" format="r1"/>`;
}

function spineEntry(item: PlanItem, asset: FcpxmlAsset, fps: number, tb: number): string {
  const offset = rational(secondsToFrames(item.timestamp, fps), tb, fps);
  const duration = rational(secondsToFrames(asset.durationSec, fps), tb, fps);
  return `<video ref="${esc(resourceId(asset.id))}" offset="${offset}" duration="${duration}" lane="1" start="0s" name="${esc(shortName(item))}"/>`;
}

/* -------------------------------------------------------------------------- */
/*  Time utilities                                                             */
/* -------------------------------------------------------------------------- */

export function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

/**
 * `N/Ds` where D = timebase. The numerator is `frames × (timebase / fps)`.
 */
export function rational(frames: number, timebase: number, fps: number): string {
  const num = frames * (timebase / fps);
  return `${num}/${timebase}s`;
}

export function rationalFrame(fps: number): string {
  // Frame duration = 1/fps, expressed as {timebase/fps}/timebase.
  // For 30 fps → 100/3000s; for 60 → 100/6000s.
  const timebase = fps * 100;
  return `${timebase / fps}/${timebase}s`;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function resourceId(itemId: string): string {
  return `r_${itemId}`;
}

function shortName(item: PlanItem): string {
  return (item.brief || item.id).slice(0, 60);
}

function formatDims(fmt: Project["videoFormat"]): { w: number; h: number } {
  switch (fmt) {
    case "1:1":
      return { w: 1080, h: 1080 };
    case "16:9":
      return { w: 1920, h: 1080 };
    case "9:16":
    default:
      return { w: 1080, h: 1920 };
  }
}

/** XML attribute-safe escape. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
