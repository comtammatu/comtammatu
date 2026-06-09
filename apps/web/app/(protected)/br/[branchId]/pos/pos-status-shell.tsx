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
      className="gap-6 p-6 sm:p-8"
      description={description}
      descriptionClassName="max-w-2xl text-base leading-7"
      icon={icon}
      iconClassName="size-12 border border-border/70 bg-background/80 text-primary shadow-sm"
      title={title}
      titleClassName="text-3xl font-semibold tracking-tight"
    >
      <Badge variant={badge.variant ?? "info"}>
        {badge.icon}
        <span>{badge.label}</span>
      </Badge>
    </AppEmptyState>
  );
}
