import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const noteCalloutVariants = cva("flex items-start gap-2 rounded-md px-3 py-2", {
  variants: {
    tone: {
      warning: "bg-warning/15 text-warning",
      muted: "border bg-muted/30 text-foreground",
    },
  },
  defaultVariants: {
    tone: "muted",
  },
});

type NoteCalloutProps = React.ComponentProps<"div"> &
  VariantProps<typeof noteCalloutVariants> & {
    icon?: React.ReactNode;
    label?: React.ReactNode;
  };

function NoteCallout({
  className,
  tone = "muted",
  icon,
  label,
  children,
  ...props
}: NoteCalloutProps) {
  return (
    <div
      data-slot="note-callout"
      data-tone={tone}
      className={cn(noteCalloutVariants({ tone, className }))}
      {...props}
    >
      {icon ? (
        <span
          data-slot="note-callout-icon"
          aria-hidden
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center",
            tone === "warning" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div data-slot="note-callout-content" className="min-w-0 flex-1">
        {label ? (
          <div
            data-slot="note-callout-label"
            className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              tone === "warning" ? "text-warning" : "text-muted-foreground",
            )}
          >
            {label}
          </div>
        ) : null}
        <div
          data-slot="note-callout-body"
          className={cn(
            "break-words text-sm",
            tone === "warning" ? "font-semibold" : "",
            label ? "mt-0.5" : "",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export { NoteCallout, noteCalloutVariants };
export type { NoteCalloutProps };
