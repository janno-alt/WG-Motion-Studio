import { nanoid } from "nanoid";
import { create } from "zustand";
import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { useStore } from "zustand";

import type { Asset, Clip, ClipKind, Timeline, Track, TrackKind } from "@/types";
import { commands } from "@/lib/tauri";

interface TimelineState {
  projectId: string | null;
  tracks: Track[];
  clips: Clip[];

  selectedClipIds: Set<string>;
  playheadSec: number;
  zoomPxPerSec: number;
  format: "9:16" | "16:9";

  loaded: boolean;
  saving: boolean;

  load: (projectId: string) => Promise<void>;
  saveSnapshot: () => Promise<void>;

  setPlayhead: (sec: number) => void;
  setZoom: (pxPerSec: number) => void;
  setFormat: (f: "9:16" | "16:9") => void;
  selectClip: (id: string, additive?: boolean) => void;
  clearSelection: () => void;

  addClip: (clip: Omit<Clip, "id" | "sortOrder">) => string;
  moveClip: (id: string, deltaSec: number) => void;
  trimClipStart: (id: string, deltaSec: number) => void;
  trimClipEnd: (id: string, deltaSec: number) => void;
  splitClipAt: (id: string, atSec: number) => string | null;
  removeClip: (id: string) => void;
  removeSelected: () => void;

  addCaptionsFromSegments: (
    segments: Array<{ startSec: number; endSec: number; text: string }>,
  ) => void;

  reset: () => void;
}

const SNAP_EPSILON = 1e-3;

export const useTimelineStore = create<TimelineState>()(
  temporal(
    (set, get) => ({
      projectId: null,
      tracks: [],
      clips: [],
      selectedClipIds: new Set<string>(),
      playheadSec: 0,
      zoomPxPerSec: 60,
      format: "9:16",
      loaded: false,
      saving: false,

      load: async (projectId) => {
        const tracks = await commands.createDefaultTracks(projectId);
        const tl = await commands.loadTimeline(projectId);
        set({
          projectId,
          tracks: tl.tracks.length ? tl.tracks : tracks,
          clips: tl.clips,
          selectedClipIds: new Set(),
          playheadSec: 0,
          loaded: true,
        });
      },

      saveSnapshot: async () => {
        const { projectId, tracks, clips } = get();
        if (!projectId) return;
        set({ saving: true });
        try {
          const tl: Timeline = { projectId, tracks, clips };
          await commands.saveTimeline(tl);
        } finally {
          set({ saving: false });
        }
      },

      setPlayhead: (sec) => set({ playheadSec: Math.max(0, sec) }),
      setZoom: (pxPerSec) =>
        set({ zoomPxPerSec: Math.max(8, Math.min(240, pxPerSec)) }),
      setFormat: (format) => set({ format }),

      selectClip: (id, additive) =>
        set((s) => {
          const next = new Set(additive ? s.selectedClipIds : []);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedClipIds: next };
        }),

      clearSelection: () => set({ selectedClipIds: new Set() }),

      addClip: (clip) => {
        const id = `clp-${nanoid(10)}`;
        const sortOrder = get().clips.filter((c) => c.trackId === clip.trackId).length;
        const newClip: Clip = { ...clip, id, sortOrder };
        set((s) => ({ clips: [...s.clips, newClip] }));
        return id;
      },

      moveClip: (id, deltaSec) =>
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === id
              ? { ...c, startSec: Math.max(0, c.startSec + deltaSec) }
              : c,
          ),
        })),

      trimClipStart: (id, deltaSec) =>
        set((s) => ({
          clips: s.clips.map((c) => {
            if (c.id !== id) return c;
            const newIn = Math.max(0, c.inPointSec + deltaSec);
            const newDur = Math.max(SNAP_EPSILON, c.durationSec - deltaSec);
            const newStart = Math.max(0, c.startSec + deltaSec);
            if (newIn >= c.outPointSec) return c;
            return { ...c, inPointSec: newIn, startSec: newStart, durationSec: newDur };
          }),
        })),

      trimClipEnd: (id, deltaSec) =>
        set((s) => ({
          clips: s.clips.map((c) => {
            if (c.id !== id) return c;
            const newOut = c.outPointSec + deltaSec;
            const newDur = Math.max(SNAP_EPSILON, c.durationSec + deltaSec);
            if (newOut <= c.inPointSec) return c;
            return { ...c, outPointSec: newOut, durationSec: newDur };
          }),
        })),

      splitClipAt: (id, atSec) => {
        const clip = get().clips.find((c) => c.id === id);
        if (!clip) return null;
        const localOffset = atSec - clip.startSec;
        if (localOffset <= SNAP_EPSILON || localOffset >= clip.durationSec - SNAP_EPSILON) {
          return null;
        }
        const splitPointInAsset = clip.inPointSec + localOffset;
        const newId = `clp-${nanoid(10)}`;
        const left: Clip = {
          ...clip,
          durationSec: localOffset,
          outPointSec: splitPointInAsset,
        };
        const right: Clip = {
          ...clip,
          id: newId,
          startSec: clip.startSec + localOffset,
          durationSec: clip.durationSec - localOffset,
          inPointSec: splitPointInAsset,
          sortOrder: clip.sortOrder + 0.5,
        };
        set((s) => {
          const clips = s.clips.map((c) => (c.id === id ? left : c));
          clips.push(right);
          clips
            .filter((c) => c.trackId === clip.trackId)
            .sort((a, b) => a.startSec - b.startSec)
            .forEach((c, i) => {
              c.sortOrder = i;
            });
          return { clips: [...clips] };
        });
        return newId;
      },

      removeClip: (id) =>
        set((s) => ({
          clips: s.clips.filter((c) => c.id !== id),
          selectedClipIds: new Set(
            [...s.selectedClipIds].filter((sid) => sid !== id),
          ),
        })),

      removeSelected: () =>
        set((s) => ({
          clips: s.clips.filter((c) => !s.selectedClipIds.has(c.id)),
          selectedClipIds: new Set(),
        })),

      addCaptionsFromSegments: (segments) => {
        const captionsTrack = get().tracks.find((t) => t.kind === "captions");
        if (!captionsTrack) return;
        set((s) => {
          const filtered = s.clips.filter((c) => c.trackId !== captionsTrack.id);
          const newClips: Clip[] = segments.map((seg, i) => ({
            id: `cap-${nanoid(10)}`,
            trackId: captionsTrack.id,
            assetId: null,
            kind: "caption" as ClipKind,
            startSec: seg.startSec,
            durationSec: Math.max(SNAP_EPSILON, seg.endSec - seg.startSec),
            inPointSec: 0,
            outPointSec: Math.max(SNAP_EPSILON, seg.endSec - seg.startSec),
            data: { text: seg.text },
            sortOrder: i,
          }));
          return { clips: [...filtered, ...newClips] };
        });
      },

      reset: () =>
        set({
          projectId: null,
          tracks: [],
          clips: [],
          selectedClipIds: new Set(),
          playheadSec: 0,
          loaded: false,
          saving: false,
        }),
    }),
    {
      partialize: (state) => ({
        tracks: state.tracks,
        clips: state.clips,
      }),
      limit: 50,
      equality: (a, b) =>
        a.tracks === b.tracks && a.clips === b.clips,
    },
  ),
);

export function useTimelineHistory() {
  const { undo, redo, pastStates, futureStates, clear } = useStore(
    useTimelineStore.temporal,
    (s) => ({
      undo: s.undo,
      redo: s.redo,
      pastStates: s.pastStates,
      futureStates: s.futureStates,
      clear: s.clear,
    }),
  );
  return {
    undo,
    redo,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
    clear,
  };
}

export type _UnusedTemporalCheck = TemporalState<{
  tracks: Track[];
  clips: Clip[];
}>;

const _kindCheck: TrackKind = "video";
void _kindCheck;
const _assetCheck: Asset | null = null;
void _assetCheck;
