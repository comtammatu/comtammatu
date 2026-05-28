"use server";

import { z } from "zod";
import { unstable_cache } from "next/cache";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  getPaymentProvider,
  getRegisteredMethods,
  type PaymentMethod,
  type PaymentProvider,
  type PaymentResult,
} from "@comtammatu/shared/providers";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { ensurePaymentProvidersRegistered } from "@lib/payment-providers-init";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { withActionPositional } from "@/_lib/with-action";
import { createTaxInvoice } from "@/_actions/finance";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import { mapRpcError } from "@/_lib/rpc-error-map";
import { posUseAuth } from "./_lib/auth";
import { cancelPendingPaymentSchema } from "./_lib/payment-schemas";
import {
  cancelPendingPaymentRpcFallback,
  cancelPendingPaymentRpcMappings,
} from "./_lib/payment-messages";
import { POS_ERROR_CODES } from "./_utils/error-codes";

type PosSupabase = NonNullable<
  Awaited<ReturnType<typeof getAuthContextWithPermission>>
>["supabase"];

const POS_ROLES = MODULE_ACL.pos.allowedRoles;
const POS_CONSUMPTION_SETUP_ERROR =
  "Chi nhánh chưa cấu hình Bếp chi nhánh cho POS. Thiết lập vị trí bếp trước khi thanh toán.";

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const paymentSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  method: z.enum(["cash", "momo"]),
  amount: z.coerce.number().positive({ error: "Số tiền không hợp lệ" }),
});

const orderIdSchema = z.coerce.number().int().positive();

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

export interface PendingRemotePaymentForBillData {
  method: "vietqr" | "momo";
  payment_id: number;
  provider_ref?: string;
  qr_data?: string;
  redirect_url?: string;
  qr_info?: CreatePaymentSuccessData["qr_info"];
}

function mapPaymentRpcError(message: string): string | null {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("default_consumption_location_missing") ||
    normalized.includes("consumption_location_missing") ||
    normalized.includes("consume_location_missing") ||
    normalized.includes("default_consumption")
  ) {
    return POS_CONSUMPTION_SETUP_ERROR;
  }

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

  if (
    normalized.includes("stock_consumption_failed") ||
    normalized.includes("stock_failed") ||
    normalized.includes("out_of_stock") ||
    normalized.includes("recipe_missing")
  ) {
    return "Chưa thể hoàn tất thanh toán vì tồn kho hoặc định mức món chưa sẵn sàng. Quản lý đã được thông báo.";
  }

  if (normalized.includes("amount_mismatch_recomputed")) {
    return "Tổng tiền đơn đã thay đổi so với dữ liệu món. Vui lòng tải lại đơn và kiểm tra trước khi thanh toán.";
  }

  return null;
}

function sanitizeProviderMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 160) : null;
}

function describeProviderCreateFailure(
  method: PaymentMethod,
  providerData?: Record<string, unknown>,
): string {
  if (method === "momo") {
    const message = sanitizeProviderMessage(providerData?.message);
    if (message) {
      return `Không tạo được QR MoMo: ${message}`;
    }

    const error = sanitizeProviderMessage(providerData?.error);
    if (error?.includes("NEXT_PUBLIC_APP_URL")) {
      return "Không tạo được QR MoMo vì NEXT_PUBLIC_APP_URL phải là URL HTTPS public để MoMo gọi IPN.";
    }
    if (error && /timeout|timed out|aborted/i.test(error)) {
      return "MoMo phản hồi quá chậm. Vui lòng thử tạo lại QR.";
    }

    return "Không tạo được QR MoMo. Vui lòng kiểm tra cấu hình MoMo hoặc thử lại.";
  }

  if (method === "vietqr") {
    return "Không tạo được thanh toán VietQR. Vui lòng kiểm tra cấu hình ngân hàng.";
  }

  return "Không thể tạo thanh toán.";
}

function describeProviderException(
  method: PaymentMethod,
  err: unknown,
): string {
  const message = err instanceof Error ? err.message : "";
  if (method === "momo" && message.includes("NEXT_PUBLIC_APP_URL")) {
    return "Không tạo được QR MoMo vì NEXT_PUBLIC_APP_URL phải là URL HTTPS public để MoMo gọi IPN.";
  }
  return describeProviderCreateFailure(method);
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strValue(
  providerData: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = providerData?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function buildVietQrImageUrlFromProviderData(
  providerData: Record<string, unknown> | undefined,
): string | undefined {
  const bankCode = strValue(providerData, "bankCode");
  const accountNo = strValue(providerData, "accountNo");
  if (!bankCode || !accountNo) return undefined;

  const url = new URL(
    `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNo)}-compact.png`,
  );
  const amount = strValue(providerData, "amount");
  const description = strValue(providerData, "description");
  const accountName = strValue(providerData, "accountName");
  if (amount) url.searchParams.set("amount", amount);
  if (description) url.searchParams.set("addInfo", description);
  if (accountName) url.searchParams.set("accountName", accountName);
  return url.toString();
}

function pickRemoteQrData(
  method: PaymentMethod,
  providerData: Record<string, unknown> | undefined,
): string | undefined {
  if (method === "momo") {
    // MoMo qrCodeUrl is QR payload data. payUrl/deeplink are navigation
    // links and must not be rendered as POS QR.
    return strValue(providerData, "qrCodeUrl");
  }

  if (method === "vietqr") {
    return (
      strValue(providerData, "qrData") ??
      strValue(providerData, "qrUrl") ??
      buildVietQrImageUrlFromProviderData(providerData)
    );
  }

  return undefined;
}

function buildStoredProviderData(providerResult: PaymentResult): Json {
  const raw = {
    ...(providerResult.providerData ?? {}),
    providerRef: providerResult.providerRef,
    qrData: providerResult.qrData,
    redirectUrl: providerResult.redirectUrl,
  };
  return JSON.parse(JSON.stringify(raw)) as Json;
}

async function persistPendingProviderData(
  supabase: PosSupabase,
  input: {
    paymentId: number;
    tenantId: number;
    branchId: number;
    providerResult: PaymentResult;
  },
) {
  const { error } = await supabase
    .from("payments")
    .update({
      provider_ref: input.providerResult.providerRef,
      provider_data: buildStoredProviderData(input.providerResult),
    })
    .eq("id", input.paymentId)
    .eq("tenant_id", input.tenantId)
    .eq("branch_id", input.branchId)
    .eq("status", "pending");

  if (error) {
    console.error("[createPayment] provider_data persist failed:", error.code);
  }
}

function buildPendingRemotePaymentForBillData(row: {
  id: number;
  method: string;
  provider_ref: string | null;
  provider_data: unknown;
}): PendingRemotePaymentForBillData | null {
  if (row.method !== "vietqr" && row.method !== "momo") return null;

  const method = row.method;
  const providerData = asRecord(row.provider_data);
  const qrInfo = pickVietQrInfo(providerData);
  const qrData = pickRemoteQrData(method, providerData);
  const redirectUrl =
    method === "momo" ? undefined : strValue(providerData, "redirectUrl");

  return {
    method,
    payment_id: row.id,
    ...(row.provider_ref ? { provider_ref: row.provider_ref } : {}),
    ...(qrData ? { qr_data: qrData } : {}),
    ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    ...(qrInfo ? { qr_info: qrInfo } : {}),
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

/* ─── Cached payment-config helpers ───────────────────────────────────────
 *
 * Both `fetchPaymentMethodsForPos` and `fetchVietQrConfig` read tenant-level
 * `system_settings` rows that change rarely (admin payments-settings page).
 * These calls fire on every Server Action route revalidation — caching them
 * collapses ~150ms × 2 fetches to near-zero cache hits.
 *
 * Tag: `payment-config` — admin payment-settings save calls
 *      `revalidateTag('payment-config')` to bust. Existing
 *      `revalidatePath('/br/[branchId]/pos', 'page')` route bust complements
 *      the tag bust (both fire on the same admin save).
 *
 * Service-role client + explicit `tenant_id` filter inside cache; outer
 * Server Actions still validate caller's branch membership BEFORE invoking.
 */
const getCachedPaymentSettings = unstable_cache(
  async (tenantId: number) => {
    const sb = createServiceClient();
    const { data: rows, error } = await sb
      .from("system_settings")
      .select("key, value")
      .eq("tenant_id", tenantId)
      .in("key", [
        SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR,
        SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO,
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
      ]);

    if (error) {
      throw new Error(`payment settings: ${error.message}`);
    }

    const settings: Record<string, string> = {};
    if (rows) {
      for (const row of rows) {
        settings[row.key] = row.value;
      }
    }
    return settings;
  },
  ["payment-config"],
  {
    revalidate: 600,
    tags: ["payment-config"],
  },
);

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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  ensurePaymentProvidersRegistered();
  let settings: Record<string, string>;
  try {
    settings = await getCachedPaymentSettings(claims.tenant_id);
  } catch {
    return {
      success: false,
      error: "Không thể tải cấu hình thanh toán. Vui lòng thử lại.",
    };
  }

  const registered = new Set(getRegisteredMethods());
  const methods: PaymentMethod[] = [];

  if (registered.has("cash")) {
    methods.push("cash");
  }
  if (truthySetting(settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR])) {
    const bank =
      settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] ||
      process.env["VIETQR_BANK_ID"] ||
      "";
    const account =
      settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] ||
      process.env["VIETQR_ACCOUNT_NO"] ||
      "";
    if (bank && account) {
      methods.push("vietqr");
    }
  }
  if (
    truthySetting(settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO]) &&
    registered.has("momo")
  ) {
    methods.push("momo");
  }

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
  method: "cash" | "momo",
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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

  const provider = getPaymentProvider(
    parsedPayment.data.method as PaymentMethod,
  );
  if (!provider) {
    return {
      success: false,
      error: `Phương thức thanh toán '${parsedPayment.data.method}' chưa được cấu hình.`,
    };
  }

  // Call provider to get QR/redirect data (if applicable).
  let providerResult: Awaited<ReturnType<PaymentProvider["createPayment"]>>;
  try {
    providerResult = await provider.createPayment({
      tenantId: claims.tenant_id,
      orderId: parsedPayment.data.orderId,
      orderNumber: order.order_number,
      amount: parsedPayment.data.amount,
    });
  } catch (err) {
    console.error("[createPayment] provider threw:", {
      method: parsedPayment.data.method,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: describeProviderException(
        parsedPayment.data.method as PaymentMethod,
        err,
      ),
    };
  }

  const isRemotePayment = parsedPayment.data.method !== "cash";
  if (isRemotePayment && providerResult.status === "failed") {
    console.error("[createPayment] provider failed:", {
      method: parsedPayment.data.method,
      providerRef: providerResult.providerRef,
      resultCode: providerResult.providerData?.resultCode,
    });
    return {
      success: false,
      error: describeProviderCreateFailure(
        parsedPayment.data.method as PaymentMethod,
        providerResult.providerData,
      ),
    };
  }

  if (
    isRemotePayment &&
    providerResult.status === "pending" &&
    !providerResult.qrData &&
    !providerResult.redirectUrl
  ) {
    return {
      success: false,
      error:
        parsedPayment.data.method === "momo"
          ? "MoMo đã tạo phiên thanh toán nhưng không trả về qrCodeUrl."
          : "Không tạo được dữ liệu QR cho phương thức thanh toán này.",
    };
  }

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
      const { data: existingPayment, error: existingError } = await supabase
        .from("payments")
        .select("id, status, provider_ref, method")
        .eq("order_id", parsedPayment.data.orderId)
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", parsedBranch.data)
        .neq("status", "failed")
        .maybeSingle();

      if (
        !existingError &&
        existingPayment &&
        existingPayment.status === "pending" &&
        existingPayment.method === parsedPayment.data.method
      ) {
        await persistPendingProviderData(supabase, {
          paymentId: existingPayment.id,
          tenantId: claims.tenant_id,
          branchId: parsedBranch.data,
          providerResult,
        });
        const qrInfo = pickVietQrInfo(providerResult.providerData);
        const providerRef =
          providerResult.providerRef ??
          existingPayment.provider_ref ??
          undefined;

        return {
          success: true,
          data: {
            payment_id: existingPayment.id,
            status: existingPayment.status,
            ...(providerRef ? { provider_ref: providerRef } : {}),
            ...(providerResult.qrData
              ? { qr_data: providerResult.qrData }
              : {}),
            ...(providerResult.redirectUrl
              ? { redirect_url: providerResult.redirectUrl }
              : {}),
            ...(qrInfo ? { qr_info: qrInfo } : {}),
          },
        };
      }

      return {
        success: false,
        error:
          "Đơn hàng đang có thanh toán chờ xử lý. Vui lòng tải lại hóa đơn và thử lại.",
      };
    }
    const mappedError = mapPaymentRpcError(msg);
    if (mappedError) {
      console.error("[createPayment] rpc failed:", msg);
      return { success: false, error: mappedError };
    }
    console.error("[createPayment] [unmapped] rpc error:", msg);
    return { success: false, error: "Không thể tạo thanh toán." };
  }

  const result = data as {
    payment_id: number;
    status: string;
    idempotent?: boolean;
  } | null;
  if (!result) {
    return { success: false, error: "Không thể tạo thanh toán." };
  }

  if (isRemotePayment) {
    await persistPendingProviderData(supabase, {
      paymentId: result.payment_id,
      tenantId: claims.tenant_id,
      branchId: parsedBranch.data,
      providerResult,
    });
  }

  // For cash payments (status=completed immediately), deduct ingredients from stock.
  // VietQR/Momo deduct after confirm/webhook completes.
  // All stock errors are non-fatal for pilot: stock_levels may not be initialized yet,
  // and insufficient_stock_ingredient errors are expected until stock data is seeded.
  if (result.status === "completed" && !result.idempotent) {
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

export async function fetchPendingRemotePaymentForBill(
  branchId: number,
  orderId: number,
): Promise<ActionResult<PendingRemotePaymentForBillData | null>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedOrderId = orderIdSchema.safeParse(orderId);
  if (!parsedOrderId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, method, status, provider_ref, provider_data")
    .eq("order_id", parsedOrderId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsedBranch.data)
    .neq("status", "failed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không thể tải phiên thanh toán." };
  }

  if (!payment || payment.status !== "pending") {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: buildPendingRemotePaymentForBillData(payment),
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

export interface ConfirmPaymentResult {
  /**
   * Receipt-print outcome. E-wallet money has already settled to the bank
   * account by the time the cashier confirms — printer queue failure must
   * NOT roll back the payment (mirrors HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN
   * regression rule). UI surfaces this as a soft warning toast instead.
   */
  print: { jobId?: number; failed: boolean; error?: string };
}

/**
 * Confirm a pending VietQR/MoMo payment (called by webhook or poll).
 * Uses atomic RPC: update payment → update order → auto-post GL journal.
 * Stock consumption remains non-fatal secondary call.
 * Receipt print is enqueued failsoft after RPC succeeds.
 */
export async function confirmPayment(
  paymentId: number,
  providerRef: string,
): Promise<ActionResult<ConfirmPaymentResult>> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(paymentId);
  if (!parsedId.success) {
    return { success: false, error: "Payment ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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
  const { error: rpcError } = await supabase.rpc("confirm_payment_and_post", {
    p_payment_id: parsedId.data,
    p_tenant_id: claims.tenant_id,
    p_branch_id: claims.branch_id,
    p_provider_ref: providerRef,
  });

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
    console.error("[confirmPayment] [unmapped] rpc error:", msg);
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

  // Enqueue receipt print. Cash flow does this atomically inside
  // confirm_cash_payment; the e-wallet RPC (confirm_payment_and_post)
  // does not, so the cashier never got a printed receipt for VietQR/MoMo
  // payments before this fix. Failsoft on purpose — see HDDT-PAYMENT-
  // FIRST-FAILSOFT-ORPHAN: money has already settled, refusing the close
  // because of a printer queue fault loses a real sale for a paper fault.
  let printOutcome: ConfirmPaymentResult["print"] = { failed: false };
  const { data: printRes, error: printErr } = await supabase.rpc(
    "enqueue_receipt_print",
    { p_order_id: payment.order_id },
  );
  if (printErr) {
    const printMsg = String(printErr.message ?? "").toLowerCase();
    let userError: string;
    if (printMsg.includes("no active") && printMsg.includes("printer")) {
      userError = "Chi nhánh chưa cấu hình máy in hóa đơn.";
    } else if (printMsg.includes("permission denied")) {
      userError = "Không có quyền in hóa đơn.";
    } else {
      userError = "Không thể gửi hóa đơn tới máy in.";
    }
    console.error(
      "[confirmPayment] enqueue_receipt_print failed:",
      printErr.message,
    );
    printOutcome = { failed: true, error: userError };
  } else {
    const printData = printRes as { job_id?: number } | null;
    if (printData?.job_id != null) {
      printOutcome = { failed: false, jobId: printData.job_id };
    }
  }

  return { success: true, data: { print: printOutcome } };
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const dateSchema = z.string().date().optional();
  const parsedDate = dateSchema.safeParse(date);
  const targetDate =
    parsedDate.success && parsedDate.data ? parsedDate.data : getVNDateString();
  const { startIso, endIso } = getVNDayUtcRange(targetDate);

  // Fetch orders for the day
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, total_amount, status, payment_status, payment_method")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (ordersErr) {
    return { success: false, error: "Không thể tải dữ liệu đối soát." };
  }

  // Fetch payments for the day
  const { data: payments, error: paymentsErr } = await supabase
    .from("payments")
    .select("id, method, amount, status")
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

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
      (o) => o.status === "completed" && o.payment_status === "paid",
    ).length,
    cancelled_orders: allOrders.filter((o) => o.status === "cancelled").length,
    total_revenue: allOrders
      .filter((o) => o.payment_status === "paid" && o.status !== "cancelled")
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
    .nonnegative({ error: "Số tiền nhận không được âm" }),
});

export interface CashPaymentResult {
  order_id: number;
  payment_id: number;
  cash_received: number;
  cash_change: number;
  /** Null when receipt enqueue failed inside the RPC — payment still committed
   * (see fail-soft contract in confirm_cash_payment). UI shows print_warning
   * as a toast and offers "in lại". */
  print_job_id: number | null;
  print_warning?: string | null;
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

  // Cash confirm yêu cầu POS_CONFIRM_PAYMENT (cashier/branch_manager+).
  // Waiter chỉ có POS_USE + POS_PRINT → in bill tạm tính OK, nhưng KHÔNG
  // được chạm két. VietQR/MoMo giữ POS_USE ở createPayment/confirmPayment
  // (e-wallet = webhook source of truth, không chạm cash drawer).
  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_CONFIRM_PAYMENT,
  );
  if (!ctx) return { success: false, error: "Không có quyền thanh toán" };

  const { supabase, claims } = ctx;

  if (claims.branch_id === null) {
    return { success: false, error: "Không xác định được chi nhánh" };
  }

  const { data, error } = await supabase.rpc("confirm_cash_payment", {
    p_order_id: parsed.data.orderId,
    p_cash_received: parsed.data.cashReceived,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (
      msg.includes("must be >=") ||
      msg.includes("must be >") ||
      msg.includes("cash_received")
    ) {
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
    const mappedError = mapPaymentRpcError(msg);
    if (mappedError) {
      console.error("[confirmCashPayment] rpc failed:", msg);
      return { success: false, error: mappedError };
    }
    if (msg.includes("no active") && msg.includes("printer")) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình máy in hóa đơn. Liên hệ quản lý.",
      };
    }
    console.error("[confirmCashPayment] [unmapped] rpc error:", msg);
    return {
      success: false,
      error: "Không thể xác nhận thanh toán. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    status?: string;
    order_id: number;
    payment_id: number;
    cash_received: number;
    cash_change: number;
    print_job_id: number | null;
    print_warning?: string | null;
    error_code?: string | null;
    detail?: string | null;
  } | null;
  if (!result) {
    return { success: false, error: "Không thể xác nhận thanh toán." };
  }

  if (result.status === "stock_failed") {
    return {
      success: false,
      error:
        "Chưa thể hoàn tất thanh toán vì tồn kho hoặc định mức món chưa sẵn sàng. Quản lý đã được thông báo.",
    };
  }

  if (result.status === "amount_mismatch_recomputed") {
    return {
      success: false,
      error:
        "Tổng tiền đơn đã thay đổi so với dữ liệu món. Vui lòng tải lại đơn và kiểm tra trước khi thanh toán.",
    };
  }

  return { success: true, data: result };
}

/* ─── Cash payment + mandatory HĐĐT issuance ─── */

export interface InvoiceOutcome {
  status: "issued" | "draft" | "submitted" | "signing" | "failed";
  invoiceId?: number;
  invoiceNumber?: string | null;
  error?: string;
}

export interface CashPaymentWithInvoiceResult extends CashPaymentResult {
  invoice: InvoiceOutcome;
}

const invoicePayloadSchema = z
  .object({
    buyerName: z.string().trim().max(200).optional(),
    buyerTaxCode: z.string().trim().optional(),
    buyerAddress: z.string().trim().max(500).optional(),
    buyerNotGetInvoice: z.boolean().optional(),
  })
  .optional()
  .nullable();

function normalizeInvoicePayload(
  invoice: z.infer<typeof invoicePayloadSchema> | null,
): z.infer<typeof invoicePayloadSchema> {
  return (
    invoice ?? {
      buyerName: BUYER_NOT_GET_INVOICE_NAME,
      buyerNotGetInvoice: true,
    }
  );
}

function mapTaxInvoiceOutcome(
  invoice:
    | { id: number; invoice_number: string | null; status?: string | null }
    | undefined,
): InvoiceOutcome {
  if (!invoice) {
    return { status: "failed", error: "Hóa đơn trả về thiếu dữ liệu." };
  }

  if (
    invoice.status === "issued" ||
    invoice.status === "submitted" ||
    invoice.status === "signing"
  ) {
    return {
      status: invoice.status,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    };
  }

  return {
    status: "failed",
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    error:
      "HĐĐT chưa được provider chấp nhận; Finance cần kiểm tra và xuất lại.",
  };
}

/**
 * Orchestrator: confirm cash payment, then always attempt HĐĐT issuance.
 *
 * Failure isolation contract:
 *   - Payment is the commercial close. It commits independently.
 *   - HĐĐT failure does NOT roll back payment — the order stays paid and
 *     the invoice attempt becomes an orphan picked up by Finance.
 *   - On HĐĐT failure, we still return success: true with invoice.status='failed'
 *     so the cashier UI can confirm "Đã thu tiền" and show a soft toast.
 */
export async function confirmCashPaymentWithInvoice(
  orderId: number,
  cashReceived: number,
  invoice: z.infer<typeof invoicePayloadSchema> | null,
): Promise<ActionResult<CashPaymentWithInvoiceResult>> {
  const paymentResult = await confirmCashPayment(orderId, cashReceived);
  if (!paymentResult.success || !paymentResult.data) {
    return paymentResult as ActionResult<CashPaymentWithInvoiceResult>;
  }

  const parsed = invoicePayloadSchema.safeParse(
    normalizeInvoicePayload(invoice),
  );
  if (!parsed.success) {
    return {
      success: true,
      data: {
        ...paymentResult.data,
        invoice: {
          status: "failed",
          error: parsed.error.issues[0]?.message ?? "Dữ liệu HĐĐT không hợp lệ",
        },
      },
    };
  }

  const invoiceResult = await createTaxInvoice({
    orderId,
    ...(parsed.data ?? {}),
  });

  if (!invoiceResult.success) {
    return {
      success: true,
      data: {
        ...paymentResult.data,
        invoice: {
          status: "failed",
          error: invoiceResult.error ?? "Không thể xuất hóa đơn",
        },
      },
    };
  }

  const inv = invoiceResult.data as
    | { id: number; invoice_number: string | null; status?: string | null }
    | undefined;

  return {
    success: true,
    data: {
      ...paymentResult.data,
      invoice: mapTaxInvoiceOutcome(inv),
    },
  };
}

/* ─── cancelPendingPayment ─── */

/**
 * Cancel a pending MoMo payment. Flips payment → failed and resets
 * orders.payment_method/payment_status so the order can be split, merged,
 * or start a fresh payment session.
 */
/**
 * Migrated to `withActionPositional` in WS-1b batch 4 (2026-05-28) —
 * proving sub-slice for payment-actions migration. Behavior preserved:
 * same RPC + same args (paymentId + tenant + branch), same role/permission
 * gate (POS_USE), same branch-scope defence in depth, same RPC error
 * mapping. The Vietnamese copy and result shape (`ActionResult<void>`
 * with `data: undefined`) are byte-identical.
 */
export const cancelPendingPayment = withActionPositional(
  {
    argsToInput: (branchId: number, paymentId: number) => ({
      branchId,
      paymentId,
    }),
    schema: cancelPendingPaymentSchema,
    customAuth: posUseAuth,
  },
  async (
    { branchId, paymentId },
    { supabase, claims },
  ): Promise<ActionResult<void>> => {
    if (claims.branch_id !== branchId) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    const { error } = await supabase.rpc("cancel_pending_payment", {
      p_payment_id: paymentId,
      p_tenant_id: claims.tenant_id,
      p_branch_id: branchId,
    });

    if (error) {
      return mapRpcError<void>(
        error,
        cancelPendingPaymentRpcMappings,
        cancelPendingPaymentRpcFallback,
      );
    }

    return { success: true, data: undefined };
  },
);

/* ─── fetchVietQrConfig ─── */

export interface VietQrConfig {
  bankCode: string;
  accountNo: string;
  accountName: string;
}

/**
 * Returns VietQR bank config for client-side QR URL generation.
 * Returns null when VietQR is disabled or not configured.
 *
 * Reuses the `payment-config` tag cache — `getCachedPaymentSettings` already
 * pulls the VietQR rows we need, so a second cache key would just split the
 * cache for no win. Both fetches share the same revalidate window.
 */
export async function fetchVietQrConfig(
  branchId: number,
): Promise<ActionResult<VietQrConfig | null>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  let settings: Record<string, string>;
  try {
    settings = await getCachedPaymentSettings(claims.tenant_id);
  } catch {
    return {
      success: false,
      error: "Không thể tải cấu hình VietQR. Vui lòng thử lại.",
    };
  }

  const enabled = truthySetting(
    settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR],
  );
  const bankCode =
    settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] ||
    process.env["VIETQR_BANK_ID"] ||
    "";
  const accountNo =
    settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] ||
    process.env["VIETQR_ACCOUNT_NO"] ||
    "";
  const accountName =
    settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME] ||
    process.env["VIETQR_ACCOUNT_NAME"] ||
    "";

  if (!enabled || !bankCode || !accountNo) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: { bankCode, accountNo, accountName },
  };
}

/* ─── confirmVietQrPayment ─── */

export interface ConfirmVietQrPaymentResult {
  payment_id: number;
  idempotent: boolean;
  print: { jobId?: number; failed: boolean; error?: string };
}

/**
 * Atomic cashier-confirm for VietQR bank transfer. No payment row is created
 * until the cashier taps "Đã thanh toán" — QR is generated client-side.
 * Gated by pos:confirm_payment (cashier / branch_manager+).
 */
export async function confirmVietQrPayment(
  branchId: number,
  orderId: number,
  amount: number,
): Promise<ActionResult<ConfirmVietQrPaymentResult>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedOrderId = orderIdSchema.safeParse(orderId);
  if (!parsedOrderId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const parsedAmount = z.coerce.number().positive().safeParse(amount);
  if (!parsedAmount.success) {
    return { success: false, error: "Số tiền không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_CONFIRM_PAYMENT,
  );
  if (!ctx) return { success: false, error: "Không có quyền thanh toán" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

  const { data, error: rpcError } = await supabase.rpc(
    "confirm_vietqr_payment",
    {
      p_tenant_id: claims.tenant_id,
      p_branch_id: parsedBranch.data,
      p_order_id: parsedOrderId.data,
      p_amount: parsedAmount.data,
      p_created_by: user.id,
    },
  );

  if (rpcError) {
    const msg = rpcError.message ?? "";
    if (msg.includes("order_not_found")) {
      return { success: false, error: "Đơn hàng không tồn tại." };
    }
    if (msg.includes("amount_mismatch")) {
      return {
        success: false,
        error:
          "Số tiền không khớp với tổng đơn hàng. Khách đã quét QR cũ — vui lòng tạo đơn mới cho phần chênh lệch.",
      };
    }
    if (
      msg.includes("permission denied") ||
      msg.includes("pos:confirm_payment")
    ) {
      return { success: false, error: "Không có quyền thanh toán" };
    }
    const mappedError = mapPaymentRpcError(msg);
    if (mappedError) {
      console.error("[confirmVietQrPayment] rpc failed:", msg);
      return { success: false, error: mappedError };
    }
    console.error("[confirmVietQrPayment] [unmapped] rpc error:", msg);
    return { success: false, error: "Không thể xác nhận thanh toán VietQR." };
  }

  const result = data as {
    status?: string;
    payment_id: number;
    idempotent: boolean;
    error_code?: string;
    detail?: string;
    print: { job_id?: number; failed: boolean; error?: string };
  } | null;

  if (!result) {
    return { success: false, error: "Không thể xác nhận thanh toán." };
  }

  if (
    result.status &&
    !["completed", "already_completed"].includes(result.status)
  ) {
    const mappedError = mapPaymentRpcError(
      `${result.status}:${result.error_code ?? ""}:${result.detail ?? ""}`,
    );
    console.error("[confirmVietQrPayment] completion blocked:", {
      status: result.status,
      error_code: result.error_code,
      detail: result.detail,
    });
    return {
      success: false,
      error: mappedError ?? "Không thể xác nhận thanh toán VietQR.",
    };
  }

  return {
    success: true,
    data: {
      payment_id: result.payment_id,
      idempotent: result.idempotent,
      print: {
        failed: result.print.failed,
        ...(result.print.job_id != null ? { jobId: result.print.job_id } : {}),
        ...(result.print.error ? { error: result.print.error } : {}),
      },
    },
  };
}

/* ─── confirmVietQrPaymentWithInvoice ─── */

export interface VietQrPaymentWithInvoiceResult extends ConfirmVietQrPaymentResult {
  invoice: InvoiceOutcome;
}

/**
 * Orchestrator: confirm VietQR payment, then always attempt HĐĐT issuance.
 * Payment commits independently — HĐĐT failure does NOT roll back payment.
 */
export async function confirmVietQrPaymentWithInvoice(
  branchId: number,
  orderId: number,
  amount: number,
  invoice: z.infer<typeof invoicePayloadSchema> | null,
): Promise<ActionResult<VietQrPaymentWithInvoiceResult>> {
  const paymentResult = await confirmVietQrPayment(branchId, orderId, amount);
  if (!paymentResult.success || !paymentResult.data) {
    return paymentResult as ActionResult<VietQrPaymentWithInvoiceResult>;
  }

  const parsed = invoicePayloadSchema.safeParse(
    normalizeInvoicePayload(invoice),
  );
  if (!parsed.success) {
    return {
      success: true,
      data: {
        ...paymentResult.data,
        invoice: {
          status: "failed",
          error: parsed.error.issues[0]?.message ?? "Dữ liệu HĐĐT không hợp lệ",
        },
      },
    };
  }

  const invoiceResult = await createTaxInvoice({
    orderId,
    ...(parsed.data ?? {}),
  });

  if (!invoiceResult.success) {
    return {
      success: true,
      data: {
        ...paymentResult.data,
        invoice: {
          status: "failed",
          error: invoiceResult.error ?? "Không thể xuất hóa đơn",
        },
      },
    };
  }

  const inv = invoiceResult.data as
    | { id: number; invoice_number: string | null; status?: string | null }
    | undefined;

  return {
    success: true,
    data: {
      ...paymentResult.data,
      invoice: mapTaxInvoiceOutcome(inv),
    },
  };
}
