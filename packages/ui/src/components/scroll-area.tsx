"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

type ScrollAreaScrollbarMode = "vertical" | "horizontal" | "both";
type ScrollAreaScrollbarSize = "sm" | "default" | "touch";

const scrollBarSizeClasses: Record<ScrollAreaScrollbarSize, string> = {
  sm: "data-horizontal:h-2 data-vertical:w-2",
  default: "data-horizontal:h-2.5 data-vertical:w-2.5",
  touch: "data-horizontal:h-3 data-vertical:w-3",
};

function ScrollArea({
  className,
  children,
  scrollbar = "vertical",
  scrollbarSize = "default",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  scrollbar?: ScrollAreaScrollbarMode;
  scrollbarSize?: ScrollAreaScrollbarSize;
}) {
  const showVertical = scrollbar === "vertical" || scrollbar === "both";
  const showHorizontal = scrollbar === "horizontal" || scrollbar === "both";

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      data-scrollbar={scrollbar}
      data-scrollbar-size={scrollbarSize}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        // Override radix's inner `display:table` to `block` so children's
        // `min-w-0`/`truncate` chain works for operational dense rows.
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-1 [&>div]:block! [&>div]:min-w-0!"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {showVertical ? (
        <ScrollBar orientation="vertical" size={scrollbarSize} />
      ) : null}
      {showHorizontal ? (
        <ScrollBar orientation="horizontal" size={scrollbarSize} />
      ) : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  size = "default",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar> & {
  size?: ScrollAreaScrollbarSize;
}) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      data-size={size}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:border-l data-vertical:border-l-transparent",
        scrollBarSizeClasses[size],
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
export type { ScrollAreaScrollbarMode, ScrollAreaScrollbarSize };
