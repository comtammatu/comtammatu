"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { useTheme, type Theme } from "@comtammatu/ui/components/theme-provider";
import { BrandMark } from "@/components/brand";
import {
  ArrowLeft as IconArrowLeft,
  Monitor as IconDeviceDesktop,
  LogIn as IconDoorEnter,
  Moon as IconMoon,
  MoreVertical as IconMoreVertical,
  PowerOff as IconPowerOff,
  Sun as IconSun,
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
            className="w-12 shrink-0 p-0 md:hidden"
            onClick={onBack}
            aria-label={messages.pos.sessionHeader.backAria}
          >
            <IconArrowLeft />
          </Button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5 md:justify-center">
          <BrandMark decorative size="xs" className="shrink-0" />
          {contextLabel ? (
            <span className="font-heading min-w-0 truncate text-base font-semibold text-foreground md:text-sm">
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
          size="touch"
          className="w-12 shrink-0 p-0"
          aria-label={messages.pos.sessionHeader.moreMenuAria}
        >
          <IconMoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" density="touch" width="action">
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
          <DropdownMenuSubContent width="action">
            <DropdownMenuRadioGroup
              value={current ?? "system"}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <DropdownMenuRadioItem value="light">
                <IconSun />
                {messages.pos.sessionHeader.light}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <IconMoon />
                {messages.pos.sessionHeader.dark}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <IconDeviceDesktop />
                {messages.pos.sessionHeader.system}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {canCloseShift ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onShowCloseSession}
              variant="destructive"
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
