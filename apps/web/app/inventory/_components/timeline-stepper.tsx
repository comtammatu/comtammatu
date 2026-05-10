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

export function TimelineStepper({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div
      className="grid w-full items-start"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, index) => {
        const nextStep = steps[index + 1];
        const connectorActive = Boolean(
          nextStep?.completed || nextStep?.active,
        );

        return (
          <div key={`${step.label}-${index}`} className="relative min-w-0">
            {index < steps.length - 1 ? (
              <div
                className={cn(
                  // eslint-disable-next-line no-restricted-syntax -- ds-allow: right-[-50%] bridges adjacent grid columns to draw a continuous connector line between stepper nodes; not expressible with positive offsets
                  "absolute left-1/2 right-[-50%] top-5 z-0 h-1 -translate-y-1/2 rounded-full",
                  connectorActive ? "bg-success" : "bg-muted",
                )}
              />
            ) : null}
            <div className="relative z-10 flex min-w-0 flex-col items-center">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-full text-xs font-bold shadow-sm transition-colors",
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
                  "mt-1.5 w-full max-w-24 break-words px-1 text-center text-xs font-medium leading-4 text-muted-foreground sm:max-w-28",
                  (step.active || step.completed) &&
                    "font-bold text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.date ? (
                <p className="text-xs text-muted-foreground">{step.date}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
