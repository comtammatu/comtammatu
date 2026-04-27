"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Download as IconDownload, WifiOff as IconWifiOff } from "lucide-react";
import { useCallback, useState } from "react";
import {
  useInstallPrompt,
  useIsOnline,
  useIsStandalone,
} from "./online-status-provider";

export function PosPwaToolbar() {
  const isOnline = useIsOnline();
  const isStandalone = useIsStandalone();
  const install = useInstallPrompt();
  const [installPending, setInstallPending] = useState(false);

  const installAvailable = install != null && install.available;

  const handleInstall = useCallback(async () => {
    if (install == null || !install.available || installPending) return;
    setInstallPending(true);
    try {
      await install.prompt();
    } finally {
      setInstallPending(false);
    }
  }, [install, installPending]);

  if (isStandalone) return null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-background/80 px-2 py-1.5 md:px-4"
      role="region"
      aria-label="POS — Cài đặt và trạng thái kết nối"
    >
      {!isOnline ? (
        <div
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-destructive"
          role="alert"
        >
          <IconWifiOff className="size-4 shrink-0" />
          <span className="truncate">
            Mất kết nối — không thể tạo đơn hoặc xác nhận thanh toán.
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
          <IconDownload className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            Cài đặt POS để mở nhanh như ứng dụng.
          </span>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 gap-1 px-3 text-sm font-semibold"
        onClick={handleInstall}
        disabled={!installAvailable || installPending}
        aria-label="Cài đặt POS lên thiết bị"
      >
        <IconDownload data-icon="inline-start" />
        Cài đặt POS
      </Button>
    </div>
  );
}
