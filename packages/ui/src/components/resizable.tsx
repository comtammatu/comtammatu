"use client";

import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "../lib/utils";

type ResizableHandleSize = "sm" | "default" | "touch";

const resizableHandleSizeClasses: Record<ResizableHandleSize, string> = {
  sm: "after:w-1 aria-[orientation=horizontal]:after:h-1",
  default: "after:w-2 aria-[orientation=horizontal]:after:h-2",
  touch: "after:w-3 aria-[orientation=horizontal]:after:h-3",
};

const resizableHandleGripSizeClasses: Record<ResizableHandleSize, string> = {
  sm: "h-6 w-1",
  default: "h-8 w-1.5",
  touch: "h-10 w-2",
};

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 aria-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  size = "default",
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
  size?: ResizableHandleSize;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      data-size={size}
      className={cn(
        "group/resizable-handle relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        resizableHandleSizeClasses[size],
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div
          className={cn(
            "z-10 shrink-0 rounded-full bg-border group-aria-[orientation=horizontal]/resizable-handle:rotate-90",
            resizableHandleGripSizeClasses[size],
          )}
        />
      ) : null}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
export type { ResizableHandleSize };
