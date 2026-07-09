"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { ThemeMenuItem } from "@/components/theme-toggle";
import {
  History as IconHistory,
  Maximize2 as IconMaximize,
  Minimize2 as IconMinimize,
  MoreVertical as IconMoreVertical,
  Volume2 as IconVolumeOn,
  VolumeX as IconVolumeOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmployeePortalBackControl } from "../../employee-portal-back-control";
import { ViewModeToggle } from "./view-mode-toggle";
import type { KdsViewMode } from "../_hooks/use-kds-view-mode";

interface KdsBoardTopBarProps {
  branchId: number;
  pendingCount: number;
  mode: KdsViewMode;
  soundEnabled: boolean;
  isFullscreen: boolean;
  onModeChange: (next: KdsViewMode) => void;
  onCompletionHistoryOpen: () => void;
  onSoundToggle: () => void;
  onFullscreenToggle: () => void;
  stationControls: ReactNode;
  filterControls: ReactNode;
}

const KDS_HEADER_COPY = {
  completionHistory: "Lịch sử hoàn thành",
  moreMenu: "Thao tác KDS",
} as const;

export function KdsBoardTopBar({
  branchId,
  pendingCount,
  mode,
  soundEnabled,
  isFullscreen,
  onModeChange,
  onCompletionHistoryOpen,
  onSoundToggle,
  onFullscreenToggle,
  stationControls,
  filterControls,
}: KdsBoardTopBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-2 py-2 xl:flex-nowrap xl:px-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <EmployeePortalBackControl
          branchId={branchId}
          className="h-11 min-h-11 px-3 text-sm"
        />
        <span className="font-heading text-base font-semibold text-foreground">
          KDS
        </span>
        <Badge variant="outline" className="font-mono tabular-nums">
          #{branchId}
        </Badge>
      </div>
      <div className="order-3 min-w-0 basis-full overflow-x-auto xl:order-none xl:basis-auto xl:flex-1">
        {stationControls}
      </div>
      <div className="order-2 flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 xl:order-none xl:min-w-max xl:shrink-0 xl:flex-nowrap">
        {filterControls}
        <Badge
          role="status"
          aria-live="polite"
          variant={pendingCount > 0 ? "warning" : "outline"}
          className="rounded-full px-2 py-1 font-mono text-sm tabular-nums"
        >
          {pendingCount > 0 ? `${pendingCount} chờ` : "0 chờ"}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={KDS_HEADER_COPY.completionHistory}
          onClick={onCompletionHistoryOpen}
        >
          <IconHistory aria-hidden />
        </Button>
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
        <ViewModeToggle mode={mode} onChange={onModeChange} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={KDS_HEADER_COPY.moreMenu}
            >
              <IconMoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <ThemeMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
