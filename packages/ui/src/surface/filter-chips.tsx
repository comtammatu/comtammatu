"use client";

import type { ComponentProps, ComponentType, ReactNode } from "react";
import { cn } from "../lib/utils";
import { Button } from "../components/button";

export interface AppFilterChipOption<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  countVariant?: "default" | "secondary" | "destructive" | "warning";
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export interface AppFilterChipsProps<T extends string = string> {
  value: T;
  options: Array<AppFilterChipOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function AppFilterChips<T extends string = string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: AppFilterChipsProps<T>) {
  return (
    <div
      data-slot="app-filter-chips"
      role="toolbar"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {options.map((option) => {
        const active = value === option.value;
        const Icon = option.icon;

        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "secondary" : "outline"}
            size="xs"
            disabled={option.disabled}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "border-border/40 text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon className="mr-1.5 size-3.5 shrink-0" /> : null}
            <span>{option.label}</span>
            {option.count != null ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-2xs font-mono font-semibold",
                  active
                    ? "bg-background/20 text-background"
                    : option.countVariant === "destructive"
                      ? "bg-destructive/15 text-destructive"
                      : option.countVariant === "warning"
                        ? "bg-warning/15 text-warning"
                        : "bg-muted/30 text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export function AppFilterChipsBar({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="app-filter-chips-bar"
      className={cn(
        "flex flex-wrap items-center gap-1.5 border-t border-border/20 bg-muted/30 px-3 py-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export const FilterChips = AppFilterChips;
export type FilterChipsProps = AppFilterChipsProps;
export const FilterChipsBar = AppFilterChipsBar;
