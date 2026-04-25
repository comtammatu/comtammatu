"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Download as IconDownload, WifiOff as IconWifiOff } from "lucide-react";
import { useCallback, useState } from "react";
import { useInstallPrompt, useIsOnline } from "./online-status-provider";

export function PosPwaToolbar() {
  const isOnline = useIsOnline();
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

  if (isOnline && !installAvailable) return null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-background/80 px-2 py-1.5 md:px-4"
      role="region"
      aria-label="POS — Trạng thái kết nối"
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
        <span className="flex-1" aria-hidden="true" />
      )}
      {installAvailable ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1 px-3 text-sm font-semibold"
          onClick={handleInstall}
          disabled={installPending}
          aria-label="Cài đặt POS lên thiết bị"
        >
          <IconDownload data-icon="inline-start" />
          Cài đặt POS
        </Button>
      ) : null}
    </div>
  );
}
