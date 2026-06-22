"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell as IconBell,
  BellOff as IconBellOff,
  Send as IconSend,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui/lib/utils";
import { notify } from "@comtammatu/ui/lib/notify";
import {
  areNotificationPopupsEnabled,
  setNotificationPopupsMuted,
} from "@lib/notifications/popup-preference";
import { messages } from "@lib/messages";

type PopupState =
  | "loading"
  | "unsupported"
  | "blocked"
  | "off"
  | "muted"
  | "enabled";

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function NotificationPopupControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const copy = messages.notifications.device;
  const [state, setState] = useState<PopupState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    if (Notification.permission !== "granted") {
      setState("off");
      return;
    }
    setState(areNotificationPopupsEnabled() ? "enabled" : "muted");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const status = useMemo(() => {
    switch (state) {
      case "enabled":
        return { label: copy.enabled, variant: "success" as const };
      case "muted":
        return { label: copy.muted, variant: "secondary" as const };
      case "blocked":
        return { label: copy.blocked, variant: "destructive" as const };
      case "unsupported":
        return { label: copy.unsupported, variant: "secondary" as const };
      case "off":
        return { label: copy.off, variant: "info" as const };
      default:
        return { label: copy.loading, variant: "secondary" as const };
    }
  }, [copy, state]);

  const enable = async () => {
    setBusy(true);
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      setNotificationPopupsMuted(false);
      // The popups render through the service worker; make sure it is
      // registered before declaring success.
      if (!(await navigator.serviceWorker.getRegistration())) {
        await navigator.serviceWorker.register("/sw.js");
      }
      notify.success(copy.enabledToast);
      refresh();
    } catch {
      notify.error(copy.enableFailed);
    } finally {
      setBusy(false);
    }
  };

  const disable = () => {
    setNotificationPopupsMuted(true);
    notify.success(copy.disabledToast);
    refresh();
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(copy.testTitle, {
        body: copy.testBody,
        icon: "/icons/icon-192.png",
        badge: "/icons/favicon-32x32.png",
        tag: "notification:test",
        data: { url: "/notifications" },
      });
      notify.success(copy.testSent);
    } catch {
      notify.error(copy.testFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        compact ? null : "rounded-md border bg-background p-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold">{copy.title}</p>
          {compact ? null : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {copy.description}
            </p>
          )}
        </div>
        <Badge variant={status.variant} className="shrink-0">
          {status.label}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {state === "enabled" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={disable}
            disabled={busy}
          >
            <IconBellOff data-icon="inline-start" />
            {copy.disable}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={enable}
            disabled={busy || state === "unsupported"}
          >
            <IconBell data-icon="inline-start" />
            {copy.enable}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={sendTest}
          disabled={busy || state !== "enabled"}
        >
          <IconSend data-icon="inline-start" />
          {copy.test}
        </Button>
      </div>
    </div>
  );
}
