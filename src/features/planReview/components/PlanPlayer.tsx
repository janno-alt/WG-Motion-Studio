import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Player } from "@remotion/player";

import type { Preset, Project, Theme } from "@/types";
import { ProjectComposition } from "@remotion-project/compositions/ProjectComposition";

interface Props {
  project: Project;
  theme: Theme;
  presets: Preset[];
}

const ASPECTS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export function PlanPlayer({ project, theme, presets }: Props) {
  const { w, h } = ASPECTS[project.videoFormat] ?? ASPECTS["9:16"]!;
  const durationInFrames = Math.max(1, Math.round(project.videoDuration * project.fps));

  const presetMap = useMemo(() => {
    const m: Record<string, Preset> = {};
    for (const p of presets) m[p.id] = p;
    return m;
  }, [presets]);

  const videoSrc = project.videoPath ? convertFileSrc(project.videoPath) : null;

  const inputProps = useMemo(
    () => ({ project, theme, presets: presetMap, videoSrc }),
    [project, theme, presetMap, videoSrc],
  );

  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden bg-surface-0">
      <div
        className="relative overflow-hidden rounded-card border border-border-subtle shadow-panel"
        style={{ aspectRatio: `${w} / ${h}`, width: "min(100%, 320px)" }}
      >
        <Player
          component={ProjectComposition}
          compositionWidth={w}
          compositionHeight={h}
          durationInFrames={durationInFrames}
          fps={project.fps}
          inputProps={inputProps}
          style={{ width: "100%", height: "100%" }}
          controls
          loop
          autoPlay={false}
          clickToPlay
        />
      </div>
    </div>
  );
}
