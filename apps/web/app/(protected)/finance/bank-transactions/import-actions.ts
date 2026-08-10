"use server";

import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { parseSpreadsheetFile } from "@/_lib/spreadsheet";
import { parseSepayExportRows } from "../_lib/sepay-export-model";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;
const importSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.name.toLowerCase().endsWith(".csv")),
});
const importResultSchema = z.object({
  processed_count: z.number().int().nonnegative(),
  inserted_count: z.number().int().nonnegative(),
  existing_count: z.number().int().nonnegative(),
});

export type SepayImportState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      rowErrors?: Array<{ row: number; reason: string }>;
    }
  | {
      status: "success";
      processedCount: number;
      insertedCount: number;
      existingCount: number;
    };

export async function importSepayBankTransactions(
  _previousState: SepayImportState,
  formData: FormData,
): Promise<SepayImportState> {
  const parsedInput = importSchema.safeParse({ file: formData.get("file") });
  if (!parsedInput.success) {
    return { status: "error", message: "Chọn đúng file CSV xuất từ SePay." };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { status: "error", message: "Không có quyền nhập giao dịch SePay." };
  }

  let sheet;
  try {
    const parsedFile = await parseSpreadsheetFile(parsedInput.data.file, {
      maxRowsPerSheet: 5000,
    });
    sheet = parsedFile.sheets[0];
  } catch {
    return { status: "error", message: "Không thể đọc file CSV SePay." };
  }

  if (!sheet) {
    return { status: "error", message: "File SePay không có dữ liệu." };
  }

  const parsedRows = parseSepayExportRows(sheet.headers, sheet.rows);
  if (!parsedRows.success) {
    return {
      status: "error",
      message: parsedRows.error,
      ...(parsedRows.rowErrors ? { rowErrors: parsedRows.rowErrors } : {}),
    };
  }

  const rpcRows: Json[] = parsedRows.rows.map((row) => ({
    provider_transaction_id: row.provider_transaction_id,
    occurred_at: row.occurred_at,
    transfer_type: row.transfer_type,
    amount: row.amount,
    balance_after: row.balance_after,
    account_number: row.account_number,
    code: row.code,
    content: row.content,
    reference_code: row.reference_code,
    raw_payload: row.raw_payload,
  }));

  const { data, error } = await ctx.supabase.rpc(
    "import_sepay_bank_transactions",
    { p_rows: rpcRows },
  );

  if (error) {
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "File có giao dịch trùng mã nhưng khác số tiền, loại hoặc thời gian."
          : "Không thể nhập giao dịch SePay.",
    };
  }

  const result = importResultSchema.safeParse(data);
  if (!result.success) {
    return { status: "error", message: "Kết quả nhập SePay không hợp lệ." };
  }

  revalidateSurfacePath("/finance");
  revalidateSurfacePath("/finance/bank-transactions");

  return {
    status: "success",
    processedCount: result.data.processed_count,
    insertedCount: result.data.inserted_count,
    existingCount: result.data.existing_count,
  };
}
