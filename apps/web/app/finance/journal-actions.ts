"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "@/admin/_lib/audit";

const JOURNAL_READ_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
];
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

  const ctx = await getAuthContextWithPermission(JOURNAL_READ_ROLES, PERMISSION_KEYS.FINANCE_VIEW);
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

const voidSchema = z.object({
  entryId: z.coerce.number().int().positive(),
  reason: z.string().min(1, "Lý do không được trống"),
});

/* ─── Create Journal Entry ─── */

export const createJournalEntry = withAction(
  { roles: JOURNAL_WRITE_ROLES, schema: createJournalSchema, permission: PERMISSION_KEYS.FINANCE_EXPENSE_APPROVE },
  async (data, { supabase, claims, user }) => {
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

    // Generate entry number: JE-YYYYMMDD-NNN
    const dateStr = data.entryDate.replace(/-/g, "");
    const { count } = await supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .like("entry_number", `JE-${dateStr}-%`);

    const seq = String((count ?? 0) + 1).padStart(3, "0");
    const entryNumber = `JE-${dateStr}-${seq}`;

    const { data: entry, error: entryErr } = await supabase
      .from("journal_entries")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: data.branchId ?? null,
        entry_number: entryNumber,
        entry_date: data.entryDate,
        description: data.description,
        reference_type: data.referenceType,
        reference_id: data.referenceId ?? null,
        created_by: user.id,
      })
      .select("id, entry_number")
      .single();

    if (entryErr || !entry) {
      return { success: false, error: "Không thể tạo bút toán." };
    }

    const lines = data.lines.map((l) => ({
      tenant_id: claims.tenant_id,
      journal_entry_id: entry.id,
      account_id: l.accountId,
      debit_amount: l.debitAmount,
      credit_amount: l.creditAmount,
      description: l.description ?? null,
    }));

    const { error: linesErr } = await supabase
      .from("journal_entry_lines")
      .insert(lines);

    if (linesErr) {
      await supabase.from("journal_entries").delete().eq("id", entry.id);
      return { success: false, error: "Không thể tạo dòng bút toán." };
    }

    return { success: true, data: entry };
  },
);

/* ─── Post Journal Entry ─── */

export const postJournalEntry = withAction(
  { roles: JOURNAL_WRITE_ROLES, schema: postIdSchema, permission: PERMISSION_KEYS.FINANCE_EXPENSE_APPROVE },
  async (data, { supabase, claims, user }) => {
    const { data: entry, error: fetchErr } = await supabase
      .from("journal_entries")
      .select("id, status")
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (fetchErr || !entry) {
      return { success: false, error: "Bút toán không tồn tại." };
    }

    if (entry.status !== "draft") {
      return { success: false, error: "Chỉ có thể ghi sổ bút toán nháp." };
    }

    const { data: isBalanced } = await supabase.rpc(
      "validate_journal_balance",
      { p_entry_id: data.id },
    );

    if (!isBalanced) {
      return { success: false, error: "Bút toán không cân bằng." };
    }

    const { error } = await supabase
      .from("journal_entries")
      .update({
        status: "posted",
        posted_by: user.id,
        posted_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể ghi sổ." };
    }

    logAudit(supabase, {
      action: "post",
      entityType: "journal_entry",
      entityId: data.id,
      oldData: { status: "draft" },
      newData: { status: "posted" },
    });

    return { success: true };
  },
);

/* ─── Void Journal Entry ─── */

export const voidJournalEntry = withAction(
  { roles: JOURNAL_WRITE_ROLES, schema: voidSchema, permission: PERMISSION_KEYS.FINANCE_EXPENSE_APPROVE },
  async (data, { supabase, claims, user }) => {
    const { error } = await supabase
      .from("journal_entries")
      .update({
        status: "voided",
        voided_reason: data.reason,
      })
      .eq("id", data.entryId)
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["draft", "posted"]);

    if (error) {
      return { success: false, error: "Không thể hủy bút toán." };
    }

    logAudit(supabase, {
      action: "void",
      entityType: "journal_entry",
      entityId: data.entryId,
      newData: { status: "voided", reason: data.reason },
    });

    return { success: true };
  },
);
