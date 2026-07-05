import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Layout-free inset surface: `rounded-md border bg-card` and nothing else.
 *
 * Control/inset radius tier (design-system.md § E Radius). Unlike `Card`
 * (`rounded-lg`, opinionated flex/gap/padding), `Frame` carries only chrome so
 * callers keep full control of layout and content flow. Use it as the
 * delegation target for a plain bordered box; use `Card` for a card-role
 * surface.
 */
function Frame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="frame"
      className={cn("rounded-md border bg-card", className)}
      {...props}
    />
  );
}

export { Frame };
