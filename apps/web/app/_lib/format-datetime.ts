/**
 * Định dạng thời gian theo múi giờ Asia/Ho_Chi_Minh.
 *
 * Server-rendered code (Next.js App Router) chạy trên Node — `new Date(...).toLocaleString("vi-VN", ...)`
 * không truyền `timeZone` sẽ render theo timezone tiến trình (mặc định UTC), gây lệch -7h
 * trên mọi báo cáo Finance / lịch sử ca POS / order detail. Mọi UI hiển thị thời gian
 * cho người dùng VN PHẢI dùng các helper trong file này.
 */

const VN_TZ = "Asia/Ho_Chi_Minh";
const VN_LOCALE = "vi-VN";

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
