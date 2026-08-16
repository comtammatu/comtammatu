"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { messages } from "@lib/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { AppHeaderBrand } from "@/components/app-header";
import { BranchQuickMenuLimitSheet } from "../(operator)/_components/home/branch-quick-menu-limit-sheet";
import { PrinterStatusIndicator } from "./printer-status-badge";
import { usePosSession, usePosSound } from "./_providers/pos-desktop-provider";
import {
  ArrowLeft as IconArrowLeft,
  Ellipsis as IconEllipsis,
  LogIn as IconDoorEnter,
  Megaphone as IconVoiceOn,
  PowerOff as IconPowerOff,
  ShieldAlert as IconShieldAlert,
  Volume2 as IconVolume2,
  VolumeX as IconVolumeX,
} from "lucide-react";

interface PosSessionTopBarProps {
  /** Ẩn nút "Chốt ca" cho role không có `pos:close_shift`. */
  canCloseShift: boolean;
  /** Owner / branch_manager may edit daily sales limits from POS. */
  canManageMenuLimits: boolean;
  onShowCloseSession: () => void;
  /**
   * Mobile: thay tên POS terminal bằng context cụ thể (vd. "Bàn 5", "Mang về",
   * "Thêm món #TC-...") để cashier biết đang thao tác trên đơn nào. Desktop
   * sidebar không cần — context đã hiện trong cart/order-list pane.
   */
  contextLabel?: string;
  /**
   * Mobile: nút back arrow cạnh contextLabel — quay lại table gate / trang
   * chính POS hoặc hủy append hiện tại. Hidden khi undefined.
   */
  onBack?: () => void;
}

function PosSessionTopBarComponent({
  canCloseShift,
  canManageMenuLimits,
  onShowCloseSession,
  contextLabel,
  onBack,
}: PosSessionTopBarProps) {
  const { branchId } = usePosSession();
  const [menuLimitsOpen, setMenuLimitsOpen] = useState(false);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-border/60 bg-background px-2 md:px-3">
        <div className="flex w-full items-center justify-between gap-2">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              className="shrink-0 md:hidden"
              onClick={onBack}
              aria-label={messages.pos.sessionHeader.backAria}
            >
              <IconArrowLeft />
            </Button>
          ) : null}

          <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5">
            <AppHeaderBrand
              title={null}
              subtitleHiddenOnMobile={false}
              showText={false}
            />
            {contextLabel ? (
              <span className="font-heading min-w-0 truncate text-base font-semibold text-foreground md:text-sm">
                {contextLabel}
              </span>
            ) : null}
          </div>

          {/* Single overflow ⋮ menu for both mobile + desktop sidebar.
              Exit / close-shift live here to keep the header small — and to
              avoid a mis-tap on "Chốt ca" mid-payment. The F10 hotkey still
              opens close-shift quickly on desktop. */}
          <div className="flex shrink-0 items-center gap-2">
            <PrinterStatusIndicator branchId={branchId} />
            {canManageMenuLimits ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                className="shrink-0"
                onClick={() => setMenuLimitsOpen(true)}
                aria-label={messages.pos.sessionHeader.menuLimitsAria}
              >
                <IconShieldAlert className="text-warning" />
              </Button>
            ) : null}
            <PosMoreMenu
              branchId={branchId}
              canCloseShift={canCloseShift}
              onShowCloseSession={onShowCloseSession}
            />
          </div>
        </div>
      </div>
      {canManageMenuLimits ? (
        <BranchQuickMenuLimitSheet
          branchId={branchId}
          open={menuLimitsOpen}
          onOpenChange={setMenuLimitsOpen}
        />
      ) : null}
    </>
  );
}

function PosMoreMenu({
  branchId,
  canCloseShift,
  onShowCloseSession,
}: {
  branchId: number;
  canCloseShift: boolean;
  onShowCloseSession: () => void;
}) {
  const { audioMode, toggleSound } = usePosSound();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            className="shrink-0"
            aria-label={messages.pos.sessionHeader.moreMenuAria}
          >
            <IconEllipsis />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          className="min-h-12 text-sm"
          render={
            <Link href={`/br/${branchId}`}>
              <IconDoorEnter />
              {APP_COPY_VI.branchHome}
            </Link>
          }
        />

        <DropdownMenuItem
          className="min-h-12 text-sm"
          onClick={toggleSound}
        >
          {audioMode === "off" ? (
            <IconVolumeX />
          ) : audioMode === "beep" ? (
            <IconVolume2 />
          ) : (
            <IconVoiceOn />
          )}
          {audioMode === "off"
            ? "Âm báo POS: tắt"
            : audioMode === "beep"
              ? "Âm báo POS: chuông"
              : audioMode === "voice"
                ? "Âm báo POS: đọc"
                : "Âm báo POS: chuông + đọc"}
        </DropdownMenuItem>

        {canCloseShift ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onShowCloseSession}
              className="min-h-12 text-sm text-destructive focus:text-destructive"
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

export const PosSessionTopBar = memo(PosSessionTopBarComponent);
