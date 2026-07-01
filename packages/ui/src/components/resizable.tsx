"use client";

import * as React from "react";

import { cn } from "../lib/utils";

type ResizableProps = Omit<React.ComponentProps<"div">, "children"> & {
  first: React.ReactNode;
  second: React.ReactNode;
  direction?: "horizontal" | "vertical";
  defaultSize?: number;
  min?: number;
  max?: number;
  label?: string;
  onSizeChange?: (size: number) => void;
};

function Resizable({
  first,
  second,
  direction = "horizontal",
  defaultSize = 50,
  min = 20,
  max = 80,
  label = "Điều chỉnh kích thước",
  onSizeChange,
  className,
  style,
  ...props
}: ResizableProps) {
  const [size, setSize] = React.useState(defaultSize);
  const safeSize = Math.min(Math.max(Number(size) || defaultSize, min), max);
  const template =
    direction === "vertical"
      ? { gridTemplateRows: `${safeSize}% 0.75rem minmax(0,1fr)` }
      : { gridTemplateColumns: `${safeSize}% 0.75rem minmax(0,1fr)` };

  return (
    <div
      data-slot="resizable"
      data-orientation={direction}
      className={cn("grid min-h-0 min-w-0", className)}
      style={{ ...template, ...style }}
      {...props}
    >
      <div className="min-h-0 min-w-0 overflow-auto">{first}</div>
      <input
        type="range"
        min={min}
        max={max}
        value={safeSize}
        aria-label={label}
        aria-orientation={direction === "vertical" ? "vertical" : undefined}
        aria-valuetext={`${safeSize}%`}
        className={cn(
          "self-center accent-primary",
          direction === "vertical" ? "h-3 w-full" : "h-full w-3 rotate-90",
        )}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          setSize(next);
          onSizeChange?.(next);
        }}
      />
      <div className="min-h-0 min-w-0 overflow-auto">{second}</div>
    </div>
  );
}

export { Resizable };
