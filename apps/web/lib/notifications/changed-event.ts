/** Same-tab signal so shell badges refresh after mark-read without waiting for Realtime. */
export const NOTIFICATIONS_CHANGED_EVENT = "ctmt:notifications-changed";

export function emitNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
