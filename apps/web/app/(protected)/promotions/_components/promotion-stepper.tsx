"use client";

import { Check as IconCheck } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";

export interface PromotionStepItem {
  id: number;
  label: string;
}

export const PROMOTION_FORM_STEPS: readonly PromotionStepItem[] = [
  { id: 1, label: PROMOTIONS_VI.stepIdentity },
  { id: 2, label: PROMOTIONS_VI.stepBenefit },
  { id: 3, label: PROMOTIONS_VI.stepSchedule },
  { id: 4, label: PROMOTIONS_VI.stepCodes },
] as const;

export function PromotionStepper({
  currentStep,
  onSelectStep,
  canNavigateToStep,
}: {
  currentStep: number;
  onSelectStep: (step: number) => void;
  canNavigateToStep?: (step: number) => boolean;
}) {
  const currentStepItem =
    PROMOTION_FORM_STEPS.find((s) => s.id === currentStep) ??
    PROMOTION_FORM_STEPS[0]!;

  return (
    <Frame className="flex flex-col gap-2 bg-muted/30 p-3 sm:p-4">
      {/* Mobile view: Compact progress info */}
      <div className="flex items-center justify-between sm:hidden">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            {currentStep}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {currentStepItem.label}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {currentStep} {PROMOTIONS_VI.stepOf} {PROMOTION_FORM_STEPS.length}
        </span>
      </div>

      {/* Desktop & Tablet view: Full horizontal stepper */}
      <nav aria-label="Promotion Form Steps" className="hidden sm:block">
        <ol className="flex items-center justify-between gap-2">
          {PROMOTION_FORM_STEPS.map((step, index) => {
            const isCompleted = step.id < currentStep;
            const isActive = step.id === currentStep;
            const isClickable =
              canNavigateToStep?.(step.id) ?? step.id <= currentStep;

            return (
              <li
                key={step.id}
                className="flex flex-1 items-center"
              >
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!isClickable}
                  onClick={() => onSelectStep(step.id)}
                  className={cn(
                    "group h-auto w-full justify-start gap-2 p-1.5 text-left font-normal text-foreground hover:bg-muted/50",
                    !isClickable && "cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ring-1 transition-colors",
                      isCompleted
                        ? "bg-primary text-primary-foreground ring-primary"
                        : isActive
                          ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                          : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    {isCompleted ? (
                      <IconCheck className="size-3.5 stroke-[2.5]" />
                    ) : (
                      step.id
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        "truncate text-xs font-medium",
                        isActive
                          ? "font-semibold text-foreground"
                          : isCompleted
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                </Button>

                {index < PROMOTION_FORM_STEPS.length - 1 ? (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "mx-2 h-0.5 w-6 shrink-0 lg:w-12",
                      step.id < currentStep ? "bg-primary" : "bg-border",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </Frame>
  );
}
