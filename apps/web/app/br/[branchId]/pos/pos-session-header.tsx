"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
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
import {
  ArrowLeft as IconArrowLeft,
  Monitor as IconDeviceDesktop,
  LogIn as IconDoorEnter,
  Moon as IconMoon,
  MoreVertical as IconMoreVertical,
  PowerOff as IconPowerOff,
  Sun as IconSun,
} from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { PosThemeToggle } from "./pos-theme-toggle";
import type { ActiveSession } from "./page";

interface PosSessionHeaderProps {
  session: ActiveSession;
  /** Ẩn nút "Chốt ca" cho role không có `pos:close_shift` (waiter). */
  canCloseShift: boolean;
  onShowCloseSession: () => void;
  /**
   * Mobile: thay tên POS terminal bằng context cụ thể (vd. "Bàn 5", "Mang về",
   * "Thêm món #TC-...") để cashier biết đang thao tác trên đơn nào. Khi không
   * có context (chưa chọn bàn / mới mở POS) header rơi về tên terminal.
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
  session,
  canCloseShift,
  onShowCloseSession,
  contextLabel,
  onBack,
}: PosSessionHeaderProps) {
  return (
    <div className="border-b border-border/60 px-2 py-2 md:px-3 md:py-1.5">
      <div className="flex w-full items-center justify-between gap-2">
        {/* Desktop sidebar: back link inline. Mobile: "Thoát" gom vào overflow
            menu, còn nút back-to-table-gate (onBack) render bên dưới cạnh
            contextLabel. */}
        <div className="hidden md:block">
          <EmployeePortalBackControl />
        </div>

        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 md:hidden"
            onClick={onBack}
            aria-label="Quay lại trang chính"
          >
            <IconArrowLeft />
          </Button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5 md:justify-center">
          {contextLabel ? (
            <span className="min-w-0 truncate text-base font-bold text-foreground md:text-sm md:font-semibold">
              {contextLabel}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground md:text-sm">
              <IconDeviceDesktop className="size-4 shrink-0 text-primary" />
              <span className="truncate">
                {session.pos_terminals?.name ?? "POS"}
              </span>
            </span>
          )}
        </div>

        {/* Mobile: 1 nút overflow ⋮ — Thoát/Theme/Chốt ca chỉ hiện khi user bấm.
            Tránh che chỗ + tránh bấm nhầm "Chốt ca" giữa phiên đặt món / thanh toán. */}
        <div className="md:hidden">
          <PosMobileMoreMenu
            canCloseShift={canCloseShift}
            onShowCloseSession={onShowCloseSession}
          />
        </div>

        {/* Desktop sidebar: giữ inline cluster theme + chốt ca cho cashier
            đứng máy desktop dùng nhanh. Width sidebar (≥384px) thừa chỗ. */}
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <PosThemeToggle />
          {canCloseShift ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 min-h-9 shrink-0 px-3 text-sm font-semibold text-muted-foreground hover:text-destructive"
              onClick={onShowCloseSession}
              aria-label="Chốt ca POS"
            >
              Chốt ca
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PosMobileMoreMenu({
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
          size="icon"
          className="size-10 shrink-0"
          aria-label="Mở menu POS"
        >
          <IconMoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/employee">
            <IconDoorEnter />
            Cổng nhân viên
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {isDark ? <IconMoon /> : <IconSun />}
            Giao diện
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => setTheme("light")}
              data-active={current === "light"}
            >
              <IconSun />
              Sáng
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("dark")}
              data-active={current === "dark"}
            >
              <IconMoon />
              Tối
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme("system")}
              data-active={current === "system"}
            >
              <IconDeviceDesktop />
              Hệ thống
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {canCloseShift ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onShowCloseSession}
              className="text-destructive focus:text-destructive"
            >
              <IconPowerOff />
              Chốt ca
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PosSessionHeader = memo(PosSessionHeaderComponent);
