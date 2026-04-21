import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: Props) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-panel">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        ) : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
