"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@comtammatu/ui";

export interface AppFormGridProps extends ComponentProps<"div"> {
  columns?: 1 | 2 | 3 | 4;
  density?: "compact" | "default";
  children: ReactNode;
}

export function AppFormGrid({
  columns = 2,
  density = "compact",
  className,
  children,
  ...props
}: AppFormGridProps) {
  return (
    <div
      data-slot="app-form-grid"
      className={cn(
        "grid grid-cols-1",
        density === "compact" ? "gap-3" : "gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface AppFormRowProps extends ComponentProps<"div"> {
  colSpan?: "full" | 1 | 2 | 3;
  children: ReactNode;
}

export function AppFormRow({
  colSpan = "full",
  className,
  children,
  ...props
}: AppFormRowProps) {
  return (
    <div
      data-slot="app-form-row"
      className={cn(
        colSpan === "full" && "col-span-full",
        colSpan === 1 && "col-span-1",
        colSpan === 2 && "sm:col-span-2",
        colSpan === 3 && "sm:col-span-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface AppFormSectionProps
  extends Omit<ComponentProps<"div">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export function AppFormSection({
  title,
  description,
  className,
  children,
  ...props
}: AppFormSectionProps) {
  return (
    <div
      data-slot="app-form-section"
      className={cn("col-span-full flex flex-col gap-2 pt-2 first:pt-0", className)}
      {...props}
    >
      {title || description ? (
        <div className="flex flex-col gap-1">
          {title ? (
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
          ) : null}
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
