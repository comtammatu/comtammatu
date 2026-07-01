"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { AppSection, type AppSectionProps } from "./surface";

export type SettingsFormSectionProps = Omit<AppSectionProps, "children"> & {
  children: ReactNode;
  groupClassName?: string;
};

export function SettingsFormSection({
  children,
  contentClassName,
  groupClassName,
  ...sectionProps
}: SettingsFormSectionProps) {
  return (
    <AppSection contentClassName={cn("gap-4", contentClassName)} {...sectionProps}>
      <FieldGroup className={groupClassName}>{children}</FieldGroup>
    </AppSection>
  );
}
