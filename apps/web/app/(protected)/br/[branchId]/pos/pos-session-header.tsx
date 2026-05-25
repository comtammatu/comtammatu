"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { useTheme } from "@comtammatu/ui/components/theme-provider";
import { BrandMark } from "@/components/brand";
import { usePosSound } from "./_providers/pos-desktop-provider";
import {
  ArrowLeft as IconArrowLeft,
  Monitor as IconDeviceDesktop,
  LogIn as IconDoorEnter,
  Moon as IconMoon,
  MoreVertical as IconMoreVertical,
  PowerOff as IconPowerOff,
  Sun as IconSun,
  Volume2 as IconVolume2,
  VolumeX as IconVolumeX,
} from "lucide-react";

interface PosSessionHeaderProps {
  /** Ẩn nút "Chốt ca" cho role không có `pos:close_shift` (waiter). */
  canCloseShift: boolean;
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
  onShowCloseSession,
  contextLabel,
  onBack,
}: PosSessionHeaderProps) {
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

        {/* Single overflow ⋮ menu cho cả mobile + desktop sidebar.
            Thoát / Giao diện / Chốt ca gom hết để header gọn — tránh che
            chỗ + tránh bấm nhầm "Chốt ca" giữa phiên thanh toán. F10 hotkey
            vẫn mở Chốt ca nhanh trên desktop. */}
        <PosMoreMenu
          canCloseShift={canCloseShift}
          onShowCloseSession={onShowCloseSession}
        />
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
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { soundEnabled, toggleSound } = usePosSound();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? theme : undefined;
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
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

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {isDark ? <IconMoon /> : <IconSun />}
            {messages.pos.sessionHeader.appearance}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => setTheme("light")}
              data-active={current === "light"}
            >
              <IconSun />
              {messages.pos.sessionHeader.light}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("dark")}
              data-active={current === "dark"}
            >
              <IconMoon />
              {messages.pos.sessionHeader.dark}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("system")}
              data-active={current === "system"}
            >
              <IconDeviceDesktop />
              {messages.pos.sessionHeader.system}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

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
