import { ArrowLeft, Download, Pause, Play, Repeat, Save, Undo2, Redo2, RotateCcw } from "lucide-react";

import { Button } from "@/components/Button";
import { formatTimestamp } from "@/lib/srt";
import type { SaveState } from "../hooks/useAutoSave";

interface Props {
  name: string;
  onRenameName: (v: string) => void;
  saveState: SaveState;
  playing: boolean;
  loop: boolean;
  currentSec: number;
  durationSec: number;
  onPlayPause: () => void;
  onToggleLoop: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onBack: () => void;
  onSaveAndBack: () => void;
  onExportAlpha: () => void;
  exporting?: boolean;
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
};

const SAVE_COLOR: Record<SaveState, string> = {
  saved: "text-text-muted",
  dirty: "text-warn",
  saving: "text-text-secondary",
  error: "text-danger",
};

export function EditorToolbar(props: Props) {
  const {
    name,
    onRenameName,
    saveState,
    playing,
    loop,
    currentSec,
    durationSec,
    onPlayPause,
    onToggleLoop,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onReset,
    onBack,
    onSaveAndBack,
    onExportAlpha,
    exporting,
  } = props;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-1 px-3">
      <button
        type="button"
        onClick={onBack}
        className="flex h-7 w-7 items-center justify-center rounded-default text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
        title="Back to plan review"
      >
        <ArrowLeft size={14} />
      </button>

      <input
        value={name}
        onChange={(e) => onRenameName(e.target.value)}
        className="min-w-[180px] max-w-[360px] flex-1 truncate bg-transparent px-1 text-sm font-medium text-text-primary focus:outline-none"
      />

      <div className={["text-2xs", SAVE_COLOR[saveState]].join(" ")}>
        {SAVE_LABEL[saveState]}
      </div>

      <div className="mx-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayPause}
          className="flex h-8 w-8 items-center justify-center rounded-default bg-surface-3 text-text-primary hover:bg-border"
          title="Play / Pause (Space)"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          type="button"
          onClick={onToggleLoop}
          className={[
            "flex h-8 w-8 items-center justify-center rounded-default transition-colors",
            loop
              ? "bg-accent-primary/15 text-accent-primary"
              : "bg-surface-3 text-text-secondary hover:bg-border",
          ].join(" ")}
          title="Loop"
        >
          <Repeat size={14} />
        </button>
        <div className="font-mono text-xs tracking-tight text-text-secondary">
          {formatTimestamp(currentSec)} /{" "}
          <span className="text-text-muted">{formatTimestamp(durationSec)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="flex h-7 w-7 items-center justify-center rounded-default text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
          title="Undo (⌘Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="flex h-7 w-7 items-center justify-center rounded-default text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 size={14} />
        </button>
        <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={onReset}>
          Reset to AI
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Download size={13} />}
          disabled={exporting}
          onClick={onExportAlpha}
        >
          {exporting ? "Exporting…" : "Export alpha"}
        </Button>
        <Button variant="primary" size="sm" leadingIcon={<Save size={13} />} onClick={onSaveAndBack}>
          Save &amp; back
        </Button>
      </div>
    </header>
  );
}
