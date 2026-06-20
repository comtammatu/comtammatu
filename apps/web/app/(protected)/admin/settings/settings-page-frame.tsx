import type { ReactNode } from "react";
import { AppPageHeader } from "@/components/surface";

interface SettingsPageFrameProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsPageFrame({
  title,
  description,
  actions,
  children,
}: SettingsPageFrameProps) {
  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader
        title={title}
        description={description}
        actions={actions}
      />
      {children}
    </div>
  );
}
