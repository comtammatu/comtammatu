"use client";

import { Check } from "lucide-react";
import { cn } from "@comtammatu/ui";

interface TimelineStep {
  label: string;
  date?: string;
  active?: boolean;
  completed?: boolean;
  icon?: string;
}

export function TimelineStepper({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center">
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
                <Check className="size-4" />
              ) : (
                (step.icon ?? String(index + 1))
              )}
            </div>
            <p
              className={cn(
                "mt-1.5 max-w-20 text-center text-xs font-medium text-muted-foreground",
                (step.active || step.completed) && "font-bold text-foreground",
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
