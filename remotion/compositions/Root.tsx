import { Composition } from "remotion";

import {
  EMPTY_PROJECT,
  ProjectComposition,
  type ProjectCompositionProps,
} from "./ProjectComposition";
import {
  PLACEHOLDER_ITEM,
  SingleGraphicComposition,
  type SingleGraphicCompositionProps,
} from "./SingleGraphicComposition";

/**
 * Two entry compositions:
 *
 * - `MotionStudioProject` — full-timeline render (used by export in phase 5)
 * - `SingleGraphicPreview` — ~3s scratch-pad for the editor's player
 *
 * Both receive all data through input props; no filesystem reads happen here.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MotionStudioProject"
        component={ProjectComposition}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={300}
        defaultProps={{
          project: EMPTY_PROJECT,
          theme: EMPTY_PROJECT as unknown as ProjectCompositionProps["theme"],
          presets: {},
          videoSrc: null,
        }}
        calculateMetadata={({ props }) => {
          const fps = props.project?.fps ?? 30;
          const duration = props.project?.videoDuration ?? 10;
          const w = formatToDimensions(props.project?.videoFormat ?? "9:16");
          return {
            fps,
            durationInFrames: Math.max(1, Math.round(duration * fps)),
            width: w.width,
            height: w.height,
          };
        }}
      />
      <Composition
        id="SingleGraphicPreview"
        component={SingleGraphicComposition}
        fps={30}
        width={1080}
        height={1920}
        durationInFrames={90}
        defaultProps={{
          item: PLACEHOLDER_ITEM,
          theme: {} as SingleGraphicCompositionProps["theme"],
          presets: {},
        }}
        calculateMetadata={({ props }) => {
          const fps = 30;
          const duration = props.item?.duration ?? 3;
          return {
            fps,
            durationInFrames: Math.max(30, Math.round(duration * fps)),
            width: 1080,
            height: 1920,
          };
        }}
      />
    </>
  );
};

function formatToDimensions(format: string): { width: number; height: number } {
  switch (format) {
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1920, height: 1080 };
    case "9:16":
    default:
      return { width: 1080, height: 1920 };
  }
}
