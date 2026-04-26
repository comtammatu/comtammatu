"use client";

import { memo, type ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Monitor as IconDeviceDesktop } from "lucide-react";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { PosThemeToggle } from "./pos-theme-toggle";
import type { ActiveSession } from "./page";

interface PosSessionHeaderProps {
  session: ActiveSession;
  /** Ẩn nút"Chốt ca" cho role không có `pos:close_shift` (waiter). */
  canCloseShift: boolean;
  onShowCloseSession: () => void;
  contextLabel?: string;
  contextAction?: ReactNode;
}

function PosSessionHeaderComponent({
  session,
  canCloseShift,
  onShowCloseSession,
  contextLabel,
  contextAction,
}: PosSessionHeaderProps) {
  return (
    <div className="border-b border-border/60 px-2 py-1 md:px-3 md:py-1.5">
      <div className="flex w-full items-center justify-between gap-1.5 md:gap-2">
        <EmployeePortalBackControl />

        <div className="flex min-w-0 flex-1 items-center justify-center text-sm">
          {contextLabel ? (
            <span className="min-w-0 truncate font-semibold text-foreground">
              {contextLabel}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
              <IconDeviceDesktop className="size-4 shrink-0 text-primary" />
              <span className="truncate">
                {session.pos_terminals?.name ?? "POS"}
              </span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {contextAction}
          <PosThemeToggle />
          {canCloseShift ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-h-0 shrink-0 px-2 text-xs font-semibold text-muted-foreground hover:text-destructive md:h-9 md:px-3 md:text-sm"
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
