import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Palette, Sparkles, Settings, PanelLeftClose, PanelLeft } from "lucide-react";

import { useAppStore } from "@/state/appStore";
import { ApiUsageWidget } from "@/components/ApiUsageWidget";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Projects", icon: LayoutDashboard },
  { to: "/themes", label: "Themes", icon: Palette },
  { to: "/presets", label: "Presets", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
];

const APP_VERSION = "v0.1.0 · LOCAL";

export function AppShell() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

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
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} item={item} collapsed={sidebarCollapsed} />
          ))}
        </nav>
        <div className="border-t border-border-subtle">
          <ApiUsageWidget collapsed={sidebarCollapsed} />
        </div>
        {!sidebarCollapsed ? (
          <div className="border-t border-border-subtle px-3 py-2 font-mono text-2xs text-text-muted">
            {APP_VERSION}
          </div>
        ) : null}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
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
            Motion Studio
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
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          "group flex h-8 items-center gap-2 rounded-default px-2 text-sm transition-colors",
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
        </>
      )}
    </NavLink>
  );
}
