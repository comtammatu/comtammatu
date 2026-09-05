/** Same-tab and cross-tab signal so shell badges refresh after mark-read without waiting for Realtime. */
export const NOTIFICATIONS_CHANGED_EVENT = "ctmt:notifications-changed";

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel("ctmt:notifications");
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === NOTIFICATIONS_CHANGED_EVENT) {
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
        }
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

export function initNotificationSync(): void {
  if (typeof window === "undefined") return;
  getBroadcastChannel();
}

export function emitNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  try {
    const channel = getBroadcastChannel();
    channel?.postMessage({ type: NOTIFICATIONS_CHANGED_EVENT });
  } catch {
    // Ignore cross-tab broadcast failure
  }
}
