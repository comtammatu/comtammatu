import { z } from "zod";
import { getVNDateParts } from "@comtammatu/shared/time";

// ─── URL param schema — single source of truth ──────────────────
//
// Seven params govern the entire Finance surface. Defaults
// are stripped from the URL (omit semantics) — we serialize only what
// differs from default so links stay readable and bookmarks decay
// gracefully when a future default changes.
//
// All date math is grounded in Asia/Ho_Chi_Minh per regression rule
// PERIOD-FILTER-USES-LOCAL-TZ. ISO date strings (YYYY-MM-DD) represent
// VN-local calendar dates, never UTC.

export const FINANCE_RANGES = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "mtd",
  "last_month",
  "qtd",
  "ytd",
  "custom",
] as const;
export type FinanceRange = (typeof FINANCE_RANGES)[number];

const FINANCE_GRANULARITIES = ["day", "week", "month"] as const;
export type FinanceGranularity = (typeof FINANCE_GRANULARITIES)[number];

const FINANCE_COMPARE_MODES = [
  "none",
  "prev_period",
  "prev_week",
  "prev_month",
  "prev_year",
] as const;
export type FinanceCompareMode = (typeof FINANCE_COMPARE_MODES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const branchSchema = z
  .string()
  .optional()
  .transform((v): number | null => {
    if (!v || v === "all") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

const FINANCE_DEFAULTS = {
  range: "mtd" as FinanceRange,
  granularity: "day" as FinanceGranularity,
  compare: "prev_month" as FinanceCompareMode,
} as const;

const financeParamsSchema = z.object({
  branch: branchSchema,
  range: z.enum(FINANCE_RANGES).default(FINANCE_DEFAULTS.range),
  from: isoDate.optional(),
  to: isoDate.optional(),
  gran: z.enum(FINANCE_GRANULARITIES).default(FINANCE_DEFAULTS.granularity),
  compare: z.enum(FINANCE_COMPARE_MODES).default(FINANCE_DEFAULTS.compare),
  cashier: z
    .string()
    .optional()
    .transform((v): string | null => (v && v.length > 0 ? v : null)),
});

export type FinanceParamsInput = Record<string, string | string[] | undefined>;

export interface FinanceParams {
  branch: number | null;
  range: FinanceRange;
  from: string | null;
  to: string | null;
  gran: FinanceGranularity;
  compare: FinanceCompareMode;
  cashier: string | null;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

// Server Component & Client both call this — gives a typed object even
// when the URL is mangled or empty. Falls back to defaults; never throws.
export function parseFinanceParams(input: FinanceParamsInput): FinanceParams {
  const flat = {
    branch: pickFirst(input.branch),
    range: pickFirst(input.range),
    from: pickFirst(input.from),
    to: pickFirst(input.to),
    gran: pickFirst(input.gran),
    compare: pickFirst(input.compare),
    cashier: pickFirst(input.cashier),
  };
  const parsed = financeParamsSchema.safeParse(flat);
  if (!parsed.success) {
    return {
      branch: null,
      range: FINANCE_DEFAULTS.range,
      from: null,
      to: null,
      gran: FINANCE_DEFAULTS.granularity,
      compare: FINANCE_DEFAULTS.compare,
      cashier: null,
    };
  }
  return {
    branch: parsed.data.branch,
    range: parsed.data.range,
    from: parsed.data.from ?? null,
    to: parsed.data.to ?? null,
    gran: parsed.data.gran,
    compare: parsed.data.compare,
    cashier: parsed.data.cashier,
  };
}

// Serialize back to URLSearchParams. Defaults are stripped so the URL
// stays minimal — same input through parse→serialize→parse is idempotent
// at the semantic level even if the literal string differs.
export function serializeFinanceParams(p: FinanceParams): URLSearchParams {
  const usp = new URLSearchParams();
  if (p.branch != null) usp.set("branch", String(p.branch));
  if (p.range !== FINANCE_DEFAULTS.range) usp.set("range", p.range);
  if (p.range === "custom") {
    if (p.from) usp.set("from", p.from);
    if (p.to) usp.set("to", p.to);
  }
  if (p.gran !== FINANCE_DEFAULTS.granularity) usp.set("gran", p.gran);
  if (p.compare !== FINANCE_DEFAULTS.compare) usp.set("compare", p.compare);
  if (p.cashier) usp.set("cashier", p.cashier);
  return usp;
}

// ─── Period preset library — Asia/Ho_Chi_Minh ───────────────────

function vnDateParts(date: Date): { y: number; m: number; d: number } {
  const { year, month, day } = getVNDateParts(date);
  return { y: year, m: month, d: day };
}

function fmtVN(parts: { y: number; m: number; d: number }): string {
  const m = String(parts.m).padStart(2, "0");
  const d = String(parts.d).padStart(2, "0");
  return `${parts.y}-${m}-${d}`;
}

// JS Date arithmetic is UTC-based; we offset to noon VN to avoid
// rollover bugs when adding/subtracting days near midnight.
function vnNoon(parts: { y: number; m: number; d: number }): Date {
  // Noon VN = 05:00 UTC — safe distance from any DST or rollover edge.
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 5, 0, 0));
}

function addDays(parts: { y: number; m: number; d: number }, n: number) {
  const next = new Date(vnNoon(parts).getTime() + n * 24 * 60 * 60 * 1000);
  return vnDateParts(next);
}

function firstOfMonth(parts: { y: number; m: number; d: number }) {
  return { y: parts.y, m: parts.m, d: 1 };
}

function lastOfMonth(parts: { y: number; m: number; d: number }) {
  // Day 0 of next month = last day of current month.
  const next = new Date(Date.UTC(parts.y, parts.m, 0, 5, 0, 0));
  return vnDateParts(next);
}

function firstOfQuarter(parts: { y: number; m: number; d: number }) {
  // Quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec.
  const quarterStart = Math.floor((parts.m - 1) / 3) * 3 + 1;
  return { y: parts.y, m: quarterStart, d: 1 };
}

export interface DateRange {
  start: string;
  end: string;
}

// Caller passes the "now" anchor so server + client can stay in sync.
// Default = system clock — fine for client; Server Component should pass
// `new Date()` at request time.
export function getPresetRange(
  range: FinanceRange,
  now: Date = new Date(),
  custom?: { from: string | null; to: string | null },
): DateRange {
  const today = vnDateParts(now);
  const todayStr = fmtVN(today);

  switch (range) {
    case "today":
      return { start: todayStr, end: todayStr };
    case "yesterday": {
      const y = fmtVN(addDays(today, -1));
      return { start: y, end: y };
    }
    case "7d":
      return { start: fmtVN(addDays(today, -6)), end: todayStr };
    case "30d":
      return { start: fmtVN(addDays(today, -29)), end: todayStr };
    case "mtd":
      return { start: fmtVN(firstOfMonth(today)), end: todayStr };
    case "last_month": {
      const lastOfPrev = addDays(firstOfMonth(today), -1);
      return {
        start: fmtVN(firstOfMonth(lastOfPrev)),
        end: fmtVN(lastOfMonth(lastOfPrev)),
      };
    }
    case "qtd":
      return { start: fmtVN(firstOfQuarter(today)), end: todayStr };
    case "ytd":
      return { start: `${today.y}-01-01`, end: todayStr };
    case "custom": {
      const start = custom?.from ?? fmtVN(firstOfMonth(today));
      const end = custom?.to ?? todayStr;
      return start <= end ? { start, end } : { start: end, end: start };
    }
  }
}

// Compare period semantics (BA §3 + Q4):
//   prev_period  = same length, immediately preceding
//   prev_week    = shift exactly 7 days back
//   prev_month   = shift to same DOM in previous month, pad if missing (default
//                  — matches the admin dashboard overview's MoM comparison)
//   prev_year    = shift exactly 1 year back
//
// Returns null when mode = none or current range is empty.
function getComparePeriod(
  current: DateRange,
  mode: FinanceCompareMode,
): DateRange | null {
  if (mode === "none") return null;
  const startParts = parseIsoToParts(current.start);
  const endParts = parseIsoToParts(current.end);
  if (!startParts || !endParts) return null;

  if (mode === "prev_period") {
    const startMs = vnNoon(startParts).getTime();
    const endMs = vnNoon(endParts).getTime();
    const lengthMs = endMs - startMs;
    const prevEndMs = startMs - 24 * 60 * 60 * 1000;
    const prevStartMs = prevEndMs - lengthMs;
    return {
      start: fmtVN(vnDateParts(new Date(prevStartMs))),
      end: fmtVN(vnDateParts(new Date(prevEndMs))),
    };
  }

  if (mode === "prev_week") {
    return {
      start: fmtVN(addDays(startParts, -7)),
      end: fmtVN(addDays(endParts, -7)),
    };
  }

  if (mode === "prev_month") {
    return {
      start: fmtVN(shiftMonth(startParts, -1)),
      end: fmtVN(shiftMonth(endParts, -1)),
    };
  }

  // prev_year
  return {
    start: fmtVN({ ...startParts, y: startParts.y - 1 }),
    end: fmtVN({ ...endParts, y: endParts.y - 1 }),
  };
}

function parseIsoToParts(
  iso: string,
): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// Shift month preserving DOM with end-of-month clamp (e.g. Mar 31 −1m
// → Feb 28/29). Standard MoM compare semantics.
function shiftMonth(parts: { y: number; m: number; d: number }, delta: number) {
  const targetMonth0 = parts.m - 1 + delta;
  const targetY = parts.y + Math.floor(targetMonth0 / 12);
  let targetM = (targetMonth0 % 12) + 1;
  if (targetM <= 0) targetM += 12;
  const lastDay = lastOfMonth({ y: targetY, m: targetM, d: 1 }).d;
  return { y: targetY, m: targetM, d: Math.min(parts.d, lastDay) };
}

// Resolve params + presets into a concrete (start, end, compare) bundle
// that server actions can use directly.
export interface ResolvedFinanceRange {
  start: string;
  end: string;
  compare: DateRange | null;
}

export function resolveFinanceRange(
  params: FinanceParams,
  now: Date = new Date(),
): ResolvedFinanceRange {
  const range = getPresetRange(params.range, now, {
    from: params.from,
    to: params.to,
  });
  return {
    start: range.start,
    end: range.end,
    compare: getComparePeriod(range, params.compare),
  };
}
