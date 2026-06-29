import type { ReactNode } from "react";
import { AppPage, AppToolbar, type AppToolbarProps } from "@/components/surface";

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

type InventoryFilterBarProps = AppToolbarProps;

export function InventoryFilterBar(props: InventoryFilterBarProps) {
  return <AppToolbar {...props} />;
}
