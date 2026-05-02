/**
 * Centralised frame ↔ seconds conversion. The Remotion player and Theatre's
 * sheet sequence both deal in continuous time, but the UI layer scales by
 * fps when reading clip start/duration. Theatre Sheet sequences run in
 * seconds; Remotion Sequences run in frames. Keep this single source of
 * truth so we never drift.
 */
export const PREVIEW_FPS = 30;

export function frameToSeconds(frame: number, fps = PREVIEW_FPS): number {
  return frame / fps;
}

export function secondsToFrame(seconds: number, fps = PREVIEW_FPS): number {
  return Math.round(seconds * fps);
}
