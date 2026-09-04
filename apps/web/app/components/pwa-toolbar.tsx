"use client";

import {
  Download as IconDownload,
  LayoutGrid as IconLayoutGrid,
  RefreshCw as IconRefreshCw,
  Share2 as IconShare,
  WifiOff as IconWifiOff,
  X as IconX,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@comtammatu/ui/components/button";
import { PwaInstallHelpDialog } from "@/components/pwa-install-help-dialog";
import {
  useHasNewVersion,
  useInstallPrompt,
  useIsIosPwaInstall,
  useIsOnline,
  useIsStandalone,
} from "@/components/pwa-runtime";

export interface PwaToolbarCopy {
  regionLabel: string;
  offline: string;
  iosInstallHint: string;
  iosInstallHintShort: string;
  installHint: string;
  installHintShort: string;
  installButton: string;
  /** Swaps in while an install prompt is pending. Contained layout only. */
  installPendingLabel?: string;
  installButtonShort: string;
  installButtonAria: string;
  dismissLabel: string;
  iosDialogTitle: string;
  iosDialogDescription: string;
  iosSteps: readonly string[];
  /** Browser (non-iOS) manual install steps. Contained layout only. */
  browserDialogTitle?: string;
  browserDialogDescription?: string;
  browserSteps?: readonly string[];
  close: string;
  /** Update-available banner copy. Both layouts; omit only if the surface has no reload path. */
  updateHint?: string;
  updateButton?: string;
}

export interface PwaToolbarProps {
  copy: PwaToolbarCopy;
  /**
   * "contained" = operator portal and `/me` personnel shell:
   * centers at max-w-lg/lg:max-w-3xl, sm: breakpoints, always offers a
   * manual-install fallback, shows an undismissable update banner, hides
   * fully once installed+online with no pending update. "full-bleed" = the
   * Operations (POS/KDS/pickup) toolbar: edge-to-edge bar, md: breakpoints,
   * install row only when a real install path exists, shows the same
   * undismissable update banner, and otherwise gets out of the operational
   * screen.
   */
  layout: "contained" | "full-bleed";
  /** Persist the install-dismiss flag under this key; omit to skip persistence. */
  dismissStorageKey?: string;
  /** Leading entry-link button for active full-bleed banners. */
  entryLink?: ReactNode;
}

/**
 * Canonical install/offline/update PWA toolbar (design-system.md § B). Single
 * source for the Operations (POS/KDS/pickup) and operator portal toolbars:
 * shares the online/standalone/install-prompt state and handlers, and renders
 * each layout's exact pre-extraction markup so both consumers keep identical
 * update/offline behavior.
 */
export function PwaToolbar({
  copy,
  layout,
  dismissStorageKey,
  entryLink,
}: PwaToolbarProps) {
  const isOnline = useIsOnline();
  const isStandalone = useIsStandalone();
  const isIosPwaInstall = useIsIosPwaInstall();
  const hasNewVersion = useHasNewVersion();
  const install = useInstallPrompt();
  const [installPending, setInstallPending] = useState(false);
  const [helpMode, setHelpMode] = useState<"ios" | "browser" | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  // Hydrate dismiss flag from localStorage. Only the install hint can be
  // dismissed — offline alert always shows because it's a critical state.
  useEffect(() => {
    if (!dismissStorageKey || typeof window === "undefined") return;
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

  const handleDismiss = useCallback(() => {
    setInstallDismissed(true);
    if (!dismissStorageKey) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(dismissStorageKey, "true");
      }
    } catch {
      // ignore
    }
  }, [dismissStorageKey]);

  // Full-bleed (Operations): only the iOS help dialog is offered — there is
  // no browser-manual-install fallback copy.
  const handleInstallFullBleed = useCallback(async () => {
    if (installPending) return;
    if (install == null || !install.available) {
      if (isIosPwaInstall) setHelpMode("ios");
      return;
    }
    setInstallPending(true);
    try {
      await install.prompt();
    } finally {
      setInstallPending(false);
    }
  }, [install, installPending, isIosPwaInstall]);

  // Contained: always falls back to a help dialog (iOS or
  // browser-manual steps) when there is no captured browser prompt.
  const handleInstallContained = useCallback(async () => {
    if (installPending) return;
    if (hasBrowserPrompt && install != null) {
      setInstallPending(true);
      try {
        await install.prompt();
      } finally {
        setInstallPending(false);
      }
      return;
    }
    setHelpMode(isIosPwaInstall ? "ios" : "browser");
  }, [hasBrowserPrompt, install, installPending, isIosPwaInstall]);

  const helpCopy = useMemo(() => {
    if (helpMode === "ios") {
      return {
        title: copy.iosDialogTitle,
        description: copy.iosDialogDescription,
        steps: copy.iosSteps,
      };
    }
    return {
      title: copy.browserDialogTitle ?? "",
      description: copy.browserDialogDescription ?? "",
      steps: copy.browserSteps ?? [],
    };
  }, [copy, helpMode]);

  const helpDialog = (
    <PwaInstallHelpDialog
      open={helpMode != null}
      onOpenChange={(open) => {
        if (!open) setHelpMode(null);
      }}
      title={helpCopy.title}
      description={helpCopy.description}
      steps={helpCopy.steps}
      closeLabel={copy.close}
    />
  );

  if (layout === "full-bleed") {
    // The update banner is the one row that must ALSO show in standalone —
    // installed tablets running a whole shift are exactly the clients that
    // break on a stale chunk after a deploy. It cannot be dismissed.
    if (hasNewVersion && copy.updateHint && copy.updateButton) {
      return (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-2 py-2 md:px-4"
          role="region"
          aria-label={copy.regionLabel}
        >
          {entryLink}
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
      return null;
    }

    return (
      <>
        <div
          className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-2 py-2 md:px-4"
          role="region"
          aria-label={copy.regionLabel}
        >
          {entryLink}
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
                {isIosPwaInstall ? copy.iosInstallHint : copy.installHint}
              </span>
              <span className="truncate md:hidden">
                {isIosPwaInstall
                  ? copy.iosInstallHintShort
                  : copy.installHintShort}
              </span>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="shrink-0 text-sm font-semibold"
            onClick={handleInstallFullBleed}
            disabled={!installAvailable || installPending}
            aria-label={copy.installButtonAria}
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
        {helpDialog}
      </>
    );
  }

  // Contained (operator portal).
  // Same as full-bleed: the update row must also show in standalone. Installed
  // operator tabs running across a deploy hit ChunkLoadError after skipWaiting.
  if (hasNewVersion && copy.updateHint && copy.updateButton) {
    return (
      <div
        className="border-b border-border/60 bg-background/95 px-3 py-2 print:hidden"
        role="region"
        aria-label={copy.regionLabel}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
          <div
            className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground"
            role="alert"
          >
            <IconRefreshCw className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{copy.updateHint}</span>
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
      </div>
    );
  }

  if (isStandalone && isOnline) return null;
  if (isOnline && installDismissed) return null;

  const installButtonLabel = installPending
    ? (copy.installPendingLabel ?? copy.installButton)
    : copy.installButton;

  return (
    <>
      <div
        className="border-b border-border/60 bg-background/95 px-3 py-2 print:hidden"
        role="region"
        aria-label={copy.regionLabel}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
          {!isOnline ? (
            <div
              className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-destructive"
              role="alert"
            >
              <IconWifiOff className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{copy.offline}</span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm sm:font-semibold sm:text-foreground">
              {isIosPwaInstall && !hasBrowserPrompt ? (
                <IconShare className="size-4 shrink-0" />
              ) : (
                <IconDownload className="size-4 shrink-0" />
              )}
              <span className="hidden min-w-0 truncate sm:inline">
                {isIosPwaInstall ? copy.iosInstallHint : copy.installHint}
              </span>
              <span className="min-w-0 truncate sm:hidden">
                {isIosPwaInstall
                  ? copy.iosInstallHintShort
                  : copy.installHintShort}
              </span>
            </div>
          )}
          {isOnline ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="shrink-0 text-sm font-semibold"
                onClick={handleInstallContained}
                disabled={installPending}
                aria-label={copy.installButtonAria}
              >
                {isIosPwaInstall && !hasBrowserPrompt ? (
                  <IconShare data-icon="inline-start" />
                ) : (
                  <IconDownload data-icon="inline-start" />
                )}
                <span className="sm:hidden">{copy.installButtonShort}</span>
                <span className="hidden sm:inline">{installButtonLabel}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="shrink-0 px-3 text-muted-foreground"
                onClick={handleDismiss}
                aria-label={copy.dismissLabel}
              >
                <IconX data-icon="inline-start" />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {helpDialog}
    </>
  );
}

export function PwaToolbarEntryLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-touch"
      className="shrink-0 text-muted-foreground"
      render={<Link href={href} aria-label={label} />}
    >
      <IconLayoutGrid />
    </Button>
  );
}
