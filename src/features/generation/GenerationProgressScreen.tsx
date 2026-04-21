import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { commands, onPlanProgress, type PlanProgress } from "@/lib/tauri";
import { PLANNING_PROMPT } from "@/lib/planningPrompt";
import { useProjectsStore } from "@/state/projectsStore";
import { formatUsd } from "@/lib/pricing";

type Phase = "idle" | "running" | "done" | "error";

export function GenerationProgressScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const upsertProject = useProjectsStore((s) => s.upsert);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [droppedCount, setDroppedCount] = useState<number | null>(null);
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!id || startedRef.current) return;
    startedRef.current = true;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      unlisten = await onPlanProgress(setProgress);
      setPhase("running");
      try {
        const hasKey = await commands.hasApiKey("anthropic");
        if (!hasKey) {
          throw new Error(
            "Anthropic API key missing. Add it in Settings before analyzing.",
          );
        }
        const result = await commands.generatePlan(id, PLANNING_PROMPT);
        if (cancelled) return;
        upsertProject(result.project);
        setDroppedCount(result.droppedCount);
        setCostUsd(result.costUsd);
        setPhase("done");
        if (result.droppedCount > 0) {
          toast.info(`${result.droppedCount} invalid items were dropped.`);
        }
        navigate(`/projects/${id}`);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [id, navigate, upsertProject]);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Analyzing" />
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md space-y-5 rounded-card border border-border-subtle bg-surface-1 p-6 shadow-panel">
          {phase === "error" ? (
            <ErrorPane
              message={error ?? "Unknown error"}
              onRetry={() => {
                startedRef.current = false;
                setError(null);
                setPhase("idle");
              }}
              onBack={() => navigate("/dashboard")}
            />
          ) : phase === "done" ? (
            <DonePane droppedCount={droppedCount ?? 0} costUsd={costUsd ?? 0} />
          ) : (
            <RunningPane progress={progress} />
          )}
        </div>
      </div>
    </div>
  );
}

function RunningPane({ progress }: { progress: PlanProgress | null }) {
  const stages: { key: PlanProgress["stage"]; label: string }[] = [
    { key: "loading", label: "Loading project context" },
    { key: "calling", label: "Calling Claude Opus" },
    { key: "parsing", label: "Validating plan" },
    { key: "persisting", label: "Saving to database" },
  ];
  const currentIdx = progress
    ? stages.findIndex((s) => s.key === progress.stage)
    : -1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Loader2 size={16} className="animate-spin text-accent-primary" />
        {progress?.message ?? "Starting analysis…"}
      </div>
      <ul className="space-y-1.5 text-xs">
        {stages.map((s, i) => {
          const active = i === currentIdx;
          const done = i < currentIdx || progress?.stage === "done";
          return (
            <li
              key={s.key}
              className={[
                "flex items-center gap-2",
                done ? "text-success" : active ? "text-text-primary" : "text-text-muted",
              ].join(" ")}
            >
              <span
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  done ? "bg-success" : active ? "bg-accent-primary" : "bg-surface-3",
                ].join(" ")}
              />
              {s.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DonePane({ droppedCount, costUsd }: { droppedCount: number; costUsd: number }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-success">Plan ready.</div>
      <div className="text-xs text-text-secondary">
        {droppedCount > 0 ? `${droppedCount} items dropped during validation. ` : null}
        Claude cost: {formatUsd(costUsd)}
      </div>
    </div>
  );
}

function ErrorPane({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-danger">Analysis failed</div>
        <pre className="selectable max-h-40 overflow-auto rounded-default bg-surface-0 p-2 font-mono text-2xs text-text-secondary">
          {message}
        </pre>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back to dashboard
        </Button>
        <Button variant="primary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
