import type { ReactNode } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { cn } from "@comtammatu/ui";

type StepTone = "done" | "current" | "pending";

const STEP_TONE_CLASS: Record<StepTone, string> = {
  done: "border-success/30 bg-success/10",
  current: "border-warning/30 bg-warning/10",
  pending: "border-border bg-muted/30",
};

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
  steps: PosStatusStep[];
}

export function PosStatusShell({
  icon,
  title,
  description,
  badge,
  steps,
}: PosStatusShellProps) {
  return (
    <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <Empty className="items-start gap-6 border-0 p-0 text-left">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4">
              <EmptyMedia
                variant="icon"
                className="size-14 rounded-full border border-border/70 bg-background/80 text-primary shadow-sm [&_svg:not([class*='size-'])]:size-5"
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
          <EmptyContent className="w-full max-w-none">
            <ol className="grid w-full gap-3 lg:grid-cols-3">
              {steps.map((step) => (
                <li key={step.label}>
                  <Card
                    className={cn(
                      "rounded-lg text-card-foreground",
                      STEP_TONE_CLASS[step.tone ?? "pending"],
                    )}
                  >
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        {step.label}
                      </p>
                      <h3 className="mt-2 text-base font-semibold">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-base text-muted-foreground">
                        {step.description}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  );
}
