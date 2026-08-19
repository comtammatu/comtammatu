export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const VN_LOCALE = "vi-VN";

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

export interface VNMonthCalendarCell {
  date: string | null;
  day: number | null;
  isToday: boolean;
}

export function getVNMonthCalendarCells(
  monthStart: string,
  today = getVNDateString(),
): VNMonthCalendarCell[] {
  const parts = parseISODateParts(monthStart);
  if (!parts) {
    return getVNMonthCalendarCells(getVNMonthStartDateString(), today);
  }

  const firstDate = new Date(Date.UTC(parts.year, parts.month - 1, 1, 5, 0, 0));
  const mondayFirstOffset = (firstDate.getUTCDay() + 6) % 7;
  const daysInMonth = Number(
    getVNMonthEndDateString(parts.year, parts.month).slice(-2),
  );
  const totalCells = Math.max(
    35,
    Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7,
  );

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - mondayFirstOffset + 1;
    if (day < 1 || day > daysInMonth) {
      return { date: null, day: null, isToday: false };
    }

    const date = formatISODateParts({ ...parts, day });
    return { date, day, isToday: date === today };
  });
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

/** Matches inventory_shift_key / branch_day 04:00 local cut-off (VN wall clock). */
export const VN_BUSINESS_DAY_CUTOFF_HOUR = 4;

/**
 * Business date for a timestamp: before 04:00 VN belongs to the previous calendar day.
 * Does not change getVNDateString (calendar midnight).
 */
export function getVNBusinessDateString(
  value: string | number | Date = new Date(),
): string {
  const date = toDate(value) ?? new Date();
  const parts = getVNDateParts(date);
  if (getVNMinutesOfDay(date) < VN_BUSINESS_DAY_CUTOFF_HOUR * 60) {
    return addVNDateDays(formatISODateParts(parts), -1);
  }
  return formatISODateParts(parts);
}

/** UTC bounds for business date D: [D 04:00 VN, (D+1) 04:00 VN). */
export function getVNBusinessDayUtcRange(dateStr: string): {
  startIso: string;
  endIso: string;
} {
  const parts = parseISODateParts(dateStr) ?? getVNDateParts();
  const start = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      VN_BUSINESS_DAY_CUTOFF_HOUR - 7,
    ),
  );
  const end = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + 1,
      VN_BUSINESS_DAY_CUTOFF_HOUR - 7,
    ),
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

export function formatVNWeekdayShort(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleDateString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    weekday: "short",
  });
}

export function formatVNDayMonth(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleDateString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
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

export function formatVNTimeSeconds(
  value: string | number | Date | null | undefined,
  dash = "—",
): string {
  const date = toDate(value);
  if (!date) return dash;
  return date.toLocaleTimeString(VN_LOCALE, {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

export function formatVNClockTime(
  value: string | null | undefined,
  dash = "—",
): string {
  if (!value) return dash;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return dash;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] == null ? 0 : Number(match[3]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return dash;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatVNDurationMinutes(
  totalMinutes: number,
  dash = "—",
): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return dash;
  const minutes = Math.floor(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} phút`;
  if (remainder === 0) return `${hours} giờ`;
  return `${hours} giờ ${String(remainder).padStart(2, "0")} phút`;
}

export function formatVNDuration(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined,
  dash = "—",
): string {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return dash;
  return formatVNDurationMinutes(
    (endDate.getTime() - startDate.getTime()) / 60_000,
    dash,
  );
}

/**
 * Compact elapsed duration for POS tables, order cards, and pending queues.
 * Examples: "Vừa xong", "25p", "1h 15p", "2h".
 */
export function formatVNElapsedCompact(
  start: string | number | Date | null | undefined,
  now: string | number | Date = new Date(),
): string | null {
  const startDate = toDate(start);
  const nowDate = toDate(now);
  if (!startDate || !nowDate) return null;
  const diffMinutes = Math.max(
    0,
    Math.floor((nowDate.getTime() - startDate.getTime()) / 60_000),
  );
  if (diffMinutes < 1) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes}p`;
  const hours = Math.floor(diffMinutes / 60);
  const remainder = diffMinutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}p` : `${hours}h`;
}

/** Wall-clock minutes since VN midnight (0–1439) for the given instant. */
export function getVNMinutesOfDay(
  value: string | number | Date = new Date(),
): number {
  const date = toDate(value);
  if (!date) return 0;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  // hour12:false can emit "24" for midnight in some engines → normalise.
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

/** Format minutes since midnight (wraps 1440) as `HH:MM`. */
export function formatMinutesOfDay(totalMinutes: number, dash = "—"): string {
  if (!Number.isFinite(totalMinutes)) return dash;
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Parse a "HH:MM" / "HH:MM:SS" clock string to minutes since midnight. */
export function parseClockTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] == null ? 0 : Number(match[3]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

/**
 * Whether `nowMin` (minutes since midnight) falls inside a shift window
 * [startMin − graceMin, endMin + graceMin]. Overnight shifts (endMin <= startMin,
 * e.g. 18:00–02:00) are unwrapped past midnight, and `nowMin` is also tested one
 * day forward so an early-morning clock-in matches an evening-start shift. Grace
 * only ever widens the window — a rostered employee is never wrongly blocked.
 */
export function isWithinShiftWindow(
  nowMin: number,
  startMin: number,
  endMin: number,
  graceMin: number,
): boolean {
  const effectiveEnd = endMin > startMin ? endMin : endMin + 1440;
  const lo = startMin - graceMin;
  const hi = effectiveEnd + graceMin;
  return (
    (nowMin >= lo && nowMin <= hi) ||
    (nowMin + 1440 >= lo && nowMin + 1440 <= hi)
  );
}
