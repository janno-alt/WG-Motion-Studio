import { describe, expect, test } from "vitest";

import type { PlanItem, Project } from "@/types";
import { buildFcpxml, esc, rational, rationalFrame, secondsToFrames } from "./fcpxml";

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Test Project",
    clientId: "theme-1",
    srtPath: "/tmp/x.srt",
    videoFormat: "9:16",
    videoDuration: 10,
    fps: 30,
    settings: {
      graphicsDensity: "balanced",
      styleIntensity: "balanced",
      allowedTiers: { tier1: true, tier2: true, tier3: true },
    },
    status: "rendered",
    planItems: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function planItem(id: string, timestamp: number, duration: number): PlanItem {
  return {
    id,
    timestamp,
    duration,
    tier: 1,
    componentType: "IconPopIn",
    brief: `Brief ${id}`,
    srtContext: "",
    status: "generated",
    baseState: {
      position: { x: 540, y: 960 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      opacity: 1,
      anchorPoint: { x: 0.5, y: 0.5 },
    },
    animation: {
      enter: { motion: null, mask: null },
      idle: { motion: [], mask: null },
      exit: { motion: null, mask: null },
    },
  };
}

describe("time utilities", () => {
  test("secondsToFrames rounds deterministically", () => {
    expect(secondsToFrames(0, 30)).toBe(0);
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(1.5, 30)).toBe(45);
    expect(secondsToFrames(0.033, 30)).toBe(1);
  });

  test("rational expresses frames as fps-based fractions", () => {
    // 30 frames at 30fps with timebase 3000 = 3000/3000s = 1s.
    expect(rational(30, 3000, 30)).toBe("3000/3000s");
    // 0 frames → 0/3000s
    expect(rational(0, 3000, 30)).toBe("0/3000s");
  });

  test("rationalFrame is 1/fps", () => {
    expect(rationalFrame(30)).toBe("100/3000s");
    expect(rationalFrame(60)).toBe("100/6000s");
  });
});

describe("esc", () => {
  test("handles ampersands, quotes, brackets", () => {
    expect(esc('A & "B" <c>')).toBe("A &amp; &quot;B&quot; &lt;c&gt;");
  });
});

describe("buildFcpxml", () => {
  test("emits valid-shape XML with exactly the rendered items", () => {
    const project = baseProject({
      planItems: [
        planItem("a", 0.5, 2),
        planItem("b", 5, 2.5),
        planItem("c", 8, 1.5), // intentionally omitted from assets
      ],
    });
    const assets = new Map([
      ["a", { id: "a", path: "/tmp/a.webm", durationSec: 2 }],
      ["b", { id: "b", path: "/tmp/b.webm", durationSec: 2.5 }],
    ]);
    const xml = buildFcpxml({ project, assets });

    expect(xml).toContain('<fcpxml version="1.10">');
    expect(xml).toContain('<format id="r1"');
    expect(xml).toMatch(/<asset id="r_a"[^>]*src="file:\/\/\/tmp\/a\.webm"/);
    expect(xml).toMatch(/<asset id="r_b"[^>]*src="file:\/\/\/tmp\/b\.webm"/);
    // Item "c" was omitted — no resource or spine entry.
    expect(xml).not.toContain("r_c");
    // Spine should have exactly two <video> entries with lane="1".
    const spineVideos = xml.match(/<video ref="r_[ab]"/g);
    expect(spineVideos).not.toBeNull();
    expect(spineVideos!.length).toBe(2);
  });

  test("escapes special chars in project name", () => {
    const project = baseProject({ name: 'Jan & "Jon"' });
    const xml = buildFcpxml({ project, assets: new Map() });
    expect(xml).toContain("Jan &amp; &quot;Jon&quot;");
    expect(xml).not.toContain('Jan & "Jon"');
  });
});
