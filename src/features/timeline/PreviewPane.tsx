import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef } from "react";

import { TimelineComposition, timelineDurationFrames } from "@/lib/timeline/composition";
import { useAssetsStore } from "@/state/assetsStore";
import { useBrandKitsStore } from "@/state/brandKitsStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useTimelineStore } from "@/state/timelineStore";
import type { Asset } from "@/types";

const PREVIEW_FPS = 30;
const EMPTY_ASSETS: Asset[] = [];

interface Props {
  width: number;
  height: number;
}

export function PreviewPane({ width, height }: Props) {
  const projectId = useTimelineStore((s) => s.projectId);
  const tracks = useTimelineStore((s) => s.tracks);
  const clips = useTimelineStore((s) => s.clips);
  const playheadSec = useTimelineStore((s) => s.playheadSec);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const assets = useAssetsStore((s) =>
    projectId ? s.byProject[projectId] ?? EMPTY_ASSETS : EMPTY_ASSETS,
  );
  const projects = useProjectsStore((s) => s.projects);
  const brandKits = useBrandKitsStore((s) => s.brandKits);

  const ref = useRef<PlayerRef>(null);

  const brandKit = useMemo(() => {
    if (!projectId) return null;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;
    return brandKits.find((k) => k.id === project.clientId) ?? null;
  }, [projectId, projects, brandKits]);

  const timeline = useMemo(
    () => ({ projectId: projectId ?? "", tracks, clips }),
    [projectId, tracks, clips],
  );

  const durationInFrames = Math.max(1, timelineDurationFrames(timeline, PREVIEW_FPS));

  const inputProps = useMemo(
    () => ({ timeline, assets, brandKit, fps: PREVIEW_FPS, width, height }),
    [timeline, assets, brandKit, width, height],
  );

  // Seek the player when playhead changes externally (e.g. ruler drag).
  useEffect(() => {
    const target = Math.round(playheadSec * PREVIEW_FPS);
    const player = ref.current;
    if (!player) return;
    if (Math.abs(player.getCurrentFrame() - target) > 1) {
      player.seekTo(target);
    }
  }, [playheadSec]);

  // Push the player's current frame into the store while playing so the
  // ruler tracks it.
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    let raf = 0;
    const tick = () => {
      const f = player.getCurrentFrame();
      const sec = f / PREVIEW_FPS;
      const current = useTimelineStore.getState().playheadSec;
      if (Math.abs(sec - current) > 1 / PREVIEW_FPS) {
        setPlayhead(sec);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setPlayhead]);

  if (clips.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-0 text-xs text-text-muted">
        Drag a video file onto the timeline below to start.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <Player
        ref={ref}
        component={TimelineComposition}
        compositionWidth={width}
        compositionHeight={height}
        durationInFrames={durationInFrames}
        fps={PREVIEW_FPS}
        inputProps={inputProps}
        controls
        clickToPlay
        style={{ maxWidth: "100%", maxHeight: "100%" }}
        acknowledgeRemotionLicense
      />
    </div>
  );
}
