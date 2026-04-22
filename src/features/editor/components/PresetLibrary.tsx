import { useMemo, useState } from "react";
import { Plus, Search, Sparkles } from "lucide-react";

import { Input } from "@/components/Input";
import type { Preset, PresetCategory } from "@/types";
import { DRAG_DATA } from "./SlotTimeline";
import { usePresetsStore, groupPresetsByCategory } from "@/state/presetsStore";

type TabKey = PresetCategory | "custom";

interface Props {
  themePreferredIds: string[];
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "enter", label: "Enter" },
  { key: "idle", label: "Idle" },
  { key: "exit", label: "Exit" },
  { key: "mask", label: "Mask" },
  { key: "custom", label: "Custom" },
];

const CATEGORY_COLOR: Record<PresetCategory, string> = {
  enter: "bg-success",
  idle: "bg-info",
  exit: "bg-danger",
  mask: "bg-warn",
};

export function PresetLibrary({ themePreferredIds }: Props) {
  const allPresets = usePresetsStore((s) => s.presets);
  const [tab, setTab] = useState<TabKey>("enter");
  const [query, setQuery] = useState("");
  const [themeOnly, setThemeOnly] = useState(false);

  const grouped = useMemo(() => groupPresetsByCategory(allPresets), [allPresets]);

  const list: Preset[] = useMemo(() => {
    let base: Preset[];
    if (tab === "custom") base = allPresets.filter((p) => !p.builtIn);
    else base = grouped[tab];

    if (themeOnly && themePreferredIds.length > 0) {
      const set = new Set(themePreferredIds);
      base = base.filter((p) => set.has(p.id));
    }
    const needle = query.trim().toLowerCase();
    if (needle) {
      base = base.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.tags.some((t) => t.toLowerCase().includes(needle)),
      );
    }
    return base;
  }, [tab, grouped, allPresets, themeOnly, themePreferredIds, query]);

  const counts = useMemo(
    () => ({
      enter: grouped.enter.length,
      idle: grouped.idle.length,
      exit: grouped.exit.length,
      mask: grouped.mask.length,
      custom: allPresets.filter((p) => !p.builtIn).length,
    }),
    [grouped, allPresets],
  );

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface-1">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3 text-2xs uppercase tracking-wide text-text-muted">
        <span>Presets</span>
        <button
          type="button"
          disabled
          title="Preset builder — phase 6"
          className="flex h-5 w-5 items-center justify-center rounded-default text-text-muted disabled:cursor-not-allowed"
        >
          <Plus size={12} />
        </button>
      </div>

      <div className="shrink-0 space-y-2 border-b border-border-subtle p-2">
        <div className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-text-secondary">
          <input
            type="checkbox"
            checked={themeOnly}
            onChange={(e) => setThemeOnly(e.target.checked)}
            className="accent-accent-primary"
          />
          Theme preferred only{" "}
          {themePreferredIds.length === 0 ? (
            <span className="text-text-muted">· none set</span>
          ) : null}
        </label>
      </div>

      <div className="flex shrink-0 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "relative flex-1 px-1 py-1.5 text-2xs font-medium transition-colors",
              tab === t.key
                ? "border-b-2 border-accent-primary text-text-primary"
                : "text-text-muted hover:text-text-primary",
            ].join(" ")}
          >
            {t.label}
            <span className="ml-1 font-mono text-text-muted">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-1.5 overflow-auto p-2">
        {list.length === 0 ? (
          <div className="p-4 text-center text-2xs text-text-muted">
            {tab === "custom"
              ? "No custom presets yet. Preset builder arrives in phase 6."
              : "No matches."}
          </div>
        ) : (
          list.map((p) => <PresetCard key={p.id} preset={p} preferred={themePreferredIds.includes(p.id)} />)
        )}
      </div>
    </aside>
  );
}

function PresetCard({ preset, preferred }: { preset: Preset; preferred: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(DRAG_DATA, preset.id);
      }}
      className="group flex cursor-grab items-center gap-2 rounded-default border border-border-subtle bg-surface-2 p-2 hover:border-accent-primary active:cursor-grabbing"
    >
      <div
        className={[
          "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-default",
          CATEGORY_COLOR[preset.category],
        ].join(" ")}
      >
        <ThumbAnimation category={preset.category} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <div className="truncate text-xs font-medium text-text-primary">{preset.name}</div>
          {preferred ? (
            <Sparkles size={10} className="text-accent-primary" />
          ) : null}
        </div>
        <div className="truncate text-2xs text-text-muted">{preset.tags.join(" · ") || "—"}</div>
      </div>
    </div>
  );
}

/**
 * CSS-only hover animation per category. Cheap, no player instances — enough
 * to communicate the motion feel at card size.
 */
function ThumbAnimation({ category }: { category: PresetCategory }) {
  return (
    <div
      className={[
        "h-3 w-3 rounded-sm bg-white opacity-80",
        category === "enter" && "animate-[thumb-pop_1.5s_ease-out_infinite]",
        category === "idle" && "animate-[thumb-pulse_1.8s_ease-in-out_infinite]",
        category === "exit" && "animate-[thumb-fade_1.5s_ease-in_infinite]",
        category === "mask" && "animate-[thumb-wipe_1.8s_ease-in-out_infinite]",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
