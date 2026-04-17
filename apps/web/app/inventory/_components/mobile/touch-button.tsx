"use client";

import * as React from "react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";

type ButtonProps = React.ComponentProps<typeof Button>;

type TouchButtonProps = Omit<ButtonProps, "size"> & {
  fullWidth?: boolean;
};

export const TouchButton = React.forwardRef<
  HTMLButtonElement,
  TouchButtonProps
>(function TouchButton(
  { className, fullWidth = true, ...props },
  ref,
) {
  return (
    <Button
      ref={ref as unknown as React.Ref<HTMLButtonElement>}
      size="lg"
      className={cn(
        "h-auto min-h-14 px-4 text-base leading-6 font-semibold [&_svg:not([class*='size-'])]:size-5",
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
});

TouchButton.displayName = "TouchButton";
