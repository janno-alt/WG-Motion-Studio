import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Slider from "@radix-ui/react-slider";
import { AlertTriangle, Trash2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/Button";
import { Field, Input, Textarea } from "@/components/Input";
import { TierBadge } from "@/components/TierBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { commands } from "@/lib/tauri";
import { formatTimestamp } from "@/lib/srt";
import type { PlanItem, Project, StyleVariant, Tier1ComponentType } from "@/types";

interface Props {
  project: Project;
  item: PlanItem | null;
  onUpdate: (next: PlanItem) => void;
  onDelete: (item: PlanItem) => void;
}

const TIER1_TYPES: Tier1ComponentType[] = [
  "IconPopIn",
  "HighlightCircle",
  "SlideInIllustration",
  "TextCallout",
  "NumberEmphasis",
  "ProgressBar",
  "LowerThird",
  "ArrowPointer",
];

/**
 * The right-side detail panel on the plan-review screen. Edits happen in
 * local state and commit via `onUpdate` on blur / explicit changes. Tier
 * changes invalidate asset references and surface a "needs regeneration"
 * hint.
 */
export function PlanItemDetailPanel({ project, item, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();

  const [local, setLocal] = useState<PlanItem | null>(item);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setLocal(item), [item]);

  if (!item || !local) {
    return (
      <aside className="flex w-[380px] shrink-0 flex-col items-center justify-center border-l border-border-subtle bg-surface-1 text-xs text-text-muted">
        Select a graphic to see its details.
      </aside>
    );
  }

  const commit = (patch: Partial<PlanItem>) => {
    const next: PlanItem = { ...local, ...patch };
    setLocal(next);
    onUpdate(next);
  };

  const tierChanged = local.tier !== item.tier;
  const assetInvalid = tierChanged && item.tier !== local.tier;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-surface-1">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <div className="flex items-center gap-2">
          <TierBadge tier={local.tier} size="md" />
          <StatusBadge status={"draft" as const} />
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex h-6 w-6 items-center justify-center rounded-default text-text-muted hover:bg-surface-2 hover:text-danger"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-3">
        {assetInvalid ? (
          <div className="flex items-start gap-1.5 rounded-default border border-warn/40 bg-warn/10 p-2 text-2xs text-warn">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Tier changed — existing assets need to be regenerated.
          </div>
        ) : null}

        <Section title="Timing">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Timestamp">
              <Input
                type="text"
                readOnly
                value={formatTimestamp(local.timestamp)}
                className="h-7 font-mono text-xs"
              />
            </Field>
            <Field label={`Duration — ${local.duration.toFixed(2)}s`}>
              <Slider.Root
                className="relative mt-1 flex h-5 w-full items-center"
                value={[local.duration]}
                min={0.4}
                max={10}
                step={0.05}
                onValueCommit={(v) => commit({ duration: v[0] ?? local.duration })}
                onValueChange={(v) => setLocal({ ...local, duration: v[0] ?? local.duration })}
              >
                <Slider.Track className="relative h-1 grow rounded-full bg-surface-3">
                  <Slider.Range className="absolute h-full rounded-full bg-accent-primary" />
                </Slider.Track>
                <Slider.Thumb className="block h-3 w-3 rounded-full border border-surface-0 bg-accent-primary" />
              </Slider.Root>
            </Field>
          </div>
        </Section>

        <Section title="Kind">
          <Field label="Tier">
            <div className="flex gap-1">
              {[1, 2, 3].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => commit({ tier: t as 1 | 2 | 3 })}
                  className={[
                    "h-7 flex-1 rounded-default border text-xs transition-colors",
                    local.tier === t
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-subtle text-text-secondary hover:bg-surface-2",
                  ].join(" ")}
                >
                  Tier {t}
                </button>
              ))}
            </div>
          </Field>

          {local.tier === 1 ? (
            <Field label="Component type">
              <select
                value={local.componentType ?? ""}
                onChange={(e) => commit({ componentType: e.target.value as Tier1ComponentType })}
                className="h-7 w-full rounded-default border border-border-subtle bg-surface-0 px-2 text-xs text-text-primary"
              >
                {TIER1_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Style variant">
            <div className="flex gap-1">
              {(["A", "B", "C", "D"] as StyleVariant[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => commit({ styleVariant: v })}
                  className={[
                    "h-7 flex-1 rounded-default border text-xs transition-colors",
                    local.styleVariant === v
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-subtle text-text-secondary hover:bg-surface-2",
                  ].join(" ")}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Brief">
          <Textarea
            rows={4}
            value={local.brief}
            onChange={(e) => setLocal({ ...local, brief: e.target.value })}
            onBlur={(e) => commit({ brief: e.target.value })}
            className="text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw size={12} />}
            onClick={async () => {
              try {
                await commands.generateSingleAsset(item.id);
                toast.success("Asset regenerated");
              } catch (err) {
                toast.error(`Regenerate failed: ${String(err)}`);
              }
            }}
          >
            Regenerate asset
          </Button>
        </Section>

        <Section title="SRT context">
          <div className="selectable rounded-default border border-border-subtle bg-surface-0 p-2 font-mono text-2xs leading-relaxed text-text-secondary">
            {local.srtContext || "(empty)"}
          </div>
        </Section>
      </div>

      <div className="shrink-0 border-t border-border-subtle p-2">
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Pencil size={13} />}
          onClick={() => navigate(`/projects/${project.id}/editor/${item.id}`)}
          className="w-full"
        >
          Open in editor
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete plan item?"
        description="Removes this graphic from the plan."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(item);
        }}
      />
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-card border border-border-subtle bg-surface-0/60 p-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  );
}
