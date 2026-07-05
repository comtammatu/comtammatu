"use client";

import * as React from "react";
import { Slot } from "@comtammatu/ui/components/slot";
import { cn } from "@comtammatu/ui";

const INTERACTIVE_CARD_BASE_CLASSNAME =
  "flex items-center gap-3 rounded-md border bg-card text-card-foreground outline-none transition-[transform,box-shadow,background-color] hover:bg-accent/40 hover:shadow-effect-card-hover focus-visible:ring-[3px] focus-visible:ring-foreground active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50";

const MIN_HEIGHT_CLASSNAME = {
  default: "",
  mobile: "min-h-18",
  tap: "min-h-16",
} as const;

const PADDING_CLASSNAME = {
  default: "px-4 py-3",
  compact: "px-3 py-2",
  none: "",
} as const;

type InteractiveCardProps = React.ComponentProps<"div"> &
  {
    asChild?: boolean;
    minHeight?: keyof typeof MIN_HEIGHT_CLASSNAME;
    padding?: keyof typeof PADDING_CLASSNAME;
  };

export function InteractiveCard({
  className,
  asChild = false,
  minHeight,
  padding,
  ...props
}: InteractiveCardProps) {
  const Comp = asChild ? Slot : "div";
  const resolvedMinHeight = minHeight ?? "default";
  const resolvedPadding = padding ?? "default";
  return (
    <Comp
      data-slot="interactive-card"
      className={cn(
        INTERACTIVE_CARD_BASE_CLASSNAME,
        MIN_HEIGHT_CLASSNAME[resolvedMinHeight],
        PADDING_CLASSNAME[resolvedPadding],
        className,
      )}
      {...props}
    />
  );
}

export type { InteractiveCardProps };
