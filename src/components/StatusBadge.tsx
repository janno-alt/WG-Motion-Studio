import type { ProjectStatus } from "@/types";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: "bg-status-draft/15 text-status-draft",
  editing: "bg-status-review/15 text-status-review",
  rendered: "bg-status-rendered/15 text-status-rendered",
  exported: "bg-status-exported/15 text-status-exported",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  editing: "Editing",
  rendered: "Rendered",
  exported: "Exported",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium",
        STATUS_STYLES[status],
      ].join(" ")}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
