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
import { getVNDayUtcRange } from "@comtammatu/shared/time";
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
  matchedEventIds: number[];
  allocatedAmount: number | null;
}

export type ExpenseMatchOption = ExpenseRow;

interface ExpenseMatchRow {
  webhook_event_id: number;
  expense_id: number;
  allocated_amount?: number | string | null;
}

interface ExpenseMatchAggregate {
  matchedEventIds: number[];
  allocatedAmount: number | null;
}

interface WebhookExpenseMatchRow {
  id: number;
  expense_id: number | null;
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

  if (parsed.data.category === "cogs_manual") {
    return {
      success: false,
      error:
        "Giá vốn món lấy từ tiêu hao kho; không nhập thủ công ở chi vận hành.",
    };
  }

  if (
    branchId != null &&
    !(await canAccessBranch(supabase, claims, branchId))
  ) {
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
    if (error.code === "23503") {
      return {
        success: false,
        error: "Chi phí đã gắn bằng chứng ngân hàng; không thể xóa trực tiếp.",
      };
    }
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

  const rows = (data ?? []).map((r) => ({
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
  }));
  const matchedByExpense = await fetchExpenseMatchMap(
    supabase,
    claims.tenant_id,
    rows.map((r) => r.id),
  );
  if (matchedByExpense == null) {
    return { success: false, error: "Không tải được dữ liệu khớp chi phí." };
  }

  return {
    success: true,
    data: rows.map((row) => {
      const match = matchedByExpense.get(row.id);
      return {
        ...row,
        matchedEventIds: match?.matchedEventIds ?? [],
        allocatedAmount: match ? match.allocatedAmount : 0,
      };
    }),
  };
}

function getVNDateRangeUtc(startDate: string, endDate: string) {
  const { startIso } = getVNDayUtcRange(startDate);
  const { endIso } = getVNDayUtcRange(endDate);
  return { startIso, endIso };
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
  const summary = await fetchActualFoodCostSummary(params);
  if (!summary.success) {
    return {
      success: false,
      error: summary.error ?? "Không tải được giá vốn món.",
      errorCode: summary.errorCode,
    };
  }
  return { success: true, data: summary.data?.total ?? 0 };
}

export async function fetchActualFoodCostSummary(params: {
  branchId?: number | null;
  startDate: string;
  endDate: string;
}): Promise<ActionResult<{ total: number; orderCount: number }>> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem giá vốn." };

  const { supabase, claims } = ctx;
  const { startIso, endIso } = getVNDateRangeUtc(
    params.startDate,
    params.endDate,
  );

  let query = supabase
    .from("stock_movements")
    .select("order_id, quantity_change, unit_cost")
    .eq("tenant_id", claims.tenant_id)
    .eq("type", "consumption")
    .eq("movement_subtype", "sale_consumption")
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (params.branchId != null) {
    query = query.eq("branch_id", params.branchId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không tải được giá vốn món." };
  }

  const orderIds = new Set<number>();
  const total = (data ?? []).reduce((sum, r) => {
    if (r.order_id != null) orderIds.add(r.order_id);
    return sum + Math.abs(Number(r.quantity_change)) * Number(r.unit_cost);
  }, 0);
  return { success: true, data: { total, orderCount: orderIds.size } };
}

const matchSepayExpensesSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  allocations: z
    .array(
      z.object({
        expenseId: z.coerce.number().int().positive(),
        amount: z.coerce.number().int().positive().max(10_000_000_000),
      }),
    )
    .max(20)
    .superRefine((allocations, ctx) => {
      const seen = new Set<number>();
      allocations.forEach((allocation, index) => {
        if (seen.has(allocation.expenseId)) {
          ctx.addIssue({
            code: "custom",
            message: "Duplicate expense allocation",
            path: [index, "expenseId"],
          });
        }
        seen.add(allocation.expenseId);
      });
    }),
});

type UntypedRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { code?: string | null } | null }>;
};

function mapMatchExpenseError(code?: string | null): string {
  if (code === "P0002") return "Không tìm thấy giao dịch hoặc khoản chi.";
  if (code === "23505") return "Có dòng khớp bị trùng.";
  if (code === "23514") return "Giao dịch này không thể khớp khoản chi.";
  if (isExpenseMatchSchemaMissing(code)) {
    return "Chưa cập nhật dữ liệu ghép nhiều khoản chi.";
  }
  return "Không thể khớp giao dịch.";
}

function isExpenseMatchSchemaMissing(code?: string | null): boolean {
  return code === "PGRST202" || code === "PGRST205" || code === "42P01";
}

function isExpenseAllocationColumnMissing(code?: string | null): boolean {
  return code === "PGRST204" || code === "42703";
}

export async function matchSepayTransactionWithExpenses(
  input: z.infer<typeof matchSepayExpensesSchema>,
): Promise<ActionResult> {
  const parsed = matchSepayExpensesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền sửa chi phí." };

  const { supabase } = ctx;
  const allocations = parsed.data.allocations;

  const { error } = await (supabase as unknown as UntypedRpcClient).rpc(
    "set_sepay_expense_allocations",
    {
      p_event_id: parsed.data.eventId,
      p_allocations: allocations.map((allocation) => ({
        expense_id: allocation.expenseId,
        amount: allocation.amount,
      })),
    },
  );

  if (error) {
    if (!isExpenseMatchSchemaMissing(error.code)) {
      console.error(
        "[finance:expense-match] failed to match expenses",
        error.code,
      );
    }
    return { success: false, error: mapMatchExpenseError(error.code) };
  }

  await logAudit(supabase, {
    action: "update",
    entityType: "webhook_event",
    entityId: parsed.data.eventId,
    newData: { expense_allocations: allocations },
  });

  return { success: true };
}

async function fetchExpenseMatchMap(
  supabase: NonNullable<
    Awaited<ReturnType<typeof getAuthContextWithPermission>>
  >["supabase"],
  tenantId: number,
  expenseIds?: readonly number[],
): Promise<Map<number, ExpenseMatchAggregate> | null> {
  const matchedByExpense = new Map<number, Map<number, number | null>>();
  const addMatch = (
    expenseId: number,
    eventId: number,
    allocatedAmount: number | null,
  ) => {
    const current =
      matchedByExpense.get(expenseId) ?? new Map<number, number | null>();
    const existing = current.get(eventId);
    if (
      !current.has(eventId) ||
      (existing == null && allocatedAmount != null)
    ) {
      current.set(eventId, allocatedAmount);
    }
    matchedByExpense.set(expenseId, current);
  };
  const toAggregateMap = () =>
    new Map(
      Array.from(matchedByExpense, ([expenseId, eventAllocations]) => {
        const amounts = Array.from(eventAllocations.values());
        return [
          expenseId,
          {
            matchedEventIds: Array.from(eventAllocations.keys()),
            allocatedAmount: amounts.every((amount) => amount != null)
              ? amounts.reduce((sum, amount) => sum + (amount ?? 0), 0)
              : null,
          },
        ];
      }),
    );

  let matchQuery = supabase
    .from("bank_transaction_expense_matches")
    .select("webhook_event_id, expense_id, allocated_amount")
    .eq("tenant_id", tenantId);
  if (expenseIds != null) {
    if (expenseIds.length === 0) return new Map();
    matchQuery = matchQuery.in("expense_id", [...expenseIds]);
  }
  const allocationResult = await matchQuery;
  let matchRows: unknown = allocationResult.data;
  let matchErr = allocationResult.error;

  if (matchErr && isExpenseAllocationColumnMissing(matchErr.code)) {
    let legacyQuery = supabase
      .from("bank_transaction_expense_matches")
      .select("webhook_event_id, expense_id")
      .eq("tenant_id", tenantId);
    if (expenseIds != null) {
      legacyQuery = legacyQuery.in("expense_id", [...expenseIds]);
    }
    const legacyResult = await legacyQuery;
    matchRows = legacyResult.data as unknown;
    matchErr = legacyResult.error;
  }

  if (matchErr && !isExpenseMatchSchemaMissing(matchErr.code)) {
    console.error(
      "[finance:expense-match] failed to load bank_transaction_expense_matches",
      matchErr.code,
    );
    return null;
  } else if (!matchErr) {
    for (const row of (matchRows ?? []) as ExpenseMatchRow[]) {
      const numericAmount = Number(row.allocated_amount);
      addMatch(
        row.expense_id,
        row.webhook_event_id,
        row.allocated_amount != null && Number.isFinite(numericAmount)
          ? numericAmount
          : null,
      );
    }
  }

  let webhookQuery = supabase
    .from("webhook_events")
    .select("id, expense_id")
    .eq("tenant_id", tenantId)
    .eq("provider", "sepay")
    .not("expense_id", "is", null);
  if (expenseIds != null) {
    webhookQuery = webhookQuery.in("expense_id", [...expenseIds]);
  }
  const { data: webhookRows, error: webhookErr } = await webhookQuery;

  if (webhookErr) {
    console.error(
      "[finance:expense-match] failed to load webhook_event expense matches",
      webhookErr.code,
    );
    return null;
  }

  for (const row of (webhookRows ?? []) as WebhookExpenseMatchRow[]) {
    if (row.expense_id != null) {
      addMatch(row.expense_id, row.id, null);
    }
  }

  return toAggregateMap();
}

export async function fetchExpenseMatchOptions(): Promise<
  ActionResult<ExpenseMatchOption[]>
> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem chi phí." };

  const { supabase, claims } = ctx;
  const matchedByExpense = await fetchExpenseMatchMap(
    supabase,
    claims.tenant_id,
  );
  if (matchedByExpense == null) {
    return { success: false, error: "Không tải được dữ liệu khớp chi phí." };
  }

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, branch_id, expense_date, category, amount, payment_method, paid_at, vendor_name, note, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("payment_method", ["transfer", "unpaid"])
    .order("expense_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(150);

  if (error) {
    return { success: false, error: "Không tải được danh sách chi phí." };
  }

  return {
    success: true,
    data: (data ?? []).map((r) => {
      const match = matchedByExpense.get(r.id);
      return {
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
        matchedEventIds: match?.matchedEventIds ?? [],
        allocatedAmount: match ? match.allocatedAmount : 0,
      };
    }),
  };
}
