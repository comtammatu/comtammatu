import type { ReactNode } from "react";
import { AppPage, AppToolbar } from "@/components/surface";

interface InventoryPageContentProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  scroll?: boolean;
  width?: "wide" | "narrow";
  density?: "comfortable" | "compact";
  mobile?: boolean;
}

export function InventoryPageContent({
  children,
  className,
  contentClassName,
  scroll = true,
  width = "wide",
  density = "comfortable",
  mobile = false,
}: InventoryPageContentProps) {
  return (
    <AppPage
      className={className}
      contentClassName={contentClassName}
      scroll={scroll}
      width={width}
      density={density}
      mobile={mobile}
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
