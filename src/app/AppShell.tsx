import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListVideo,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Settings,
} from "lucide-react";

import { useAppStore } from "@/state/appStore";
import { useRendersStore, activeCount } from "@/state/rendersStore";
import { ApiUsageWidget } from "@/components/ApiUsageWidget";
import { CommandPalette } from "@/components/CommandPalette";
import { useRenderQueueEvents } from "@/features/render/useRenderQueueEvents";
import { APP_VERSION } from "@/lib/version";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional callback returning a small badge string. */
  badge?: () => number;
}

const APP_VERSION_LABEL = `v${APP_VERSION} · LOCAL`;

export function AppShell() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const renders = useRendersStore((s) => s.renders);
  const loadRenders = useRendersStore((s) => s.load);

  useRenderQueueEvents();

  useEffect(() => {
    void loadRenders(null);
  }, [loadRenders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const renderBadge = activeCount(renders);
  const navItems: NavItem[] = [
    { to: "/dashboard", label: "Projects", icon: LayoutDashboard },
    { to: "/brand-kits", label: "Brand kits", icon: Palette },
    {
      to: "/renders",
      label: "Renders",
      icon: ListVideo,
      badge: () => renderBadge,
    },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-full w-full bg-surface-0 text-text-primary">
      <aside
        className={[
          "flex shrink-0 flex-col border-r border-border-subtle bg-surface-1",
          "transition-[width] duration-[200ms] ease-out-expo",
          sidebarCollapsed ? "w-16" : "w-60",
        ].join(" ")}
      >
        <SidebarHeader collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <nav className="flex flex-1 flex-col gap-0.5 overflow-hidden px-2 py-1">
          {navItems.map((item) => (
            <SidebarNavItem key={item.to} item={item} collapsed={sidebarCollapsed} />
          ))}
        </nav>
        <div className="border-t border-border-subtle">
          <ApiUsageWidget collapsed={sidebarCollapsed} />
        </div>
        {!sidebarCollapsed ? (
          <div className="border-t border-border-subtle px-3 py-2 font-mono text-2xs text-text-muted">
            {APP_VERSION_LABEL}
          </div>
        ) : null}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}

function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-3">
      <div className="flex items-center gap-2 overflow-hidden">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-default bg-accent-primary font-mono text-xs font-bold text-surface-0">
          M
        </div>
        {!collapsed ? (
          <span className="truncate text-sm font-semibold text-text-primary">
            Video Studio
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onToggle}
        title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘B)`}
        className="flex h-6 w-6 items-center justify-center rounded-default text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
      >
        {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
      </button>
    </div>
  );
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  const badgeCount = item.badge?.() ?? 0;
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          "group relative flex h-8 items-center gap-2 rounded-default px-2 text-sm transition-colors",
          collapsed ? "justify-center" : "",
          isActive
            ? "bg-surface-3 text-text-primary"
            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            className={isActive ? "text-accent-primary" : undefined}
          />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
          {badgeCount > 0 ? (
            <span
              className={[
                "ml-auto rounded-full bg-accent-primary px-1.5 py-0 font-mono text-2xs font-medium text-surface-0",
                collapsed ? "absolute -right-0.5 -top-0.5 ml-0" : "",
              ].join(" ")}
            >
              {badgeCount}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
