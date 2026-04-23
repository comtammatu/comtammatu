"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { IconClock, IconLogout, IconDeviceDesktop } from "@tabler/icons-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { formatTime } from "./pos-menu-types";
import { PrinterStatusBadge } from "./printer-status-badge";
import type { ActiveSession } from "./page";
import type { OrderType } from "./types";

interface PosSessionHeaderProps {
  session: ActiveSession;
  branchId: number;
  orderType: OrderType;
  selectedTableNumber: number | undefined;
  activeOrderCount: number;
  onShowCloseSession: () => void;
}

export function PosSessionHeader({
  session,
  branchId,
  orderType,
  selectedTableNumber,
  activeOrderCount,
  onShowCloseSession,
}: PosSessionHeaderProps) {
  const contextLabel =
    orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chọn bàn";

  return (
    <div className="border-b border-border/60 px-3 py-2 md:px-4">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <EmployeePortalBackControl />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
              <IconDeviceDesktop className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">
                {session.pos_terminals?.name ?? "POS"}
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <IconClock className="size-3.5 shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">Ca mở lúc </span>
                {formatTime(session.opened_at)}
              </span>
            </span>
          </div>
        </div>

        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <Badge variant="outline" className="max-w-36 truncate">
            {contextLabel}
          </Badge>
          <Badge variant="outline">{activeOrderCount} đơn đang phục vụ</Badge>
          <PrinterStatusBadge branchId={branchId} />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 min-w-11 h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:text-destructive"
          onClick={onShowCloseSession}
        >
          <IconLogout className="size-3.5" />
          Đóng ca
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-2 sm:hidden">
        <Badge variant="outline" className="min-w-0 truncate">
          {contextLabel}
        </Badge>
        <Badge variant="outline">{activeOrderCount} đơn</Badge>
      </div>
    </div>
  );
}
