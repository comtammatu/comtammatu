"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@comtammatu/ui";

const interactiveCardVariants = cva(
  "flex items-center gap-3 rounded-md border bg-card text-card-foreground outline-none transition-[transform,box-shadow,background-color] hover:bg-accent/40 hover:shadow-effect-card-hover focus-visible:ring-[3px] focus-visible:ring-foreground active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      minHeight: {
        default: "",
        mobile: "min-h-18",
        tap: "min-h-16",
      },
      padding: {
        default: "px-4 py-3",
        compact: "px-3 py-2",
        none: "",
      },
    },
    defaultVariants: {
      minHeight: "default",
      padding: "default",
    },
  },
);

type InteractiveCardProps = React.ComponentProps<"div"> &
  VariantProps<typeof interactiveCardVariants> & {
    asChild?: boolean;
  };

export function InteractiveCard({
  className,
  asChild = false,
  minHeight,
  padding,
  ...props
}: InteractiveCardProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="interactive-card"
      className={cn(interactiveCardVariants({ minHeight, padding }), className)}
      {...props}
    />
  );
}

export type { InteractiveCardProps };
