import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LayoutDashboard, Palette, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
