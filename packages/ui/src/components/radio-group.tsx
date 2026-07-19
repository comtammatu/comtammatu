"use client";

import * as React from "react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import {
  RadioGroup as RadioGroupPrimitive,
  type RadioGroupProps,
} from "@base-ui/react/radio-group";

import { cn } from "../lib/utils";

function RadioGroup({ className, ...props }: RadioGroupProps<string>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof RadioPrimitive.Root> & {
  size?: "default" | "touch";
}) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      data-size={size}
      className={cn(
        "group/radio-group-item peer relative flex aspect-square shrink-0 rounded-full border border-input outline-none data-[size=default]:size-4 data-[size=touch]:size-5 after:absolute data-[size=default]:after:-inset-x-3 data-[size=default]:after:-inset-y-2 data-[size=touch]:after:-inset-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center group-data-[size=touch]/radio-group-item:size-5"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground group-data-[size=touch]/radio-group-item:size-2.5" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
