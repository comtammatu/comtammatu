import { readDevicePref, writeDevicePref } from "@lib/device-prefs";

const MUTED_KEY = "ctmt:notify-popups-muted";

/** Popups are on unless this device has been explicitly muted. */
export function areNotificationPopupsEnabled(): boolean {
  return readDevicePref(MUTED_KEY) !== "1";
}

export function setNotificationPopupsMuted(muted: boolean): void {
  writeDevicePref(MUTED_KEY, muted ? "1" : "0");
}
