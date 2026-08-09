"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "../lib/utils";

type SliderProps = Omit<
  SliderPrimitive.Root.Props<number>,
  "children" | "defaultValue" | "onValueChange" | "render" | "value"
> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  value?: number;
  defaultValue?: number;
  showValue?: boolean;
  formatValue?: (value: number) => React.ReactNode;
  onValueChange?: (value: number) => void;
};

function Slider({
  id,
  label,
  description,
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  showValue = true,
  formatValue,
  onValueChange,
  className,
  ...props
}: SliderProps) {
  const descriptionId = React.useId();
  const describedBy =
    [props["aria-describedby"], description ? descriptionId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <SliderPrimitive.Root
      id={id}
      data-slot="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      defaultValue={defaultValue ?? min}
      onValueChange={(next) => onValueChange?.(next)}
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      {label || showValue ? (
        <div className="flex items-center justify-between gap-3">
          {label ? (
            <SliderPrimitive.Label className="text-xs font-medium">
              {label}
            </SliderPrimitive.Label>
          ) : (
            <span />
          )}
          {showValue ? (
            <SliderPrimitive.Value className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatValue
                ? (_, values) => formatValue(values[0] ?? min)
                : null}
            </SliderPrimitive.Value>
          ) : null}
        </div>
      ) : null}
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex h-7 w-full touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-50"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="h-1.5 w-full rounded-md bg-muted select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="rounded-md bg-primary select-none"
          />
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            aria-describedby={describedBy}
            getAriaValueText={
              formatValue
                ? (formattedValue, thumbValue) => {
                    // formatValue may return arbitrary JSX; aria-valuetext only
                    // accepts text, so fall back when it is not stringable.
                    const formatted = formatValue(thumbValue);
                    return typeof formatted === "string" ||
                      typeof formatted === "number"
                      ? String(formatted)
                      : formattedValue;
                  }
                : undefined
            }
            className="size-4 rounded-md border border-primary bg-background select-none has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/20"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
      {description ? (
        <span id={descriptionId} className="text-2xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </SliderPrimitive.Root>
  );
}

export { Slider };
