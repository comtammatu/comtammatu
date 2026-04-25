import type { ReactNode } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";

type StepTone = "done" | "current" | "pending";

export interface PosStatusStep {
  label: string;
  title: string;
  description: string;
  tone?: StepTone;
}

export interface PosStatusShellProps {
  icon: ReactNode;
  title: string;
  description: string;
  badge: {
    label: string;
    icon: ReactNode;
    variant?: "destructive" | "warning" | "info";
  };
  steps?: PosStatusStep[];
}

export function PosStatusShell({
  icon,
  title,
  description,
  badge,
}: PosStatusShellProps) {
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <Empty className="items-start gap-5 border-0 p-0 text-left">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-4">
              <EmptyMedia
                variant="icon"
                className="size-14 border border-border/70 bg-background/80 text-primary shadow-sm"
              >
                {icon}
              </EmptyMedia>
              <EmptyHeader className="items-start gap-1.5 text-left">
                <EmptyTitle className="text-3xl font-semibold tracking-tight">
                  {title}
                </EmptyTitle>
                <EmptyDescription className="max-w-2xl text-base leading-7">
                  {description}
                </EmptyDescription>
              </EmptyHeader>
            </div>
            <Badge variant={badge.variant ?? "info"}>
              {badge.icon}
              <span>{badge.label}</span>
            </Badge>
          </div>
        </Empty>
      </CardContent>
    </Card>
  );
}
