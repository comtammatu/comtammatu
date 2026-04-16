"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Clock, LogOut, Monitor } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { formatTime } from "./pos-menu-types";
import type { PosFlowStep } from "./pos-menu-types";
import type { ActiveSession } from "./page";
import type { OrderType } from "./types";

interface PosSessionHeaderProps {
  session: ActiveSession;
  orderType: OrderType;
  selectedTableNumber: number | undefined;
  flowHeadline: string;
  flowHint: string;
  flowSteps: readonly PosFlowStep[];
  flowProgressPercent: number;
  isPending: boolean;
  canSubmit: boolean;
  cartQuantity: number;
  cartTotal: number;
  activeOrderCount: number;
  readyOrderCount: number;
  completedOrderCount: number;
  sessionRevenue: number;
  onShowCloseSession: () => void;
}

export function PosSessionHeader({
  session,
  orderType,
  selectedTableNumber,
  flowHeadline,
  flowHint,
  flowSteps,
  flowProgressPercent,
  isPending,
  canSubmit,
  cartQuantity,
  activeOrderCount,
  readyOrderCount,
  completedOrderCount,
  sessionRevenue,
  onShowCloseSession,
}: PosSessionHeaderProps) {
  return (
    <div className="border-b border-border/60 px-3 py-3 md:px-4">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4">
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

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 md:p-5">
          <div className="relative space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Ca POS
                </p>
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                  {flowHeadline}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  {flowHint}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:min-w-88">
                <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ngữ cảnh hiện tại
                  </p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {orderType === "takeaway"
                      ? "Mang về"
                      : selectedTableNumber != null
                        ? `Bàn ${selectedTableNumber}`
                        : "Chưa gán bàn"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Đơn đang chạy
                  </p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {activeOrderCount} đơn đang chạy
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
                {isPending
                  ? "Đang xử lý thay đổi đơn"
                  : `${String(Math.round(flowProgressPercent))}% mạch tạo đơn đã sẵn`}
              </span>
              <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
                {canSubmit ? "Có thể gửi bếp" : "Chưa đủ điều kiện gửi bếp"}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {flowSteps.map((step, index) => (
                <div
                  key={step.label}
                  className="rounded-lg border bg-muted/30 text-card-foreground p-3"
                  data-state={step.state}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{step.label}</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {step.meta}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border bg-muted/30 text-card-foreground border-primary/15 bg-primary/8 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Giỏ hiện tại
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {cartQuantity > 0
                    ? `${cartQuantity} món`
                    : "Chưa có món trong giỏ"}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 text-card-foreground border-success/15 bg-success/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-success">
                  Đơn sẵn sàng
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {readyOrderCount} đơn
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 text-card-foreground p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Đã hoàn tất
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {completedOrderCount} đơn
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 text-card-foreground border-warning/15 bg-warning/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                  Doanh thu ca
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {formatVND(sessionRevenue)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
