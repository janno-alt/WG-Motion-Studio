import { nanoid } from "nanoid";
import { create } from "zustand";
import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { useStore } from "zustand";

import type {
  Asset,
  Clip,
  ClipKind,
  SilenceRange,
  Timeline,
  Track,
  TrackKind,
} from "@/types";
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
  moveClipToTrack: (id: string, newTrackId: string) => void;
  trimClipStart: (id: string, deltaSec: number) => void;
  trimClipEnd: (id: string, deltaSec: number) => void;
  splitClipAt: (id: string, atSec: number) => string | null;
  removeClip: (id: string) => void;
  removeSelected: () => void;

  addCaptionsFromSegments: (
    segments: Array<{ startSec: number; endSec: number; text: string }>,
  ) => void;

  insertGraphicAtPlayhead: (
    kind: "titleCard" | "lowerThird" | "outro" | "lottie",
    data: Record<string, unknown>,
    durationSec?: number,
  ) => string | null;

  applyRippleAutoCut: (clipId: string, silenceRanges: SilenceRange[]) => number;

  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;

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

      moveClipToTrack: (id, newTrackId) =>
        set((s) => {
          const clip = s.clips.find((c) => c.id === id);
          if (!clip || clip.trackId === newTrackId) return {};
          const fromTrack = s.tracks.find((t) => t.id === clip.trackId);
          const toTrack = s.tracks.find((t) => t.id === newTrackId);
          if (!fromTrack || !toTrack) return {};

          // Captions stay on captions tracks; video/image only on video; audio
          // only on audio. Reject incompatible moves silently — Clip.tsx
          // already snaps back visually.
          const compatible =
            (fromTrack.kind === "video" && toTrack.kind === "video") ||
            (fromTrack.kind === "audio" && toTrack.kind === "audio") ||
            (fromTrack.kind === "captions" && toTrack.kind === "captions");
          if (!compatible) return {};

          const sortOrder = s.clips.filter((c) => c.trackId === newTrackId).length;
          return {
            clips: s.clips.map((c) =>
              c.id === id ? { ...c, trackId: newTrackId, sortOrder } : c,
            ),
          };
        }),

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

      applyRippleAutoCut: (clipId, silenceRanges) => {
        const state = get();
        const clip = state.clips.find((c) => c.id === clipId);
        if (!clip) return 0;

        // Clip silence ranges to the asset window the clip is using.
        const clamped = silenceRanges
          .map((r) => ({
            start: Math.max(r.startSec, clip.inPointSec),
            end: Math.min(r.endSec, clip.outPointSec),
          }))
          .filter((r) => r.end - r.start > SNAP_EPSILON)
          .sort((a, b) => a.start - b.start);

        // Compute kept ranges = complement of silence within [in, out]
        const kept: { start: number; end: number }[] = [];
        let cursor = clip.inPointSec;
        for (const sil of clamped) {
          if (sil.start > cursor + SNAP_EPSILON) {
            kept.push({ start: cursor, end: sil.start });
          }
          cursor = Math.max(cursor, sil.end);
        }
        if (cursor < clip.outPointSec - SNAP_EPSILON) {
          kept.push({ start: cursor, end: clip.outPointSec });
        }

        const removed =
          clip.outPointSec -
          clip.inPointSec -
          kept.reduce((sum, k) => sum + (k.end - k.start), 0);

        // Build new clips placed back-to-back starting at original startSec.
        let pos = clip.startSec;
        const newClips: Clip[] = kept.map((k) => {
          const dur = k.end - k.start;
          const c: Clip = {
            id: `clp-${nanoid(10)}`,
            trackId: clip.trackId,
            assetId: clip.assetId,
            kind: clip.kind,
            startSec: pos,
            durationSec: dur,
            inPointSec: k.start,
            outPointSec: k.end,
            data: clip.data,
            sortOrder: 0,
          };
          pos += dur;
          return c;
        });

        // Subsequent clips on the same track shift left by `removed` seconds.
        const oldEnd = clip.startSec + clip.durationSec;
        set((s) => {
          const others = s.clips.filter((c) => c.id !== clipId);
          const shifted = others.map((c) => {
            if (c.trackId === clip.trackId && c.startSec >= oldEnd - SNAP_EPSILON) {
              return { ...c, startSec: Math.max(0, c.startSec - removed) };
            }
            return c;
          });
          const merged = [...shifted, ...newClips];
          merged
            .filter((c) => c.trackId === clip.trackId)
            .sort((a, b) => a.startSec - b.startSec)
            .forEach((c, i) => {
              c.sortOrder = i;
            });
          return { clips: merged };
        });
        return removed;
      },

      setTrackVolume: (trackId, volume) =>
        set((s) => ({
          tracks: s.tracks.map((t) =>
            t.id === trackId ? { ...t, volume: Math.max(0, Math.min(2, volume)) } : t,
          ),
        })),

      setTrackMuted: (trackId, muted) =>
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)),
        })),

      insertGraphicAtPlayhead: (kind, data, durationSec) => {
        const state = get();
        // Graphic clips go on V2 if it exists, otherwise V1, otherwise abort.
        const targetTrack =
          state.tracks.find((t) => t.kind === "video" && t.name === "V2") ??
          state.tracks.find((t) => t.kind === "video");
        if (!targetTrack) return null;
        const dur = durationSec ?? (kind === "outro" ? 4 : kind === "lowerThird" ? 5 : 3);
        const start = state.playheadSec;
        const id = `clp-${nanoid(10)}`;
        const newClip: Clip = {
          id,
          trackId: targetTrack.id,
          assetId: null,
          kind,
          startSec: start,
          durationSec: dur,
          inPointSec: 0,
          outPointSec: dur,
          data,
          sortOrder: state.clips.filter((c) => c.trackId === targetTrack.id).length,
        };
        set((s) => ({ clips: [...s.clips, newClip] }));
        return id;
      },

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
