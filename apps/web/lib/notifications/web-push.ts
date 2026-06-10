import "server-only";

import webpush from "web-push";

export type WebPushSubscriptionRecord = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushNotificationSource = {
  id: number;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  action_url: string | null;
  created_at: string;
};

export type NotificationPushPayload = {
  title: string;
  body?: string;
  icon: string;
  badge: string;
  tag: string;
  data: {
    notificationId: number;
    kind: string;
    severity: string;
    url: string;
    createdAt: string;
  };
};

export type WebPushSendResult =
  | { success: true }
  | {
      success: false;
      expired: boolean;
      statusCode: number | null;
      error: string;
    };

let vapidConfigured = false;

function readVapidConfig() {
  const publicKey = process.env["WEB_PUSH_VAPID_PUBLIC_KEY"]?.trim() ?? "";
  const privateKey = process.env["WEB_PUSH_VAPID_PRIVATE_KEY"]?.trim() ?? "";
  const subject =
    process.env["WEB_PUSH_SUBJECT"]?.trim() ||
    process.env["NEXT_PUBLIC_APP_URL"]?.trim() ||
    "mailto:ops@comtammatu.local";

  return { publicKey, privateKey, subject };
}

function ensureVapidConfigured(): ReturnType<typeof readVapidConfig> | null {
  const config = readVapidConfig();
  if (!config.publicKey || !config.privateKey) return null;

  if (!vapidConfigured) {
    webpush.setVapidDetails(
      config.subject,
      config.publicKey,
      config.privateKey,
    );
    vapidConfigured = true;
  }

  return config;
}

export function getWebPushPublicConfig() {
  const { publicKey, privateKey } = readVapidConfig();
  return {
    configured: Boolean(publicKey && privateKey),
    publicKey: publicKey || null,
  };
}

export function buildNotificationPushPayload(
  notification: WebPushNotificationSource,
): NotificationPushPayload {
  const url = notification.action_url || "/notifications";
  return {
    title: notification.title,
    ...(notification.body ? { body: notification.body } : {}),
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32x32.png",
    tag: `notification:${notification.id}`,
    data: {
      notificationId: notification.id,
      kind: notification.kind,
      severity: notification.severity,
      url,
      createdAt: notification.created_at,
    },
  };
}

function getStatusCode(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function sendWebPushNotification(
  subscription: WebPushSubscriptionRecord,
  payload: NotificationPushPayload,
): Promise<WebPushSendResult> {
  const config = ensureVapidConfigured();
  if (!config) {
    return {
      success: false,
      expired: false,
      statusCode: null,
      error: "web_push_not_configured",
    };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      {
        TTL: 60 * 60,
        urgency: payload.data.severity === "critical" ? "high" : "normal",
      },
    );
    return { success: true };
  } catch (error: unknown) {
    const statusCode = getStatusCode(error);
    return {
      success: false,
      expired: statusCode === 404 || statusCode === 410,
      statusCode,
      error: getErrorMessage(error).slice(0, 500),
    };
  }
}
