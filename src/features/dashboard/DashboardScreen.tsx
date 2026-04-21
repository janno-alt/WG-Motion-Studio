import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

export function DashboardScreen() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
        <h1 className="text-sm font-medium">Projects</h1>
        <Link
          to="/projects/new"
          className="flex items-center gap-1.5 rounded bg-accent px-2.5 py-1 text-sm text-content-inverse hover:bg-accent-soft"
        >
          <Plus size={14} />
          New project
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-content-tertiary">
        No projects yet.
      </div>
    </div>
  );
}
