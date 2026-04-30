/**
 * Tenant-timezone-aware date/time helpers.
 *
 * Rationale: every formatting path in the app must take an explicit IANA
 * timezone (e.g. `Asia/Ho_Chi_Minh`) supplied by the tenant config. NEVER
 * rely on the host's clock — a cashier on a Windows box configured to
 * UTC-7 must still see Vietnamese local time on receipts.
 *
 * These helpers therefore:
 *   1. Refuse to read `process.env.TZ`, `Intl.DateTimeFormat()` zero-arg, or
 *      `Date#getTimezoneOffset` — the `tz` parameter is always required.
 *   2. Use the platform `Intl` API (no extra deps); pin `hourCycle: "h23"`
 *      and a deterministic locale so SSR/CSR produce identical strings.
 */

import { DEFAULT_TENANT_TIMEZONE } from "../auth/types";

export { DEFAULT_TENANT_TIMEZONE };

export type DateLike = Date | string | number;

function toDate(input: DateLike): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Format a date in the given tenant timezone. Wraps `Intl.DateTimeFormat`
 * with deterministic defaults (`vi-VN`, `h23`, no auto-tz).
 */
export function formatInTz(
  input: DateLike,
  tz: string,
  options: Intl.DateTimeFormatOptions = {},
  locale = "vi-VN",
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hourCycle: "h23",
    ...options,
  }).format(toDate(input));
}

/**
 * `dd/MM/yyyy HH:mm` — the canonical receipt + audit display.
 * Composed manually because `Intl` with `vi-VN` orders time before date,
 * which doesn't match Vietnamese receipt convention.
 */
export function formatDateTimeVN(input: DateLike, tz: string): string {
  return `${formatDateVN(input, tz)} ${formatTimeVN(input, tz)}`;
}

/** `dd/MM/yyyy` — for date-only display (payroll period, audit row). */
export function formatDateVN(input: DateLike, tz: string): string {
  return formatInTz(input, tz, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** `HH:mm` — for clock-in/out display where the date is implied. */
export function formatTimeVN(input: DateLike, tz: string): string {
  return formatInTz(input, tz, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Returns YYYY-MM-DD in the given timezone. Uses `en-CA` locale because it
 * always produces ISO-shaped output (`2026-04-30`).
 */
export function todayInTz(tz: string, now: DateLike = new Date()): string {
  return formatInTz(now, tz, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }, "en-CA");
}

/**
 * Returns the {y, m, d, H, M, S} components of `input` evaluated in `tz`.
 * Used internally by start/end-of-day helpers; exported for callers that
 * need to compose other ranges (e.g. start-of-month).
 */
export function getZonedParts(input: DateLike, tz: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(toDate(input));
  const lookup = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number.parseInt(part.value, 10) : 0;
  };
  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

/**
 * Convert a wall-clock instant in `tz` to a UTC `Date`. Used to compose
 * day/month boundaries that match the tenant's local calendar.
 */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): Date {
  // Strategy: build a naive UTC timestamp, measure how `tz` interprets it,
  // then offset by the difference. Robust across DST without external libs.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = getZonedParts(new Date(utcGuess), tz);
  const tzAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = tzAsUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Start-of-day (00:00:00 local) for the given date, returned as a UTC Date. */
export function startOfDayInTz(input: DateLike, tz: string): Date {
  const { year, month, day } = getZonedParts(input, tz);
  return zonedWallClockToUtc(year, month, day, 0, 0, 0, tz);
}

/** End-of-day = next-day 00:00:00 local — exclusive upper bound. */
export function endOfDayInTz(input: DateLike, tz: string): Date {
  const start = startOfDayInTz(input, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Start-of-month (1st @ 00:00:00 local), returned as a UTC Date. */
export function startOfMonthInTz(input: DateLike, tz: string): Date {
  const { year, month } = getZonedParts(input, tz);
  return zonedWallClockToUtc(year, month, 1, 0, 0, 0, tz);
}
