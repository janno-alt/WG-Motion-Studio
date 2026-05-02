import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri", () => ({
  commands: {
    loadTimeline: vi.fn().mockResolvedValue({ projectId: "p1", tracks: [], clips: [] }),
    saveTimeline: vi.fn().mockImplementation(async (t) => t),
    createDefaultTracks: vi.fn().mockResolvedValue([
      { id: "v1", projectId: "p1", kind: "video", name: "V1", sortOrder: 0, muted: false, hidden: false, volume: 1, pan: 0 },
      { id: "a1", projectId: "p1", kind: "audio", name: "A1", sortOrder: 3, muted: false, hidden: false, volume: 1, pan: 0 },
      { id: "cap", projectId: "p1", kind: "captions", name: "Captions", sortOrder: 5, muted: false, hidden: false, volume: 1, pan: 0 },
    ]),
  },
}));

import { useTimelineStore } from "./timelineStore";

describe("timelineStore", () => {
  beforeEach(() => {
    useTimelineStore.getState().reset();
    useTimelineStore.temporal.getState().clear();
  });

  it("load() seeds tracks and starts empty", async () => {
    await useTimelineStore.getState().load("p1");
    const s = useTimelineStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.tracks.map((t) => t.kind)).toEqual(["video", "audio", "captions"]);
    expect(s.clips).toEqual([]);
  });

  it("addClip + splitClipAt produces two back-to-back clips", async () => {
    await useTimelineStore.getState().load("p1");
    const id = useTimelineStore.getState().addClip({
      trackId: "v1",
      assetId: "a1",
      kind: "video",
      startSec: 0,
      durationSec: 6,
      inPointSec: 0,
      outPointSec: 6,
      data: null,
    });
    const newId = useTimelineStore.getState().splitClipAt(id, 2.5);
    expect(newId).not.toBeNull();

    const clips = useTimelineStore.getState().clips;
    const left = clips.find((c) => c.id === id)!;
    const right = clips.find((c) => c.id === newId)!;
    expect(left.startSec).toBeCloseTo(0);
    expect(left.durationSec).toBeCloseTo(2.5);
    expect(left.outPointSec).toBeCloseTo(2.5);
    expect(right.startSec).toBeCloseTo(2.5);
    expect(right.durationSec).toBeCloseTo(3.5);
    expect(right.inPointSec).toBeCloseTo(2.5);
    expect(right.outPointSec).toBeCloseTo(6);
  });

  it("splitClipAt at start or end is a no-op", async () => {
    await useTimelineStore.getState().load("p1");
    const id = useTimelineStore.getState().addClip({
      trackId: "v1",
      assetId: "a1",
      kind: "video",
      startSec: 1,
      durationSec: 4,
      inPointSec: 0,
      outPointSec: 4,
      data: null,
    });
    expect(useTimelineStore.getState().splitClipAt(id, 1)).toBeNull();
    expect(useTimelineStore.getState().splitClipAt(id, 5)).toBeNull();
    expect(useTimelineStore.getState().clips.length).toBe(1);
  });

  it("trimClipStart shrinks clip and shifts inPoint", async () => {
    await useTimelineStore.getState().load("p1");
    const id = useTimelineStore.getState().addClip({
      trackId: "v1",
      assetId: "a1",
      kind: "video",
      startSec: 0,
      durationSec: 5,
      inPointSec: 0,
      outPointSec: 5,
      data: null,
    });
    useTimelineStore.getState().trimClipStart(id, 1);
    const clip = useTimelineStore.getState().clips.find((c) => c.id === id)!;
    expect(clip.startSec).toBe(1);
    expect(clip.inPointSec).toBe(1);
    expect(clip.durationSec).toBe(4);
    expect(clip.outPointSec).toBe(5);
  });

  it("addCaptionsFromSegments populates captions track", async () => {
    await useTimelineStore.getState().load("p1");
    useTimelineStore.getState().addCaptionsFromSegments([
      { startSec: 0, endSec: 1.5, text: "Hello" },
      { startSec: 1.5, endSec: 3.0, text: "World" },
    ]);
    const captions = useTimelineStore.getState().clips.filter((c) => c.kind === "caption");
    expect(captions.length).toBe(2);
    expect(captions[0]?.data).toEqual({ text: "Hello" });
    expect(captions[1]?.startSec).toBe(1.5);
  });

  it("undo/redo roundtrips a split", async () => {
    await useTimelineStore.getState().load("p1");
    const id = useTimelineStore.getState().addClip({
      trackId: "v1",
      assetId: "a1",
      kind: "video",
      startSec: 0,
      durationSec: 6,
      inPointSec: 0,
      outPointSec: 6,
      data: null,
    });
    useTimelineStore.getState().splitClipAt(id, 3);
    expect(useTimelineStore.getState().clips.length).toBe(2);

    useTimelineStore.temporal.getState().undo();
    expect(useTimelineStore.getState().clips.length).toBe(1);
    expect(useTimelineStore.getState().clips[0]?.durationSec).toBe(6);

    useTimelineStore.temporal.getState().redo();
    expect(useTimelineStore.getState().clips.length).toBe(2);
  });
});
