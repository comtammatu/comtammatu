"use client";

import Link from "next/link";
import { ChevronRight as IconChevronRight } from "lucide-react";
import { cn } from "@comtammatu/ui";

export type InventoryStatChipTone =
  | "default"
  | "warning"
  | "destructive"
  | "muted";

interface BaseProps {
  label: string;
  value: string;
  tone?: InventoryStatChipTone;
}

export type InventoryStatChipProps =
  | ({ kind: "info" } & BaseProps)
  | ({
      kind: "filter";
      active: boolean;
      onToggle: () => void;
      disabled?: boolean;
    } & BaseProps)
  | ({
      kind: "link";
      href: string;
      disabled?: boolean;
    } & BaseProps);

const TONE_VALUE_CLASS: Record<InventoryStatChipTone, string> = {
  default: "",
  muted: "text-muted-foreground",
  warning: "text-warning",
  destructive: "text-destructive",
};

const BASE_CLASS =
  "flex min-w-fit items-center gap-2 px-3 py-2 transition-colors";

function valueClass(tone: InventoryStatChipTone | undefined): string {
  return cn(
    "text-sm font-semibold tabular-nums",
    TONE_VALUE_CLASS[tone ?? "default"],
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled chip kind: ${JSON.stringify(value)}`);
}

/**
 * Single stat chip shared by `/inventory/stock` summary strip and
 * `/inventory` Today's Playbook KPI strip. Replaces the legacy
 * `SummaryMetric` and `KpiMetric` components which had near-identical
 * markup. Three render modes are exhaustively typed via discriminated
 * `kind` so a missing handler trips TS at compile time.
 */
export function InventoryStatChip(props: InventoryStatChipProps) {
  switch (props.kind) {
    case "info":
      return (
        <div className={BASE_CLASS}>
          <span className="text-xs text-muted-foreground">{props.label}</span>
          <span className={valueClass(props.tone)}>{props.value}</span>
        </div>
      );

    case "filter": {
      if (props.disabled) {
        return (
          <div
            className={cn(BASE_CLASS, "cursor-not-allowed opacity-50")}
            aria-disabled
          >
            <span className="text-xs text-muted-foreground">{props.label}</span>
            <span className={valueClass(props.tone)}>{props.value}</span>
          </div>
        );
      }
      return (
        <button
          type="button"
          onClick={props.onToggle}
          aria-pressed={props.active}
          aria-label={`${props.label}: ${props.value}`}
          className={cn(
            BASE_CLASS,
            "relative cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            props.active && "z-10 bg-primary/10 ring-2 ring-primary",
          )}
        >
          <span className="text-xs text-muted-foreground">{props.label}</span>
          <span className={valueClass(props.tone)}>{props.value}</span>
        </button>
      );
    }

    case "link": {
      // count=0 (or otherwise disabled) — render as plain info to avoid
      // navigating the user into an empty list.
      if (props.disabled) {
        return (
          <div
            className={cn(BASE_CLASS, "cursor-not-allowed opacity-50")}
            aria-disabled
          >
            <span className="text-xs text-muted-foreground">{props.label}</span>
            <span className={valueClass(props.tone)}>{props.value}</span>
          </div>
        );
      }
      return (
        <Link
          href={props.href}
          prefetch={false}
          aria-label={`${props.label}: ${props.value}`}
          className={cn(
            BASE_CLASS,
            "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="text-xs text-muted-foreground">{props.label}</span>
          <span className={valueClass(props.tone)}>{props.value}</span>
          <IconChevronRight className="size-3 text-muted-foreground/60" />
        </Link>
      );
    }

    default:
      return assertNever(props);
  }
}
