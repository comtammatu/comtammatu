"use client";

import Link from "next/link";
import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { MenuLimitsSheet } from "../menu-limits/menu-limits-sheet";
import type { MenuLimitRow } from "../menu-limits/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { BrandMark } from "@/components/brand";
import { PrinterStatusBadge } from "./printer-status-badge";
import { usePosSession, usePosSound } from "./_providers/pos-desktop-provider";
import {
  ArrowLeft as IconArrowLeft,
  LogIn as IconDoorEnter,
  MoreVertical as IconMoreVertical,
  PowerOff as IconPowerOff,
  Volume2 as IconVolume2,
  VolumeX as IconVolumeX,
} from "lucide-react";

interface PosSessionHeaderProps {
  /** Ẩn nút "Chốt ca" cho role không có `pos:close_shift` (waiter). */
  canCloseShift: boolean;
  canManageMenuLimits?: boolean;
  menuLimitRows?: MenuLimitRow[];
  onShowCloseSession: () => void;
  /**
   * Mobile: thay tên POS terminal bằng context cụ thể (vd. "Bàn 5", "Mang về",
   * "Thêm món #TC-...") để cashier biết đang thao tác trên đơn nào. Desktop
   * sidebar không cần — context đã hiện trong cart/order-list pane.
   */
  contextLabel?: string;
  /**
   * Mobile: nút back arrow cạnh contextLabel — quay lại table gate / trang
   * chính POS. Hidden khi undefined (desktop sidebar, hoặc menu chưa ready,
   * hoặc đang appending — banner "Huỷ" đã serve role thoát).
   */
  onBack?: () => void;
}

function PosSessionHeaderComponent({
  canCloseShift,
  canManageMenuLimits = false,
  menuLimitRows = [],
  onShowCloseSession,
  contextLabel,
  onBack,
}: PosSessionHeaderProps) {
  const { branchId } = usePosSession();

  return (
    <div className="border-b border-border/60 px-2 py-2 md:px-3 md:py-1.5">
      <div className="flex w-full items-center justify-between gap-2">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="min-w-12 shrink-0 px-0 md:hidden"
            onClick={onBack}
            aria-label={messages.pos.sessionHeader.backAria}
          >
            <IconArrowLeft />
          </Button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5 md:justify-center">
          <BrandMark decorative size="xs" className="shrink-0" />
          {contextLabel ? (
            <span className="font-heading min-w-0 truncate text-base font-bold text-foreground md:text-sm md:font-semibold">
              {contextLabel}
            </span>
          ) : null}
        </div>

        {/* Single overflow ⋮ menu for both mobile + desktop sidebar.
            Exit / close-shift live here to keep the header small — and to
            avoid a mis-tap on "Chốt ca" mid-payment. The F10 hotkey still
            opens close-shift quickly on desktop. */}
        <div className="flex shrink-0 items-center gap-1">
          <PrinterStatusBadge branchId={branchId} />
          {canManageMenuLimits ? (
            <MenuLimitsSheet
              branchId={branchId}
              rows={menuLimitRows}
              compact
              triggerLabel="Khóa món"
              triggerTitle="Khóa món / hạn mức"
              sheetTitle="Khóa món / hạn mức hôm nay"
              sheetDescription="Tắt món hết hàng hoặc đặt số suất tối đa bán trong ngày cho chi nhánh này."
            />
          ) : null}
          <PosMoreMenu
            canCloseShift={canCloseShift}
            onShowCloseSession={onShowCloseSession}
          />
        </div>
      </div>
    </div>
  );
}

function PosMoreMenu({
  canCloseShift,
  onShowCloseSession,
}: {
  canCloseShift: boolean;
  onShowCloseSession: () => void;
}) {
  const { soundEnabled, toggleSound } = usePosSound();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          className="shrink-0"
          aria-label={messages.pos.sessionHeader.moreMenuAria}
        >
          <IconMoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/employee">
            <IconDoorEnter />
            {messages.pos.sessionHeader.employeePortal}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={toggleSound}>
          {soundEnabled ? <IconVolume2 /> : <IconVolumeX />}
          {soundEnabled ? "Tắt âm báo POS" : "Bật âm báo POS"}
        </DropdownMenuItem>

        {canCloseShift ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onShowCloseSession}
              className="text-destructive focus:text-destructive"
            >
              <IconPowerOff />
              {messages.pos.sessionHeader.closeShift}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PosSessionHeader = memo(PosSessionHeaderComponent);
