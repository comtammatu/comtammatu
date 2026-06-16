import ExcelJS from "exceljs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_ROWS_PER_SHEET = 5000;

interface SheetColumn {
  header: string;
  key: string;
  width?: number;
}

export interface SheetDef {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

export async function buildXlsx(sheets: SheetDef[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cơm Tấm Má Tư";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 2),
    }));
    if (sheet.rows.length > 0) {
      ws.addRows(sheet.rows);
    }
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export function buildCsv(sheet: SheetDef): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const headerLine = sheet.columns.map((c) => escape(c.header)).join(",");
  const bodyLines = sheet.rows.map((row) =>
    sheet.columns.map((c) => escape(row[c.key])).join(","),
  );

  return "\uFEFF" + [headerLine, ...bodyLines].join("\r\n");
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheets: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    const headers: string[] = [];
    const headerRow = ws.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? "").trim();
    });

    const rows: Record<string, string>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, string> = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = headers[col - 1];
        if (!key) return;
        const raw = cell.value;
        let value: string;
        if (raw === null || raw === undefined) {
          value = "";
        } else if (typeof raw === "object" && "text" in raw) {
          value = String((raw as { text: unknown }).text ?? "");
        } else if (typeof raw === "object" && "result" in raw) {
          value = String((raw as { result: unknown }).result ?? "");
        } else {
          value = String(raw);
        }
        value = value.trim();
        if (value) hasValue = true;
        obj[key] = value;
      });
      if (hasValue) rows.push(obj);
    });

    sheets.push({ name: ws.name, headers, rows });
  });

  return sheets;
}

function parseCsvText(text: string): ParsedSheet {
  const normalized = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      current.push(field);
      field = "";
    } else if (ch === "\r") {
      // handled by \n
    } else if (ch === "\n") {
      current.push(field);
      records.push(current);
      current = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    records.push(current);
  }

  const headerRow = records.shift() ?? [];
  const headers = headerRow.map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (const rec of records) {
    if (rec.every((v) => v.trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = (rec[idx] ?? "").trim();
    });
    rows.push(obj);
  }

  return { name: "Sheet1", headers, rows };
}

export interface ParseOptions {
  maxRowsPerSheet?: number;
}

export async function parseSpreadsheetFile(
  file: File,
  options: ParseOptions = {},
): Promise<{ sheets: ParsedSheet[]; format: "xlsx" | "csv" }> {
  if (file.size === 0) {
    throw new Error("File rỗng");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn. Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xlsm");

  if (!isCsv && !isXlsx) {
    throw new Error("Chỉ hỗ trợ file .xlsx hoặc .csv");
  }

  const limit = options.maxRowsPerSheet ?? MAX_ROWS_PER_SHEET;

  let sheets: ParsedSheet[];
  let format: "xlsx" | "csv";

  if (isCsv) {
    const text = await file.text();
    sheets = [parseCsvText(text)];
    format = "csv";
  } else {
    const buf = await file.arrayBuffer();
    sheets = await parseXlsxBuffer(buf);
    format = "xlsx";
  }

  for (const sheet of sheets) {
    if (sheet.rows.length > limit) {
      throw new Error(
        `Sheet "${sheet.name}" có quá nhiều dòng (${sheet.rows.length}). Tối đa ${limit}.`,
      );
    }
  }

  return { sheets, format };
}

export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function stringToBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
