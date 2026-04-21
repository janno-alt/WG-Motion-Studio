import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Grid2x2, List, Plus } from "lucide-react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { StatusBadge } from "@/components/StatusBadge";
import { useAppStore } from "@/state/appStore";
import { useProjectsStore } from "@/state/projectsStore";
import { useThemesStore } from "@/state/themesStore";
import { formatRelativeTime, formatSeconds } from "@/lib/format";
import type { Project, ProjectStatus, Theme } from "@/types";

const STATUS_FILTERS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "generating", label: "Generating" },
  { value: "rendered", label: "Rendered" },
  { value: "exported", label: "Exported" },
];

export function DashboardScreen() {
  const { projects, loading, load } = useProjectsStore();
  const { themes, load: loadThemes } = useThemesStore();
  const { projectListLayout, setProjectListLayout } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [clientFilter, setClientFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void load();
    void loadThemes();
  }, [load, loadThemes]);

  const themeById = useMemo(() => {
    const m = new Map<string, Theme>();
    for (const t of themes) m.set(t.id, t);
    return m;
  }, [themes]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (clientFilter !== "all" && p.clientId !== clientFilter) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [projects, statusFilter, clientFilter, search]);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Projects"
        actions={
          <div className="flex items-center gap-2">
            <LayoutToggle layout={projectListLayout} onChange={setProjectListLayout} />
            <Link to="/projects/new">
              <Button variant="primary" size="sm" leadingIcon={<Plus size={14} />}>
                New project
              </Button>
            </Link>
          </div>
        }
      />
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-1 px-4 py-2">
        <Input
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 max-w-xs"
        />
        <FilterChips<ProjectStatus | "all">
          value={statusFilter}
          options={STATUS_FILTERS}
          onChange={setStatusFilter}
        />
        <div className="ml-auto flex items-center gap-2">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value as string | "all")}
            className="h-7 rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
          >
            <option value="all">All clients</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && projects.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={projects.length > 0} />
        ) : projectListLayout === "grid" ? (
          <GridView projects={filtered} themeById={themeById} />
        ) : (
          <ListView projects={filtered} themeById={themeById} />
        )}
      </div>
    </div>
  );
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: "grid" | "list";
  onChange: (l: "grid" | "list") => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-default border border-border-subtle">
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={[
          "flex h-7 w-7 items-center justify-center transition-colors",
          layout === "grid"
            ? "bg-surface-3 text-text-primary"
            : "bg-surface-1 text-text-secondary hover:text-text-primary",
        ].join(" ")}
        title="Grid layout"
      >
        <Grid2x2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={[
          "flex h-7 w-7 items-center justify-center transition-colors",
          layout === "list"
            ? "bg-surface-3 text-text-primary"
            : "bg-surface-1 text-text-secondary hover:text-text-primary",
        ].join(" ")}
        title="List layout"
      >
        <List size={14} />
      </button>
    </div>
  );
}

function FilterChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            "rounded-default px-2 py-1 text-xs transition-colors",
            value === o.value
              ? "bg-surface-3 text-text-primary"
              : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="text-sm text-text-secondary">
        {hasAny ? "No projects match these filters." : "No projects yet."}
      </div>
      {!hasAny ? (
        <Link to="/projects/new">
          <Button variant="primary" size="sm" leadingIcon={<Plus size={14} />}>
            Create your first one
          </Button>
        </Link>
      ) : null}
    </div>
  );
}

function GridView({
  projects,
  themeById,
}: {
  projects: Project[];
  themeById: Map<string, Theme>;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-4">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} theme={themeById.get(p.clientId)} />
      ))}
    </div>
  );
}

function ProjectCard({ project, theme }: { project: Project; theme: Theme | undefined }) {
  return (
    <Link
      to={routeForProject(project)}
      className="group flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-1 p-3 shadow-panel transition-colors hover:border-accent-primary"
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-border-subtle"
            style={{ background: theme?.colors.primary ?? "#2A2A2A" }}
            title={theme?.name ?? project.clientId}
          />
          <div className="min-w-0 truncate text-sm font-medium text-text-primary">{project.name}</div>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="flex items-center gap-3 text-2xs text-text-muted">
        <span>{project.videoFormat}</span>
        <span>{formatSeconds(project.videoDuration)}</span>
        <span>{project.planItems.length} items</span>
      </div>
      <div className="mt-auto text-2xs text-text-muted">
        Updated {formatRelativeTime(project.updatedAt)}
      </div>
    </Link>
  );
}

function ListView({
  projects,
  themeById,
}: {
  projects: Project[];
  themeById: Map<string, Theme>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="sticky top-0 bg-surface-1 text-left text-2xs uppercase tracking-wide text-text-muted">
          <th className="px-4 py-2 font-medium">Name</th>
          <th className="px-4 py-2 font-medium">Client</th>
          <th className="px-4 py-2 font-medium">Format</th>
          <th className="px-4 py-2 font-medium">Duration</th>
          <th className="px-4 py-2 font-medium">Items</th>
          <th className="px-4 py-2 font-medium">Status</th>
          <th className="px-4 py-2 font-medium">Updated</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const theme = themeById.get(p.clientId);
          return (
            <tr key={p.id} className="border-t border-border-subtle hover:bg-surface-2">
              <td className="px-4 py-2">
                <Link to={routeForProject(p)} className="block text-text-primary hover:text-accent-primary">
                  {p.name}
                </Link>
              </td>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2 text-xs text-text-secondary">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-border-subtle"
                    style={{ background: theme?.colors.primary ?? "#2A2A2A" }}
                  />
                  {theme?.name ?? p.clientId}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-text-secondary">{p.videoFormat}</td>
              <td className="px-4 py-2 text-xs text-text-secondary">
                {formatSeconds(p.videoDuration)}
              </td>
              <td className="px-4 py-2 text-xs text-text-secondary">{p.planItems.length}</td>
              <td className="px-4 py-2">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-4 py-2 text-xs text-text-muted">
                {formatRelativeTime(p.updatedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function routeForProject(p: Project): string {
  switch (p.status) {
    case "draft":
    case "analyzing":
      return `/projects/${p.id}/generating`;
    default:
      return `/projects/${p.id}`;
  }
}
