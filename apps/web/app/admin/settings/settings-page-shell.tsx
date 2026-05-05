import type { ReactNode } from "react";
import { AppPageHeader } from "@/components/surface";

interface SettingsPageShellProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsPageShell({
  title,
  description,
  actions,
  children,
}: SettingsPageShellProps) {
  return (
    <div className="space-y-6">
      <AppPageHeader
        title={title}
        description={description}
        actions={actions}
      />
      {children}
    </div>
  );
}
