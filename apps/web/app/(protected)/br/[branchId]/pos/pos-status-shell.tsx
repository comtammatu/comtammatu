import type { ReactNode } from "react";
import { AppEmptyState } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";

export interface PosStatusShellProps {
  icon: ReactNode;
  title: string;
  description: string;
  badge: {
    label: string;
    icon: ReactNode;
    variant?: "destructive" | "warning" | "info";
  };
}

export function PosStatusShell({
  icon,
  title,
  description,
  badge,
}: PosStatusShellProps) {
  return (
    <AppEmptyState
      align="start"
      description={description}
      descriptionClassName="max-w-md text-sm"
      icon={icon}
      iconClassName="size-12 border border-border/70 bg-background/80 text-primary shadow-sm"
      title={title}
      titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
    >
      <Badge variant={badge.variant ?? "info"}>
        {badge.icon}
        <span>{badge.label}</span>
      </Badge>
    </AppEmptyState>
  );
}
