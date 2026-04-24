"use client";

import { memo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { IconClock, IconDeviceDesktop } from "@tabler/icons-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { formatTime } from "./pos-menu-types";
import { PosThemeToggle } from "./pos-theme-toggle";
import type { ActiveSession } from "./page";

interface PosSessionHeaderProps {
  session: ActiveSession;
  /** Ẩn nút "Chốt ca" cho role không có `pos:close_shift` (waiter). */
  canCloseShift: boolean;
  onShowCloseSession: () => void;
}

function PosSessionHeaderComponent({
  session,
  canCloseShift,
  onShowCloseSession,
}: PosSessionHeaderProps) {
  return (
    <div className="border-b border-border/60 px-2 py-1.5 md:px-4 md:py-2">
      <div className="flex w-full items-center justify-between gap-1.5 md:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <EmployeePortalBackControl />
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground md:flex-wrap md:gap-x-3 md:gap-y-1">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
              <IconDeviceDesktop className="size-4 shrink-0 text-primary" />
              <span className="truncate">
                {session.pos_terminals?.name ?? "POS"}
              </span>
            </span>
            <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
              <IconClock className="size-4 shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">Ca mở lúc </span>
                {formatTime(session.opened_at)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <PosThemeToggle />
          {canCloseShift ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10 h-9 shrink-0 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-destructive md:min-h-11 md:px-4"
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

export const PosSessionHeader = memo(PosSessionHeaderComponent);
