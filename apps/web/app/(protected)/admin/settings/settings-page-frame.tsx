import type { ReactNode } from "react";
import { AppPage, AppPageHeader, type AppPageProps } from "@/components/surface";

interface SettingsPageFrameProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  // Settings forms default to a focused column; jobs/data views pass "wide".
  width?: AppPageProps["width"];
}

export function SettingsPageFrame({
  title,
  description,
  actions,
  children,
  width = "default",
}: SettingsPageFrameProps) {
  return (
    <AppPage width={width} density="compact">
      <AppPageHeader title={title} description={description} actions={actions} />
      {children}
    </AppPage>
  );
}
