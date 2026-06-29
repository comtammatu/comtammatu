import type { PayrollEntryRow } from "./_types";

export interface PayrollCsvColumnLabels {
  employeeCode: string;
  employeeName: string;
  period: string;
  gross: string;
  insuranceBase: string;
  bhxh: string;
  bhyt: string;
  bhtn: string;
  taxableIncome: string;
  pit: string;
  net: string;
}

export interface PayrollCsvOptions {
  columns: PayrollCsvColumnLabels;
  /** Pre-formatted period label, e.g. "6/2026". */
  periodLabel: string;
}

const COLUMN_ORDER: readonly (keyof PayrollCsvColumnLabels)[] = [
  "employeeCode",
  "employeeName",
  "period",
  "gross",
  "insuranceBase",
  "bhxh",
  "bhyt",
  "bhtn",
  "taxableIncome",
  "pit",
  "net",
];

// RFC 4180: quote a field only when it contains a comma, double-quote, or
// newline; inner double-quotes are doubled.
function escapeCsvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Numbers are emitted as raw integers (no thousand separators / currency
// symbol) so spreadsheets keep them numeric. Insurance and tax figures are
// stored as positive deductions; we keep that sign convention here.
function toInt(value: number): number {
  return Math.round(Number(value) || 0);
}

function buildRow(entry: PayrollEntryRow, options: PayrollCsvOptions): string {
  const cells: (string | number)[] = [
    entry.employees?.employee_code ?? "",
    entry.employees?.profiles?.full_name ?? "",
    options.periodLabel,
    toInt(entry.gross_total),
    toInt(entry.insurance_base),
    toInt(entry.bhxh_employee),
    toInt(entry.bhyt_employee),
    toInt(entry.bhtn_employee),
    toInt(entry.taxable_income),
    toInt(entry.pit_tax),
    toInt(entry.net_salary),
  ];
  return cells.map(escapeCsvField).join(",");
}

/**
 * Build a payroll-period CSV: a header row plus one row per employee entry.
 * Returns a UTF-8 BOM-prefixed, CRLF-delimited string so Excel keeps
 * Vietnamese diacritics and treats each record as its own row.
 */
export function buildPayrollCsv(
  entries: readonly PayrollEntryRow[],
  options: PayrollCsvOptions,
): string {
  const headerLine = COLUMN_ORDER.map((key) =>
    escapeCsvField(options.columns[key]),
  ).join(",");
  const bodyLines = entries.map((entry) => buildRow(entry, options));
  return "\uFEFF" + [headerLine, ...bodyLines].join("\r\n");
}
