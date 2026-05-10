"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

type RadioGroupDensity = "compact" | "default" | "touch";

const radioGroupDensityClasses: Record<RadioGroupDensity, string> = {
  compact: "gap-2",
  default: "gap-3",
  touch: "gap-3.5",
};

const radioGroupItemDensityClasses: Record<RadioGroupDensity, string> = {
  compact: "size-3.5 after:-inset-x-2 after:-inset-y-1.5",
  default: "size-4 after:-inset-x-3 after:-inset-y-2",
  touch: "size-5 after:-inset-x-3 after:-inset-y-3",
};

const radioGroupIndicatorDensityClasses: Record<RadioGroupDensity, string> = {
  compact: "size-3.5 [&>span]:size-1.5",
  default: "size-4 [&>span]:size-2",
  touch: "size-5 [&>span]:size-2.5",
};

const RadioGroupDensityContext =
  React.createContext<RadioGroupDensity>("default");

function RadioGroup({
  className,
  density = "default",
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root> & {
  density?: RadioGroupDensity;
}) {
  return (
    <RadioGroupDensityContext.Provider value={density}>
      <RadioGroupPrimitive.Root
        data-slot="radio-group"
        data-density={density}
        className={cn(
          "grid w-full",
          radioGroupDensityClasses[density],
          className,
        )}
        {...props}
      />
    </RadioGroupDensityContext.Provider>
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const density = React.useContext(RadioGroupDensityContext);

  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      data-density={density}
      className={cn(
        "group/radio-group-item peer relative flex aspect-square shrink-0 rounded-full border border-input outline-none after:absolute focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        radioGroupItemDensityClasses[density],
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className={cn(
          "flex items-center justify-center",
          radioGroupIndicatorDensityClasses[density],
        )}
      >
        <span className="absolute top-1/2 left-1/2 rounded-full bg-primary-foreground -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
export type { RadioGroupDensity };
