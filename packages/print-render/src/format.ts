/**
 * Formatting helpers mirroring the SQL print_template_* formatters
 * (print_template_money, _hhmm, _datetime, _duration, _diff_sign).
 */

import { formatCount, formatVND } from "@comtammatu/shared/format";
import {
  formatVNDateTime,
  formatVNDurationMinutes,
  formatVNTime,
} from "@comtammatu/shared/time";
import type { PrintDocumentBlock } from "./print-document";

const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_TIME_ZONE_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function normalizeVNPrintTimestamp(value: string): string {
  return ISO_TIME_ZONE_PATTERN.test(value) ? value : `${value}+07:00`;
}

function toPrintDate(value: string): Date {
  return new Date(
    ISO_DATETIME_PATTERN.test(value) ? normalizeVNPrintTimestamp(value) : value,
  );
}

export const fmtInt = (n: number | null | undefined): string =>
  formatCount(n ?? 0);

export const fmtMoney = (n: number | null | undefined): string =>
  formatVND(n ?? 0);

export const hhmm = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return ISO_DATETIME_PATTERN.test(iso)
    ? formatVNTime(normalizeVNPrintTimestamp(iso), iso)
    : iso;
};

export const datetime = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return ISO_DATETIME_PATTERN.test(iso)
    ? formatVNDateTime(normalizeVNPrintTimestamp(iso), iso)
    : iso;
};

export const duration = (
  openedIso: string | null | undefined,
  closedIso: string | null | undefined,
): string => {
  if (!openedIso || !closedIso) return "";
  const ms = toPrintDate(closedIso).getTime() - toPrintDate(openedIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return formatVNDurationMinutes(Math.round(ms / 60_000), "");
};

export const diffSign = (n: number): string =>
  n === 0 ? "OK" : n > 0 ? "THỪA" : "THIẾU";

type TextOpts = {
  align?: "left" | "center" | "right";
  bold?: boolean;
  double?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
};

export const textBlock = (
  value: string,
  opts: TextOpts = {},
): PrintDocumentBlock => ({ type: "text", text: value, ...opts });

export const rowBlock = (
  left: string,
  right = "",
  opts: { bold?: boolean; double?: boolean; strikethrough?: boolean } = {},
): PrintDocumentBlock => ({ type: "row", left, right, ...opts });

export const dividerBlock = (char = "-"): PrintDocumentBlock => ({
  type: "divider",
  char,
});

export const spacerBlock = (lines = 1): PrintDocumentBlock => ({
  type: "spacer",
  lines,
});
