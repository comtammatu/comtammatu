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
import { mapRpcError } from "@/_lib/rpc-error-map";
import { posConfirmPaymentAuth, posUseAuth } from "./_lib/auth";
import {
  branchOnlyReadSchema,
  cancelPendingPaymentSchema,
  cashConfirmSchema,
  createPaymentSchema,
  fetchPendingRemotePaymentSchema,
} from "./_lib/payment-schemas";
import {
  cancelPendingPaymentRpcFallback,
  cancelPendingPaymentRpcMappings,
  confirmCashPaymentRpcFallback,
  confirmCashPaymentRpcMappings,
  createPaymentRpcFallback,
  createPaymentRpcMappings,
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
 *
 * Auth `posUseAuth` (POS_USE). Branch-claim guard stays
 * inline to preserve "Không có quyền truy cập chi nhánh này" (helper's
 * null-from-customAuth path collapses to the generic "Không có quyền").
 *
 * Behavior:
 *   - `ensurePaymentProvidersRegistered()` side effect runs after auth.
 *   - `getCachedPaymentSettings(tenant)` try/catch returns
 *     "Không thể tải cấu hình thanh toán. Vui lòng thử lại." on throw.
 *   - Method list build order (cash → vietqr → momo) and gating rules
 *     (registered provider × system setting × bank/account env presence
 *     for VietQR).
 */
export const fetchPaymentMethodsForPos = withActionPositional(
  {
    argsToInput: (branchId: number) => ({ branchId }),
    schema: branchOnlyReadSchema,
    customAuth: posUseAuth,
  },
  async (
    { branchId },
    { claims },
  ): Promise<ActionResult<{ methods: PaymentMethod[] }>> => {
    if (claims.branch_id !== branchId) {
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
  },
);

/* ─── createPayment ─── */

/**
 * Create a payment record for an order. Cash payments are immediately
 * completed (status=completed) and trigger stock consumption synchronously;
 * MoMo / VietQR start as pending and complete via webhook + a separate
 * `confirmPayment` / `confirmVietQrPayment` call.
 *
 * Auth is `posUseAuth` (POS_USE — any POS operator) — looser than
 * `confirmCashPayment`'s `posConfirmPaymentAuth` (POS_CONFIRM_PAYMENT,
 * cashier-only cash-drawer gate). Waiters with POS_USE can therefore start
 * a MoMo / VietQR payment session (no cash drawer involved) but cannot
 * confirm cash.
 *
 * Behavior:
 *   - RPC `create_payment` arg shape (p_tenant_id,
 *     p_branch_id, p_order_id, p_method, p_amount, p_created_by,
 *     p_provider_ref, p_status).
 *   - Branch-claim guard (`claims.branch_id !== branchId`) returns
 *     "Không có quyền truy cập chi nhánh này".
 *   - Inline DB `orders` select returns "Đơn hàng không tồn tại." on miss,
 *     "Đơn hàng đã thanh toán." when `payment_status === "paid"`. Both
 *     checks live inside the handler — server-side amount-vs-total equality
 *     stays inline too ("Số tiền không khớp với tổng đơn hàng.").
 *   - `getPaymentProvider` + `provider.createPayment` + try/catch wrapping
 *     `describeProviderException` / `describeProviderCreateFailure`
 *     untouched. Provider integration is the source of QR/redirect data
 *     and MUST NOT be rewritten in this slice.
 *   - 23505 unique-violation retry: stays handler-only because we query
 *     the `payments` table for an existing pending row and either reuse
 *     it (idempotent replay — return success with the existing payment_id
 *     and freshly persisted provider blob) or surface "Đơn hàng đang có
 *     thanh toán chờ xử lý." Neither outcome fits the `RpcErrorMapping`
 *     shape so it lives outside the mapping table.
 *   - `persistPendingProviderData` fires for remote (MoMo) payments AFTER
 *     RPC success AND inside the 23505-retry branch — idempotent-replay
 *     semantics where the second `createPayment` call overwrites the
 *     stored provider blob with the fresh QR.
 *   - Cash auto-completes (`status === "completed"`) inside the RPC
 *     atomically. Payments never consume stock (D016).
 *   - `createPaymentRpcMappings` ordering must keep
 *     `amount_mismatch_recomputed` shadowing `amount_mismatch`.
 */
export const createPayment = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      orderId: number,
      method: "cash" | "momo",
      amount: number,
    ) => ({ branchId, orderId, method, amount }),
    schema: createPaymentSchema,
    customAuth: posUseAuth,
  },
  async (
    { branchId, orderId, method, amount },
    { supabase, claims },
  ): Promise<ActionResult<CreatePaymentSuccessData>> => {
    if (claims.branch_id !== branchId) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    // Verify order exists and belongs to branch.
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, total_amount, payment_status")
      .eq("id", orderId)
      .eq("branch_id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (orderError || !order) {
      return { success: false, error: "Đơn hàng không tồn tại." };
    }

    if (order.payment_status === "paid") {
      return { success: false, error: "Đơn hàng đã thanh toán." };
    }

    // Server-side amount validation.
    if (amount !== Number(order.total_amount)) {
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
    if (!allowedMethods.includes(method as PaymentMethod)) {
      return {
        success: false,
        error: "Phương thức thanh toán không được phép hoặc chưa cấu hình.",
      };
    }

    const provider = getPaymentProvider(method as PaymentMethod);
    if (!provider) {
      return {
        success: false,
        error: `Phương thức thanh toán '${method}' chưa được cấu hình.`,
      };
    }

    // Call provider to get QR/redirect data (if applicable).
    let providerResult: Awaited<ReturnType<PaymentProvider["createPayment"]>>;
    try {
      providerResult = await provider.createPayment({
        tenantId: claims.tenant_id,
        orderId,
        orderNumber: order.order_number,
        amount,
      });
    } catch (err) {
      console.error("[createPayment] provider threw:", {
        method,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: describeProviderException(method as PaymentMethod, err),
      };
    }

    const isRemotePayment = method !== "cash";
    if (isRemotePayment && providerResult.status === "failed") {
      console.error("[createPayment] provider failed:", {
        method,
        providerRef: providerResult.providerRef,
        resultCode: providerResult.providerData?.resultCode,
      });
      return {
        success: false,
        error: describeProviderCreateFailure(
          method as PaymentMethod,
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
          method === "momo"
            ? "MoMo đã tạo phiên thanh toán nhưng không trả về qrCodeUrl."
            : "Không tạo được dữ liệu QR cho phương thức thanh toán này.",
      };
    }

    // Atomic RPC: insert payment + update order in one transaction.
    // Prevents race condition where payment exists but order status is stale.
    const { data, error: rpcError } = await supabase.rpc("create_payment", {
      p_tenant_id: claims.tenant_id,
      p_branch_id: branchId,
      p_order_id: orderId,
      p_method: method,
      p_amount: amount,
      p_created_by: user.id,
      p_provider_ref: providerResult.providerRef ?? undefined,
      p_status: providerResult.status,
    });

    if (rpcError) {
      // 23505 unique-violation: another `createPayment` call for the same
      // order already committed a non-failed payment row. Retry policy
      // lives here (not in the mapping table) because we need to query
      // the payments table for an existing pending row and either reuse
      // it OR surface a typed "đang chờ xử lý" message.
      if (rpcError.code === "23505") {
        const { data: existingPayment, error: existingError } = await supabase
          .from("payments")
          .select("id, status, provider_ref, method")
          .eq("order_id", orderId)
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .neq("status", "failed")
          .maybeSingle();

        if (
          !existingError &&
          existingPayment &&
          existingPayment.status === "pending" &&
          existingPayment.method === method
        ) {
          await persistPendingProviderData(supabase, {
            paymentId: existingPayment.id,
            tenantId: claims.tenant_id,
            branchId,
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

      console.error(
        "[createPayment] rpc failed:",
        String(rpcError.message ?? ""),
      );
      return mapRpcError<CreatePaymentSuccessData>(
        rpcError,
        createPaymentRpcMappings,
        createPaymentRpcFallback,
      );
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
        branchId,
        providerResult,
      });
    }

    // Payments never consume stock (D016).

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
  },
);

/**
 * Read the most recent non-failed payment for an order. Returns `null`
 * when there's no pending row to resume — caller (bill sheet) uses that
 * signal to start a fresh QR session vs reuse the existing one.
 *
 * Auth `posUseAuth` (POS_USE). Branch-claim guard stays
 * inline for "Không có quyền truy cập chi nhánh này" copy preservation.
 *
 * Behavior:
 *   - SELECT shape on `payments` (id, method, status,
 *     provider_ref, provider_data) with the `neq("status", "failed")`
 *     filter + `order("id", desc).limit(1).maybeSingle()` chain.
 *   - DB error returns "Không thể tải phiên thanh toán."
 *   - Non-pending or missing rows return `{ success: true, data: null }`
 *     — bill sheet treats either as "no resumable session."
 */
export const fetchPendingRemotePaymentForBill = withActionPositional(
  {
    argsToInput: (branchId: number, orderId: number) => ({
      branchId,
      orderId,
    }),
    schema: fetchPendingRemotePaymentSchema,
    customAuth: posUseAuth,
  },
  async (
    { branchId, orderId },
    { supabase, claims },
  ): Promise<ActionResult<PendingRemotePaymentForBillData | null>> => {
    if (claims.branch_id !== branchId) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .select("id, method, status, provider_ref, provider_data")
      .eq("order_id", orderId)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
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
  },
);

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
 * Uses atomic RPC `confirm_payment_and_post`: update payment → update order.
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

  // Atomic RPC: confirm payment + update order.
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

  // Payments never consume stock (D016).

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

// ─── Confirm cash payment (atomic mark-paid + enqueue receipt) ───────────

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
/**
 * Cash confirm requires POS_CONFIRM_PAYMENT (cashier / branch_manager+) —
 * waiter has only POS_USE + POS_PRINT (provisional bill OK, no cash
 * drawer). VietQR / MoMo keep POS_USE at createPayment / confirmPayment
 * (e-wallet = webhook source of truth, no cash drawer).
 *
 * Behavior:
 *   - RPC `confirm_cash_payment` (p_order_id + p_cash_received).
 *   - All 8 error sentinels mapped via `confirmCashPaymentRpcMappings`
 *     in identical order so cash-specific copy beats the shared
 *     payment vocabulary (e.g. `tenant mismatch` → "Không có quyền truy
 *     cập đơn này" not the shared "Không thể xử lý...").
 *   - Status-based result branching for `stock_failed` and
 *     `amount_mismatch_recomputed` kept inside the handler (the RPC
 *     can RETURN those even when the SQL itself does not raise — so
 *     they cannot be mapped via RpcErrorMapping which only inspects
 *     `error.message`).
 *   - `branch_id === null` guard (operator with no branch grant)
 *     returns "Không xác định được chi nhánh" inside the handler.
 */
export const confirmCashPayment = withActionPositional(
  {
    argsToInput: (orderId: number, cashReceived: number) => ({
      orderId,
      cashReceived,
    }),
    schema: cashConfirmSchema,
    customAuth: posConfirmPaymentAuth,
  },
  async (
    { orderId, cashReceived },
    { supabase, claims },
  ): Promise<ActionResult<CashPaymentResult>> => {
    if (claims.branch_id === null) {
      return {
        success: false,
        error: "Không xác định được chi nhánh",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    const { data, error } = await supabase.rpc("confirm_cash_payment", {
      p_order_id: orderId,
      p_cash_received: cashReceived,
    });

    if (error) {
      console.error(
        "[confirmCashPayment] rpc failed:",
        String(error.message ?? ""),
      );
      return mapRpcError<CashPaymentResult>(
        error,
        confirmCashPaymentRpcMappings,
        confirmCashPaymentRpcFallback,
      );
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
      return {
        success: false,
        error: "Không thể xác nhận thanh toán.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }

    // RPC can RETURN these statuses without raising — status branching has
    // to live in the handler because `mapRpcError` only sees errors.
    if (result.status === "stock_failed") {
      return {
        success: false,
        error:
          "Chưa thể hoàn tất thanh toán vì tồn kho hoặc định mức món chưa sẵn sàng. Quản lý đã được thông báo.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }

    if (result.status === "amount_mismatch_recomputed") {
      return {
        success: false,
        error:
          "Tổng tiền đơn đã thay đổi so với dữ liệu món. Vui lòng tải lại đơn và kiểm tra trước khi thanh toán.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }

    return { success: true, data: result };
  },
);

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
export const fetchVietQrConfig = withActionPositional(
  {
    argsToInput: (branchId: number) => ({ branchId }),
    schema: branchOnlyReadSchema,
    customAuth: posUseAuth,
  },
  async (
    { branchId },
    { claims },
  ): Promise<ActionResult<VietQrConfig | null>> => {
    if (claims.branch_id !== branchId) {
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
  },
);

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
