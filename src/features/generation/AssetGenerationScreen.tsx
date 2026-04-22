import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { TierBadge } from "@/components/TierBadge";
import { commands, onAssetProgress, type AssetProgress, type GenerateAllSummary } from "@/lib/tauri";
import { formatUsd } from "@/lib/pricing";
import { formatTimestamp } from "@/lib/srt";
import { useProjectsStore } from "@/state/projectsStore";
import { useThemesStore } from "@/state/themesStore";
import type { PlanItem, Project } from "@/types";

type Phase =
  | "idle"
  | "running"
  | "done"
  | "partial"
  | "error";

interface Row {
  item: PlanItem;
  phase: AssetProgress["phase"] | "pending";
  message?: string | null;
  error?: string | null;
}

export function AssetGenerationScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const upsertProject = useProjectsStore((s) => s.upsert);
  const { themes, load: loadThemes } = useThemesStore();

  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [summary, setSummary] = useState<GenerateAllSummary | null>(null);
  const started = useRef(false);

  useEffect(() => {
    void loadThemes();
  }, [loadThemes]);

  useEffect(() => {
    if (!id) return;
    void commands.getProject(id).then((p) => {
      setProject(p);
      const initial: Record<string, Row> = {};
      for (const item of p.planItems) {
        initial[item.id] = { item, phase: "pending" };
      }
      setRows(initial);
    });
  }, [id]);

  useEffect(() => {
    if (!id || started.current || !project) return;
    started.current = true;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      unlisten = await onAssetProgress((e) => {
        setRows((prev) => {
          const row = prev[e.itemId];
          if (!row) return prev;
          return {
            ...prev,
            [e.itemId]: {
              ...row,
              phase: e.phase,
              message: e.message ?? null,
              error: e.error ?? null,
            },
          };
        });
      });

      setPhase("running");
      try {
        const result = await commands.generateAllAssets(id);
        if (cancelled) return;
        setSummary(result);
        setPhase(result.failed > 0 ? "partial" : "done");
        // Refresh project state.
        const fresh = await commands.getProject(id);
        setProject(fresh);
        upsertProject(fresh);
        if (result.failed === 0) {
          toast.success(
            `${result.succeeded} generated · ${result.skippedCached} cached · ${formatUsd(result.costUsd)}`,
          );
          setTimeout(() => navigate(`/projects/${id}/export`), 3000);
        } else {
          toast.warning(`${result.failed} item(s) failed — retry below.`);
        }
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        toast.error(`Generation failed: ${String(err)}`);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.id]);

  const theme = themes.find((t) => t.id === project?.clientId);

  const retry = async (itemId: string) => {
    try {
      setRows((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId]!, phase: "starting", error: null, message: null },
      }));
      await commands.generateSingleAsset(itemId);
      toast.success("Retried");
    } catch (err) {
      toast.error(`Retry failed: ${String(err)}`);
    }
  };

  if (!project) {
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader title="Generating assets" />
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Loading project…
        </div>
      </div>
    );
  }

  const items = Object.values(rows);
  const doneCount = items.filter((r) => r.phase === "done" || r.phase === "cached").length;
  const failedCount = items.filter((r) => r.phase === "error").length;
  const overallPct = items.length === 0 ? 0 : (doneCount / items.length) * 100;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Generating assets"
        actions={
          phase === "done" || phase === "partial" ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/projects/${id}/export`)}
            >
              Continue to export
            </Button>
          ) : null
        }
      />

      <div className="shrink-0 border-b border-border-subtle bg-surface-1 px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <div className="text-text-secondary">
            {phase === "running" ? (
              <span className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-accent-primary" />
                Generating {doneCount}/{items.length}
                {failedCount ? ` · ${failedCount} failed` : ""}
              </span>
            ) : phase === "done" ? (
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 size={12} />
                All assets ready
              </span>
            ) : phase === "partial" ? (
              <span className="flex items-center gap-2 text-warn">
                <AlertTriangle size={12} />
                Partial — {failedCount} failed
              </span>
            ) : phase === "error" ? (
              <span className="text-danger">Generation failed</span>
            ) : null}
          </div>
          {summary ? (
            <div className="font-mono text-text-muted">
              Cost: {formatUsd(summary.costUsd)}
            </div>
          ) : null}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full bg-accent-primary transition-[width] duration-[200ms] ease-out-expo"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <ul className="divide-y divide-border-subtle">
          {items.map((row) => (
            <li
              key={row.item.id}
              className="flex items-center gap-3 px-4 py-2.5 text-xs"
            >
              <span className="font-mono text-text-muted w-16 shrink-0">
                {formatTimestamp(row.item.timestamp)}
              </span>
              <TierBadge tier={row.item.tier} />
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {row.item.brief || "(no brief)"}
              </span>
              <PhaseBadge row={row} onRetry={() => void retry(row.item.id)} />
              {theme && row.item.finalAssetUrl ? (
                <div
                  className="h-6 w-6 shrink-0 rounded-sm border border-border-subtle bg-surface-0"
                  style={{
                    backgroundImage: `url(${toAssetUrl(row.item.finalAssetUrl)})`,
                    backgroundSize: "cover",
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PhaseBadge({ row, onRetry }: { row: Row; onRetry: () => void }) {
  if (row.phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-2xs text-danger" title={row.error ?? undefined}>
          Failed
        </span>
        <Button variant="ghost" size="sm" leadingIcon={<RefreshCw size={12} />} onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (row.phase === "done") {
    return (
      <span className="rounded-full bg-success/15 px-2 py-0.5 text-2xs text-success">Done</span>
    );
  }
  if (row.phase === "cached") {
    return (
      <span className="rounded-full bg-info/15 px-2 py-0.5 text-2xs text-info">Cached</span>
    );
  }
  if (row.phase === "pending") {
    return <span className="text-2xs text-text-muted">queued</span>;
  }
  return (
    <span className="flex items-center gap-1 text-2xs text-text-secondary">
      <Loader2 size={10} className="animate-spin" />
      {labelFor(row.phase)}
    </span>
  );
}

function labelFor(phase: Row["phase"]): string {
  switch (phase) {
    case "starting":
      return "starting";
    case "calling":
      return "calling API";
    case "validating":
      return "validating";
    case "saving":
      return "saving";
    default:
      return "working";
  }
}

function toAssetUrl(path: string): string {
  // convertFileSrc would be better but we keep this dependency-light here.
  return `asset://localhost/${encodeURIComponent(path)}`;
}
