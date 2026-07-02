"use client";

import { PwaInstallHelpDialog } from "@/components/pwa-install-help-dialog";
import { Button } from "@comtammatu/ui/components/button";
import {
  Download as IconDownload,
  LayoutGrid as IconLayoutGrid,
  RefreshCw as IconRefreshCw,
  Share2 as IconShare,
  WifiOff as IconWifiOff,
  X as IconX,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useHasNewVersion,
  useInstallPrompt,
  useIsIosPwaInstall,
  useIsOnline,
  useIsStandalone,
} from "./provider";

type OperationalPwaSurface = "pos" | "kds" | "runner";

function getDismissStorageKey(
  surface: OperationalPwaSurface,
  branchId: string,
) {
  return `operational-pwa-install-dismissed:${surface}:${branchId}`;
}

interface OperationalPwaCopy {
  appLabel: string;
  regionLabel: string;
  hubLinkLabel: string;
  offline: string;
  iosInstallHint: string;
  iosInstallHintShort: string;
  browserInstallHint: string;
  browserInstallHintShort: string;
  installButton: string;
  installButtonShort: string;
  dismissLabel: string;
  installButtonLabel: string;
  updateHint: string;
  updateButton: string;
  iosDialogTitle: string;
  iosDialogDescription: string;
  iosSteps: readonly string[];
  close: string;
}

function buildCopy(surface: OperationalPwaSurface): OperationalPwaCopy {
  const appLabel =
    surface === "pos" ? "POS" : surface === "kds" ? "KDS" : "màn gọi số";
  const jobLabel =
    surface === "pos"
      ? "đơn/thanh toán"
      : surface === "kds"
        ? "trạng thái bếp"
        : "trạng thái món";

  return {
    appLabel,
    regionLabel: `${appLabel} - cài đặt và trạng thái kết nối`,
    hubLinkLabel: "Về màn hình chính chi nhánh",
    offline: `Mất kết nối - không thể cập nhật ${jobLabel}.`,
    iosInstallHint: `iOS: dùng Chia sẻ để thêm ${appLabel} vào Màn hình chính.`,
    iosInstallHintShort: "iOS: thêm vào Màn hình",
    browserInstallHint: `Cài đặt ${appLabel} để mở nhanh như ứng dụng.`,
    browserInstallHintShort: `Cài ${appLabel}`,
    installButton: `Cài đặt ${appLabel}`,
    installButtonShort: "Cài",
    dismissLabel: "Tạm ẩn lời nhắc",
    installButtonLabel: `Cài đặt ${appLabel} lên thiết bị`,
    updateHint: "Có phiên bản mới của ứng dụng.",
    updateButton: "Tải lại",
    iosDialogTitle: `Cài đặt ${appLabel} trên iOS`,
    iosDialogDescription:
      "Safari và trình duyệt iOS không mở hộp thoại cài đặt trực tiếp.",
    iosSteps: [
      "Mở menu Chia sẻ của trình duyệt.",
      "Chọn Thêm vào Màn hình chính.",
      `Giữ tên ${appLabel} mặc định và bấm Thêm.`,
    ],
    close: "Đóng",
  };
}

export function OperationalPwaToolbar({
  branchId,
  surface,
}: {
  branchId: string;
  surface: OperationalPwaSurface;
}) {
  const copy = useMemo(() => buildCopy(surface), [surface]);
  const dismissStorageKey = useMemo(
    () => getDismissStorageKey(surface, branchId),
    [branchId, surface],
  );
  const isOnline = useIsOnline();
  const isStandalone = useIsStandalone();
  const isIosPwaInstall = useIsIosPwaInstall();
  const hasNewVersion = useHasNewVersion();
  const install = useInstallPrompt();
  const [installPending, setInstallPending] = useState(false);
  const [iosDialogOpen, setIosDialogOpen] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);

  // Hydrate dismiss flag from localStorage. Only the install hint can be
  // dismissed — offline alert always shows because it's a critical state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(dismissStorageKey) === "true") {
        setInstallDismissed(true);
      }
    } catch {
      // localStorage may be blocked in private mode — ignore.
    }
  }, [dismissStorageKey]);

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
        window.localStorage.setItem(dismissStorageKey, "true");
      }
    } catch {
      // ignore
    }
  }, [dismissStorageKey]);

  // Runner is a guest-facing display: it never gets staff navigation.
  // POS/KDS keep the hub link in every toolbar state (including standalone,
  // where browser chrome is absent) so staff can always return to the hub.
  const showHubLink = surface !== "runner";
  const hubLink = showHubLink ? (
    <Button
      asChild
      variant="ghost"
      size="icon-touch"
      className="shrink-0 text-muted-foreground"
    >
      <Link href={`/br/${branchId}`} aria-label={copy.hubLinkLabel}>
        <IconLayoutGrid />
      </Link>
    </Button>
  ) : null;

  // The update banner is the one row that must ALSO show in standalone —
  // installed tablets running a whole shift are exactly the clients that
  // break on a stale chunk after a deploy. It cannot be dismissed.
  if (hasNewVersion) {
    return (
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-2 py-2 md:px-4"
        role="region"
        aria-label={copy.regionLabel}
      >
        {hubLink}
        <div
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground"
          role="alert"
        >
          <IconRefreshCw className="size-4 shrink-0" />
          <span className="truncate">{copy.updateHint}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="shrink-0 text-sm font-semibold"
          onClick={() => {
            window.location.reload();
          }}
        >
          <IconRefreshCw data-icon="inline-start" />
          {copy.updateButton}
        </Button>
      </div>
    );
  }

  const showInstallRow =
    !isStandalone && (!isOnline || (!installDismissed && installAvailable));

  if (!showInstallRow) {
    if (hubLink == null) return null;
    return (
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-2 py-1 md:px-4"
        role="region"
        aria-label={copy.regionLabel}
      >
        {hubLink}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-2 py-2 md:px-4"
        role="region"
        aria-label={copy.regionLabel}
      >
        {hubLink}
        {!isOnline ? (
          <div
            className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-destructive"
            role="alert"
          >
            <IconWifiOff className="size-4 shrink-0" />
            <span className="truncate">{copy.offline}</span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm md:font-semibold md:text-foreground">
            <IconDownload className="size-4 shrink-0" />
            <span className="hidden truncate md:inline">
              {isIosPwaInstall ? copy.iosInstallHint : copy.browserInstallHint}
            </span>
            <span className="truncate md:hidden">
              {isIosPwaInstall
                ? copy.iosInstallHintShort
                : copy.browserInstallHintShort}
            </span>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="shrink-0 text-sm font-semibold"
          onClick={handleInstall}
          disabled={!installAvailable || installPending}
          aria-label={copy.installButtonLabel}
        >
          {isIosPwaInstall && !hasBrowserPrompt ? (
            <IconShare data-icon="inline-start" />
          ) : (
            <IconDownload data-icon="inline-start" />
          )}
          <span className="md:hidden">{copy.installButtonShort}</span>
          <span className="hidden md:inline">{copy.installButton}</span>
        </Button>
        {isOnline && installAvailable ? (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="shrink-0 px-3 text-muted-foreground"
            onClick={handleDismiss}
            aria-label={copy.dismissLabel}
          >
            <IconX />
          </Button>
        ) : null}
      </div>
      <PwaInstallHelpDialog
        open={iosDialogOpen}
        onOpenChange={setIosDialogOpen}
        title={copy.iosDialogTitle}
        description={copy.iosDialogDescription}
        steps={copy.iosSteps}
        closeLabel={copy.close}
      />
    </>
  );
}

export function PosPwaToolbar({ branchId }: { branchId: string }) {
  return <OperationalPwaToolbar branchId={branchId} surface="pos" />;
}

export function KdsPwaToolbar({ branchId }: { branchId: string }) {
  return <OperationalPwaToolbar branchId={branchId} surface="kds" />;
}

export function RunnerPwaToolbar({ branchId }: { branchId: string }) {
  return <OperationalPwaToolbar branchId={branchId} surface="runner" />;
}
