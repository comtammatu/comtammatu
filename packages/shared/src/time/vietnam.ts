export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const VN_LOCALE = "vi-VN";
export const VN_UTC_OFFSET_HOURS = 7;
export const VN_UTC_OFFSET_MS = VN_UTC_OFFSET_HOURS * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface VNDateParts {
  year: number;
  month: number;
  day: number;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseISODateParts(dateStr: string): VNDateParts | null {
  const match = ISO_DATE_PATTERN.exec(dateStr);
  if (!match) return null;
  const [, year, month, day] = match;
  if (!year || !month || !day) return null;

  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31
  ) {
    return null;
  }
  return parts;
}

export function formatISODateParts(parts: VNDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

function vnNoonUtc(parts: VNDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 5, 0, 0));
}

export function getVNDateParts(
  value: string | number | Date = new Date(),
): VNDateParts {
  const date = toDate(value);
  if (!date) return { year: 1970, month: 1, day: 1 };

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return { year: 1970, month: 1, day: 1 };
  }

  return { year, month, day };
}

export function getVNDateString(
  value: string | number | Date = new Date(),
): string {
  return formatISODateParts(getVNDateParts(value));
}

export function addVNDateDays(dateStr: string, days: number): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return getVNDateString();
  return getVNDateString(
    new Date(vnNoonUtc(parts).getTime() + days * MS_PER_DAY),
  );
}

export function getYesterdayVNDateString(
  value: string | number | Date = new Date(),
): string {
  return addVNDateDays(getVNDateString(value), -1);
}

export function getVNDateStringDaysAgo(
  daysAgo: number,
  value: string | number | Date = new Date(),
): string {
  return addVNDateDays(getVNDateString(value), -daysAgo);
}

export function getVNMonthStartDateString(
  value: string | number | Date = new Date(),
): string {
  const parts = getVNDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
}

export function getVNMonthEndDateString(year: number, month: number): string {
  return getVNDateString(new Date(Date.UTC(year, month, 0, 5, 0, 0)));
}

export function getVNMonthYear(value: string | number | Date = new Date()): {
  year: number;
  month: number;
} {
  const parts = getVNDateParts(value);
  return { year: parts.year, month: parts.month };
}

export function getVNMonthString(
  value: string | number | Date = new Date(),
): string {
  const { year, month } = getVNMonthYear(value);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftVNMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const targetMonth0 = month - 1 + delta;
  const targetYear = year + Math.floor(targetMonth0 / 12);
  let targetMonth = (targetMonth0 % 12) + 1;
  if (targetMonth <= 0) targetMonth += 12;
  return { year: targetYear, month: targetMonth };
}

export function getVNMonthSequenceBack(
  count: number,
  value: string | number | Date = new Date(),
): Array<{ year: number; month: number; date: string }> {
  const current = getVNMonthYear(value);
  return Array.from({ length: count }, (_, index) => {
    const shifted = shiftVNMonth(current.year, current.month, -index);
    return {
      ...shifted,
      date: `${shifted.year}-${String(shifted.month).padStart(2, "0")}-01`,
    };
  });
}

export function getVNWeekStartDateString(
  value: string | number | Date = new Date(),
): string {
  const today = getVNDateParts(value);
  const day = vnNoonUtc(today).getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addVNDateDays(formatISODateParts(today), diff);
}

export function getVNWeekEndDateString(weekStartDate: string): string {
  return addVNDateDays(weekStartDate, 6);
}

export function getVNDayUtcRange(dateStr: string): {
  startIso: string;
  endIso: string;
} {
  const parts = parseISODateParts(dateStr) ?? getVNDateParts();
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -7));
  const end = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + 1, -7),
  );

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function diffVNDateDays(fromDate: string, toDate: string): number {
  const from = parseISODateParts(fromDate);
  const to = parseISODateParts(toDate);
  if (!from || !to) return 0;
  return Math.floor(
    (vnNoonUtc(to).getTime() - vnNoonUtc(from).getTime()) / MS_PER_DAY,
  );
}

export function formatVNBusinessDate(
  value: string | null | undefined,
  dash = "—",
): string {
  if (!value) return dash;
  const parts = parseISODateParts(value);
  if (!parts) return value;
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(
    2,
    "0",
  )}/${parts.year}`;
}

export function formatVNShortBusinessDate(
  value: string | null | undefined,
  dash = "—",
): string {
  if (!value) return dash;
  const parts = parseISODateParts(value);
  if (!parts) return value;
  return `${parts.day}/${parts.month}`;
}

export function formatVNDateTime(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatVNDateTimeWithSeconds(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatVNDate(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleDateString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatVNLongDate(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleDateString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatVNTime(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleTimeString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}
