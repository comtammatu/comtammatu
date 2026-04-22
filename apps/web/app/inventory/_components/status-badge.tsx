"use client";

import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
  variant?: BadgeProps["variant"];
  size?: "sm" | "default";
}

export function StatusBadge({
  status,
  label,
  className,
  variant,
  size = "default",
}: StatusBadgeProps) {
  const resolvedVariant = variant ?? getInventoryStatusBadgeVariant(status);
  const resolvedLabel = getInventoryStatusLabel(status, label);

  return (
    <Badge
      variant={resolvedVariant}
      className={cn(size === "sm" && "text-xs px-2 py-0.5", className)}
      data-slot="status-badge"
      data-status={status}
    >
      {resolvedLabel}
    </Badge>
  );
}
