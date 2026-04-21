import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

import { ScreenHeader } from "@/components/ScreenHeader";

export function DashboardScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Projects"
        actions={
          <Link
            to="/projects/new"
            className="flex items-center gap-1.5 rounded-default bg-accent-primary px-2.5 py-1 text-sm font-medium text-surface-0 transition-colors hover:bg-accent-primary-hover"
          >
            <Plus size={14} />
            New project
          </Link>
        }
      />
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        No projects yet.
      </div>
    </div>
  );
}
