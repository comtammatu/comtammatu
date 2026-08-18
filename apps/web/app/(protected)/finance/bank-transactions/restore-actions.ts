"use server";

import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { messages } from "@lib/messages";
import { mbbankStatementRestoreRpcRows } from "./mbbank-statement-pre-sepay";
import {
  MBBANK_STATEMENT_OPENING_BANK_DELTA,
  MBBANK_STATEMENT_OPENING_EFFECTIVE_AT,
  MBBANK_STATEMENT_RESTORE_IDEMPOTENCY_KEY,
} from "./mbbank-statement-restore-contract";

const copy = messages.finance.bankTransactions;
const restoreSchema = z.object({
  confirmed: z
    .string()
    .refine((value) => value === "true", copy.statementRestoreConfirmRequired),
});
const restoreResultSchema = z.object({
  processed_count: z.number().int().nonnegative(),
  inserted_count: z.number().int().nonnegative(),
  existing_count: z.number().int().nonnegative(),
});

export type MbbankStatementRestoreState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      processedCount: number;
      insertedCount: number;
      existingCount: number;
    };

export async function restoreMbbankStatementGap(
  _previousState: MbbankStatementRestoreState,
  formData: FormData,
): Promise<MbbankStatementRestoreState> {
  const parsed = restoreSchema.safeParse({
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ?? copy.statementRestoreError,
    };
  }

  const ctx = await getAuthContextWithPermission(
    ["owner"],
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { status: "error", message: copy.statementRestoreForbidden };
  }

  const { data, error } = await ctx.supabase.rpc(
    "restore_mbbank_statement_gap",
    {
      p_rows: mbbankStatementRestoreRpcRows(),
      p_bank_opening_delta: MBBANK_STATEMENT_OPENING_BANK_DELTA,
      p_reason: copy.statementRestoreLedgerReason,
      p_idempotency_key: MBBANK_STATEMENT_RESTORE_IDEMPOTENCY_KEY,
      p_opening_effective_at: MBBANK_STATEMENT_OPENING_EFFECTIVE_AT,
    },
  );

  if (error) {
    console.error("[finance:bank] restore failed", error.code);
    return { status: "error", message: copy.statementRestoreError };
  }

  const result = restoreResultSchema.safeParse(data);
  if (!result.success) {
    return { status: "error", message: copy.statementRestoreError };
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
