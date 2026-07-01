"use client";

import * as React from "react";

import { cn } from "../lib/utils";

type SliderProps = Omit<React.ComponentProps<"input">, "type" | "value"> & {
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
  onChange,
  onValueChange,
  className,
  ...props
}: SliderProps) {
  const generatedId = React.useId();
  const descriptionId = React.useId();
  const inputId = id ?? generatedId;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    Number(defaultValue ?? min),
  );
  const currentValue = Number(value ?? uncontrolledValue);
  const displayValue = formatValue?.(currentValue) ?? currentValue;
  const describedBy =
    [props["aria-describedby"], description ? descriptionId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div data-slot="slider" className={cn("flex flex-col gap-1.5", className)}>
      {label || showValue ? (
        <div className="flex items-center justify-between gap-3">
          {label ? (
            <label htmlFor={inputId} className="text-xs font-medium">
              {label}
            </label>
          ) : (
            <span />
          )}
          {showValue ? (
            <output
              htmlFor={inputId}
              className="font-mono text-xs tabular-nums text-muted-foreground"
            >
              {displayValue}
            </output>
          ) : null}
        </div>
      ) : null}
      <input
        {...props}
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        aria-valuetext={String(displayValue)}
        aria-describedby={describedBy}
        className="h-7 w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (value == null) setUncontrolledValue(next);
          onValueChange?.(next);
          onChange?.(event);
        }}
      />
      {description ? (
        <span id={descriptionId} className="text-2xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </div>
  );
}

export { Slider };
