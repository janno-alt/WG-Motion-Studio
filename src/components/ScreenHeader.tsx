import type { ReactNode } from "react";

interface Props {
  title: string;
  actions?: ReactNode;
}

export function ScreenHeader({ title, actions }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-1 px-4">
      <h1 className="text-sm font-medium text-text-primary">{title}</h1>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
