"use client";

import type { ComponentProps, ReactNode } from "react";
import { ERRORS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { cn } from "../lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/empty";
export type BrandSymbolVariant = "crest" | "primary" | "secondary" | "subtle";

export type AppEmptyStateMode =
  | "no-data"
  | "no-results"
  | "no-access"
  | "error";

const EMPTY_STATE_COPY: Record<AppEmptyStateMode, string> = {
  "no-data": STATES_VI.empty,
  "no-results": STATES_VI.noResults,
  "no-access": STATES_VI.noAccess,
  error: ERRORS_VI.loadFailed,
};

type AppEmptyRootProps = Omit<
  ComponentProps<typeof Empty>,
  "children" | "className" | "title"
>;

export type AppEmptyStateProps = AppEmptyRootProps & {
  title?: string;
  mode?: AppEmptyStateMode;
  description?: string;
  icon?: ReactNode;
  iconClassName?: string;
  /**
   * Decorative Má Tư brand symbol rendered in place of `icon`. Static
   * only — no mascot, no motion (design-system.md § brand rules).
   */
  symbol?: BrandSymbolVariant | ReactNode;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  compact?: boolean;
  align?: "center" | "start";
};

export function AppEmptyState({
  title,
  mode = "no-data",
  description,
  icon,
  iconClassName,
  symbol,
  children,
  className,
  titleClassName,
  descriptionClassName,
  compact = false,
  align = "center",
  ...props
}: AppEmptyStateProps) {
  return (
    <Empty
      className={cn(
        "border bg-card",
        compact ? "py-6" : "py-12",
        align === "start" && "items-start text-left",
        className,
      )}
      {...props}
    >
      {symbol ? (<EmptyMedia variant="default" className={iconClassName}>{typeof symbol === "string" ? null : symbol}</EmptyMedia>) : icon ? (
        <EmptyMedia variant="icon" className={iconClassName}>
          {icon}
        </EmptyMedia>
      ) : null}
      <EmptyHeader className={cn(align === "start" && "items-start text-left")}>
        <EmptyTitle className={titleClassName}>
          {title ?? EMPTY_STATE_COPY[mode]}
        </EmptyTitle>
        {description ? (
          <EmptyDescription
            className={cn(
              "max-w-md",
              align === "start" && "text-left",
              descriptionClassName,
            )}
          >
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {children ? (
        <EmptyContent
          className={cn(
            "flex-row flex-wrap justify-center",
            align === "start" && "justify-start",
          )}
        >
          {children}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export const EmptyState = AppEmptyState;
export type EmptyStateProps = AppEmptyStateProps;
