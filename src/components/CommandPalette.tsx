import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  LayoutDashboard,
  Palette,
  Sparkles,
  Settings,
  Save,
  RotateCcw,
  Download,
  Undo2,
  Redo2,
  Play,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useEditorHistory, useEditorStore, instanceFromDefaults } from "@/state/editorStore";
import { usePresetsStore } from "@/state/presetsStore";

/**
 * Command palette: global (Cmd+K), context-aware in the editor with
 * preset quick-apply to the currently selected slot.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const presets = usePresetsStore((s) => s.presets);

  const inEditor = /\/projects\/[^/]+\/editor\//.test(location.pathname);
  const projectIdMatch = location.pathname.match(/\/projects\/([^/]+)/);
  const projectId = projectIdMatch?.[1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  // Editor-specific actions pulled lazily so they only activate inside editor.
  const history = useEditorHistory();
  const selectedInstance = useEditorStore((s) => s.selectedInstance);
  const upsertEnter = useEditorStore((s) => s.upsertEnterMotion);
  const upsertExit = useEditorStore((s) => s.upsertExitMotion);
  const addIdle = useEditorStore((s) => s.addIdleMotion);

  const quickApply = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const instance = instanceFromDefaults(
      preset.id,
      preset.defaults.duration,
      preset.defaults.intensity,
      typeof preset.defaults.easing === "string" ? preset.defaults.easing : undefined,
    );
    if (preset.defaults.direction) instance.direction = preset.defaults.direction;
    if (preset.category === "enter") upsertEnter(instance);
    else if (preset.category === "exit") upsertExit(instance);
    else if (preset.category === "idle") addIdle(instance);
    setOpen(false);
  };

  // Fallback: if nothing selected, still show the preset list so user can
  // apply to the default slot for its category.
  void selectedInstance;

  const presetEntries = useMemo(() => {
    return presets.map((p) => ({
      id: p.id,
      name: p.name,
      value: `preset:${p.id}`,
      category: p.category,
      tags: p.tags.join(" "),
    }));
  }, [presets]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface-1 shadow-popover">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command shouldFilter loop>
            <Command.Input
              placeholder="Search actions or presets…"
              className="w-full bg-transparent px-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <Command.List className="max-h-96 overflow-auto border-t border-border-subtle p-1">
              <Command.Empty className="py-6 text-center text-xs text-text-muted">
                No matches.
              </Command.Empty>

              {inEditor ? (
                <Command.Group heading="Editor">
                  <Entry
                    icon={Save}
                    label="Save and return to plan review"
                    onSelect={() =>
                      navigate(projectId ? `/projects/${projectId}` : "/dashboard")
                    }
                  />
                  <Entry icon={Undo2} label="Undo" onSelect={() => history.undo()} />
                  <Entry icon={Redo2} label="Redo" onSelect={() => history.redo()} />
                  <Entry
                    icon={RotateCcw}
                    label="Reset to AI default"
                    onSelect={() => {
                      // handled by EditorScreen via sessionStorage; palette just closes.
                      setOpen(false);
                    }}
                  />
                  <Entry
                    icon={Download}
                    label="Export current item as alpha"
                    onSelect={() => {
                      // Trigger via custom event; EditorScreen listens.
                      window.dispatchEvent(new CustomEvent("editor:exportAlpha"));
                      setOpen(false);
                    }}
                  />
                  <Entry
                    icon={Play}
                    label="Play / pause"
                    onSelect={() => {
                      window.dispatchEvent(new CustomEvent("editor:togglePlay"));
                      setOpen(false);
                    }}
                  />
                </Command.Group>
              ) : null}

              <Command.Group heading="Navigate">
                <Entry icon={LayoutDashboard} label="Go to projects" onSelect={() => go("/dashboard")} />
                {projectId ? (
                  <Entry
                    icon={ArrowRight}
                    label="Go to current project plan"
                    onSelect={() => go(`/projects/${projectId}`)}
                  />
                ) : null}
                <Entry icon={Palette} label="Manage themes" onSelect={() => go("/themes")} />
                <Entry icon={Sparkles} label="Browse presets" onSelect={() => go("/presets")} />
                <Entry icon={Settings} label="Settings" onSelect={() => go("/settings")} />
              </Command.Group>

              {inEditor && presetEntries.length > 0 ? (
                <Command.Group heading="Apply preset">
                  {presetEntries.slice(0, 40).map((p) => (
                    <Command.Item
                      key={p.value}
                      value={`${p.value} ${p.name} ${p.category} ${p.tags}`}
                      onSelect={() => quickApply(p.id)}
                      className="flex cursor-pointer items-center gap-2 rounded-default px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-3 aria-selected:text-text-primary"
                    >
                      <Zap size={12} />
                      <span className="flex-1">{p.name}</span>
                      <span className="font-mono text-2xs text-text-muted">{p.category}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Entry({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-default px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-3 aria-selected:text-text-primary"
    >
      <Icon size={14} />
      <span className="flex-1">{label}</span>
      <ArrowRight size={12} className="text-text-muted" />
    </Command.Item>
  );
}
