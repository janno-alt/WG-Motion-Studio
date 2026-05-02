/**
 * Keyboard shortcut helpers. Centralised so we never collide and so the
 * Cmd-Palette can list bindings.
 */

export type Modifiers = {
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export interface Hotkey {
  id: string;
  keys: string;
  description: string;
  match: (e: KeyboardEvent) => boolean;
}

export const HOTKEYS = {
  togglePlayback: hotkey("togglePlayback", "Space", "Play / pause", (e) => e.code === "Space"),
  scrubBackward: hotkey("scrubBackward", "J", "Reverse / scrub back", keyIs("j")),
  scrubPause: hotkey("scrubPause", "K", "Pause", keyIs("k")),
  scrubForward: hotkey("scrubForward", "L", "Play / scrub forward", keyIs("l")),
  setIn: hotkey("setIn", "I", "Set in-point", keyIs("i")),
  setOut: hotkey("setOut", "O", "Set out-point", keyIs("o")),
  splitAtPlayhead: hotkey(
    "splitAtPlayhead",
    "⌘K",
    "Split clip at playhead",
    (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k",
  ),
  undo: hotkey(
    "undo",
    "⌘Z",
    "Undo",
    (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z",
  ),
  redo: hotkey(
    "redo",
    "⌘⇧Z",
    "Redo",
    (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z",
  ),
  delete: hotkey(
    "delete",
    "⌫",
    "Delete selected clip(s)",
    (e) => e.key === "Backspace" || e.key === "Delete",
  ),
} as const;

function keyIs(letter: string): (e: KeyboardEvent) => boolean {
  return (e) => !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === letter;
}

function hotkey(
  id: string,
  keys: string,
  description: string,
  match: (e: KeyboardEvent) => boolean,
): Hotkey {
  return { id, keys, description, match };
}

/**
 * Whether the focused element is an editable field where global hotkeys
 * should NOT fire.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
