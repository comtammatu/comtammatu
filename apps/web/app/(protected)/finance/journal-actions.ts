"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";

const JOURNAL_READ_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const JOURNAL_WRITE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Journal Entries (auth-only, optional filters) ─── */

const fetchJournalSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  status: z.enum(["draft", "posted", "voided"]).optional(),
  referenceType: z
    .enum(["sale", "purchase", "payroll", "manual", "adjustment"])
    .optional(),
});

export async function fetchJournalEntries(
  filters?: z.infer<typeof fetchJournalSchema>,
): Promise<ActionResult> {
  const parsed = fetchJournalSchema.optional().safeParse(filters);

  const ctx = await getAuthContextWithPermission(
    JOURNAL_READ_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("journal_entries")
    .select(
      `
      *,
      journal_entry_lines (
        id, account_id, debit_amount, credit_amount, description,
        chart_of_accounts ( account_code, account_name )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("entry_date", { ascending: false })
    .limit(200);

  const f = parsed.success ? parsed.data : undefined;
  if (f?.startDate) query = query.gte("entry_date", f.startDate);
  if (f?.endDate) query = query.lte("entry_date", f.endDate);
  if (f?.status) query = query.eq("status", f.status);
  if (f?.referenceType) query = query.eq("reference_type", f.referenceType);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải danh sách bút toán." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Schemas ─── */

const lineSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  debitAmount: z.coerce.number().nonnegative().default(0),
  creditAmount: z.coerce.number().nonnegative().default(0),
  description: z.string().optional(),
});

const createJournalSchema = z.object({
  entryDate: z.string().date(),
  description: z.string().min(1, "Diễn giải không được trống"),
  referenceType: z
    .enum(["sale", "purchase", "payroll", "manual", "adjustment"])
    .default("manual"),
  referenceId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  lines: z.array(lineSchema).min(2, "Bút toán phải có ít nhất 2 dòng"),
});

const postIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "Entry ID không hợp lệ" }),
});

// Rule JE-VOID-REVERSING-ONLY: void reason ≥20 chars (mirrors
// HDDT-CANCEL-REASON-MIN-20). A void leaves the row in the ledger
// permanently; the auditor needs a real, descriptive reason —
// "đảo bút toán" (15 chars) is useless to a tax inspection.
const voidSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  reason: z
    .string()
    .trim()
    .min(20, "Lý do hủy phải có ít nhất 20 ký tự")
    .max(500, "Lý do hủy quá dài"),
});

interface JournalRpcResult {
  id: number;
  entry_number?: string;
  status?: string;
  void_journal_entry_id?: number | null;
  void_journal_entry_number?: string | null;
}

const journalRpcResultSchema = z
  .object({
    id: z.number(),
    entry_number: z.string().optional(),
    status: z.string().optional(),
    void_journal_entry_id: z.number().nullable().optional(),
    void_journal_entry_number: z.string().nullable().optional(),
  })
  .passthrough();

interface SafeDbError {
  code?: string;
  message?: string;
}

function mapJournalMutationError(error: SafeDbError | null | undefined) {
  if (!error) return "Không thể xử lý bút toán.";
  if (error.code === "42501") return "Không có quyền";
  if (error.code === "P0002") return "Bút toán không tồn tại.";
  if (error.code === "23503") return "Tài khoản kế toán không hợp lệ.";
  if (error.code === "23505") {
    return "Số bút toán bị trùng. Vui lòng thử lại.";
  }
  if (error.code === "22023") return "Dữ liệu bút toán không hợp lệ.";
  if (
    error.code === "23514" &&
    (error.message?.includes("fiscal_period_closed_cannot_post") ||
      error.message?.includes("current_period_closed_cannot_reverse"))
  ) {
    return "Không thể ghi sổ vào kỳ kế toán đã đóng. Hãy chọn kỳ hiện tại hoặc mở lại kỳ theo quy trình.";
  }
  if (
    error.code === "23514" &&
    error.message?.includes("period_closed_cannot_void")
  ) {
    return "Không thể hủy bút toán đã ghi vào kỳ kế toán đã đóng. Hãy tạo bút toán đảo trong kỳ hiện tại.";
  }
  return "Không thể xử lý bút toán.";
}

function parseJournalRpcResult(value: unknown): JournalRpcResult | null {
  const parsed = journalRpcResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* ─── Create Journal Entry ─── */

export const createJournalEntry = withAction(
  {
    roles: JOURNAL_WRITE_ROLES,
    schema: createJournalSchema,
    permission: PERMISSION_KEYS.FINANCE_EXPENSE_APPROVE,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, { supabase }) => {
    // Validate balance: SUM(debit) must equal SUM(credit)
    const totalDebit = data.lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + l.creditAmount, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return {
        success: false,
        error: `Bút toán không cân: Nợ ${totalDebit.toLocaleString()} ≠ Có ${totalCredit.toLocaleString()}`,
      };
    }
    if (totalDebit === 0) {
      return { success: false, error: "Bút toán phải có giá trị > 0" };
    }
    if (
      data.lines.some(
        (line) =>
          (line.debitAmount === 0 && line.creditAmount === 0) ||
          (line.debitAmount > 0 && line.creditAmount > 0),
      )
    ) {
      return {
        success: false,
        error: "Mỗi dòng bút toán phải nhập đúng một bên Nợ hoặc Có.",
      };
    }

    const lines = data.lines.map((line) => ({
      account_id: line.accountId,
      debit_amount: line.debitAmount,
      credit_amount: line.creditAmount,
      description: line.description ?? null,
    }));

    const { data: entry, error } = await supabase.rpc(
      "create_manual_journal_entry",
      {
        p_entry_date: data.entryDate,
        p_description: data.description,
        p_lines: lines,
        p_reference_type: data.referenceType,
        p_reference_id: data.referenceId ?? undefined,
        p_branch_id: data.branchId ?? undefined,
      },
    );

    if (error || !entry) {
      return { success: false, error: mapJournalMutationError(error) };
    }

    const result = parseJournalRpcResult(entry);
    if (!result) return { success: false, error: "Không thể xử lý bút toán." };

    return { success: true, data: result };
  },
);

/* ─── Post Journal Entry ─── */

export const postJournalEntry = withAction(
  {
    roles: JOURNAL_WRITE_ROLES,
    schema: postIdSchema,
    permission: PERMISSION_KEYS.FINANCE_EXPENSE_APPROVE,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "post_manual_journal_entry",
      {
        p_entry_id: data.id,
      },
    );

    if (error || !result) {
      return { success: false, error: mapJournalMutationError(error) };
    }

    const parsed = parseJournalRpcResult(result);
    if (!parsed) return { success: false, error: "Không thể xử lý bút toán." };

    return { success: true, data: parsed };
  },
);

/* ─── Void Journal Entry ─── */

export const voidJournalEntry = withAction(
  {
    roles: JOURNAL_WRITE_ROLES,
    schema: voidSchema,
    permission: PERMISSION_KEYS.FINANCE_EXPENSE_APPROVE,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "void_manual_journal_entry",
      {
        p_entry_id: data.entryId,
        p_reason: data.reason,
      },
    );

    if (error || !result) {
      return { success: false, error: mapJournalMutationError(error) };
    }

    const parsed = parseJournalRpcResult(result);
    if (!parsed) return { success: false, error: "Không thể xử lý bút toán." };

    return { success: true, data: parsed };
  },
);
