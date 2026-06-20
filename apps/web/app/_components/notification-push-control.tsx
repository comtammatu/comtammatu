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
  getPushRegistrationState,
  removePushSubscription,
  savePushSubscription,
  sendTestPushNotification,
  type PushRegistrationState,
} from "@/_actions/notifications";
import { messages } from "@lib/messages";

type BrowserPushState =
  | "loading"
  | "unsupported"
  | "not-configured"
  | "blocked"
  | "ready"
  | "enabled";

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index++) {
    output[index] = raw.charCodeAt(index);
  }
  return buffer;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function getDeviceLabel(): string {
  const userAgent = navigator.userAgent;
  if (/iPhone/i.test(userAgent)) return "iPhone PWA";
  if (/iPad/i.test(userAgent)) return "iPad PWA";
  if (/Android/i.test(userAgent)) return "Android PWA";
  return "Web PWA";
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

function getSubscriptionKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys.auth) return null;
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  };
}

export function NotificationPushControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const copy = messages.notifications.push;
  const [state, setState] = useState<BrowserPushState>("loading");
  const [serverState, setServerState] = useState<PushRegistrationState | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }

    const result = await getPushRegistrationState();
    if (!result.success || !result.data) {
      setState("not-configured");
      return;
    }

    setServerState(result.data);
    if (!result.data.configured || !result.data.publicKey) {
      setState("not-configured");
      return;
    }

    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setState(subscription ? "enabled" : "ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = useMemo(() => {
    switch (state) {
      case "enabled":
        return { label: copy.enabled, variant: "success" as const };
      case "blocked":
        return { label: copy.blocked, variant: "destructive" as const };
      case "unsupported":
        return { label: copy.unsupported, variant: "secondary" as const };
      case "not-configured":
        return { label: copy.notConfigured, variant: "warning" as const };
      case "ready":
        return { label: copy.ready, variant: "info" as const };
      default:
        return { label: copy.loading, variant: "secondary" as const };
    }
  }, [copy, state]);

  const enable = async () => {
    if (!serverState?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "ready");
        return;
      }

      const registration = await getServiceWorkerRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToArrayBuffer(serverState.publicKey),
        }));
      const payload = getSubscriptionKeys(subscription);
      if (!payload) {
        notify.error(copy.enableFailed);
        return;
      }

      const result = await savePushSubscription({
        ...payload,
        userAgent: navigator.userAgent,
        deviceLabel: getDeviceLabel(),
      });
      if (!result.success) {
        notify.error(result.error ?? copy.enableFailed);
        return;
      }
      notify.success(copy.enabledToast);
      await refresh();
    } catch {
      notify.error(copy.enableFailed);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      if (subscription) await subscription.unsubscribe();
      if (endpoint) await removePushSubscription({ endpoint });
      notify.success(copy.disabledToast);
      await refresh();
    } catch {
      notify.error(copy.disableFailed);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const result = await sendTestPushNotification();
      if (!result.success) {
        notify.error(result.error ?? copy.testFailed);
        return;
      }
      notify.success(copy.testSent);
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
            disabled={
              busy || state === "unsupported" || state === "not-configured"
            }
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
