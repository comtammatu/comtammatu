"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import {
  History as IconHistory,
  Maximize2 as IconMaximize,
  Minimize2 as IconMinimize,
  Volume2 as IconVolumeOn,
  VolumeX as IconVolumeOff,
} from "lucide-react";
import type { ReactNode } from "react";
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
  isFullscreen: boolean;
  onModeChange: (next: KdsViewMode) => void;
  onCompletionHistoryOpen: () => void;
  onSoundToggle: () => void;
  onFullscreenToggle: () => void;
  menuLimits: KdsMenuLimitRow[];
  onMenuLimitsChange: (rows: KdsMenuLimitRow[]) => void;
  stationControls: ReactNode;
  filterControls: ReactNode;
}

const KDS_HEADER_COPY = {
  completionHistory: "Lịch sử hoàn thành",
} as const;

export function BoardHeader({
  branchId,
  pendingCount,
  mode,
  soundEnabled,
  isFullscreen,
  onModeChange,
  onCompletionHistoryOpen,
  onSoundToggle,
  onFullscreenToggle,
  menuLimits,
  onMenuLimitsChange,
  stationControls,
  filterControls,
}: BoardHeaderProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto px-2 py-1.5 md:px-3">
      <div className="flex shrink-0 items-center gap-2">
        <EmployeePortalBackControl className="h-8 px-2 text-sm" />
        <span className="font-heading text-base font-semibold text-foreground">
          KDS #{branchId}
        </span>
      </div>
      <div className="min-w-0 flex-1">{stationControls}</div>
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {filterControls}
        <Badge
          role="status"
          aria-live="polite"
          variant={pendingCount > 0 ? "warning" : "outline"}
          className="rounded-full px-2.5 py-1 text-sm"
        >
          {pendingCount > 0 ? `${pendingCount} chờ` : "0 chờ"}
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={KDS_HEADER_COPY.completionHistory}
              onClick={onCompletionHistoryOpen}
            >
              <IconHistory aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{KDS_HEADER_COPY.completionHistory}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={soundEnabled ? "secondary" : "ghost"}
              size="icon-lg"
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
          </TooltipTrigger>
          <TooltipContent>
            {soundEnabled ? "Tắt chuông" : "Bật chuông"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isFullscreen ? "secondary" : "ghost"}
              size="icon-lg"
              aria-label={
                isFullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình"
              }
              aria-pressed={isFullscreen}
              onClick={onFullscreenToggle}
            >
              {isFullscreen ? (
                <IconMinimize aria-hidden />
              ) : (
                <IconMaximize aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
          </TooltipContent>
        </Tooltip>
        <KdsMenuLimitsSheet
          branchId={branchId}
          rows={menuLimits}
          onRowsChange={onMenuLimitsChange}
          compact
        />
        <ViewModeToggle mode={mode} onChange={onModeChange} />
      </div>
    </div>
  );
}
