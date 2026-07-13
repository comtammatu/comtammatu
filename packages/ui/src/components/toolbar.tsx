import * as React from "react";

import { cn } from "../lib/utils";

function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

function ToolbarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      {...props}
    />
  );
}

function ToolbarSpacer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-spacer"
      className={cn("min-w-2 flex-1", className)}
      {...props}
    />
  );
}

export { Toolbar, ToolbarGroup, ToolbarSpacer };
