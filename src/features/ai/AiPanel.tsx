import { AutoBRollPanel } from "./AutoBRollPanel";
import { AutoHookPanel } from "./AutoHookPanel";

export function AiPanel() {
  return (
    <div className="grid h-full grid-rows-2 overflow-hidden">
      <div className="min-h-0 border-b border-border-subtle">
        <AutoHookPanel />
      </div>
      <div className="min-h-0">
        <AutoBRollPanel />
      </div>
    </div>
  );
}
