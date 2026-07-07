"use server";

/**
 * Operating-expense capture (D028 / blueprint P0-2).
 *
 * Single-entry expense-ledger writes for the owner finance cockpit. The summed
 * total feeds `fetchOperatingExpenseTotal` (finance-cockpit) which lights up the
 * "Chi vận hành" KPI and the net-profit line. NOT a general ledger (D020);
 * supplier costs stay in supplier_invoices. v1 owner-only (finance module gate).
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";
import {
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_PAYMENT_METHODS,
} from "./_lib/expense-categories";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ExpenseRow {
  id: number;
  branch_id: number | null;
  expense_date: string;
  category: string;
  amount: number;
  payment_method: string;
  paid_at: string | null;
  vendor_name: string | null;
  note: string | null;
  created_at: string;
}

const createExpenseSchema = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  expenseDate: z.string().regex(BUSINESS_DATE, "Ngày không hợp lệ"),
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  amount: z.coerce
    .number()
    .positive("Số tiền phải lớn hơn 0")
    .max(10_000_000_000, "Số tiền quá lớn"),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  vendorName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function createExpense(
  input: z.infer<typeof createExpenseSchema>,
): Promise<ActionResult> {
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền ghi chi phí." };

  const { supabase, claims, user } = ctx;
  const branchId = parsed.data.branchId ?? null;

  if (branchId != null && !(await canAccessBranch(supabase, claims, branchId))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const paidAt =
    parsed.data.paymentMethod === "unpaid" ? null : new Date().toISOString();

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: branchId,
      expense_date: parsed.data.expenseDate,
      category: parsed.data.category,
      amount: parsed.data.amount,
      payment_method: parsed.data.paymentMethod,
      paid_at: paidAt,
      vendor_name: parsed.data.vendorName ?? null,
      note: parsed.data.note ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Không thể lưu chi phí." };
  }

  await logAudit(supabase, {
    action: "create",
    entityType: "expense",
    entityId: data.id,
    newData: {
      branch_id: branchId,
      category: parsed.data.category,
      amount: parsed.data.amount,
      payment_method: parsed.data.paymentMethod,
    },
  });

  return { success: true, data: { id: data.id } };
}

const deleteExpenseSchema = z.object({
  expenseId: z.coerce.number().int().positive(),
});

export async function deleteExpense(
  input: z.infer<typeof deleteExpenseSchema>,
): Promise<ActionResult> {
  const parsed = deleteExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền xóa chi phí." };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("tenant_id", claims.tenant_id)
    .eq("id", parsed.data.expenseId);

  if (error) {
    return { success: false, error: "Không thể xóa chi phí." };
  }

  await logAudit(supabase, {
    action: "delete",
    entityType: "expense",
    entityId: parsed.data.expenseId,
  });

  return { success: true };
}

export async function fetchExpenses(params: {
  branchId?: number | null;
  startDate: string;
  endDate: string;
}): Promise<ActionResult<ExpenseRow[]>> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem chi phí." };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("expenses")
    .select(
      "id, branch_id, expense_date, category, amount, payment_method, paid_at, vendor_name, note, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .gte("expense_date", params.startDate)
    .lte("expense_date", params.endDate)
    .order("expense_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);

  if (params.branchId != null) {
    query = query.eq("branch_id", params.branchId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không tải được danh sách chi phí." };
  }

  return {
    success: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      branch_id: r.branch_id,
      expense_date: r.expense_date,
      category: r.category,
      amount: Number(r.amount),
      payment_method: r.payment_method,
      paid_at: r.paid_at,
      vendor_name: r.vendor_name,
      note: r.note,
      created_at: r.created_at,
    })),
  };
}

function nextDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

// Read-only actual food cost (giá vốn món) from approved consumption, mirroring
// the finance cockpit's ingredientCost so the expenses page shows the same
// figure. NOT an expense-ledger row: keeps it out of operating expense / net
// profit (which already nets consumption via gross profit), so no double count.
export async function fetchActualFoodCostTotal(params: {
  branchId?: number | null;
  startDate: string;
  endDate: string;
}): Promise<ActionResult<number>> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem giá vốn." };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("stock_movements")
    .select("quantity_change, unit_cost")
    .eq("tenant_id", claims.tenant_id)
    .eq("type", "consumption")
    .eq("movement_subtype", "sale_consumption")
    .gte("created_at", params.startDate)
    .lt("created_at", nextDate(params.endDate));

  if (params.branchId != null) {
    query = query.eq("branch_id", params.branchId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không tải được giá vốn món." };
  }

  const total = (data ?? []).reduce(
    (sum, r) => sum + Math.abs(Number(r.quantity_change)) * Number(r.unit_cost),
    0,
  );
  return { success: true, data: total };
}

const matchSepayExpenseSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  expenseId: z.coerce.number().int().positive(),
});

export async function matchSepayTransactionWithExpense(
  input: z.infer<typeof matchSepayExpenseSchema>,
): Promise<ActionResult> {
  const parsed = matchSepayExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền sửa chi phí." };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("webhook_events")
    .update({ expense_id: parsed.data.expenseId })
    .eq("tenant_id", claims.tenant_id)
    .eq("id", parsed.data.eventId)
    .eq("provider", "sepay");

  if (error) {
    return { success: false, error: "Không thể khớp giao dịch." };
  }

  await logAudit(supabase, {
    action: "update",
    entityType: "webhook_event",
    entityId: parsed.data.eventId,
    newData: { expense_id: parsed.data.expenseId },
  });

  return { success: true };
}

export async function fetchUnmatchedExpenses(): Promise<
  ActionResult<ExpenseRow[]>
> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem chi phí." };

  const { supabase, claims } = ctx;

  // Find all expenses that are "transfer" and don't exist in webhook_events.expense_id
  const { data: matchedEvents, error: matchedErr } = await supabase
    .from("webhook_events")
    .select("expense_id")
    .eq("tenant_id", claims.tenant_id)
    .not("expense_id", "is", null);

  if (matchedErr) {
    return { success: false, error: "Lỗi tải dữ liệu khớp." };
  }

  const matchedExpenseIds = Array.from(
    new Set((matchedEvents ?? []).map((e) => e.expense_id as number)),
  );

  let query = supabase
    .from("expenses")
    .select(
      "id, branch_id, expense_date, category, amount, payment_method, paid_at, vendor_name, note, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("payment_method", "transfer")
    .order("expense_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);

  if (matchedExpenseIds.length > 0) {
    query = query.not("id", "in", `(${matchedExpenseIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không tải được danh sách chi phí." };
  }

  return {
    success: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      branch_id: r.branch_id,
      expense_date: r.expense_date,
      category: r.category,
      amount: Number(r.amount),
      payment_method: r.payment_method,
      paid_at: r.paid_at,
      vendor_name: r.vendor_name,
      note: r.note,
      created_at: r.created_at,
    })),
  };
}
