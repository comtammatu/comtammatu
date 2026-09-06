import * as React from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils";

export interface FormGridProps extends ComponentProps<"div"> {
  columns?: 1 | 2 | 3 | 4;
  density?: "compact" | "default";
  children: ReactNode;
}

export function FormGrid({
  columns = 2,
  density = "compact",
  className,
  children,
  ...props
}: FormGridProps) {
  return (
    <div
      data-slot="form-grid"
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

export interface FormRowProps extends ComponentProps<"div"> {
  colSpan?: "full" | 1 | 2 | 3;
  children: ReactNode;
}

export function FormRow({
  colSpan = "full",
  className,
  children,
  ...props
}: FormRowProps) {
  return (
    <div
      data-slot="form-row"
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

export interface FormSectionProps
  extends Omit<ComponentProps<"div">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export function FormSection({
  title,
  description,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <div
      data-slot="form-section"
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

export const AppFormGrid = FormGrid;
export const AppFormRow = FormRow;
export const AppFormSection = FormSection;

export type AppFormGridProps = FormGridProps;
export type AppFormRowProps = FormRowProps;
export type AppFormSectionProps = FormSectionProps;
