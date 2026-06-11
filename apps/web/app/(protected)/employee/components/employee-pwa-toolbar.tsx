"use client";

import {
  Download as IconDownload,
  Share2 as IconShare,
  WifiOff as IconWifiOff,
  X as IconX,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
  useInstallPrompt,
  useIsIosPwaInstall,
  useIsOnline,
  useIsStandalone,
} from "@/components/pwa-runtime";
import { messages } from "@lib/messages";

type InstallHelpMode = "ios" | "browser";

export function EmployeePwaToolbar() {
  const copy = messages.employee.pwa;
  const isOnline = useIsOnline();
  const isStandalone = useIsStandalone();
  const isIosPwaInstall = useIsIosPwaInstall();
  const install = useInstallPrompt();
  const [installPending, setInstallPending] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [helpMode, setHelpMode] = useState<InstallHelpMode | null>(null);

  const hasBrowserPrompt = install != null && install.available;
  const installButtonLabel = installPending
    ? copy.installPending
    : copy.installButton;
  const helpCopy = useMemo(() => {
    if (helpMode === "ios") {
      return {
        title: copy.iosDialogTitle,
        description: copy.iosDialogDescription,
        steps: copy.iosSteps,
      };
    }

    return {
      title: copy.browserDialogTitle,
      description: copy.browserDialogDescription,
      steps: copy.browserSteps,
    };
  }, [copy, helpMode]);

  const handleInstall = useCallback(async () => {
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

  if (isStandalone && isOnline) return null;
  if (isOnline && installDismissed) return null;

  return (
    <>
      <div
        className="border-b border-border/60 bg-background/95 px-3 py-2 print:hidden"
        role="region"
        aria-label={copy.regionLabel}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2 lg:max-w-3xl">
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
                onClick={handleInstall}
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
                onClick={() => setInstallDismissed(true)}
                aria-label={copy.dismissLabel}
              >
                <IconX data-icon="inline-start" />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <Dialog
        open={helpMode != null}
        onOpenChange={(open) => {
          if (!open) setHelpMode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{helpCopy.title}</DialogTitle>
            <DialogDescription>{helpCopy.description}</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-2 text-sm leading-relaxed">
            {helpCopy.steps.map((step, index) => (
              <li key={step}>
                {index + 1}. {step}
              </li>
            ))}
          </ol>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {copy.close}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
