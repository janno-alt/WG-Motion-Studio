import { ScreenHeader } from "@/components/ScreenHeader";
import { ApiKeysSection } from "./sections/ApiKeysSection";
import { BudgetSection } from "./sections/BudgetSection";
import { UpdateCheckSection } from "./sections/UpdateCheckSection";
import { ExportPathsSection } from "./sections/ExportPathsSection";
import { RenderQualitySection } from "./sections/RenderQualitySection";

export function SettingsScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Settings" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          <ApiKeysSection />
          <BudgetSection />
          <RenderQualitySection />
          <ExportPathsSection />
          <UpdateCheckSection />
        </div>
      </div>
    </div>
  );
}
