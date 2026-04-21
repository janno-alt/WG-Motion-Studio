import { ScreenHeader } from "@/components/ScreenHeader";

export function NewProjectScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="New project" />
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        Project setup — phase 2.
      </div>
    </div>
  );
}
