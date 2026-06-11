/**
 * Formatting helpers mirroring the SQL print_template_* formatters
 * (print_template_money, _hhmm, _datetime, _duration, _diff_sign).
 */

import type { PrintDocumentBlock } from "./print-document";

export const fmtInt = (n: number | null | undefined): string =>
  String(Math.round(typeof n === "number" && Number.isFinite(n) ? n : 0));

export const fmtMoney = (n: number | null | undefined): string =>
  new Intl.NumberFormat("vi-VN").format(
    Math.round(typeof n === "number" && Number.isFinite(n) ? n : 0),
  ) + "đ";

export const hhmm = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : iso;
};

export const datetime = (iso: string | null | undefined): string => {
  if (!iso) return "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return iso;
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};

export const duration = (
  openedIso: string | null | undefined,
  closedIso: string | null | undefined,
): string => {
  if (!openedIso || !closedIso) return "";
  const ms = new Date(closedIso).getTime() - new Date(openedIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
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
