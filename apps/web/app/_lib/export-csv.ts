/**
 * Semicolon CSV with UTF-8 BOM for Vietnamese Excel locales.
 * Shared by audit (and similar) list exports — not finance-specific signatures.
 */

export const CSV_SEP = ";";
export const CSV_BOM = "\uFEFF";

export function escapeCsvCell(value: string | number): string {
  const s = String(value);
  return s.includes(CSV_SEP) || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function buildSemicolonCsv(input: {
  signatureLines: string[];
  header: string[];
  rows: Array<Array<string | number>>;
}): string {
  const lines: string[] = [];
  for (const line of input.signatureLines) {
    lines.push(escapeCsvCell(line));
  }
  if (input.signatureLines.length > 0) {
    lines.push("");
  }
  lines.push(input.header.map(escapeCsvCell).join(CSV_SEP));
  for (const row of input.rows) {
    lines.push(row.map(escapeCsvCell).join(CSV_SEP));
  }
  return CSV_BOM + lines.join("\n");
}

export function downloadSemicolonCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
