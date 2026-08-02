"use client";

import { Check as IconCheck } from "lucide-react";
import { cn } from "@comtammatu/ui";

interface TimelineStep {
  label: string;
  date?: string;
  active?: boolean;
  completed?: boolean;
  icon?: string;
}

export function TimelineStepper({
  steps,
  orientation = "horizontal",
}: {
  steps: TimelineStep[];
  orientation?: "horizontal" | "vertical";
}) {
  if (orientation === "vertical") {
    return (
      <div className="flex flex-col w-full px-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-start gap-4 w-full">
            {/* Left side: status circle and vertical line */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-border/60 transition-colors",
                  step.completed
                    ? "bg-success text-white"
                    : step.active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {step.completed ? (
                  <IconCheck className="size-4" />
                ) : (
                  (step.icon ?? String(index + 1))
                )}
              </div>
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "w-1 h-10 my-1 rounded-full",
                    step.completed ? "bg-success" : "bg-muted",
                  )}
                />
              ) : (
                <div className="h-4" /> // Spacer for the last item's text height padding
              )}
            </div>
            {/* Right side: text details */}
            <div className="flex flex-col pt-2 pb-4 min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold text-muted-foreground leading-normal break-words",
                  (step.active || step.completed) && "font-semibold text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.date ? (
                <p className="text-xs text-muted-foreground mt-1 font-mono">{step.date}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-border/60 transition-colors",
                step.completed
                  ? "bg-success text-white"
                  : step.active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step.completed ? (
                <IconCheck className="size-4" />
              ) : (
                (step.icon ?? String(index + 1))
              )}
            </div>
            <p
              className={cn(
                "max-w-20 text-center text-xs font-medium text-muted-foreground",
                (step.active || step.completed) && "font-semibold text-foreground",
              )}
            >
              {step.label}
            </p>
            {step.date ? (
              <p className="text-xs text-muted-foreground">{step.date}</p>
            ) : null}
          </div>
          {index < steps.length - 1 ? (
            <div
              className={cn(
                "mx-2 h-1 w-12 rounded-full sm:w-20",
                step.completed ? "bg-success" : "bg-muted",
              )}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
