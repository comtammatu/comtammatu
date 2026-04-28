"use client";

import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Download as IconDownload,
  Share2 as IconShare,
  WifiOff as IconWifiOff,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
  useInstallPrompt,
  useIsIosPwaInstall,
  useIsOnline,
  useIsStandalone,
} from "./online-status-provider";

const POS_PWA_COPY = {
  regionLabel: "POS - cài đặt và trạng thái kết nối",
  offline:
    "Mất kết nối - không thể tạo đơn hoặc xác nhận thanh toán.",
  iosInstallHint: "iOS: dùng Chia sẻ để thêm POS vào Màn hình chính.",
  browserInstallHint: "Cài đặt POS để mở nhanh như ứng dụng.",
  installButton: "Cài đặt POS",
  installButtonLabel: "Cài đặt POS lên thiết bị",
  iosDialogTitle: "Cài đặt POS trên iOS",
  iosDialogDescription:
    "Safari và trình duyệt iOS không mở hộp thoại cài đặt trực tiếp.",
  iosSteps: [
    "Mở menu Chia sẻ của trình duyệt.",
    "Chọn Thêm vào Màn hình chính.",
    "Giữ tên POS mặc định và bấm Thêm.",
  ],
  close: "Đóng",
} as const;

export function PosPwaToolbar() {
  const isOnline = useIsOnline();
  const isStandalone = useIsStandalone();
  const isIosPwaInstall = useIsIosPwaInstall();
  const install = useInstallPrompt();
  const [installPending, setInstallPending] = useState(false);
  const [iosDialogOpen, setIosDialogOpen] = useState(false);

  const hasBrowserPrompt = install != null && install.available;
  const installAvailable = hasBrowserPrompt || isIosPwaInstall;

  const handleInstall = useCallback(async () => {
    if (installPending) return;
    if (install == null || !install.available) {
      if (isIosPwaInstall) setIosDialogOpen(true);
      return;
    }
    setInstallPending(true);
    try {
      await install.prompt();
    } finally {
      setInstallPending(false);
    }
  }, [install, installPending, isIosPwaInstall]);

  if (isStandalone) return null;

  return (
    <>
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-background/80 px-2 py-1.5 md:px-4"
        role="region"
        aria-label={POS_PWA_COPY.regionLabel}
      >
        {!isOnline ? (
          <div
            className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-destructive"
            role="alert"
          >
            <IconWifiOff className="size-4 shrink-0" />
            <span className="truncate">{POS_PWA_COPY.offline}</span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
            <IconDownload className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {isIosPwaInstall
                ? POS_PWA_COPY.iosInstallHint
                : POS_PWA_COPY.browserInstallHint}
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
          aria-label={POS_PWA_COPY.installButtonLabel}
        >
          {isIosPwaInstall && !hasBrowserPrompt ? (
            <IconShare data-icon="inline-start" />
          ) : (
            <IconDownload data-icon="inline-start" />
          )}
          {POS_PWA_COPY.installButton}
        </Button>
      </div>
      <Dialog open={iosDialogOpen} onOpenChange={setIosDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{POS_PWA_COPY.iosDialogTitle}</DialogTitle>
            <DialogDescription>
              {POS_PWA_COPY.iosDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <ol className="grid gap-2 text-sm leading-relaxed">
            {POS_PWA_COPY.iosSteps.map((step, index) => (
              <li key={step}>
                {index + 1}. {step}
              </li>
            ))}
          </ol>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {POS_PWA_COPY.close}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
