import { z } from "zod";
import { parseVietnameseNumericImport } from "@comtammatu/shared/format";

const sepayExportRowSchema = z
  .object({
    ID: z.string().trim().min(1).max(128),
    "Tài khoản": z.string().trim(),
    "Thời gian": z.string().trim().min(1),
    "Loại giao dịch": z.string().trim().min(1),
    Tiền: z.string().trim().min(1),
    "Luỹ kế": z.string().trim(),
    "Nội dung": z.string().trim(),
    "Mã thanh toán": z.string().trim(),
    "Mã tham chiếu": z.string().trim(),
  })
  .passthrough();

const REQUIRED_HEADERS = Object.keys(sepayExportRowSchema.shape);

export interface SepayExportImportRow {
  provider_transaction_id: string;
  occurred_at: string;
  transfer_type: "in" | "out";
  amount: number;
  balance_after: number | null;
  account_number: string | null;
  code: string | null;
  content: string | null;
  reference_code: string | null;
  raw_payload: Record<string, string>;
}

export type ParseSepayExportResult =
  | { success: true; rows: SepayExportImportRow[] }
  | {
      success: false;
      error: string;
      rowErrors?: Array<{ row: number; reason: string }>;
    };

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseTransferType(value: string): "in" | "out" | null {
  const normalized = normalizeText(value);
  if (["in", "tien vao", "nhan tien"].includes(normalized)) return "in";
  if (["out", "tien ra", "chuyen tien"].includes(normalized)) return "out";
  return null;
}

function parseMoney(value: string): number | null {
  let normalized = value.trim().replace(/[^0-9.,+-]/g, "");
  if (/^[+-]?\d{1,3}(,\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = parseVietnameseNumericImport(normalized, {
    maxFractionDigits: 2,
  });
  return parsed.state === "valid" ? parsed.value : null;
}

function parseOccurredAt(value: string): string | null {
  const trimmed = value.trim();
  const isoLocal = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})$/,
  );
  const vietnamese = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}:\d{2}:\d{2})$/,
  );
  const parts = isoLocal
    ? {
        year: Number(isoLocal[1]),
        month: Number(isoLocal[2]),
        day: Number(isoLocal[3]),
        time: isoLocal[4],
      }
    : vietnamese
      ? {
          year: Number(vietnamese[3]),
          month: Number(vietnamese[2]),
          day: Number(vietnamese[1]),
          time: vietnamese[4],
        }
      : null;

  if (!parts?.time) return null;
  const maxDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  if (
    parts.year < 2000 ||
    parts.year > 2200 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > maxDay
  ) {
    return null;
  }

  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const timestamp = Date.parse(
    `${String(parts.year)}-${month}-${day}T${parts.time}+07:00`,
  );
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseSepayExportRows(
  headers: string[],
  rawRows: Record<string, string>[],
): ParseSepayExportResult {
  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );
  if (missingHeaders.length > 0) {
    return {
      success: false,
      error: `File SePay thiếu cột: ${missingHeaders.join(", ")}`,
    };
  }
  if (rawRows.length === 0) {
    return { success: false, error: "File SePay không có giao dịch." };
  }

  const rows: SepayExportImportRow[] = [];
  for (let index = 0; index < rawRows.length; index += 1) {
    const parsed = sepayExportRowSchema.safeParse(rawRows[index]);
    if (!parsed.success) {
      const row = index + 2;
      return {
        success: false,
        error: `Dòng ${String(row)} không đúng định dạng SePay.`,
        rowErrors: [{ row, reason: "Không đúng định dạng SePay" }],
      };
    }

    const occurredAt = parseOccurredAt(parsed.data["Thời gian"]);
    const transferType = parseTransferType(parsed.data["Loại giao dịch"]);
    const rawAmount = parseMoney(parsed.data.Tiền);
    const balanceAfter = parsed.data["Luỹ kế"]
      ? parseMoney(parsed.data["Luỹ kế"])
      : null;

    if (
      occurredAt == null ||
      transferType == null ||
      rawAmount == null ||
      rawAmount === 0 ||
      (parsed.data["Luỹ kế"] && balanceAfter == null)
    ) {
      const row = index + 2;
      return {
        success: false,
        error: `Dòng ${String(row)} có ngày, loại hoặc số tiền không hợp lệ.`,
        rowErrors: [
          { row, reason: "Ngày, loại hoặc số tiền không hợp lệ" },
        ],
      };
    }

    rows.push({
      provider_transaction_id: parsed.data.ID,
      occurred_at: occurredAt,
      transfer_type: transferType,
      amount: Math.abs(rawAmount),
      balance_after: balanceAfter,
      account_number: optional(parsed.data["Tài khoản"]),
      code: optional(parsed.data["Mã thanh toán"]),
      content: optional(parsed.data["Nội dung"]),
      reference_code: optional(parsed.data["Mã tham chiếu"]),
      raw_payload: rawRows[index] ?? {},
    });
  }

  return { success: true, rows };
}
