"use client";

import { formatCount } from "@comtammatu/shared/format";
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
  Megaphone as IconVoiceOn,
  Minimize2 as IconMinimize,
  MoreVertical as IconMoreVertical,
  Volume2 as IconVolumeOn,
  VolumeX as IconVolumeOff,
} from "lucide-react";
import type { ReactNode } from "react";
import type { OperationalAudioMode } from "@lib/operational-audio";
import { BranchRuntimeBackControl } from "../../branch-runtime-back-control";
import { ViewModeToggle } from "./view-mode-toggle";
import type { KdsViewMode } from "../_hooks/use-kds-view-mode";

interface KdsBoardTopBarProps {
  branchId: number;
  pendingCount: number;
  mode: KdsViewMode;
  audioMode: OperationalAudioMode;
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

const KDS_AUDIO_MODE_LABEL: Record<OperationalAudioMode, string> = {
  off: "Chuông KDS: tắt",
  beep: "Chuông KDS: chuông",
  voice: "Chuông KDS: đọc",
  "beep+voice": "Chuông KDS: chuông + đọc",
};

function KdsAudioModeIcon({ mode }: { mode: OperationalAudioMode }) {
  if (mode === "off") return <IconVolumeOff aria-hidden />;
  if (mode === "beep") return <IconVolumeOn aria-hidden />;
  return <IconVoiceOn aria-hidden />;
}

export function KdsBoardTopBar({
  branchId,
  pendingCount,
  mode,
  audioMode,
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
        <BranchRuntimeBackControl
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
          {`${formatCount(pendingCount)} chờ`}
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
          variant={audioMode === "off" ? "ghost" : "secondary"}
          size="icon-lg"
          aria-label={KDS_AUDIO_MODE_LABEL[audioMode]}
          aria-pressed={audioMode !== "off"}
          onClick={onSoundToggle}
        >
          <KdsAudioModeIcon mode={audioMode} />
        </Button>
        <Button
          type="button"
          variant={isFullscreen ? "secondary" : "ghost"}
          size="icon-lg"
          aria-label={isFullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình"}
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
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={KDS_HEADER_COPY.moreMenu}
              >
                <IconMoreVertical />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <ThemeMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
