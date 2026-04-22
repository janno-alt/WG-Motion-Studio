import { useEffect, useMemo, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/Input";
import { commands } from "@/lib/tauri";
import { useProjectsStore } from "@/state/projectsStore";
import { usePresetsStore } from "@/state/presetsStore";
import type { Preset, PresetCategory } from "@/types";
import { PresetBuilderModal } from "./PresetBuilderModal";

const TABS: { key: PresetCategory | "all" | "custom"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "enter", label: "Enter" },
  { key: "idle", label: "Idle" },
  { key: "exit", label: "Exit" },
  { key: "mask", label: "Mask" },
  { key: "custom", label: "Custom" },
];

export function PresetsScreen() {
  const { presets, load, remove, upsert } = usePresetsStore();
  const { projects, load: loadProjects } = useProjectsStore();

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [query, setQuery] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Preset | null>(null);

  useEffect(() => {
    void load();
    if (projects.length === 0) void loadProjects();
  }, []);

  const usedInCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const proj of projects) {
      for (const item of proj.planItems) {
        const ids = [
          item.animation.enter.motion?.presetId,
          item.animation.exit.motion?.presetId,
          item.animation.enter.mask?.presetId,
          item.animation.exit.mask?.presetId,
          ...item.animation.idle.motion.map((m) => m.presetId),
        ].filter((x): x is string => Boolean(x));
        for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
      }
    }
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return presets.filter((p) => {
      if (tab === "custom" && p.builtIn) return false;
      if (tab !== "all" && tab !== "custom" && p.category !== tab) return false;
      if (needle) {
        const hay = `${p.name} ${p.tags.join(" ")} ${p.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [presets, tab, query]);

  const openNew = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const openEdit = (p: Preset) => {
    setEditing(p);
    setBuilderOpen(true);
  };

  const doDelete = async (p: Preset) => {
    setConfirmDelete(null);
    if (p.builtIn) {
      toast.error("Built-in presets cannot be deleted.");
      return;
    }
    try {
      await commands.deletePreset(p.id);
      remove(p.id);
      toast.success("Preset deleted");
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    }
  };

  const exportCustom = async () => {
    const custom = presets.filter((p) => !p.builtIn);
    if (custom.length === 0) {
      toast.info("No custom presets to export.");
      return;
    }
    const picked = await saveDialog({
      defaultPath: "wg-motion-studio-presets.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!picked) return;
    try {
      await writeTextFile(picked, JSON.stringify(custom, null, 2));
      toast.success(`Exported ${custom.length} preset(s)`);
    } catch (err) {
      toast.error(`Export failed: ${String(err)}`);
    }
  };

  const importJson = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const raw = await readTextFile(picked);
      const incoming = JSON.parse(raw);
      if (!Array.isArray(incoming)) throw new Error("Expected an array of presets");
      let imported = 0;
      const existing = new Set(presets.map((p) => p.id));
      for (const p of incoming) {
        if (!p || typeof p !== "object") continue;
        const candidate = p as Preset;
        const id = existing.has(candidate.id) ? `user-${nanoid(8)}` : candidate.id;
        const saved = await commands.savePreset({
          ...candidate,
          id,
          builtIn: false,
        });
        upsert(saved);
        imported += 1;
      }
      toast.success(`Imported ${imported} preset(s)`);
    } catch (err) {
      toast.error(`Import failed: ${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Presets"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<Upload size={12} />}
              onClick={() => void importJson()}
            >
              Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<Download size={12} />}
              onClick={() => void exportCustom()}
            >
              Export custom
            </Button>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus size={14} />}
              onClick={openNew}
            >
              New preset
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-4 py-2">
        <div className="relative max-w-xs flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or tag…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "rounded-default px-2 py-1 text-xs transition-colors",
                tab === t.key
                  ? "bg-surface-3 text-text-primary"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            {tab === "custom"
              ? "No custom presets yet. Create one via the + button."
              : "No matches."}
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 p-4">
            {filtered.map((p) => (
              <PresetRow
                key={p.id}
                preset={p}
                usedIn={usedInCount.get(p.id) ?? 0}
                onEdit={openEdit}
                onDelete={() => setConfirmDelete(p)}
              />
            ))}
          </ul>
        )}
      </div>

      <PresetBuilderModal
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        editing={editing}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete preset?"
        description={
          <>
            Delete <span className="text-text-primary">{confirmDelete?.name}</span>? Plan
            items that reference it will keep the reference but won&apos;t animate.
          </>
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDelete && void doDelete(confirmDelete)}
      />
    </div>
  );
}

function PresetRow({
  preset,
  usedIn,
  onEdit,
  onDelete,
}: {
  preset: Preset;
  usedIn: number;
  onEdit: (p: Preset) => void;
  onDelete: (p: Preset) => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-card border border-border-subtle bg-surface-1 p-3">
      <div className="h-10 w-10 shrink-0 rounded-default bg-surface-3" aria-hidden>
        <div className="flex h-full w-full items-center justify-center text-2xs uppercase text-text-muted">
          {preset.category[0]}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="truncate text-sm font-medium text-text-primary">{preset.name}</div>
          {preset.builtIn ? (
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-2xs text-text-muted">
              built-in
            </span>
          ) : null}
        </div>
        <div className="truncate text-2xs text-text-muted">
          {preset.category} · used in {usedIn} item{usedIn === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(preset)}
          className="flex h-6 w-6 items-center justify-center rounded-default text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          title={preset.builtIn ? "Open (read-only for built-ins)" : "Edit"}
        >
          <Pencil size={12} />
        </button>
        {!preset.builtIn ? (
          <button
            type="button"
            onClick={() => onDelete(preset)}
            className="flex h-6 w-6 items-center justify-center rounded-default text-text-secondary hover:bg-surface-2 hover:text-danger"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
