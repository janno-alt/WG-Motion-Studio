import { Composition } from "remotion";

import { ProjectComposition, EMPTY_PROJECT } from "./ProjectComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MotionStudioProject"
        component={ProjectComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ project: EMPTY_PROJECT }}
      />
    </>
  );
};
