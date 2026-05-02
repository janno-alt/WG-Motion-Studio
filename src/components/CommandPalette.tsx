import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  Captions,
  Film,
  LayoutDashboard,
  Palette,
  Settings,
  Sparkles,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useBrandKitsStore } from "@/state/brandKitsStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useTimelineStore } from "@/state/timelineStore";
import {
  DEFAULT_LOTTIE,
  DEFAULT_LOWER_THIRD,
  DEFAULT_OUTRO,
  DEFAULT_TITLE_CARD,
} from "@/types";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = useTimelineStore((s) => s.projectId);
  const insertGraphic = useTimelineStore((s) => s.insertGraphicAtPlayhead);
  const saveSnapshot = useTimelineStore((s) => s.saveSnapshot);
  const projects = useProjectsStore((s) => s.projects);
  const brandKits = useBrandKitsStore((s) => s.brandKits);

  const inTimeline = /\/projects\/[^/]+/.test(location.pathname);

  const lottieTemplates = useMemo(() => {
    if (!projectId) return [];
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    const kit = brandKits.find((k) => k.id === project.clientId);
    return kit?.lottieTemplatePaths ?? [];
  }, [projectId, projects, brandKits]);

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

  const insert = async (kind: "titleCard" | "lowerThird" | "outro" | "lottie", data: Record<string, unknown>) => {
    setOpen(false);
    const id = insertGraphic(kind, data);
    if (!id) {
      toast.error("Open a project timeline first.");
      return;
    }
    await saveSnapshot();
    toast.success(`${labelFor(kind)} inserted at playhead.`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-0/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface-1 shadow-popover">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command shouldFilter loop>
            <Command.Input
              placeholder="Search actions…"
              className="w-full bg-transparent px-3 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <Command.List className="max-h-96 overflow-auto border-t border-border-subtle p-1">
              <Command.Empty className="py-6 text-center text-xs text-text-muted">
                No matches.
              </Command.Empty>

              <Command.Group heading="Navigate">
                <Entry icon={LayoutDashboard} label="Projects" onSelect={() => go("/dashboard")} />
                <Entry icon={Palette} label="Brand kits" onSelect={() => go("/brand-kits")} />
                <Entry icon={Settings} label="Settings" onSelect={() => go("/settings")} />
              </Command.Group>

              {inTimeline ? (
                <Command.Group heading="Insert">
                  <Entry
                    icon={Type}
                    label="Insert title card"
                    onSelect={() => void insert("titleCard", { ...DEFAULT_TITLE_CARD })}
                  />
                  <Entry
                    icon={Captions}
                    label="Insert lower third"
                    onSelect={() => void insert("lowerThird", { ...DEFAULT_LOWER_THIRD })}
                  />
                  <Entry
                    icon={Film}
                    label="Insert outro"
                    onSelect={() => void insert("outro", { ...DEFAULT_OUTRO })}
                  />
                  {lottieTemplates.map((path) => (
                    <Entry
                      key={path}
                      icon={Sparkles}
                      label={`Insert Lottie · ${path.split("/").pop()}`}
                      onSelect={() =>
                        void insert("lottie", { ...DEFAULT_LOTTIE, templatePath: path })
                      }
                    />
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
  hint,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  hint?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2 rounded-default px-2 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-3 aria-selected:text-text-primary"
    >
      <Icon size={14} className="text-text-muted" />
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className="font-mono text-2xs text-text-muted">{hint}</span> : null}
      <ArrowRight size={12} className="text-text-muted opacity-0 group-aria-selected:opacity-100" />
    </Command.Item>
  );
}

function labelFor(kind: "titleCard" | "lowerThird" | "outro" | "lottie"): string {
  switch (kind) {
    case "titleCard":
      return "Title card";
    case "lowerThird":
      return "Lower third";
    case "outro":
      return "Outro";
    case "lottie":
      return "Lottie clip";
  }
}
