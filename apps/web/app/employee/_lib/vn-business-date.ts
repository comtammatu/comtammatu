import {
  formatTimeVN as formatTimeInTz,
  todayInTz,
} from "@comtammatu/shared/datetime";

/**
 * Today's YYYY-MM-DD in the tenant timezone (callers pass tz from
 * `useTenantTimezone()` on client or `claims.tenant_timezone` on server).
 *
 * Never reads the host clock — a Windows box on UTC-7 still produces the
 * correct VN business date.
 */
export function getTodayVN(tz: string): string {
  return todayInTz(tz);
}

/** Monday of the ISO week containing the given date, computed in UTC. */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Format a Date as YYYY-MM-DD using its UTC components. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format an ISO timestamp as `HH:MM` in tenant tz. */
export function formatTimeVN(iso: string, tz: string): string {
  return formatTimeInTz(iso, tz);
}

/**
 * Format a YYYY-MM-DD calendar date as DD/MM/YYYY. Pure string transform —
 * timezone-agnostic, since the input is already a calendar date.
 */
export function formatDateVN(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}
