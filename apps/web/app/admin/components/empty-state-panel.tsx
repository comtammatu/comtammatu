import type { ReactNode } from "react";
import { type EmptyStateMode, EmptyState } from "@/components/patterns";

interface EmptyStatePanelProps {
  title?: string;
  mode?: EmptyStateMode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
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
    <EmptyState
      mode={mode}
      icon={icon}
      title={title ?? "Chưa có dữ liệu"}
      description={description}
      action={children}
      className={className}
    />
  );
}
