import { ScreenHeader } from "@/components/ScreenHeader";
import { ApiKeysSection } from "./sections/ApiKeysSection";
import { BudgetSection } from "./sections/BudgetSection";
import { CaptionsSection } from "./sections/CaptionsSection";
import { UpdateCheckSection } from "./sections/UpdateCheckSection";
import { ExportPathsSection } from "./sections/ExportPathsSection";
import { LogsSection } from "./sections/LogsSection";

export function SettingsScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Settings" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          <ApiKeysSection />
          <CaptionsSection />
          <BudgetSection />
          <ExportPathsSection />
          <LogsSection />
          <UpdateCheckSection />
        </div>
      </div>
    </div>
  );
}
