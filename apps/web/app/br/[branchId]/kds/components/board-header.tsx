"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { BrandMark } from "@/components/brand";
import { EmployeePortalBackControl } from "../../employee-portal-back-control";
import { messages } from "@lib/messages";
import { ViewModeToggle } from "./view-mode-toggle";
import type { KdsViewMode } from "../hooks/use-kds-view-mode";

interface BoardHeaderProps {
  branchId: number;
  pendingCount: number;
  mode: KdsViewMode;
  onModeChange: (next: KdsViewMode) => void;
}

export function BoardHeader({
  branchId,
  pendingCount,
  mode,
  onModeChange,
}: BoardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-3 py-2 md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <EmployeePortalBackControl
          size="touch"
          className="rounded-full px-2 text-xs"
        />
        <BrandMark decorative size="xs" className="hidden sm:block" />
        <span className="font-heading shrink-0 text-xs font-semibold uppercase text-muted-foreground">
          KDS #{branchId}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          variant={pendingCount > 0 ? "warning" : "outline"}
          className="rounded-full px-3 py-1 text-xs"
        >
          {pendingCount > 0 ? (
            <>
              <span className="sm:hidden">
                {messages.pos.kds.pendingCountCompact(pendingCount)}
              </span>
              <span className="hidden sm:inline">
                {messages.pos.kds.pendingCount(pendingCount)}
              </span>
            </>
          ) : (
            <>
              <span className="sm:hidden">
                {messages.pos.kds.emptyPendingCompact}
              </span>
              <span className="hidden sm:inline">
                {messages.pos.kds.emptyPending}
              </span>
            </>
          )}
        </Badge>
        <ViewModeToggle mode={mode} onChange={onModeChange} />
      </div>
    </div>
  );
}
