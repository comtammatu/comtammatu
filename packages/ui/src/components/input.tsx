import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const inputVariants = cva(
  "w-full min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:ring-destructive/20",
  {
    variants: {
      size: {
        default: "h-7",
        field: "h-10",
        touch: "min-h-12 text-base md:text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type InputControlSize = "default" | "field" | "touch";

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {
  controlSize?: InputControlSize;
}

function Input({
  className,
  type,
  size,
  controlSize,
  ...props
}: InputProps) {
  const resolvedControlSize = controlSize ?? size ?? "default";

  return (
    <input
      type={type}
      data-slot="input"
      data-control-size={resolvedControlSize}
      className={cn(inputVariants({ size: resolvedControlSize }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
