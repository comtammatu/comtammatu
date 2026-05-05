"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { BrandMark } from "@/components/brand";
import { EmployeePortalBackControl } from "../../employee-portal-back-control";
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
        <EmployeePortalBackControl className="h-7 rounded-full px-1.5 text-xs" />
        <BrandMark decorative size="xs" />
        <span className="font-heading text-xs font-semibold uppercase text-muted-foreground">
          KDS #{branchId}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          variant={pendingCount > 0 ? "warning" : "outline"}
          className="rounded-full px-3 py-1 text-xs"
        >
          {pendingCount > 0
            ? `${pendingCount} món cần nhận`
            : "Không có món chờ"}
        </Badge>
        <ViewModeToggle mode={mode} onChange={onModeChange} />
      </div>
    </div>
  );
}
