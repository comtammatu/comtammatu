"use client";

import { Button } from "@comtammatu/ui/components/button";
import {
  History as IconHistory,
  Maximize2 as IconMaximize,
  Megaphone as IconVoiceOn,
  Minimize2 as IconMinimize,
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
  mode: KdsViewMode;
  audioMode: OperationalAudioMode;
  isFullscreen: boolean;
  onModeChange: (next: KdsViewMode) => void;
  onCompletionHistoryOpen: () => void;
  onSoundToggle: () => void;
  onFullscreenToggle: () => void;
  stationControls: ReactNode;
}

const KDS_HEADER_COPY = {
  completionHistory: "Lịch sử hoàn thành",
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
  mode,
  audioMode,
  isFullscreen,
  onModeChange,
  onCompletionHistoryOpen,
  onSoundToggle,
  onFullscreenToggle,
  stationControls,
}: KdsBoardTopBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-2 py-2 xl:flex-nowrap xl:px-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <BranchRuntimeBackControl branchId={branchId} />
      </div>
      <div className="order-3 min-w-0 basis-full overflow-x-auto xl:order-none xl:basis-auto xl:flex-1">
        {stationControls}
      </div>
      <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 xl:order-none xl:min-w-max">
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={KDS_HEADER_COPY.completionHistory}
          onClick={onCompletionHistoryOpen}
        >
          <IconHistory aria-hidden />
        </Button>
        <Button
          type="button"
          variant={audioMode === "off" ? "ghost" : "secondary"}
          size="icon-touch"
          aria-label={KDS_AUDIO_MODE_LABEL[audioMode]}
          aria-pressed={audioMode !== "off"}
          onClick={onSoundToggle}
        >
          <KdsAudioModeIcon mode={audioMode} />
        </Button>
        <Button
          type="button"
          variant={isFullscreen ? "secondary" : "ghost"}
          size="icon-touch"
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
      </div>
    </div>
  );
}
