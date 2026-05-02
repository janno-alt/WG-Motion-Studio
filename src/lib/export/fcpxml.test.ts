import { describe, expect, it } from "vitest";

import { buildFcpxml, rationalSec } from "./fcpxml";
import type { Asset, BrandKit, Clip, Timeline, Track } from "@/types";

function asset(id: string, name: string, dur: number): Asset {
  return {
    id,
    projectId: "p1",
    kind: "video",
    name,
    path: `/Users/janno/Movies/${name}`,
    thumbnailPath: null,
    durationSec: dur,
    width: 1920,
    height: 1080,
    fps: 30,
    audioChannels: 2,
    audioSampleRate: 48000,
    sizeBytes: 0,
    importedAt: 0,
  };
}

function track(id: string, kind: Track["kind"], order: number): Track {
  return {
    id,
    projectId: "p1",
    kind,
    name: id.toUpperCase(),
    sortOrder: order,
    muted: false,
    hidden: false,
    volume: 1,
    pan: 0,
  };
}

function clip(
  partial: Partial<Clip> & Pick<Clip, "id" | "trackId" | "kind" | "startSec" | "durationSec">,
): Clip {
  return {
    assetId: null,
    inPointSec: 0,
    outPointSec: partial.durationSec,
    data: null,
    sortOrder: 0,
    ...partial,
  };
}

const FORMAT_9_16 = { width: 1080, height: 1920 };

describe("rationalSec", () => {
  it("encodes zero correctly", () => {
    expect(rationalSec(0, 3000)).toBe("0s");
  });

  it("rounds to nearest frame on the timebase", () => {
    // 2.5s @ tb=3000 → 7500/3000s
    expect(rationalSec(2.5, 3000)).toBe("7500/3000s");
  });

  it("rounds 0.0333s to 1/30 → 100/3000s", () => {
    expect(rationalSec(0.0333, 3000)).toBe("100/3000s");
  });
});

describe("buildFcpxml", () => {
  const baseTimeline: Timeline = {
    projectId: "p1",
    tracks: [track("v1", "video", 0), track("a1", "audio", 1), track("cap", "captions", 2)],
    clips: [],
  };
  const baseInput = {
    brandKit: null as BrandKit | null,
    fps: 30,
    format: FORMAT_9_16,
    projectName: "Demo project",
  };

  it("emits resources + spine for a single V1 video clip", () => {
    const xml = buildFcpxml({
      ...baseInput,
      timeline: {
        ...baseTimeline,
        clips: [
          clip({
            id: "c1",
            trackId: "v1",
            kind: "video",
            assetId: "a1",
            startSec: 0,
            durationSec: 5,
            outPointSec: 5,
          }),
        ],
      },
      assets: [asset("a1", "intro.mp4", 12)],
    });

    expect(xml).toContain("<fcpxml version=\"1.10\">");
    expect(xml).toContain("<resources>");
    expect(xml).toContain("<format id=\"r0\"");
    expect(xml).toContain("frameDuration=\"100/3000s\"");
    expect(xml).toContain("width=\"1080\" height=\"1920\"");
    expect(xml).toContain("<asset id=\"r1\"");
    expect(xml).toContain("name=\"intro.mp4\"");
    expect(xml).toContain("hasVideo=\"1\" hasAudio=\"1\"");
    expect(xml).toContain("<spine>");
    expect(xml).toContain("<asset-clip ref=\"r1\" offset=\"0s\"");
    expect(xml).toContain("duration=\"15000/3000s\"");
  });

  it("places V2 clips on lane=1 connected to V1", () => {
    const xml = buildFcpxml({
      ...baseInput,
      timeline: {
        projectId: "p1",
        tracks: [
          track("v1", "video", 0),
          track("v2", "video", 1),
          track("a1", "audio", 2),
        ],
        clips: [
          clip({ id: "v1c", trackId: "v1", kind: "video", assetId: "ast1", startSec: 0, durationSec: 10, outPointSec: 10 }),
          clip({ id: "v2c", trackId: "v2", kind: "video", assetId: "ast2", startSec: 2, durationSec: 3, outPointSec: 3 }),
        ],
      },
      assets: [asset("ast1", "main.mp4", 10), asset("ast2", "broll.mp4", 5)],
    });

    expect(xml).toContain("name=\"v1c\"");
    expect(xml).toContain("name=\"v2c\"");
    // The connected V2 clip should carry lane="1" and offset relative to V1
    expect(xml).toMatch(/<asset-clip[^>]*lane="1"[^>]*name="v2c"/);
    expect(xml).toMatch(/<asset-clip[^>]*offset="6000\/3000s"[^>]*name="v2c"/);
  });

  it("encodes audio clips on negative lanes with srcEnable", () => {
    const xml = buildFcpxml({
      ...baseInput,
      timeline: {
        projectId: "p1",
        tracks: [track("v1", "video", 0), track("a1", "audio", 1)],
        clips: [
          clip({ id: "v1c", trackId: "v1", kind: "video", assetId: "ast1", startSec: 0, durationSec: 8, outPointSec: 8 }),
          clip({
            id: "music",
            trackId: "a1",
            kind: "audio",
            assetId: "song",
            startSec: 1,
            durationSec: 6,
            inPointSec: 0,
            outPointSec: 6,
          }),
        ],
      },
      assets: [asset("ast1", "video.mp4", 10), asset("song", "song.mp3", 60)],
    });

    expect(xml).toMatch(/<asset-clip[^>]*lane="-1"[^>]*name="music"[^>]*srcEnable="audio"/);
  });

  it("captures captions as <title> elements with text-style", () => {
    const xml = buildFcpxml({
      ...baseInput,
      timeline: {
        ...baseTimeline,
        clips: [
          clip({
            id: "cap1",
            trackId: "cap",
            kind: "caption",
            startSec: 1,
            durationSec: 2,
            outPointSec: 2,
            data: { text: "Hello & welcome" },
          }),
          clip({
            id: "v1c",
            trackId: "v1",
            kind: "video",
            assetId: "a1",
            startSec: 0,
            durationSec: 5,
            outPointSec: 5,
          }),
        ],
      },
      assets: [asset("a1", "intro.mp4", 12)],
    });

    expect(xml).toContain("<title");
    expect(xml).toContain("Hello &amp; welcome");
    expect(xml).toContain("text-style-def");
  });

  it("file paths get URI-encoded", () => {
    const xml = buildFcpxml({
      ...baseInput,
      timeline: {
        ...baseTimeline,
        clips: [
          clip({
            id: "c1",
            trackId: "v1",
            kind: "video",
            assetId: "a1",
            startSec: 0,
            durationSec: 5,
            outPointSec: 5,
          }),
        ],
      },
      assets: [
        {
          ...asset("a1", "my film & cut.mp4", 10),
          path: "/Users/janno/Movies/My Project/my film & cut.mp4",
        },
      ],
    });

    expect(xml).toContain("src=\"file:///Users/janno/Movies/My%20Project/my%20film%20%26%20cut.mp4\"");
  });
});
