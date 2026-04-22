import type { Project } from "@/types";

export interface ResolveScriptAsset {
  itemId: string;
  path: string;
  timestamp: number;
  duration: number;
  briefShort: string;
}

export function buildResolveScript(project: Project, assets: ResolveScriptAsset[]): string {
  const assetLines = assets
    .map(
      (a) => `    {
        "path": ${pythonStr(a.path)},
        "timestamp": ${a.timestamp.toFixed(3)},
        "duration": ${a.duration.toFixed(3)},
        "name": ${pythonStr(a.briefShort)},
    },`,
    )
    .join("\n");

  return `#!/usr/bin/env python3
"""Import WG Motion Studio project "${project.name}" into DaVinci Resolve.

Run inside Resolve: Workspace → Console → Py3 → paste or Load Script.
Assumes a timeline is already open. Assets are inserted on video track 2.
"""

import DaVinciResolveScript as dvr_script

PROJECT_NAME = ${pythonStr(project.name)}
FPS = ${project.fps}

ASSETS = [
${assetLines}
]


def seconds_to_frames(seconds: float) -> int:
    return round(seconds * FPS)


def main() -> None:
    resolve = dvr_script.scriptapp("Resolve")
    project_manager = resolve.GetProjectManager()
    project = project_manager.GetCurrentProject()
    if not project:
        print("No project open in Resolve. Please create or open one first.")
        return

    media_pool = project.GetMediaPool()
    root_folder = media_pool.GetRootFolder()
    import_folder = media_pool.AddSubFolder(root_folder, f"{PROJECT_NAME} Overlays")
    media_pool.SetCurrentFolder(import_folder)

    timeline = project.GetCurrentTimeline()
    if not timeline:
        print("No timeline open. Create a timeline and re-run the script.")
        return

    for asset in ASSETS:
        clips = media_pool.ImportMedia([asset["path"]])
        if not clips:
            print(f"Could not import {asset['path']}")
            continue
        clip = clips[0]

        offset_frames = seconds_to_frames(asset["timestamp"])
        duration_frames = seconds_to_frames(asset["duration"])

        media_pool.AppendToTimeline(
            [{
                "mediaPoolItem": clip,
                "startFrame": 0,
                "endFrame": duration_frames,
                "trackIndex": 2,
                "recordFrame": offset_frames,
            }],
        )
        print(f"Placed {asset['name']} at {asset['timestamp']:.2f}s")

    print(f"Done — {len(ASSETS)} overlays imported.")


if __name__ == "__main__":
    main()
`;
}

function pythonStr(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
