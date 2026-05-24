"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Volume2 as IconVolumeOn,
  VolumeX as IconVolumeOff,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { EmployeePortalBackControl } from "../../employee-portal-back-control";
import { KdsMenuLimitsSheet } from "./menu-limits-sheet";
import { ViewModeToggle } from "./view-mode-toggle";
import type { KdsViewMode } from "../hooks/use-kds-view-mode";
import type { KdsMenuLimitRow } from "../types";

interface BoardHeaderProps {
  branchId: number;
  pendingCount: number;
  mode: KdsViewMode;
  soundEnabled: boolean;
  onModeChange: (next: KdsViewMode) => void;
  onSoundToggle: () => void;
  menuLimits: KdsMenuLimitRow[];
  onMenuLimitsChange: (rows: KdsMenuLimitRow[]) => void;
}

export function BoardHeader({
  branchId,
  pendingCount,
  mode,
  soundEnabled,
  onModeChange,
  onSoundToggle,
  menuLimits,
  onMenuLimitsChange,
}: BoardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <EmployeePortalBackControl className="h-7 px-1.5 text-xs" />
        <BrandMark decorative size="xs" />
        <span className="font-heading text-xs font-semibold uppercase text-muted-foreground">
          KDS #{branchId}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <Badge
          role="status"
          aria-live="polite"
          variant={pendingCount > 0 ? "warning" : "outline"}
          className="rounded-full px-3 py-1 text-xs"
        >
          {pendingCount > 0
            ? `${pendingCount} món đang chờ`
            : "Không có món chờ"}
        </Badge>
        <Button
          type="button"
          variant={soundEnabled ? "secondary" : "outline"}
          size="icon-sm"
          aria-label={soundEnabled ? "Tắt chuông KDS" : "Bật chuông KDS"}
          aria-pressed={soundEnabled}
          onClick={onSoundToggle}
        >
          {soundEnabled ? (
            <IconVolumeOn aria-hidden />
          ) : (
            <IconVolumeOff aria-hidden />
          )}
        </Button>
        <KdsMenuLimitsSheet
          branchId={branchId}
          rows={menuLimits}
          onRowsChange={onMenuLimitsChange}
        />
        <ViewModeToggle mode={mode} onChange={onModeChange} />
      </div>
    </div>
  );
}
