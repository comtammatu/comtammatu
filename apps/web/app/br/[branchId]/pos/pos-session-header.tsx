"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Clock, LogOut, Monitor } from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { formatTime } from "./pos-menu-types";
import type { ActiveSession } from "./page";
import type { OrderType } from "./types";

interface PosSessionHeaderProps {
  session: ActiveSession;
  orderType: OrderType;
  selectedTableNumber: number | undefined;
  isPending: boolean;
  canSubmit: boolean;
  cartQuantity: number;
  activeOrderCount: number;
  onShowCloseSession: () => void;
}

export function PosSessionHeader({
  session,
  orderType,
  selectedTableNumber,
  isPending,
  canSubmit,
  cartQuantity,
  activeOrderCount,
  onShowCloseSession,
}: PosSessionHeaderProps) {
  const contextLabel =
    orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chưa chọn bàn";

  const guidance = canSubmit
    ? "Giỏ đã sẵn sàng để gửi bếp."
    : orderType === "takeaway"
      ? "Thêm món để bắt đầu đơn mới."
      : selectedTableNumber != null
        ? "Thêm món vào giỏ để bắt đầu đơn mới."
        : "Chọn bàn trước khi tạo đơn tại chỗ.";

  return (
    <div className="border-b border-border/60 px-3 py-3 md:px-4">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <EmployeePortalBackControl />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Monitor className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  {session.pos_terminals?.name ?? "POS"}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Clock className="size-3.5 shrink-0" />
                <span className="truncate">
                  <span className="hidden sm:inline">Ca mở lúc </span>
                  {formatTime(session.opened_at)}
                </span>
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 h-9 shrink-0 gap-1.5 rounded-full px-4 text-xs text-muted-foreground hover:text-destructive"
            onClick={onShowCloseSession}
          >
            <LogOut className="size-3.5" />
            Đóng ca
          </Button>
        </div>

        <div className="rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Ca POS
              </p>
              <p className="text-sm font-medium text-foreground">{guidance}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {contextLabel}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {cartQuantity > 0 ? `${cartQuantity} món trong giỏ` : "Chưa có món"}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {activeOrderCount} đơn đang phục vụ
              </Badge>
              {isPending ? (
                <Badge variant="warning" className="rounded-full px-3 py-1">
                  Đang xử lý thay đổi đơn
                </Badge>
              ) : canSubmit ? (
                <Badge variant="success" className="rounded-full px-3 py-1">
                  Có thể gửi bếp
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
