import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  /** Only present when available=true. */
  newVersion?: string;
  notes?: string | null;
  date?: string | null;
  /** The Update handle from plugin-updater — null when no update is available. */
  handle: Update | null;
}

/**
 * Wraps plugin-updater's `check()` so callers get a normalised UpdateInfo
 * without juggling the optional fields. Throws when the updater fails (no
 * key configured, network down, etc.).
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  const update = await check();
  if (!update) {
    return { available: false, currentVersion, handle: null };
  }
  return {
    available: true,
    currentVersion,
    newVersion: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
    handle: update,
  };
}

export interface InstallProgress {
  /** Bytes downloaded so far. */
  downloaded: number;
  /** Total bytes the server reported, or null when streaming without a length. */
  total: number | null;
}

/**
 * Downloads + installs the update, calling onProgress with byte counts as
 * the stream comes in. Returns once the install step finishes; the caller
 * should then trigger relaunch().
 */
export async function downloadAndInstall(
  update: Update,
  onProgress: (p: InstallProgress) => void,
): Promise<void> {
  let total: number | null = null;
  let downloaded = 0;
  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      downloaded = 0;
      onProgress({ downloaded, total });
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress({ downloaded, total });
    } else if (event.event === "Finished") {
      onProgress({ downloaded: total ?? downloaded, total });
    }
  });
}

export { relaunch };
