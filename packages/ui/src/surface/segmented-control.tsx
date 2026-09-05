"use client";

import type { ComponentType, ElementType, ReactNode } from "react";
import { cn } from "../lib/utils";
import { Button } from "../components/button";
import { Frame } from "../components/frame";

export interface AppSegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  count?: number;
  href?: string;
  disabled?: boolean;
}

export interface AppSegmentedControlProps<T extends string = string> {
  value: T;
  options: Array<AppSegmentedOption<T>>;
  onChange?: (value: T) => void;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
  linkComponent?: ElementType<{ href: string; children?: ReactNode; className?: string }>;
}

export function AppSegmentedControl<T extends string = string>({
  value,
  options,
  onChange,
  size = "sm",
  className,
  "aria-label": ariaLabel,
  linkComponent: Link = "a",
}: AppSegmentedControlProps<T>) {
  return (
    <Frame
      data-slot="app-segmented-control"
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center bg-muted/30 p-0.5", className)}
    >
      {options.map((option) => {
        const active = value === option.value;
        const Icon = option.icon;

        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size={size === "default" ? "default" : "xs"}
            disabled={option.disabled}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-2.5 text-xs transition-colors",
              size === "sm" ? "h-7" : "h-8",
              active && "bg-background font-medium text-foreground shadow-2xs",
            )}
            onClick={
              !option.href && onChange ? () => onChange(option.value) : undefined
            }
            render={option.href ? <Link href={option.href} /> : undefined}
          >
            {Icon ? <Icon className="mr-1.5 size-3.5 shrink-0" /> : null}
            <span>{option.label}</span>
            {option.count != null ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-2xs font-mono",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "bg-muted/30 text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </Frame>
  );
}

export const SegmentedControl = AppSegmentedControl;
export type SegmentedControlProps<T extends string = string> = AppSegmentedControlProps<T>;
export type SegmentedOption<T extends string = string> = AppSegmentedOption<T>;
