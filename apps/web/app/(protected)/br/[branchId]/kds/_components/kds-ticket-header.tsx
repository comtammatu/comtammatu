"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { StatusBadge } from "@/components/status-badge";
import { getAgeStyle, getElapsedMinutes } from "../_lib/age-style";
import { AgeBadge } from "./age-badge";
import { OrderNote } from "./order-note";
import { OrderTitleLine } from "./order-title-line";

const PRIORITY_LABEL = "Ưu tiên";

type KdsTicketHeaderDensity = "compact" | "default";

const DENSITY_CLASS: Record<
  KdsTicketHeaderDensity,
  {
    shell: string;
    identity: string;
    cluster: string;
    priority: string;
    status: string;
  }
> = {
  compact: {
    shell:
      "flex min-w-0 flex-col gap-1.5 px-2 py-2 xl:flex-row xl:items-start xl:justify-between xl:gap-2 xl:px-3 xl:py-2.5",
    identity: "min-w-0 xl:flex-1",
    cluster:
      "flex w-full flex-wrap items-center justify-start gap-1 xl:w-auto xl:shrink-0 xl:justify-end",
    priority: "px-2 py-0.5 text-xs xl:px-2.5 xl:py-1 xl:text-sm",
    status: "px-2 py-0.5 text-xs xl:px-2.5 xl:py-1 xl:text-sm",
  },
  default: {
    shell: "flex items-start justify-between gap-3 px-4 py-3",
    identity: "flex min-w-0 flex-1 flex-col gap-2",
    cluster: "flex shrink-0 flex-col items-end gap-1.5",
    priority: "px-2 py-1 text-sm font-semibold",
    status: "px-2 py-1 text-sm font-semibold",
  },
};

interface KdsTicketHeaderProps {
  kitchenTicketNumber: string;
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  orderNote: string | null;
  isPriority: boolean;
  elapsedMs: number;
  isComplete: boolean;
  status: string;
  showStatusBadge: boolean;
  density?: KdsTicketHeaderDensity;
  actions?: ReactNode;
}

export function KdsTicketHeader({
  kitchenTicketNumber,
  orderNumber,
  orderType,
  tableNumber,
  orderNote,
  isPriority,
  elapsedMs,
  isComplete,
  status,
  showStatusBadge,
  density = "default",
  actions,
}: KdsTicketHeaderProps) {
  const densityClass = DENSITY_CLASS[density];
  const elapsedMinutes = getElapsedMinutes(elapsedMs);
  const headerBg = getAgeStyle(elapsedMinutes, isComplete).bg;
  const titleSize = density === "compact" ? "compact" : "default";
  const ageSize = density === "compact" ? "compact" : "lg";

  return (
    <div className={cn("border-b", headerBg, densityClass.shell)}>
      <div className={densityClass.identity}>
        {density === "compact" ? (
          <>
            <OrderTitleLine
              kitchenTicketNumber={kitchenTicketNumber}
              orderNumber={orderNumber}
              orderType={orderType}
              tableNumber={tableNumber}
              size={titleSize}
            />
            {isPriority ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="warning" className={densityClass.priority}>
                  {PRIORITY_LABEL}
                </Badge>
              </div>
            ) : null}
            <OrderNote
              note={orderNote}
              compact
              className="mt-1.5 max-w-full xl:mt-2"
            />
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <OrderTitleLine
                kitchenTicketNumber={kitchenTicketNumber}
                orderNumber={orderNumber}
                orderType={orderType}
                tableNumber={tableNumber}
                size={titleSize}
              />
              {isPriority ? (
                <Badge variant="warning" className={densityClass.priority}>
                  {PRIORITY_LABEL}
                </Badge>
              ) : null}
            </div>
            <OrderNote note={orderNote} className="max-w-full" />
          </>
        )}
      </div>
      <div className={densityClass.cluster}>
        {actions}
        {showStatusBadge ? (
          <StatusBadge
            domain="order"
            value={status}
            className={densityClass.status}
          />
        ) : null}
        <AgeBadge
          elapsedMs={elapsedMs}
          isComplete={isComplete}
          size={ageSize}
        />
      </div>
    </div>
  );
}
