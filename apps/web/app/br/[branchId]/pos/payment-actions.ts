"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getPaymentProvider,
  getRegisteredMethods,
  VietQRProvider,
  type PaymentMethod,
  type PaymentProvider,
} from "@comtammatu/shared/providers";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { ensurePaymentProvidersRegistered } from "../../../../lib/payment-providers-init";
import { getAuthContextWithPermission } from "../../_lib/auth";

type PosSupabase = NonNullable<
  Awaited<ReturnType<typeof getAuthContextWithPermission>>
>["supabase"];

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const paymentSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  method: z.enum(["cash", "vietqr", "momo"]),
  amount: z.coerce.number().positive({ error: "Số tiền không hợp lệ" }),
});

export interface CreatePaymentSuccessData {
  payment_id: number;
  status: string;
  provider_ref?: string;
  qr_data?: string;
  redirect_url?: string;
  qr_info?: {
    bank_code?: string;
    bank_bin?: string;
    account_no?: string;
    account_name?: string;
    amount?: string;
    description?: string;
  };
}

interface OrderPaymentData {
  id: number;
  method: string;
  amount: number;
  status: string;
  provider_ref: string | null;
  paid_at: string | null;
  created_at: string;
}

function mapPaymentRpcError(message: string): string | null {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("posting_rule_not_found") ||
    normalized.includes("gl_account_not_found") ||
    normalized.includes("fiscal_period_closed")
  ) {
    return "Thanh toán tạm thời chưa thể hoàn tất do cấu hình kế toán chưa sẵn sàng. Vui lòng liên hệ quản lý.";
  }

  if (normalized.includes("tenant_mismatch")) {
    return "Không thể xử lý thanh toán cho chi nhánh này.";
  }

  return null;
}

function truthySetting(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

async function consumeStockForOrderCompat(
  supabase: PosSupabase,
  orderId: number,
) {
  return supabase.rpc("consume_stock_for_order", {
    p_order_id: orderId,
  });
}

async function readVietQrSettings(
  supabase: PosSupabase,
  tenantId: number,
): Promise<{
  enabled: boolean;
  bankCode: string;
  accountNo: string;
  accountName: string;
}> {
  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [
      SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
    ]);
  const s: Record<string, string> = {};
  if (rows) for (const row of rows) s[row.key] = row.value;
  return {
    enabled: truthySetting(s[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR]),
    bankCode:
      s[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] ||
      process.env.VIETQR_BANK_ID ||
      "",
    accountNo:
      s[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] ||
      process.env.VIETQR_ACCOUNT_NO ||
      "",
    accountName:
      s[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME] ||
      process.env.VIETQR_ACCOUNT_NAME ||
      "",
  };
}

async function resolveAllowedPaymentMethods(
  supabase: PosSupabase,
  tenantId: number,
): Promise<PaymentMethod[]> {
  ensurePaymentProvidersRegistered();

  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [
      SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR,
      SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO,
    ]);

  const settings: Record<string, string> = {};
  if (rows) {
    for (const row of rows) {
      settings[row.key] = row.value;
    }
  }

  const registered = new Set(getRegisteredMethods());
  const methods: PaymentMethod[] = [];

  if (registered.has("cash")) {
    methods.push("cash");
  }
  if (truthySetting(settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR])) {
    const vietqr = await readVietQrSettings(supabase, tenantId);
    if (vietqr.bankCode && vietqr.accountNo) {
      methods.push("vietqr");
    }
  }
  if (
    truthySetting(settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]) &&
    registered.has("momo")
  ) {
    methods.push("momo");
  }

  return methods;
}

/* ─── fetchPaymentMethodsForPos ─── */

/**
 * Methods available on POS for this tenant: cash + enabled e-wallets
 * with registered providers (env credentials).
 */
export async function fetchPaymentMethodsForPos(
  branchId: number,
): Promise<ActionResult<{ methods: PaymentMethod[] }>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const methods = await resolveAllowedPaymentMethods(
    supabase,
    claims.tenant_id,
  );

  return { success: true, data: { methods } };
}

/* ─── createPayment ─── */

/**
 * Create a payment record for an order.
 * Cash payments are immediately completed.
 * VietQR/MoMo payments start as pending.
 */
export async function createPayment(
  branchId: number,
  orderId: number,
  method: "cash" | "vietqr" | "momo",
  amount: number,
): Promise<ActionResult<CreatePaymentSuccessData>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedPayment = paymentSchema.safeParse({ orderId, method, amount });
  if (!parsedPayment.success) {
    return {
      success: false,
      error: parsedPayment.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Verify order exists and belongs to branch
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, total_amount, payment_status")
    .eq("id", parsedPayment.data.orderId)
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (orderError || !order) {
    return { success: false, error: "Đơn hàng không tồn tại." };
  }

  if (order.payment_status === "paid") {
    return { success: false, error: "Đơn hàng đã thanh toán." };
  }

  // Server-side amount validation
  if (parsedPayment.data.amount !== Number(order.total_amount)) {
    return {
      success: false,
      error: "Số tiền không khớp với tổng đơn hàng.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

  const allowedMethods = await resolveAllowedPaymentMethods(
    supabase,
    claims.tenant_id,
  );
  if (!allowedMethods.includes(parsedPayment.data.method as PaymentMethod)) {
    return {
      success: false,
      error: "Phương thức thanh toán không được phép hoặc chưa cấu hình.",
    };
  }

  // Build provider: VietQR reads per-tenant bank config from system_settings
  // (with ENV fallback) so owners can rotate STK without redeploy.
  let provider: PaymentProvider | null;
  if (parsedPayment.data.method === "vietqr") {
    const vietqr = await readVietQrSettings(supabase, claims.tenant_id);
    if (!vietqr.bankCode || !vietqr.accountNo) {
      return {
        success: false,
        error: "Chưa cấu hình STK/ngân hàng VietQR cho chi nhánh.",
      };
    }
    provider = new VietQRProvider({
      apiKey: "",
      bankAccount: vietqr.accountNo,
      bankCode: vietqr.bankCode,
      accountName: vietqr.accountName || undefined,
    });
  } else {
    provider = getPaymentProvider(parsedPayment.data.method as PaymentMethod);
  }
  if (!provider) {
    return {
      success: false,
      error: `Phương thức thanh toán '${parsedPayment.data.method}' chưa được cấu hình.`,
    };
  }

  // Call provider to get QR/redirect data (if applicable)
  const providerResult = await provider.createPayment({
    tenantId: claims.tenant_id,
    orderId: parsedPayment.data.orderId,
    orderNumber: order.order_number,
    amount: parsedPayment.data.amount,
  });

  // Atomic RPC: insert payment + update order in one transaction
  // Prevents race condition where payment exists but order status is stale
  const { data, error: rpcError } = await supabase.rpc("create_payment", {
    p_tenant_id: claims.tenant_id,
    p_branch_id: parsedBranch.data,
    p_order_id: parsedPayment.data.orderId,
    p_method: parsedPayment.data.method,
    p_amount: parsedPayment.data.amount,
    p_created_by: user.id,
    p_provider_ref: providerResult.providerRef ?? undefined,
    p_status: providerResult.status,
  });

  if (rpcError) {
    const msg = rpcError.message ?? "";
    if (msg.includes("already_paid")) {
      return { success: false, error: "Đơn hàng đã thanh toán." };
    }
    if (msg.includes("amount_mismatch")) {
      return { success: false, error: "Số tiền không khớp." };
    }
    if (rpcError.code === "23505") {
      return {
        success: false,
        error: "Đơn hàng đang có thanh toán chờ xử lý.",
      };
    }
    const mappedError = mapPaymentRpcError(msg);
    if (mappedError) {
      console.error("[createPayment] rpc failed:", msg);
      return { success: false, error: mappedError };
    }
    return { success: false, error: "Không thể tạo thanh toán." };
  }

  const result = data as { payment_id: number; status: string } | null;
  if (!result) {
    return { success: false, error: "Không thể tạo thanh toán." };
  }

  // For cash payments (status=completed immediately), deduct ingredients from stock.
  // VietQR/Momo deduct after confirm/webhook completes.
  // All stock errors are non-fatal for pilot: stock_levels may not be initialized yet,
  // and insufficient_stock_ingredient errors are expected until stock data is seeded.
  if (result.status === "completed") {
    const { error: stockErr } = await consumeStockForOrderCompat(
      supabase,
      parsedPayment.data.orderId,
    );
    if (stockErr) {
      // Non-fatal: payment succeeded, stock reconciliation can be done manually.
      // See tasks/todo.md for payment-order desync recovery query.
      console.error(
        "[createPayment] consume_stock_for_order failed:",
        stockErr.message,
      );
    }
  }

  const qrInfo = pickVietQrInfo(providerResult.providerData);

  return {
    success: true,
    data: {
      payment_id: result.payment_id,
      status: result.status,
      ...(providerResult.providerRef
        ? { provider_ref: providerResult.providerRef }
        : {}),
      ...(providerResult.qrData ? { qr_data: providerResult.qrData } : {}),
      ...(providerResult.redirectUrl
        ? { redirect_url: providerResult.redirectUrl }
        : {}),
      ...(qrInfo ? { qr_info: qrInfo } : {}),
    },
  };
}

function pickVietQrInfo(
  providerData: Record<string, unknown> | undefined,
): CreatePaymentSuccessData["qr_info"] | null {
  if (!providerData) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const info = {
    bank_code: str(providerData.bankCode),
    bank_bin: str(providerData.bankBin),
    account_no: str(providerData.accountNo),
    account_name: str(providerData.accountName),
    amount: str(providerData.amount),
    description: str(providerData.description),
  };
  return Object.values(info).some((v) => v !== undefined) ? info : null;
}

/* ─── confirmPayment ─── */

/**
 * Confirm a pending VietQR/MoMo payment (called by webhook or poll).
 * Uses atomic RPC: update payment → update order → auto-post GL journal.
 * Stock consumption remains non-fatal secondary call.
 */
export async function confirmPayment(
  paymentId: number,
  providerRef: string,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(paymentId);
  if (!parsedId.success) {
    return { success: false, error: "Payment ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id === null) {
    return { success: false, error: "Không xác định được chi nhánh" };
  }

  // Fetch order_id for stock consumption (needed after RPC)
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("id, order_id, status")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", claims.branch_id)
    .single();

  if (fetchErr || !payment) {
    return { success: false, error: "Thanh toán không tồn tại." };
  }

  if (payment.status !== "pending") {
    return { success: false, error: "Thanh toán không ở trạng thái chờ." };
  }

  // Atomic RPC: confirm payment + update order + auto-post GL journal
  // Must run BEFORE stock consumption so if it fails, no stock is deducted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: rpcError } = await (supabase as any).rpc(
    "confirm_payment_and_post",
    {
      p_payment_id: parsedId.data,
      p_tenant_id: claims.tenant_id,
      p_branch_id: claims.branch_id,
      p_provider_ref: providerRef,
    },
  );

  if (rpcError) {
    const msg = rpcError.message ?? "";
    if (msg.includes("payment_not_found")) {
      return { success: false, error: "Thanh toán không tồn tại." };
    }
    if (msg.includes("payment_not_pending")) {
      return { success: false, error: "Thanh toán không ở trạng thái chờ." };
    }
    const mappedError = mapPaymentRpcError(msg);
    if (mappedError) {
      console.error("[confirmPayment] rpc failed:", msg);
      return { success: false, error: mappedError };
    }
    return { success: false, error: "Không thể xác nhận thanh toán." };
  }

  // Deduct ingredients AFTER payment confirmed successfully.
  // Non-fatal: stock_levels may not be initialized yet.
  // COGS in GL journal uses stock_movements from create_payment (cash)
  // or will be 0 for e-wallet (reconciled via period close).
  const { error: stockErr } = await consumeStockForOrderCompat(
    supabase,
    payment.order_id,
  );
  if (stockErr) {
    console.error(
      "[confirmPayment] consume_stock_for_order failed:",
      stockErr.message,
    );
  }

  return { success: true, data };
}

/* ─── fetchPaymentForOrder ─── */

export async function fetchPaymentForOrder(
  orderId: number,
): Promise<ActionResult<OrderPaymentData | null>> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id === null) {
    return { success: false, error: "Không xác định được chi nhánh" };
  }

  const { data, error } = await supabase
    .from("payments")
    .select("id, method, amount, status, provider_ref, paid_at, created_at")
    .eq("order_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", claims.branch_id)
    .neq("status", "failed")
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không thể tải thông tin thanh toán." };
  }

  return { success: true, data };
}

/* ─── fetchDailyReconciliation ─── */

/**
 * End-of-day reconciliation: orders vs payments for a branch.
 */
export async function fetchDailyReconciliation(
  branchId: number,
  date?: string,
): Promise<ActionResult> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(POS_ROLES, PERMISSION_KEYS.POS_USE);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const dateSchema = z.string().date().optional();
  const parsedDate = dateSchema.safeParse(date);
  const targetDate =
    parsedDate.success && parsedDate.data
      ? parsedDate.data
      : new Date().toISOString().split("T")[0]!;

  // Next day for exclusive upper bound (avoids sub-millisecond boundary bug)
  const nextDay = new Date(targetDate + "T00:00:00");
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split("T")[0]!;

  // Fetch orders for the day
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, total_amount, status, payment_status, payment_method")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", `${targetDate}T00:00:00`)
    .lt("created_at", `${nextDayStr}T00:00:00`);

  if (ordersErr) {
    return { success: false, error: "Không thể tải dữ liệu đối soát." };
  }

  // Fetch payments for the day
  const { data: payments, error: paymentsErr } = await supabase
    .from("payments")
    .select("id, method, amount, status")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", `${targetDate}T00:00:00`)
    .lt("created_at", `${nextDayStr}T00:00:00`);

  if (paymentsErr) {
    return { success: false, error: "Không thể tải dữ liệu thanh toán." };
  }

  const allOrders = orders ?? [];
  const allPayments = payments ?? [];

  const completedPayments = allPayments.filter((p) => p.status === "completed");

  const summary = {
    date: targetDate,
    total_orders: allOrders.length,
    completed_orders: allOrders.filter(
      (o) => o.status === "completed" || o.status === "served",
    ).length,
    cancelled_orders: allOrders.filter((o) => o.status === "cancelled").length,
    total_revenue: allOrders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total_amount), 0),
    paid_amount: completedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    ),
    unpaid_orders: allOrders.filter(
      (o) => o.payment_status !== "paid" && o.status !== "cancelled",
    ).length,
    by_method: {
      cash: completedPayments
        .filter((p) => p.method === "cash")
        .reduce((sum, p) => sum + Number(p.amount), 0),
      vietqr: completedPayments
        .filter((p) => p.method === "vietqr")
        .reduce((sum, p) => sum + Number(p.amount), 0),
      momo: completedPayments
        .filter((p) => p.method === "momo")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    },
  };

  return { success: true, data: summary };
}

// ─── Confirm cash payment (atomic mark-paid + enqueue receipt) ───────────

const cashConfirmSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Order ID không hợp lệ" }),
  cashReceived: z.coerce
    .number()
    .positive({ error: "Số tiền nhận phải lớn hơn 0" }),
});

export interface CashPaymentResult {
  order_id: number;
  payment_id: number;
  cash_received: number;
  cash_change: number;
  print_job_id: number;
}

/**
 * Atomic cashier confirm: validates cash ≥ total, marks paid + consumes
 * stock, persists cash values on the order, enqueues final receipt — all
 * in one transaction (see confirm_cash_payment RPC).
 *
 * Blocks under-payment hard (use order discount for employee meals).
 */
export async function confirmCashPayment(
  orderId: number,
  cashReceived: number,
): Promise<ActionResult<CashPaymentResult>> {
  const parsed = cashConfirmSchema.safeParse({ orderId, cashReceived });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Đầu vào không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_PRINT,
  );
  if (!ctx) return { success: false, error: "Không có quyền thanh toán" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("confirm_cash_payment", {
    p_order_id: parsed.data.orderId,
    p_cash_received: parsed.data.cashReceived,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("must be >=") || msg.includes("must be >") || msg.includes("cash_received")) {
      return {
        success: false,
        error: "Tiền nhận phải lớn hơn hoặc bằng tổng cần thu.",
      };
    }
    if (msg.includes("exceeds sane upper bound")) {
      return {
        success: false,
        error: "Số tiền nhận vượt ngưỡng hợp lệ. Vui lòng kiểm tra lại.",
      };
    }
    if (msg.includes("permission denied")) {
      return { success: false, error: "Không có quyền thanh toán" };
    }
    if (msg.includes("tenant mismatch")) {
      return { success: false, error: "Không có quyền truy cập đơn này" };
    }
    if (msg.includes("no active") && msg.includes("printer")) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình máy in hoá đơn. Liên hệ quản lý.",
      };
    }
    return {
      success: false,
      error: "Không thể xác nhận thanh toán. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    order_id: number;
    payment_id: number;
    cash_received: number;
    cash_change: number;
    print_job_id: number;
  } | null;
  if (!result) {
    return { success: false, error: "Không thể xác nhận thanh toán." };
  }

  return { success: true, data: result };
}
