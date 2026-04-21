import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Palette, Sparkles, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

export function AppLayout() {
  return (
    <div className="flex h-full w-full bg-surface-0 text-content-primary">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-surface-1">
        <div className="flex h-12 items-center px-4 text-sm font-medium tracking-wide text-content-secondary">
          WG Motion Studio
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-surface-3 text-content-primary"
                    : "text-content-secondary hover:bg-surface-2 hover:text-content-primary",
                ].join(" ")
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
