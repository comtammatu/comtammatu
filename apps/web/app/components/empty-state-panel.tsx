import type { ReactNode } from "react";
import { AppEmptyState, type AppEmptyStateMode } from "@/components/surface";

type EmptyStateMode = "full" | "inline" | "table-row" | AppEmptyStateMode;

interface EmptyStatePanelProps {
  title?: string;
  mode?: EmptyStateMode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

function normalizeMode(mode: EmptyStateMode): AppEmptyStateMode {
  if (mode === "full" || mode === "inline" || mode === "table-row") {
    return "no-data";
  }
  return mode;
}

export function EmptyStatePanel({
  title,
  mode = "no-data",
  description,
  icon,
  className,
  children,
}: EmptyStatePanelProps) {
  return (
    <AppEmptyState
      title={title}
      mode={normalizeMode(mode)}
      description={description}
      icon={icon}
      className={className}
    >
      {children}
    </AppEmptyState>
  );
}
