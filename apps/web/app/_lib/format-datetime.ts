/**
 * Định dạng thời gian theo múi giờ Asia/Ho_Chi_Minh.
 *
 * Server-rendered code (Next.js App Router) chạy trên Node — `new Date(...).toLocaleString("vi-VN", ...)`
 * không truyền `timeZone` sẽ render theo timezone tiến trình (mặc định UTC), gây lệch -7h
 * trên mọi báo cáo Finance / lịch sử ca POS / order detail. Mọi UI hiển thị thời gian
 * cho người dùng VN PHẢI dùng các helper trong file này.
 */

export const VN_TZ = "Asia/Ho_Chi_Minh";
const VN_LOCALE = "vi-VN";

interface VNDateParts {
  year: number;
  month: number;
  day: number;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function vnDateParts(value: string | Date = new Date()): VNDateParts {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return { year: 1970, month: 1, day: 1 };

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return { year: 1970, month: 1, day: 1 };
  }

  return { year, month, day };
}

function formatISODateParts(parts: VNDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

function parseISODateParts(dateStr: string): VNDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, year, month, day] = match;
  if (!year || !month || !day) return null;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

export function getVNDateString(value: string | Date = new Date()): string {
  return formatISODateParts(vnDateParts(value));
}

export function addVNDateDays(dateStr: string, days: number): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return getVNDateString();

  const noonVNAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    5,
    0,
    0,
  );
  const shifted = new Date(noonVNAsUtc + days * 24 * 60 * 60 * 1000);
  return getVNDateString(shifted);
}

export function getYesterdayVNDateString(value: string | Date = new Date()) {
  return addVNDateDays(getVNDateString(value), -1);
}

export function getVNMonthStartDateString(
  value: string | Date = new Date(),
): string {
  const parts = vnDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
}

export function getVNMonthYear(value: string | Date = new Date()): {
  year: number;
  month: number;
} {
  const parts = vnDateParts(value);
  return { year: parts.year, month: parts.month };
}

export function getVNDayUtcRange(dateStr: string): {
  startIso: string;
  endIso: string;
} {
  const parts = parseISODateParts(dateStr);
  const safeParts = parts ?? vnDateParts();
  const start = new Date(
    Date.UTC(safeParts.year, safeParts.month - 1, safeParts.day, -7, 0, 0),
  );
  const end = new Date(
    Date.UTC(safeParts.year, safeParts.month - 1, safeParts.day + 1, -7, 0, 0),
  );

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** dd/MM/yyyy HH:mm (Asia/Ho_Chi_Minh) — mặc định cho mọi UI list/detail. */
export function formatVNDateTime(
  value: string | Date | null | undefined,
  dash = "—",
): string {
  const d = toDate(value);
  if (!d) return dash;
  return d.toLocaleString(VN_LOCALE, {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** dd/MM/yyyy HH:mm:ss — dùng cho audit trail / log nhạy giây. */
export function formatVNDateTimeWithSeconds(
  value: string | Date | null | undefined,
  dash = "—",
): string {
  const d = toDate(value);
  if (!d) return dash;
  return d.toLocaleString(VN_LOCALE, {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** dd/MM/yyyy. */
export function formatVNDate(
  value: string | Date | null | undefined,
  dash = "—",
): string {
  const d = toDate(value);
  if (!d) return dash;
  return d.toLocaleDateString(VN_LOCALE, {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** HH:mm. */
export function formatVNTime(
  value: string | Date | null | undefined,
  dash = "—",
): string {
  const d = toDate(value);
  if (!d) return dash;
  return d.toLocaleTimeString(VN_LOCALE, {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}
