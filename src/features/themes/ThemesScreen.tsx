import { useEffect } from "react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { useThemesStore } from "@/state/themesStore";

export function ThemesScreen() {
  const { themes, load } = useThemesStore();
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Themes" />
      <div className="flex-1 overflow-auto p-6">
        {themes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            No themes yet.
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {themes.map((t) => (
              <li
                key={t.id}
                className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-panel"
              >
                <div className="mb-3 flex gap-1.5">
                  <span
                    className="h-6 w-6 rounded-default border border-border-subtle"
                    style={{ background: t.colors.primary }}
                  />
                  <span
                    className="h-6 w-6 rounded-default border border-border-subtle"
                    style={{ background: t.colors.secondary }}
                  />
                  <span
                    className="h-6 w-6 rounded-default border border-border-subtle"
                    style={{ background: t.colors.accent }}
                  />
                </div>
                <div className="font-medium text-text-primary">{t.name}</div>
                <div className="mt-0.5 font-mono text-2xs text-text-muted">{t.id}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
