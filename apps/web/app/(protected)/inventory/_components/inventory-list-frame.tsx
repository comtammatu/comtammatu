"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import {
  AppSection,
  type AppSectionProps,
} from "@/components/surface";

type InventoryListFrameProps = Omit<
  AppSectionProps,
  "children" | "className" | "contentFlush"
> & {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
};

export function InventoryListFrame({
  children,
  className,
  toolbar,
  ...sectionProps
}: InventoryListFrameProps) {
  return (
    <AppSection
      {...sectionProps}
      className={cn("overflow-hidden", className)}
      contentFlush
    >
      {toolbar}
      {children}
    </AppSection>
  );
}
