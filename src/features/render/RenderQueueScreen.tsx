import { useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, FolderOpen, Loader2, RotateCcw, Trash2, X, XCircle } from "lucide-react";

import { Button } from "@/components/Button";
import { ScreenHeader } from "@/components/ScreenHeader";
import { commands } from "@/lib/tauri";
import { formatRelativeTime } from "@/lib/format";
import { useRendersStore } from "@/state/rendersStore";
import type { RenderRow } from "@/types";

export function RenderQueueScreen() {
  const { renders, loading, load, remove } = useRendersStore();

  useEffect(() => {
    void load(null);
  }, [load]);

  const cancel = async (id: string) => {
    try {
      await commands.cancelRender(id);
      toast.success("Render cancelled.");
    } catch (err) {
      toast.error(`Cancel failed: ${String(err)}`);
    }
  };

  const reveal = async (path: string) => {
    try {
      await commands.revealInFinder(path);
    } catch (err) {
      toast.error(`Reveal failed: ${String(err)}`);
    }
  };

  const purge = async (id: string) => {
    try {
      await commands.deleteRender(id);
      remove(id);
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    }
  };

  const grouped = group(renders);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Renders" />
      <div className="flex-1 overflow-auto bg-surface-0 p-4">
        {loading && renders.length === 0 ? (
          <div className="text-2xs text-text-muted">Loading…</div>
        ) : renders.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-subtle bg-surface-1 px-4 py-8 text-center text-2xs text-text-muted">
            No renders yet. Open a project, click Render, and queue one.
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.active.length > 0 ? (
              <Section title="Active">
                <ul className="space-y-2">
                  {grouped.active.map((r) => (
                    <RenderCard key={r.id} render={r} onCancel={() => void cancel(r.id)} />
                  ))}
                </ul>
              </Section>
            ) : null}
            {grouped.done.length > 0 ? (
              <Section title="Completed">
                <ul className="space-y-2">
                  {grouped.done.map((r) => (
                    <RenderCard
                      key={r.id}
                      render={r}
                      onReveal={() => void reveal(r.outputPath)}
                      onDelete={() => void purge(r.id)}
                    />
                  ))}
                </ul>
              </Section>
            ) : null}
            {grouped.failed.length > 0 ? (
              <Section title="Failed / cancelled">
                <ul className="space-y-2">
                  {grouped.failed.map((r) => (
                    <RenderCard
                      key={r.id}
                      render={r}
                      onDelete={() => void purge(r.id)}
                    />
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function group(rows: RenderRow[]) {
  const active: RenderRow[] = [];
  const done: RenderRow[] = [];
  const failed: RenderRow[] = [];
  for (const r of rows) {
    if (r.status === "running" || r.status === "queued") active.push(r);
    else if (r.status === "done") done.push(r);
    else failed.push(r);
  }
  return { active, done, failed };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RenderCard({
  render,
  onCancel,
  onReveal,
  onDelete,
}: {
  render: RenderRow;
  onCancel?: () => void;
  onReveal?: () => void;
  onDelete?: () => void;
}) {
  const pct = Math.round(render.progress * 100);
  return (
    <li className="rounded-card border border-border-subtle bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <StatusIcon status={render.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-primary">{render.preset}</span>
            <span className="text-2xs text-text-muted">·</span>
            <span className="font-mono text-2xs text-text-muted">{render.id}</span>
          </div>
          <div className="truncate text-2xs text-text-muted" title={render.outputPath}>
            {render.outputPath}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onReveal ? (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<FolderOpen size={12} />}
              onClick={onReveal}
            >
              Reveal
            </Button>
          ) : null}
          {onCancel ? (
            <Button variant="secondary" size="sm" leadingIcon={<X size={12} />} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              title="Delete record"
              className="text-text-muted hover:text-danger"
            >
              <Trash2 size={12} />
            </button>
          ) : null}
        </div>
      </div>
      {render.status === "running" || (render.status === "done" && render.progress < 1) ? (
        <div className="mt-2">
          <div className="mb-0.5 flex justify-between text-2xs text-text-muted">
            <span>{statusLabel(render.status)}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full bg-accent-primary transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
      {render.error ? (
        <div className="mt-2 truncate text-2xs text-danger" title={render.error}>
          {render.error}
        </div>
      ) : null}
      <div className="mt-1 text-2xs text-text-muted">
        {render.finishedAt
          ? `Finished ${formatRelativeTime(render.finishedAt)}`
          : render.startedAt
            ? `Started ${formatRelativeTime(render.startedAt)}`
            : `Queued ${formatRelativeTime(render.createdAt)}`}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: RenderRow["status"] }) {
  switch (status) {
    case "queued":
      return <Clock size={14} className="text-text-muted" />;
    case "running":
      return <Loader2 size={14} className="animate-spin text-accent-primary" />;
    case "done":
      return <CheckCircle2 size={14} className="text-success" />;
    case "failed":
      return <XCircle size={14} className="text-danger" />;
    case "cancelled":
      return <RotateCcw size={14} className="text-text-muted" />;
  }
}

function statusLabel(status: RenderRow["status"]): string {
  return status[0]?.toUpperCase() + status.slice(1);
}
