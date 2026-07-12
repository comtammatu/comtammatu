"use client";

import { usePathname } from "next/navigation";
import { PwaToolbar } from "@/components/pwa-toolbar";
import { useIsOnline } from "@/components/pwa-runtime";
import { messages } from "@lib/messages";

export function OperatorPwaToolbar() {
  const copy = messages.operator.pwa;
  const isOnline = useIsOnline();
  const isOperatorHome = /^\/br\/\d+\/?$/.test(usePathname());

  if (isOnline && !isOperatorHome) return null;

  return (
    <PwaToolbar
      layout="contained"
      dismissStorageKey="matu-operator-install-dismissed"
      copy={{
        regionLabel: copy.regionLabel,
        offline: copy.offline,
        iosInstallHint: copy.iosInstallHint,
        iosInstallHintShort: copy.iosInstallHintShort,
        installHint: copy.installHint,
        installHintShort: copy.installHintShort,
        installButton: copy.installButton,
        installPendingLabel: copy.installPending,
        installButtonShort: copy.installButtonShort,
        installButtonAria: copy.installButtonAria,
        dismissLabel: copy.dismissLabel,
        iosDialogTitle: copy.iosDialogTitle,
        iosDialogDescription: copy.iosDialogDescription,
        iosSteps: copy.iosSteps,
        browserDialogTitle: copy.browserDialogTitle,
        browserDialogDescription: copy.browserDialogDescription,
        browserSteps: copy.browserSteps,
        close: copy.close,
      }}
    />
  );
}
