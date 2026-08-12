"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import {
  Progress,
  type ProgressTone,
} from "@comtammatu/ui/components/progress";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";

export type OperatorFlowStep = {
  label: string;
  hint?: string;
};

export function OperatorFlowSteps({
  title,
  steps,
  currentStep,
  description,
  tone = "default",
  className,
}: {
  title: string;
  steps: readonly OperatorFlowStep[];
  currentStep: number;
  description?: string;
  tone?: ProgressTone;
  className?: string;
}) {
  const total = Math.max(steps.length, 1);
  const active = Math.min(Math.max(currentStep, 1), total);
  const value = Math.round((active / total) * 100);
  const copy = messages.inventory.operatorFlow;
  const activeStep = steps[active - 1] ?? null;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md bg-muted/50 p-2.5 sm:gap-3 sm:p-3",
        className,
      )}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          {description ? (
            <p className="mt-0.5 hidden text-xs leading-snug text-muted-foreground sm:block">
              {description}
            </p>
          ) : null}
        </div>
        <Badge variant="outline" className="shrink-0">
          {copy.stepBadge(active, total)}
        </Badge>
      </div>

      <Progress value={value} tone={tone} className="h-2" />

      {activeStep ? (
        <p className="min-w-0 truncate text-sm font-medium leading-snug sm:hidden">
          {copy.current}: {activeStep.label}
        </p>
      ) : null}

      <ol className="hidden gap-2 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        {steps.map((step, index) => {
          const stepNo = index + 1;
          const isDone = stepNo < active;
          const isCurrent = stepNo === active;
          return (
            <li
              key={`${stepNo}-${step.label}`}
              className={cn(
                "flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5",
                isCurrent && "bg-background ring-1 ring-border",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                  isDone && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary",
                  !isDone &&
                    !isCurrent &&
                    "border-border text-muted-foreground",
                )}
              >
                {stepNo}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug">
                  {step.label}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {isDone ? copy.done : isCurrent ? copy.current : copy.next}
                  {step.hint ? ` · ${step.hint}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
