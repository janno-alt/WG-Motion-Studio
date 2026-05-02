import { useEffect } from "react";
import { toast } from "sonner";

import { APP_VERSION } from "@/lib/version";
import { checkForUpdate, downloadAndInstall, relaunch } from "@/lib/updater";

const STORAGE_KEY = "lastUpdateCheckMs";
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Lightweight startup check: asks the updater plugin once per app session
 * (and at most every 6h via localStorage) whether a newer version is on the
 * configured GitHub-hosted manifest. If yes, surfaces a sticky toast with
 * an Install action that downloads + relaunches.
 *
 * Failures are silent — the user can still trigger a manual check from
 * Settings, which surfaces the underlying error there.
 */
export function useStartupUpdateCheck() {
  useEffect(() => {
    let cancelled = false;
    const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return;

    const id = window.setTimeout(async () => {
      try {
        const result = await checkForUpdate(APP_VERSION);
        if (cancelled || !result.available || !result.handle) return;
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        toast(
          `Update available — v${APP_VERSION} → v${result.newVersion}`,
          {
            duration: Infinity,
            action: {
              label: "Install",
              onClick: async () => {
                try {
                  toast.loading("Downloading update…", { id: "update-install" });
                  await downloadAndInstall(result.handle!, () => {});
                  toast.success("Installed — relaunching…", { id: "update-install" });
                  await relaunch();
                } catch (err) {
                  toast.error(`Install failed: ${String(err)}`, { id: "update-install" });
                }
              },
            },
          },
        );
      } catch {
        // silent — Settings → Updates surfaces the real error
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);
}
