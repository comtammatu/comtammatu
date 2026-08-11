"use server";

/**
 * Operating-expense capture (D028 / blueprint P0-2).
 *
 * Single-entry expense-ledger writes for the owner finance cockpit. The summed
 * total feeds `fetchOperatingExpenseSummary` (finance-cockpit) which supplies
 * the operating-expense KPI and operating result. NOT a general ledger (D020);
 * supplier costs stay in supplier_invoices.
 */

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { parseMoneyToMinorUnits } from "@comtammatu/shared/money";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import type { SepayRefundMatchOption } from "./_lib/sepay-bank-transaction-model";
import {
  fetchExpenseBankTransactionMatchMap,
  fetchExpenseMatchMap,
  mapExpenseVatBreakdown,
  type ExpenseRow,
} from "./_lib/expense-match-options";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_PAYMENT_METHODS,
} from "./_lib/expense-categories";
import { FINANCE_LOCATIONS, type FinanceLocation } from "./_lib/finance-params";
import {
  applySalesBranchesFilter,
  fetchSalesBranchIds,
} from "./_lib/finance-sales-branches";
import {
  expenseGrossFromBreakdown,
  expenseVatLineSchema,
  refineExpenseVatBreakdown,
  toExpenseVatBreakdownPayload,
} from "./_lib/expense-vat";

// Shared ref with finance/actions so parallel RSC loaders hit one getAuthContext.
const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXPENSE_MINOR_UNITS = 999_999_999_999_999n;
const EXPENSE_LIST_PAGE_SIZE = 100;
const fetchExpensesSchema = z
  .object({
    location: z.enum(FINANCE_LOCATIONS),
    branchId: z.number().int().positive().nullable().optional(),
    startDate: z.string().regex(BUSINESS_DATE),
    endDate: z.string().regex(BUSINESS_DATE),
  })
  .refine((value) => value.startDate <= value.endDate);

export type {
  ExpenseMatchOption,
  ExpenseRow,
  ExpenseVatBreakdownLine,
} from "./_lib/expense-match-options";

export interface CreateExpenseResult {
  id: number;
}

export interface SepayRefundSearchCursor {
  approvedAt: string;
  id: number;
}

export interface SepayRefundSearchPage {
  items: SepayRefundMatchOption[];
  nextCursor: SepayRefundSearchCursor | null;
}

interface RefundSearchRow {
  id: number;
  amount: number;
  approved_at: string | null;
  order_id: number;
  webhook_event_id: number | null;
  orders:
    { order_number: string | null } | { order_number: string | null }[] | null;
}

const expenseInputSchema = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  expenseDate: z.string().regex(BUSINESS_DATE, "Ngày không hợp lệ"),
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  vatBreakdown: z.array(expenseVatLineSchema).min(1).max(4),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  vendorName: z.string().trim().max(200).optional(),
  note: z
    .string()
    .trim()
    .min(5, "Nội dung chi phải có ít nhất 5 ký tự")
    .max(500),
  invoiceAttachmentUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .refine(
      (value) =>
        value == null || value.length === 0 || /^https?:\/\//i.test(value),
      { error: "Đường dẫn hóa đơn không hợp lệ" },
    ),
});

const createExpenseSchema = expenseInputSchema.superRefine((data, ctx) => {
  refineExpenseVatBreakdown(data.vatBreakdown, (index, field, message) => {
    ctx.addIssue({
      code: "custom",
      message,
      path: ["vatBreakdown", index, field],
    });
  });
});

const updateExpenseSchema = expenseInputSchema
  .omit({ paymentMethod: true, vendorName: true })
  .extend({ expenseId: z.coerce.number().int().positive() })
  .superRefine((data, ctx) => {
    refineExpenseVatBreakdown(data.vatBreakdown, (index, field, message) => {
      ctx.addIssue({
        code: "custom",
        message,
        path: ["vatBreakdown", index, field],
      });
    });
  });

type UpdateExpenseRpcClient = {
  rpc: (
    fn: "update_operating_expense",
    args: {
      p_expense_id: number;
      p_branch_id: number | null;
      p_expense_date: string;
      p_category: string;
      p_vat_breakdown: ReturnType<typeof toExpenseVatBreakdownPayload>;
      p_note: string;
      p_invoice_attachment_url: string | null;
    },
  ) => PromiseLike<{ error: { code?: string } | null }>;
};

function validateExpenseAmount(
  vatBreakdown: z.infer<typeof createExpenseSchema>["vatBreakdown"],
): string | null {
  const amountMinorUnits = parseMoneyToMinorUnits(
    expenseGrossFromBreakdown(vatBreakdown),
  );
  return amountMinorUnits <= 0n || amountMinorUnits > MAX_EXPENSE_MINOR_UNITS
    ? "Số tiền không hợp lệ"
    : null;
}

export async function createExpense(
  input: z.infer<typeof createExpenseSchema>,
): Promise<ActionResult<CreateExpenseResult>> {
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
  const vatBreakdown = toExpenseVatBreakdownPayload(parsed.data.vatBreakdown);
  const amount = expenseGrossFromBreakdown(parsed.data.vatBreakdown);
  const amountError = validateExpenseAmount(parsed.data.vatBreakdown);
  if (amountError) return { success: false, error: amountError };

  if (
    parsed.data.category === "cogs_manual" ||
    parsed.data.category === "bank_deposit"
  ) {
    return {
      success: false,
      error:
        parsed.data.category === "cogs_manual"
          ? "Giá vốn món lấy từ tiêu hao kho; không nhập thủ công ở chi phí vận hành."
          : "Nộp tiền vào ngân hàng chỉ được ghi nhận từ giao dịch SePay đã xác thực.",
    };
  }

  if (
    branchId != null &&
    !(await canAccessBranch(supabase, claims, branchId))
  ) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const invoiceAttachmentUrl =
    parsed.data.invoiceAttachmentUrl &&
    parsed.data.invoiceAttachmentUrl.length > 0
      ? parsed.data.invoiceAttachmentUrl
      : null;

  const paidAt =
    parsed.data.paymentMethod === "unpaid" ? null : new Date().toISOString();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: branchId,
      expense_date: parsed.data.expenseDate,
      category: parsed.data.category,
      amount: 0,
      subtotal: 0,
      vat_amount: 0,
      vat_breakdown: vatBreakdown,
      payment_method: parsed.data.paymentMethod,
      paid_at: paidAt,
      vendor_name: parsed.data.vendorName ?? null,
      note: parsed.data.note ?? null,
      invoice_attachment_url: invoiceAttachmentUrl,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Không thể lưu chi phí." };
  }

  const expenseId = data.id;

  await logAudit(supabase, {
    action: "create",
    entityType: "expense",
    entityId: expenseId,
    newData: {
      branch_id: branchId,
      category: parsed.data.category,
      amount,
      vat_breakdown: vatBreakdown,
      payment_method: parsed.data.paymentMethod,
      transfer_content: null,
      invoice_attachment_url: invoiceAttachmentUrl,
    },
  });

  return {
    success: true,
    data: { id: expenseId },
  };
}

export async function updateExpense(
  input: z.infer<typeof updateExpenseSchema>,
): Promise<ActionResult> {
  const parsed = updateExpenseSchema.safeParse(input);
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
  if (!ctx) return { success: false, error: "Không có quyền sửa chi phí." };

  const branchId = parsed.data.branchId ?? null;
  if (
    branchId != null &&
    !(await canAccessBranch(ctx.supabase, ctx.claims, branchId))
  ) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const amountError = validateExpenseAmount(parsed.data.vatBreakdown);
  if (amountError) return { success: false, error: amountError };

  const { error } = await (
    ctx.supabase as unknown as UpdateExpenseRpcClient
  ).rpc("update_operating_expense", {
    p_expense_id: parsed.data.expenseId,
    p_branch_id: branchId,
    p_expense_date: parsed.data.expenseDate,
    p_category: parsed.data.category,
    p_vat_breakdown: toExpenseVatBreakdownPayload(parsed.data.vatBreakdown),
    p_note: parsed.data.note,
    p_invoice_attachment_url: parsed.data.invoiceAttachmentUrl?.trim() || null,
  });

  if (error) {
    console.error(
      "[finance:expense-update] failed to update expense",
      error.code,
    );
    return {
      success: false,
      error: mapExpenseMutationError(error.code, "Không thể sửa khoản chi."),
    };
  }

  await logAudit(ctx.supabase, {
    action: "update",
    entityType: "expense",
    entityId: parsed.data.expenseId,
    newData: {
      branch_id: branchId,
      category: parsed.data.category,
      expense_date: parsed.data.expenseDate,
    },
  });

  return { success: true };
}

const expenseMutationSchema = z.object({
  expenseId: z.coerce.number().int().positive(),
});

const transitionExpensePaymentSchema = expenseMutationSchema.extend({
  targetMethod: z.enum(EXPENSE_PAYMENT_METHODS),
});

function mapExpenseMutationError(
  code: string | undefined,
  fallback: string,
): string {
  if (code === "42501") return "Không có quyền sửa khoản chi này.";
  if (code === "P0002") return "Không tìm thấy khoản chi.";
  if (code === "23505") {
    return "Khoản chi đã được khớp giao dịch ngân hàng.";
  }
  if (code === "40001") {
    return "Trạng thái khoản chi vừa thay đổi. Hãy tải lại và thử lại.";
  }
  if (code === "23514") {
    return "Trạng thái hiện tại không cho phép thao tác này.";
  }
  if (code === "PGRST202") {
    return "Chức năng cập nhật khoản chi chưa sẵn sàng.";
  }
  return fallback;
}

export async function transitionExpensePayment(
  input: z.infer<typeof transitionExpensePaymentSchema>,
): Promise<ActionResult> {
  const parsed = transitionExpensePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền sửa chi phí." };

  const { data, error } = await ctx.supabase.rpc("transition_expense_payment", {
    p_expense_id: parsed.data.expenseId,
    p_target_method: parsed.data.targetMethod,
  });
  const updated = data?.[0];

  if (error || !updated) {
    console.error(
      "[finance:expense-payment] failed to transition expense",
      error?.code,
    );
    return {
      success: false,
      error: mapExpenseMutationError(
        error?.code,
        "Không thể cập nhật thanh toán khoản chi.",
      ),
    };
  }

  await logAudit(ctx.supabase, {
    action: "update",
    entityType: "expense",
    entityId: parsed.data.expenseId,
    newData: {
      payment_method: parsed.data.targetMethod,
      paid_at: updated.paid_at ?? null,
    },
  });

  return { success: true };
}

export async function deleteExpense(
  input: z.infer<typeof expenseMutationSchema>,
): Promise<ActionResult> {
  const parsed = expenseMutationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền xóa chi phí." };

  const { error } = await ctx.supabase.rpc("cancel_expense", {
    p_expense_id: parsed.data.expenseId,
  });

  if (error) {
    console.error(
      "[finance:expense-cancel] failed to cancel expense",
      error.code,
    );
    return {
      success: false,
      error: mapExpenseMutationError(error.code, "Không thể xóa chi phí."),
    };
  }

  await logAudit(ctx.supabase, {
    action: "cancel",
    entityType: "expense",
    entityId: parsed.data.expenseId,
  });

  return { success: true };
}

export async function fetchExpenses(params: {
  location: FinanceLocation;
  branchId?: number | null;
  startDate: string;
  endDate: string;
}): Promise<ActionResult<ExpenseRow[]>> {
  const parsed = fetchExpensesSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Bộ lọc chi phí không hợp lệ." };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem chi phí." };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("expenses")
    .select(
      "id, branch_id, expense_date, category, amount, subtotal, vat_amount, vat_breakdown, payment_method, paid_at, transfer_content, vendor_name, note, invoice_attachment_url, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("category", [...EXPENSE_CATEGORIES_BY_GROUP.operating])
    .gte("expense_date", parsed.data.startDate)
    .lte("expense_date", parsed.data.endDate)
    .order("expense_date", { ascending: false })
    .order("id", { ascending: false })
    .range(0, EXPENSE_LIST_PAGE_SIZE - 1);

  if (parsed.data.location === "company") {
    query = query.is("branch_id", null);
  } else if (parsed.data.location === "branches") {
    const salesBranchIds = await fetchSalesBranchIds(
      supabase as never,
      claims.tenant_id,
    );
    query = applySalesBranchesFilter(query, "branch_id", salesBranchIds);
  } else if (
    parsed.data.location === "branch" &&
    parsed.data.branchId != null
  ) {
    query = query.eq("branch_id", parsed.data.branchId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không tải được danh sách chi phí." };
  }

  const rows: Array<
    Omit<ExpenseRow, "matchedEventIds" | "matchedBankTransactionIds">
  > = (data ?? []).map((row) => {
    const amount = Number(row.amount);
    const subtotal = Number(row.subtotal ?? amount);
    const vatAmount = Number(row.vat_amount ?? 0);
    return {
      id: row.id,
      branch_id: row.branch_id,
      expense_date: row.expense_date,
      category: row.category,
      amount,
      subtotal,
      vat_amount: vatAmount,
      vat_breakdown: mapExpenseVatBreakdown(row.vat_breakdown, {
        subtotal,
        vatAmount,
      }),
      payment_method: row.payment_method,
      paid_at: row.paid_at,
      transfer_content: row.transfer_content,
      vendor_name: row.vendor_name,
      note: row.note,
      invoice_attachment_url: row.invoice_attachment_url ?? null,
      created_at: row.created_at,
    };
  });
  const expenseIds = rows.map((row) => row.id);
  const [matchedByExpense, matchedByBankTransaction] = await Promise.all([
    fetchExpenseMatchMap(supabase, claims.tenant_id, expenseIds),
    fetchExpenseBankTransactionMatchMap(supabase, claims.tenant_id, expenseIds),
  ]);

  return {
    success: true,
    data: rows.map((row) => ({
      ...row,
      matchedEventIds: matchedByExpense.get(row.id) ?? [],
      matchedBankTransactionIds: matchedByBankTransaction.get(row.id) ?? [],
    })),
  };
}

export async function fetchExpenseById(
  expenseId: number,
): Promise<ActionResult<ExpenseRow | null>> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem chi phí." };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, branch_id, expense_date, category, amount, subtotal, vat_amount, vat_breakdown, payment_method, paid_at, transfer_content, vendor_name, note, invoice_attachment_url, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("id", expenseId)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không tải được thông tin khoản chi." };
  }
  if (!data) return { success: true, data: null };

  const amount = Number(data.amount);
  const subtotal = Number(data.subtotal ?? amount);
  const vatAmount = Number(data.vat_amount ?? 0);
  const row = {
    id: data.id,
    branch_id: data.branch_id,
    expense_date: data.expense_date,
    category: data.category,
    amount,
    subtotal,
    vat_amount: vatAmount,
    vat_breakdown: mapExpenseVatBreakdown(data.vat_breakdown, {
      subtotal,
      vatAmount,
    }),
    payment_method: data.payment_method,
    paid_at: data.paid_at,
    transfer_content: data.transfer_content,
    vendor_name: data.vendor_name,
    note: data.note,
    invoice_attachment_url: data.invoice_attachment_url ?? null,
    created_at: data.created_at,
  };

  const [matchedByExpense, matchedByBankTransaction] = await Promise.all([
    fetchExpenseMatchMap(supabase, claims.tenant_id, [expenseId]),
    fetchExpenseBankTransactionMatchMap(supabase, claims.tenant_id, [expenseId]),
  ]);

  return {
    success: true,
    data: {
      ...row,
      matchedEventIds: matchedByExpense.get(expenseId) ?? [],
      matchedBankTransactionIds: matchedByBankTransaction.get(expenseId) ?? [],
    },
  };
}

function getVNDateRangeUtc(startDate: string, endDate: string) {
  const { startIso } = getVNDayUtcRange(startDate);
  const { endIso } = getVNDayUtcRange(endDate);
  return { startIso, endIso };
}

// Read-only actual food cost (giá vốn món) from inventory valuation
// allocations, mirroring the finance cockpit's ingredientCost so the expenses
// page shows the same figure. NOT an expense-ledger row: keeps it out of
// operating expense / net profit (which already nets food cost via gross
// profit), so no double count.
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
}): Promise<
  ActionResult<{
    /** Sale-linked food cost (order_id) + sale-lineage reprice. */
    total: number;
    /** Manual phiếu tiêu hao / ops consumption without a paid order. */
    operatingConsumption: number;
    orderCount: number;
  }>
> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem giá vốn." };

  const { supabase, claims } = ctx;
  if (
    params.branchId != null &&
    !(await canAccessBranch(supabase, claims, params.branchId))
  ) {
    return { success: false, error: "Không có quyền xem giá vốn." };
  }
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetary.client) {
    return { success: false, error: "Không có quyền xem giá vốn." };
  }
  const { startIso, endIso } = getVNDateRangeUtc(
    params.startDate,
    params.endDate,
  );
  const { data: cutover, error: cutoverError } = await monetary.client
    .from("inventory_valuation_cutovers")
    .select("status")
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (cutoverError) {
    return { success: false, error: "Không tải được giá vốn món." };
  }
  if (cutover?.status !== "active") {
    return {
      success: false,
      error: "Giá vốn món yêu cầu sổ định giá kho đang hoạt động.",
    };
  }

  let eventQuery = monetary.client
    .from("inventory_valuation_events")
    .select(
      "value_delta, stock_movements!inner ( order_id, issue_id, branch_id )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("terminal_bucket", "food_cost")
    .gte("effective_at", startIso)
    .lt("effective_at", endIso);

  if (params.branchId != null) {
    eventQuery = eventQuery.eq("stock_movements.branch_id", params.branchId);
  }

  const repriceQuery = monetary.client
    .from("inventory_value_allocations")
    .select(
      "source_origin_id, allocated_value, inventory_valuation_events!inner ( effective_at, event_type )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("allocation_bucket", "food_cost")
    .in("inventory_valuation_events.event_type", [
      "invoice_reprice",
      "credit_reprice",
    ])
    .gte("inventory_valuation_events.effective_at", startIso)
    .lt("inventory_valuation_events.effective_at", endIso);
  const [eventsResult, repriceResult] = await Promise.all([
    eventQuery,
    repriceQuery,
  ]);
  if (eventsResult.error || repriceResult.error) {
    return { success: false, error: "Không tải được giá vốn món." };
  }

  const orderIds = new Set<number>();
  let saleFoodCostTotal = 0;
  let operatingConsumptionTotal = 0;
  for (const row of eventsResult.data ?? []) {
    const movement = Array.isArray(row.stock_movements)
      ? row.stock_movements[0]
      : row.stock_movements;
    const amount = Math.abs(Number(row.value_delta));
    // Paid-order POS consumption stays in Giá vốn món; manual phiếu tiêu hao
    // (issue without order) is Tiêu hao vận hành — same food_cost bucket,
    // different owner-facing card.
    if (movement?.order_id != null) {
      orderIds.add(movement.order_id);
      saleFoodCostTotal += amount;
    } else {
      operatingConsumptionTotal += amount;
    }
  }
  const repriceTotal = (repriceResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.allocated_value),
    0,
  );
  let scopedRepriceTotal = repriceTotal;
  if (params.branchId != null && (repriceResult.data?.length ?? 0) > 0) {
    const originIds = [
      ...new Set((repriceResult.data ?? []).map((row) => row.source_origin_id)),
    ];
    const { data: lineageRows, error: lineageError } = await monetary.client
      .from("inventory_value_allocations")
      .select(
        "source_origin_id, allocated_quantity, inventory_valuation_events!inner ( terminal_bucket, stock_movements!inner ( branch_id ) )",
      )
      .eq("tenant_id", claims.tenant_id)
      .in("source_origin_id", originIds)
      .eq("inventory_valuation_events.terminal_bucket", "food_cost");
    if (lineageError) {
      return { success: false, error: "Không tải được giá vốn món." };
    }
    const quantities = new Map<
      number,
      { total: number; selectedBranch: number }
    >();
    for (const row of lineageRows ?? []) {
      const originId = Number(row.source_origin_id);
      const event = Array.isArray(row.inventory_valuation_events)
        ? row.inventory_valuation_events[0]
        : row.inventory_valuation_events;
      const movement = Array.isArray(event?.stock_movements)
        ? event.stock_movements[0]
        : event?.stock_movements;
      const current = quantities.get(originId) ?? {
        total: 0,
        selectedBranch: 0,
      };
      const quantity = Number(row.allocated_quantity);
      current.total += quantity;
      if (movement?.branch_id === params.branchId) {
        current.selectedBranch += quantity;
      }
      quantities.set(originId, current);
    }
    scopedRepriceTotal = (repriceResult.data ?? []).reduce((sum, row) => {
      const quantity = quantities.get(Number(row.source_origin_id));
      if (!quantity || quantity.total <= 0) return sum;
      return (
        sum +
        (Number(row.allocated_value) * quantity.selectedBranch) / quantity.total
      );
    }, 0);
  }
  // Invoice/credit reprice adjusts inventory that already flowed to food cost;
  // attribute it to sale food cost (not operating slips).
  const total = saleFoodCostTotal + scopedRepriceTotal;
  return {
    success: true,
    data: {
      total,
      operatingConsumption: operatingConsumptionTotal,
      orderCount: orderIds.size,
    },
  };
}

const bankReconciliationIdentityShape = {
  bankTransactionId: z.number().int().positive().nullable(),
  eventId: z.number().int().positive().nullable(),
};
const hasBankReconciliationIdentity = (input: {
  bankTransactionId: number | null;
  eventId: number | null;
}) => input.bankTransactionId != null || input.eventId != null;

const matchSepayExpensesSchema = z
  .object({
    ...bankReconciliationIdentityShape,
    expenseIds: z.array(z.coerce.number().int().positive()).max(20),
  })
  .refine(hasBankReconciliationIdentity);

const matchSepaySupplierPaymentsSchema = z
  .object({
    ...bankReconciliationIdentityShape,
    supplierPaymentIds: z.array(z.coerce.number().int().positive()).max(20),
  })
  .refine(hasBankReconciliationIdentity);

const matchSepayRefundsSchema = z
  .object({
    ...bankReconciliationIdentityShape,
    refundIds: z.array(z.coerce.number().int().positive()).max(20),
  })
  .refine(hasBankReconciliationIdentity);

const searchSepayRefundsSchema = z.object({
  query: z.string().trim().max(64).optional().default(""),
  cursor: z
    .object({
      approvedAt: z.string().datetime({ offset: true }),
      id: z.coerce.number().int().positive(),
    })
    .nullable()
    .optional(),
});

const SEPAY_REFUND_SEARCH_PAGE_SIZE = 25;
const LIKE_WILDCARD = String.fromCharCode(37);

type SupplierPaymentMatchRpcError = {
  code?: string;
  message?: string;
};

type SupplierPaymentMatchRpcClient = {
  rpc: (
    fn: "match_sepay_transaction_supplier_payments",
    args: { p_event_id: number; p_supplier_payment_ids: number[] },
  ) => PromiseLike<{
    data: unknown;
    error: SupplierPaymentMatchRpcError | null;
  }>;
};

type RefundMatchRpcClient = {
  rpc: (
    fn: "match_sepay_transaction_refunds",
    args: { p_event_id: number; p_refund_ids: number[] },
  ) => PromiseLike<{
    data: unknown;
    error: SupplierPaymentMatchRpcError | null;
  }>;
};

export async function searchSepayRefundOptions(input: {
  query?: string;
  cursor?: SepayRefundSearchCursor | null;
}): Promise<ActionResult<SepayRefundSearchPage>> {
  const parsed = searchSepayRefundsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Từ khóa hoặc trang tìm kiếm không hợp lệ.",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền xem khoản hoàn tiền." };
  }

  const { supabase, claims } = ctx;
  let query = supabase
    .from("refunds")
    .select(
      "id, amount, approved_at, order_id, webhook_event_id, orders!inner ( order_number )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "approved")
    .filter("payout_method", "eq", "bank_transfer")
    .filter("webhook_event_id", "is", null)
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SEPAY_REFUND_SEARCH_PAGE_SIZE + 1);

  if (parsed.data.query) {
    const escapedQuery = parsed.data.query
      .replaceAll(LIKE_WILDCARD, `\\${LIKE_WILDCARD}`)
      .replaceAll("_", "\\_");
    query = query.ilike(
      "orders.order_number",
      `${LIKE_WILDCARD}${escapedQuery}${LIKE_WILDCARD}`,
    );
  }

  if (parsed.data.cursor) {
    const { approvedAt, id } = parsed.data.cursor;
    query = query.or(
      `approved_at.lt.${approvedAt},and(approved_at.eq.${approvedAt},id.lt.${id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error(
      "[finance:refund-search] failed to load refund options",
      error.code,
    );
    return { success: false, error: "Không tải được khoản hoàn tiền." };
  }

  const rows = ((data ?? []) as unknown as RefundSearchRow[]).filter(
    (row): row is RefundSearchRow & { approved_at: string } =>
      row.approved_at != null,
  );
  const rawPageRows = rows.slice(0, SEPAY_REFUND_SEARCH_PAGE_SIZE);
  const rawRefundIds = rawPageRows.map((row) => row.id);
  const { data: canonicalMatchRows, error: canonicalMatchError } =
    rawRefundIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("bank_transaction_reconciliation_matches")
          .select("refund_id")
          .eq("tenant_id", claims.tenant_id)
          .in("refund_id", rawRefundIds);

  if (
    canonicalMatchError &&
    !isExpenseMatchSchemaMissing(canonicalMatchError.code)
  ) {
    console.error(
      "[finance:refund-search] failed to load canonical matches",
      canonicalMatchError.code,
    );
    return { success: false, error: "Không tải được khoản hoàn tiền." };
  }

  const canonicalMatchedRefundIds = new Set(
    (canonicalMatchRows ?? []).flatMap((row) =>
      row.refund_id == null ? [] : [row.refund_id],
    ),
  );
  const hasMore = rows.length > SEPAY_REFUND_SEARCH_PAGE_SIZE;
  const pageRows = rawPageRows.filter(
    (row) => !canonicalMatchedRefundIds.has(row.id),
  );
  const items = pageRows.map((row) => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    return {
      id: row.id,
      amount: Number(row.amount),
      approvedAt: row.approved_at,
      orderId: row.order_id,
      orderNumber: order?.order_number ?? `#${row.order_id}`,
      webhookEventId: row.webhook_event_id,
    };
  });
  const last = rawPageRows.at(-1);

  return {
    success: true,
    data: {
      items,
      nextCursor:
        hasMore && last ? { approvedAt: last.approved_at, id: last.id } : null,
    },
  };
}

function mapMatchExpenseError(code?: string, message?: string): string {
  const normalized = message?.toLowerCase() ?? "";
  if (code === "P0002") return "Không tìm thấy giao dịch hoặc khoản chi.";
  if (code === "23505") return "Có dòng khớp bị trùng.";
  if (
    normalized.includes("bank_reconciliation_amount_mismatch") ||
    normalized.includes("expense_amount_mismatch")
  ) {
    return "Tổng khoản chi không bằng số tiền trên sao kê.";
  }
  if (code === "23514") return "Giao dịch này không thể khớp khoản chi.";
  if (isExpenseMatchSchemaMissing(code)) {
    return "Chưa cập nhật dữ liệu ghép nhiều khoản chi.";
  }
  return "Không thể khớp giao dịch.";
}

function isExpenseMatchSchemaMissing(code?: string): boolean {
  return code === "PGRST202" || code === "PGRST205" || code === "42P01";
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
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền sửa chi phí." };

  const { supabase } = ctx;
  const expenseIds = Array.from(new Set(parsed.data.expenseIds));
  const canonicalResult =
    parsed.data.bankTransactionId == null
      ? null
      : await supabase.rpc("reconcile_bank_transaction_targets", {
          p_bank_transaction_id: parsed.data.bankTransactionId,
          p_target_type: "expense",
          p_target_ids: expenseIds,
        });
  const legacyResult =
    canonicalResult != null || parsed.data.eventId == null
      ? null
      : await supabase.rpc("match_sepay_transaction_expenses", {
          p_event_id: parsed.data.eventId,
          p_expense_ids: expenseIds,
        });
  const error = canonicalResult?.error ?? legacyResult?.error ?? null;

  if (error) {
    if (!isExpenseMatchSchemaMissing(error.code)) {
      console.error(
        "[finance:expense-match] failed to match expenses",
        error.code,
      );
    }
    return {
      success: false,
      error: mapMatchExpenseError(error.code, error.message),
    };
  }

  if (canonicalResult == null && parsed.data.eventId != null) {
    await logAudit(supabase, {
      action: "update",
      entityType: "webhook_event",
      entityId: parsed.data.eventId,
      newData: { expense_ids: expenseIds },
    });
  }

  return { success: true };
}

export async function matchSepayTransactionWithSupplierPayments(
  input: z.infer<typeof matchSepaySupplierPaymentsSchema>,
): Promise<ActionResult> {
  const parsed = matchSepaySupplierPaymentsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền đối soát công nợ NCC." };
  }

  const supplierPaymentIds = Array.from(
    new Set(parsed.data.supplierPaymentIds),
  );
  const canonicalResult =
    parsed.data.bankTransactionId == null
      ? null
      : await ctx.supabase.rpc("reconcile_bank_transaction_targets", {
          p_bank_transaction_id: parsed.data.bankTransactionId,
          p_target_type: "supplier_payment",
          p_target_ids: supplierPaymentIds,
        });
  const legacyResult =
    canonicalResult != null || parsed.data.eventId == null
      ? null
      : await (ctx.supabase as unknown as SupplierPaymentMatchRpcClient).rpc(
          "match_sepay_transaction_supplier_payments",
          {
            p_event_id: parsed.data.eventId,
            p_supplier_payment_ids: supplierPaymentIds,
          },
        );
  const error = canonicalResult?.error ?? legacyResult?.error ?? null;

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    console.error(
      "[finance:supplier-payment-match] failed to match supplier payments",
      error.code,
    );
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền đối soát công nợ NCC." };
    }
    if (error.code === "P0002") {
      return { success: false, error: "Không tìm thấy khoản trả NCC phù hợp." };
    }
    if (
      message.includes("supplier_payment_amount_mismatch") ||
      message.includes("bank_reconciliation_amount_mismatch")
    ) {
      return {
        success: false,
        error: "Tổng khoản trả NCC không bằng số tiền trên sao kê.",
      };
    }
    if (
      message.includes("webhook_event_already_linked") ||
      message.includes("bank_reconciliation_target_already_matched")
    ) {
      return { success: false, error: "Giao dịch đã được gắn chứng từ khác." };
    }
    if (error.code === "PGRST202") {
      return { success: false, error: "Chức năng đối soát NCC chưa sẵn sàng." };
    }
    return { success: false, error: "Không thể khớp khoản trả NCC." };
  }

  if (canonicalResult == null && parsed.data.eventId != null) {
    await logAudit(ctx.supabase, {
      action: "update",
      entityType: "webhook_event",
      entityId: parsed.data.eventId,
      newData: { supplier_payment_ids: supplierPaymentIds },
    });
  }

  return { success: true };
}

export async function matchSepayTransactionWithRefunds(
  input: z.infer<typeof matchSepayRefundsSchema>,
): Promise<ActionResult> {
  const parsed = matchSepayRefundsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền đối soát hoàn tiền." };
  }

  const refundIds = Array.from(new Set(parsed.data.refundIds));
  const canonicalResult =
    parsed.data.bankTransactionId == null
      ? null
      : await ctx.supabase.rpc("reconcile_bank_transaction_targets", {
          p_bank_transaction_id: parsed.data.bankTransactionId,
          p_target_type: "refund",
          p_target_ids: refundIds,
        });
  const legacyResult =
    canonicalResult != null || parsed.data.eventId == null
      ? null
      : await (ctx.supabase as unknown as RefundMatchRpcClient).rpc(
          "match_sepay_transaction_refunds",
          {
            p_event_id: parsed.data.eventId,
            p_refund_ids: refundIds,
          },
        );
  const error = canonicalResult?.error ?? legacyResult?.error ?? null;

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    console.error("[finance:refund-match] failed to match refunds", error.code);
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền đối soát hoàn tiền." };
    }
    if (error.code === "P0002") {
      return {
        success: false,
        error: "Không tìm thấy khoản hoàn tiền phù hợp.",
      };
    }
    if (
      message.includes("refund_amount_mismatch") ||
      message.includes("bank_reconciliation_amount_mismatch")
    ) {
      return {
        success: false,
        error: "Tổng hoàn tiền không bằng số tiền trên sao kê.",
      };
    }
    if (
      message.includes("webhook_event_already_linked") ||
      message.includes("bank_reconciliation_target_already_matched")
    ) {
      return { success: false, error: "Giao dịch đã được gắn chứng từ khác." };
    }
    if (error.code === "PGRST202") {
      return {
        success: false,
        error: "Chức năng đối soát hoàn tiền chưa sẵn sàng.",
      };
    }
    return { success: false, error: "Không thể khớp khoản hoàn tiền." };
  }

  if (canonicalResult == null && parsed.data.eventId != null) {
    await logAudit(ctx.supabase, {
      action: "update",
      entityType: "webhook_event",
      entityId: parsed.data.eventId,
      newData: { refund_ids: refundIds },
    });
  }

  return { success: true };
}
