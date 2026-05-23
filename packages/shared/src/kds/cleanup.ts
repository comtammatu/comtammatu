import { getVNDateString } from "../time/vietnam";

export const KDS_ACTIVE_TICKET_STATUSES = [
  "pending",
  "preparing",
  "ready",
] as const;

export const KDS_CLEANUP_RETENTION_HOURS = 6;
export const KDS_CLEANUP_RETENTION_MS =
  KDS_CLEANUP_RETENTION_HOURS * 60 * 60 * 1000;

export function getKdsCleanupCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - KDS_CLEANUP_RETENTION_MS).toISOString();
}

export function getKdsResetBeforeLocalDate(now: Date = new Date()): string {
  return getVNDateString(now);
}
