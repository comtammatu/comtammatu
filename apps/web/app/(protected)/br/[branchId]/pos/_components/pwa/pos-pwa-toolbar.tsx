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
  X as IconX,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  useInstallPrompt,
  useIsIosPwaInstall,
  useIsOnline,
  useIsStandalone,
} from "./online-status-provider";

const DISMISS_STORAGE_KEY = "pos-pwa-install-dismissed";

const POS_PWA_COPY = {
  regionLabel: "POS - cài đặt và trạng thái kết nối",
  offline:
    "Mất kết nối - không thể tạo đơn hoặc xác nhận thanh toán.",
  iosInstallHint: "iOS: dùng Chia sẻ để thêm POS vào Màn hình chính.",
  iosInstallHintShort: "iOS: thêm vào Màn hình",
  browserInstallHint: "Cài đặt POS để mở nhanh như ứng dụng.",
  browserInstallHintShort: "Cài POS",
  installButton: "Cài đặt POS",
  installButtonShort: "Cài",
  dismissLabel: "Tạm ẩn lời nhắc",
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
  const [installDismissed, setInstallDismissed] = useState(false);

  // Hydrate dismiss flag from localStorage. Only the install hint can be
  // dismissed — offline alert always shows because it's a critical state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(DISMISS_STORAGE_KEY);
      if (stored === "true") setInstallDismissed(true);
    } catch {
      // localStorage may be blocked in private mode — ignore.
    }
  }, []);

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

  const handleDismiss = useCallback(() => {
    setInstallDismissed(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
      }
    } catch {
      // ignore
    }
  }, []);

  if (isStandalone) return null;
  // User đã ẩn lời nhắc cài + đang online → không render gì (banner offline
  // vẫn ưu tiên hiện vì là critical state, bypass dismiss).
  if (isOnline && installDismissed) return null;
  // Đang online nhưng không thể cài (browser không hỗ trợ) → cũng ẩn luôn,
  // tránh chiếm row top vô ích.
  if (isOnline && !installAvailable) return null;

  return (
    <>
      <div
        className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-background/80 px-2 py-1 md:gap-2 md:px-4 md:py-1.5"
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
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground md:gap-2 md:text-sm md:font-semibold md:text-foreground">
            <IconDownload className="size-3.5 shrink-0 md:size-4" />
            <span className="hidden truncate md:inline">
              {isIosPwaInstall
                ? POS_PWA_COPY.iosInstallHint
                : POS_PWA_COPY.browserInstallHint}
            </span>
            <span className="truncate md:hidden">
              {isIosPwaInstall
                ? POS_PWA_COPY.iosInstallHintShort
                : POS_PWA_COPY.browserInstallHintShort}
            </span>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs font-semibold md:h-9 md:px-3 md:text-sm"
          onClick={handleInstall}
          disabled={!installAvailable || installPending}
          aria-label={POS_PWA_COPY.installButtonLabel}
        >
          {isIosPwaInstall && !hasBrowserPrompt ? (
            <IconShare data-icon="inline-start" />
          ) : (
            <IconDownload data-icon="inline-start" />
          )}
          <span className="md:hidden">{POS_PWA_COPY.installButtonShort}</span>
          <span className="hidden md:inline">{POS_PWA_COPY.installButton}</span>
        </Button>
        {isOnline && installAvailable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            onClick={handleDismiss}
            aria-label={POS_PWA_COPY.dismissLabel}
          >
            <IconX className="size-3.5 md:size-4" />
          </Button>
        ) : null}
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
