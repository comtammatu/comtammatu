import type { ReactNode } from "react";
import { AppPage, AppToolbar } from "@/components/surface";

interface InventoryPageContentProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  scroll?: boolean;
  width?: "wide" | "narrow";
}

export function InventoryPageContent({
  children,
  className,
  contentClassName,
  scroll = true,
  width = "wide",
}: InventoryPageContentProps) {
  return (
    <AppPage
      className={className}
      contentClassName={contentClassName}
      scroll={scroll}
      width={width}
    >
      {children}
    </AppPage>
  );
}

interface InventoryFilterBarProps {
  children: ReactNode;
  className?: string;
}

export function InventoryFilterBar({
  children,
  className,
}: InventoryFilterBarProps) {
  return <AppToolbar className={className}>{children}</AppToolbar>;
}
