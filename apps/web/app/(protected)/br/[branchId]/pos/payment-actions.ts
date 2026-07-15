"use server";

import { z } from "zod";
import { unstable_cache } from "next/cache";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  buildVietQrEmvco,
  getPaymentProvider,
  getRegisteredMethods,
  VietQRProvider,
  type PaymentMethod,
  type PaymentProvider,
  type PaymentResult,
} from "@comtammatu/shared/providers";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { ensurePaymentProvidersRegistered } from "@lib/payment-providers-init";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { withActionPositional } from "@/_lib/with-action";
import {
  createTaxInvoice,
  resolveExistingInvoiceForOrder,
} from "@/(protected)/finance/actions";
import {
  existingIssuedInvoiceOutcome,
  mapTaxInvoiceOutcome,
  type InvoiceOutcome,
} from "./_lib/invoice-outcome";
import { mapRpcError } from "@/_lib/rpc-error-map";
import {
  isPosBranchInScope,
  posConfirmPaymentAuth,
  posUseAuth,
} from "./_lib/auth";
import {
  branchOnlyReadSchema,
  cancelPendingPaymentSchema,
  cashConfirmSchema,
  createPaymentSchema,
  fetchPendingRemotePaymentSchema,
} from "./_lib/payment-schemas";
import {
  confirmCashPaymentRpcFallback,
  confirmCashPaymentRpcMappings,
  createPaymentRpcFallback,
  createPaymentRpcMappings,
} from "./_lib/payment-messages";
import { POS_ERROR_CODES } from "./_utils/error-codes";

type PosSupabase = NonNullable<
  Awaited<ReturnType<typeof getAuthContextWithPermission>>
>["supabase"];
type RemotePaymentMethod = Exclude<PaymentMethod, "cash">;

type RpcCaller = {
  rpc: <T>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: T | null;
    error: { code?: string | null; message?: string | null } | null;
  }>;
};

type OrderPaymentCodeResult = {
  order_id?: number;
  payment_code?: string;
};

const POS_ROLES = MODULE_ACL.pos.allowedRoles;
const POS_CONSUMPTION_SETUP_ERROR =
  "Không thể hoàn tất thanh toán vì cấu hình chi nhánh chưa sẵn sàng. Quản lý đã được thông báo.";
const MST_REGEX = /^\d{10}(-\d{3})?$/;

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
    bankCode: s[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] || "",
    accountNo: s[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] || "",
    accountName: s[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME] || "",
  };
}

async function resolvePaymentProviderForMethod(
  supabase: PosSupabase,
  tenantId: number,
  method: PaymentMethod,
): Promise<PaymentProvider | null> {
  if (method !== "vietqr") return getPaymentProvider(method);

  const settings = await readVietQrSettings(supabase, tenantId);
  if (!settings.bankCode || !settings.accountNo) return null;

  return new VietQRProvider({
    apiKey: "",
    bankAccount: settings.accountNo,
    bankCode: settings.bankCode,
    accountName: settings.accountName,
  });
}

type VietQrSettings = Awaited<ReturnType<typeof readVietQrSettings>>;

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

function buildVietQrPayloadFromProviderData(
  providerData: Record<string, unknown> | undefined,
): string | undefined {
  const bankCode = strValue(providerData, "bankCode");
  const accountNo = strValue(providerData, "accountNo");
  const amount = Number(strValue(providerData, "amount"));
  if (!bankCode || !accountNo || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return (
    buildVietQrEmvco({
      bankCode,
      accountNo,
      amount,
      description: strValue(providerData, "description"),
      accountName: strValue(providerData, "accountName"),
    }) ?? undefined
  );
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
    const payload = buildVietQrPayloadFromProviderData(providerData);
    if (payload) return payload;

    const stored =
      strValue(providerData, "qrData") ?? strValue(providerData, "qrUrl");
    return stored && !/^https?:\/\//i.test(stored) ? stored : undefined;
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

async function ensureOrderPaymentCode(
  supabase: PosSupabase,
  input: { tenantId: number; branchId: number; orderId: number },
): Promise<ActionResult<string>> {
  const { data, error } = await supabase.rpc("ensure_order_payment_code", {
    p_tenant_id: input.tenantId,
    p_branch_id: input.branchId,
    p_order_id: input.orderId,
  });

  if (error) {
    console.error("[ensureOrderPaymentCode] rpc failed:", error.code);
    return {
      success: false,
      error: "Không thể tạo mã chuyển khoản cho đơn này.",
    };
  }

  const paymentCode = (data as OrderPaymentCodeResult | null)?.payment_code;
  if (!paymentCode) {
    return {
      success: false,
      error: "Không thể tạo mã chuyển khoản cho đơn này.",
    };
  }

  return { success: true, data: paymentCode };
}

function amountToProviderString(
  amount: number | string | null | undefined,
): string | undefined {
  if (amount == null) return undefined;
  const value = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(value) ? Math.round(value).toString() : undefined;
}

function buildPendingRemotePaymentForBillData(
  row: {
    id: number;
    method: string;
    amount: number | string | null;
    provider_ref: string | null;
    provider_data: unknown;
  },
  vietQrSettings?: VietQrSettings,
): PendingRemotePaymentForBillData | null {
  if (row.method !== "vietqr" && row.method !== "momo") return null;

  const method = row.method;
  const storedProviderData = asRecord(row.provider_data);
  const amount = amountToProviderString(row.amount);
  const providerData =
    method === "vietqr" && vietQrSettings?.bankCode && vietQrSettings.accountNo
      ? {
          ...(storedProviderData ?? {}),
          bankCode: vietQrSettings.bankCode,
          accountNo: vietQrSettings.accountNo,
          accountName: vietQrSettings.accountName,
          ...(amount ? { amount } : {}),
          ...(row.provider_ref ? { description: row.provider_ref } : {}),
        }
      : storedProviderData;
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

async function loadPendingRemotePaymentForBillData(
  supabase: PosSupabase,
  input: { tenantId: number; branchId: number; orderId: number },
): Promise<ActionResult<PendingRemotePaymentForBillData | null>> {
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, method, status, amount, provider_ref, provider_data")
    .eq("order_id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .eq("branch_id", input.branchId)
    .neq("status", "failed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: messages.pos.payment.pendingSessionLoadFailed,
    };
  }

  if (!payment || payment.status !== "pending") {
    return { success: true, data: null };
  }

  const vietQrSettings =
    payment.method === "vietqr"
      ? await readVietQrSettings(supabase, input.tenantId)
      : undefined;

  return {
    success: true,
    data: buildPendingRemotePaymentForBillData(payment, vietQrSettings),
  };
}

function resumePendingPayment(
  pending: PendingRemotePaymentForBillData,
): ActionResult<CreatePaymentSuccessData> {
  if (pending.method === "momo" && !pending.qr_data) {
    return {
      success: false,
      error:
        "Phiên MoMo đang chờ nhưng thiếu dữ liệu QR. Vui lòng liên hệ quản lý để đối soát trước khi thử lại.",
    };
  }

  return {
    success: true,
    data: {
      payment_id: pending.payment_id,
      status: "pending",
      ...(pending.provider_ref ? { provider_ref: pending.provider_ref } : {}),
      ...(pending.qr_data ? { qr_data: pending.qr_data } : {}),
      ...(pending.redirect_url ? { redirect_url: pending.redirect_url } : {}),
      ...(pending.qr_info ? { qr_info: pending.qr_info } : {}),
    },
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
 * `fetchPaymentMethodsForPos` reads tenant-level `system_settings` rows that
 * change rarely (admin payments-settings page). Caching collapses repeated
 * POS route revalidations to near-zero cache hits.
 *
 * Tag: `payment-config` — admin payment-settings save calls
 *      `revalidateTag('payment-config')` to bust. Existing
 *      `revalidatePath('/br/[branchId]/pos', 'page')` route bust complements
 *      the tag bust (both fire on the same admin save).
 *
 * Service-role client + explicit `tenant_id` filter inside cache; outer
 * Server Actions still validate caller's POS branch scope BEFORE invoking.
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
 * Auth `posUseAuth` (POS_USE). The branch-scope guard is inline (not via
 * `customAuth`) to keep the specific "Không có quyền truy cập chi nhánh
 * này" copy — the helper's null-from-customAuth path collapses to the
 * generic "Không có quyền". `ensurePaymentProvidersRegistered()` runs after
 * auth; method list build order is cash → vietqr → momo.
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
    if (!isPosBranchInScope(claims, branchId)) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    ensurePaymentProvidersRegistered();
    let settings: Record<string, string>;
    try {
      settings = await getCachedPaymentSettings(claims.tenant_id);
    } catch {
      return {
        success: false,
        error: messages.pos.payment.methodsConfigLoadFailed,
      };
    }

    const registered = new Set(getRegisteredMethods());
    const methods: PaymentMethod[] = [];

    if (registered.has("cash")) {
      methods.push("cash");
    }
    if (truthySetting(settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR])) {
      const bank = settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] || "";
      const account =
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] || "";
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
 * Create a pending MoMo or VietQR intent. Cash uses the separate
 * `confirmCashPayment` path and never enters this action.
 *
 * Auth is `posUseAuth` (POS_USE — any POS operator) — looser than
 * `confirmCashPayment`'s `posConfirmPaymentAuth` (POS_CONFIRM_PAYMENT,
 * cashier-only cash-drawer gate). Waiters with POS_USE can therefore start
 * a MoMo / VietQR payment session (no cash drawer involved) but cannot
 * confirm cash.
 *
 * Non-obvious constraints:
 *   - Branch-scope guard returns
 *     "Không có quyền truy cập chi nhánh này". The inline `orders` select
 *     returns "Đơn hàng không tồn tại." on miss and "Đơn hàng đã thanh
 *     toán." when `payment_status === "paid"`; the amount-vs-total equality
 *     check also stays inline ("Số tiền không khớp với tổng đơn hàng.").
 *   - `resolvePaymentProviderForMethod` + `provider.createPayment` (wrapped
 *     by `describeProviderException` / `describeProviderCreateFailure`) is
 *     the source of QR/redirect data.
 *   - A canonical pending payment is resumed before creating a new provider
 *     session. The 23505 fallback covers the remaining concurrent-insert
 *     window by reloading that canonical row.
 *   - The RPC returns its canonical provider reference. If another request
 *     won the race, this action resumes the stored session and never exposes
 *     the newly-created orphan provider session.
 *   - The service-only RPC atomically stores the pending intent and trusted
 *     provider metadata after rechecking the POS actor and branch permission.
 *   - `createPaymentRpcMappings` ordering matters:
 *     `amount_mismatch_recomputed` must shadow `amount_mismatch`.
 *
 * Local `mapPaymentRpcError` (defined above) remains in the file for
 * the VietQR family, which still calls it.
 */
export const createPayment = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      orderId: number,
      method: RemotePaymentMethod,
      amount: number,
    ) => ({ branchId, orderId, method, amount }),
    schema: createPaymentSchema,
    customAuth: posUseAuth,
  },
  async (
    { branchId, orderId, method, amount },
    { supabase, claims },
  ): Promise<ActionResult<CreatePaymentSuccessData>> => {
    if (!isPosBranchInScope(claims, branchId)) {
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
    if (!allowedMethods.includes(method)) {
      return {
        success: false,
        error: "Phương thức thanh toán không được phép hoặc chưa cấu hình.",
      };
    }

    const pendingBeforeProvider = await loadPendingRemotePaymentForBillData(
      supabase,
      {
        tenantId: claims.tenant_id,
        branchId,
        orderId,
      },
    );
    if (!pendingBeforeProvider.success) {
      return { success: false, error: pendingBeforeProvider.error };
    }
    if (pendingBeforeProvider.data) {
      if (pendingBeforeProvider.data.method !== method) {
        return {
          success: false,
          error:
            "Đơn hàng đang có thanh toán chờ xử lý. Vui lòng hủy phiên hiện tại trước khi đổi phương thức.",
        };
      }
      return resumePendingPayment(pendingBeforeProvider.data);
    }

    const provider = await resolvePaymentProviderForMethod(
      supabase,
      claims.tenant_id,
      method,
    );
    if (!provider) {
      return {
        success: false,
        error: `Phương thức thanh toán '${method}' chưa được cấu hình.`,
      };
    }

    const orderPaymentCode =
      method === "vietqr"
        ? await ensureOrderPaymentCode(supabase, {
            tenantId: claims.tenant_id,
            branchId,
            orderId,
          })
        : null;
    if (orderPaymentCode && !orderPaymentCode.success) {
      return { success: false, error: orderPaymentCode.error };
    }

    // Call provider to get QR/redirect data (if applicable).
    let providerResult: Awaited<ReturnType<PaymentProvider["createPayment"]>>;
    try {
      providerResult = await provider.createPayment({
        tenantId: claims.tenant_id,
        orderId,
        orderNumber: order.order_number,
        amount,
        ...(orderPaymentCode?.data
          ? { description: orderPaymentCode.data }
          : {}),
      });
    } catch (err) {
      console.error("[createPayment] provider threw:", {
        method,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: describeProviderException(method, err),
      };
    }

    if (method === "vietqr" && orderPaymentCode?.data) {
      providerResult = {
        ...providerResult,
        providerRef: orderPaymentCode.data,
        providerData: {
          ...(providerResult.providerData ?? {}),
          description: orderPaymentCode.data,
        },
      };
    }

    if (providerResult.status === "failed") {
      console.error("[createPayment] provider failed:", {
        method,
        providerRef: providerResult.providerRef,
        resultCode: providerResult.providerData?.resultCode,
      });
      return {
        success: false,
        error: describeProviderCreateFailure(
          method,
          providerResult.providerData,
        ),
      };
    }

    if (
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

    const providerRef = providerResult.providerRef?.trim();
    if (!providerRef) {
      return {
        success: false,
        error: "Nhà cung cấp không trả về mã tham chiếu thanh toán.",
      };
    }

    // Create only a pending remote intent; provider-specific settlement remains
    // the sole boundary allowed to complete the payment and order.
    const { data, error: rpcError } = await createServiceClient().rpc(
      "create_payment",
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: branchId,
        p_order_id: orderId,
        p_method: method,
        p_amount: amount,
        p_created_by: user.id,
        p_provider_ref: providerRef,
        p_provider_data: buildStoredProviderData(providerResult),
      },
    );

    if (rpcError) {
      // 23505 unique-violation: another `createPayment` call for the same
      // order already committed a non-failed payment row. Retry policy
      // lives here (not in the mapping table) because we need to query
      // the payments table for an existing pending row and either reuse
      // it OR surface a typed "đang chờ xử lý" message.
      if (rpcError.code === "23505") {
        const existingPayment = await loadPendingRemotePaymentForBillData(
          supabase,
          {
            tenantId: claims.tenant_id,
            branchId,
            orderId,
          },
        );
        if (!existingPayment.success) {
          return { success: false, error: existingPayment.error };
        }
        if (existingPayment.data?.method === method) {
          return resumePendingPayment(existingPayment.data);
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
      provider_ref?: string;
    } | null;
    if (!result) {
      return { success: false, error: "Không thể tạo thanh toán." };
    }

    if (result.idempotent === true || result.provider_ref !== providerRef) {
      const canonicalPayment = await loadPendingRemotePaymentForBillData(
        supabase,
        {
          tenantId: claims.tenant_id,
          branchId,
          orderId,
        },
      );
      if (!canonicalPayment.success) {
        return { success: false, error: canonicalPayment.error };
      }
      if (canonicalPayment.data?.method === method) {
        return resumePendingPayment(canonicalPayment.data);
      }
      return {
        success: false,
        error:
          "Phiên thanh toán đã được tạo ở thao tác khác. Vui lòng tải lại hóa đơn.",
      };
    }

    // No stock deduction under D016.

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
 * Auth `posUseAuth` (POS_USE). The branch-scope guard is inline to keep the
 * specific "Không có quyền truy cập chi nhánh này" copy. DB errors use
 * `messages.pos.payment.pendingSessionLoadFailed`; non-pending or missing rows
 * return `{ success: true, data: null }`.
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
    if (!isPosBranchInScope(claims, branchId)) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    return loadPendingRemotePaymentForBillData(supabase, {
      tenantId: claims.tenant_id,
      branchId,
      orderId,
    });
  },
);

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
  ): Promise<ActionResult<{ payment_id: number }>> => {
    if (!isPosBranchInScope(claims, branchId)) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { error } = await supabase.rpc("cancel_pending_payment", {
      p_payment_id: paymentId,
      p_tenant_id: claims.tenant_id,
      p_branch_id: branchId,
    });

    if (error) {
      const message = String(error.message ?? "").toLowerCase();
      if (message.includes("self_order_payment_owned")) {
        return {
          success: false,
          error:
            "Phiên này thuộc yêu cầu QR tự gọi món. Hãy xử lý tại hàng chờ thanh toán.",
        };
      }
      if (
        message.includes("momo_cancellation_requires_provider_confirmation")
      ) {
        return {
          success: false,
          error:
            "Không thể hủy phiên MoMo khi nhà cung cấp chưa xác nhận kết quả cuối.",
        };
      }
      if (error.code === "55P03") {
        return {
          success: false,
          error:
            "Đơn hàng đang được xử lý bởi một giao dịch khác. Vui lòng tải lại sau vài giây.",
        };
      }
      if (message.includes("payment_not_pending")) {
        return {
          success: false,
          error: "Phiên thanh toán này không còn chờ xử lý.",
        };
      }
      if (message.includes("payment_not_found")) {
        return { success: false, error: "Không tìm thấy phiên thanh toán." };
      }
      if (
        message.includes("not_authenticated") ||
        message.includes("tenant_mismatch") ||
        message.includes("permission denied")
      ) {
        return {
          success: false,
          error: "Không có quyền thực hiện thao tác này.",
        };
      }
      console.error("[cancelPendingPayment] rpc failed:", error.code);
      return { success: false, error: "Không thể hủy phiên thanh toán." };
    }

    return { success: true, data: { payment_id: paymentId } };
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

// ─── Confirm cash payment (atomic mark-paid + enqueue receipt) ───────────

export interface CashPaymentResult {
  order_id: number;
  payment_id: number;
  cash_received: number;
  cash_change: number;
  /** RPC completion status; "already_completed" marks an idempotent replay. */
  status?: string | null;
  /** Null when receipt enqueue failed inside the RPC — payment still committed
   * (see fail-soft contract in confirm_cash_payment). UI shows print_warning
   * as a toast and offers "in lại". */
  print_job_id: number | null;
  print_warning?: string | null;
  /** Present only when the cash payment atomically consumed a self-order call. */
  self_order_request_id?: number | null;
}

/**
 * Atomic cashier confirm: validates cash ≥ total, marks paid, persists cash
 * values on the order, enqueues final receipt — all in one transaction. It
 * does not deduct stock under D016.
 *
 * Blocks under-payment hard (use order discount for employee meals).
 */
/**
 * Auth requires POS_CONFIRM_PAYMENT (cashier / branch_manager+); staff without POS_CONFIRM_PAYMENT
 * with only POS_USE + POS_PRINT can print a provisional bill but MUST NOT
 * touch the cash drawer. VietQR / MoMo keep POS_USE at createPayment /
 * confirmVietQrPayment (e-wallet is the webhook source of truth, no cash
 * drawer).
 *
 * Non-obvious constraints:
 *   - `confirmCashPaymentRpcMappings` order matters so cash-specific copy
 *     beats the shared payment vocabulary (e.g. `tenant mismatch` →
 *     "Không có quyền truy cập đơn này", not the shared "Không thể xử lý...").
 *   - Status-based result branching for `stock_failed` and
 *     `amount_mismatch_recomputed` stays inside the handler: the RPC can
 *     RETURN those even when the SQL does not raise, so they cannot be
 *     mapped via `RpcErrorMapping` (which only inspects `error.message`).
 *   - Branch scope comes from the POS route, not only JWT claims, so owner can
 *     confirm payment while still keeping branch-scoped grants tight.
 */
export const confirmCashPayment = withActionPositional(
  {
    argsToInput: (branchId: number, orderId: number, cashReceived: number) => ({
      branchId,
      orderId,
      cashReceived,
    }),
    schema: cashConfirmSchema,
    customAuth: posConfirmPaymentAuth,
  },
  async (
    { branchId, orderId, cashReceived },
    { supabase, claims },
  ): Promise<ActionResult<CashPaymentResult>> => {
    if (!isPosBranchInScope(claims, branchId)) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    const rpc = supabase as unknown as RpcCaller;
    const { data, error } = await rpc.rpc<CashPaymentResult>(
      "confirm_cash_payment_with_invoice_binding",
      {
        p_order_id: orderId,
        p_cash_received: cashReceived,
      },
    );

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
      self_order_request_id?: number | null;
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

export interface CashPaymentWithInvoiceResult extends CashPaymentResult {
  invoice: InvoiceOutcome;
}

const invoiceBuyerPayloadSchema = z
  .object({
    buyerName: z.string().trim().max(200).optional(),
    buyerTaxCode: z
      .string()
      .trim()
      .regex(MST_REGEX, { error: "MST phải có dạng 10 số hoặc 10-3 số" })
      .optional(),
    buyerAddress: z.string().trim().max(500).optional(),
    buyerEmail: z.email({ error: "Email không hợp lệ" }).optional(),
    buyerNotGetInvoice: z.boolean().optional(),
  })
  .refine((v) => !v.buyerTaxCode || (v.buyerName && v.buyerName.length > 0), {
    error: "Có MST thì phải nhập tên người mua",
    path: ["buyerName"],
  });

type InvoiceBuyerPayload = z.infer<typeof invoiceBuyerPayloadSchema>;
type InvoicePayload = InvoiceBuyerPayload | null | undefined;

type StoredCashCallInvoiceRow = {
  id: number;
  invoice_payload: Json;
};

const SELF_ORDER_INVOICE_BINDING_ERROR =
  "Không thể xác minh thông tin HĐĐT của yêu cầu gọi thanh toán. Vui lòng tải lại và thử lại.";

function normalizeInvoicePayload(invoice: InvoicePayload): InvoiceBuyerPayload {
  return (
    invoice ?? {
      buyerName: BUYER_NOT_GET_INVOICE_NAME,
      buyerNotGetInvoice: true,
    }
  );
}

function parseInvoicePayload(
  invoice: InvoicePayload,
): ActionResult<InvoiceBuyerPayload> {
  const parsed = invoiceBuyerPayloadSchema.safeParse(
    normalizeInvoicePayload(invoice),
  );
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu HĐĐT không hợp lệ",
    };
  }
  return { success: true, data: parsed.data };
}

function parseStoredCashCallInvoicePayload(
  row: StoredCashCallInvoiceRow,
): ActionResult<InvoiceBuyerPayload> {
  const parsed = invoiceBuyerPayloadSchema.safeParse(row.invoice_payload);
  if (!parsed.success) {
    console.error("[confirmCashPaymentWithInvoice] invalid stored payload", {
      requestId: row.id,
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
      })),
    });
    return { success: false, error: SELF_ORDER_INVOICE_BINDING_ERROR };
  }
  return { success: true, data: parsed.data };
}

async function resolveBoundCashCallInvoicePayload(
  branchId: number,
  orderId: number,
  paymentId: number,
  requestId: number,
): Promise<ActionResult<InvoiceBuyerPayload>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  const parsedOrder = orderIdSchema.safeParse(orderId);
  const parsedPayment = orderIdSchema.safeParse(paymentId);
  const parsedRequest = orderIdSchema.safeParse(requestId);
  if (
    !parsedBranch.success ||
    !parsedOrder.success ||
    !parsedPayment.success ||
    !parsedRequest.success
  ) {
    return { success: false, error: "Dữ liệu thanh toán không hợp lệ" };
  }

  const ctx = await posConfirmPaymentAuth({ branchId: parsedBranch.data });
  if (!ctx) return { success: false, error: "Không có quyền thanh toán" };
  if (!isPosBranchInScope(ctx.claims, parsedBranch.data)) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: row, error } = await ctx.supabase
    .from("self_order_payment_requests")
    .select("id, invoice_payload")
    .eq("id", parsedRequest.data)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("branch_id", parsedBranch.data)
    .eq("order_id", parsedOrder.data)
    .eq("payment_id", parsedPayment.data)
    .eq("method", "cash_call")
    .eq("status", "completed")
    .maybeSingle();
  if (error) {
    console.error(
      "[confirmCashPaymentWithInvoice] bound request lookup failed",
      error.code,
    );
    return { success: false, error: SELF_ORDER_INVOICE_BINDING_ERROR };
  }
  if (!row) {
    console.error("[confirmCashPaymentWithInvoice] bound request missing", {
      tenantId: ctx.claims.tenant_id,
      branchId,
      orderId,
      paymentId,
      requestId,
    });
    return { success: false, error: SELF_ORDER_INVOICE_BINDING_ERROR };
  }
  return parseStoredCashCallInvoicePayload(row);
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
  branchId: number,
  orderId: number,
  cashReceived: number,
  invoice: InvoicePayload,
): Promise<ActionResult<CashPaymentWithInvoiceResult>> {
  const posInvoicePayload = parseInvoicePayload(invoice);
  if (!posInvoicePayload.success || !posInvoicePayload.data) {
    return posInvoicePayload as ActionResult<CashPaymentWithInvoiceResult>;
  }

  const paymentResult = await confirmCashPayment(
    branchId,
    orderId,
    cashReceived,
  );
  if (!paymentResult.success || !paymentResult.data) {
    return paymentResult as ActionResult<CashPaymentWithInvoiceResult>;
  }

  // Idempotent replay (flaky-Wi-Fi re-tap): payment already committed. Only
  // short-circuit when the order already has a genuinely-issued invoice —
  // a draft/orphan or missing row falls through to createTaxInvoice so the
  // legally-required HĐĐT still gets issued/retried (NĐ 254/2026).
  if (paymentResult.data.status === "already_completed") {
    const replayInvoice = existingIssuedInvoiceOutcome(
      await resolveExistingInvoiceForOrder(orderId),
    );
    if (replayInvoice) {
      return {
        success: true,
        data: { ...paymentResult.data, invoice: replayInvoice },
      };
    }
  }

  let invoicePayload = posInvoicePayload;
  const selfOrderRequestId = paymentResult.data.self_order_request_id;
  if (typeof selfOrderRequestId === "number" && selfOrderRequestId > 0) {
    invoicePayload = await resolveBoundCashCallInvoicePayload(
      branchId,
      orderId,
      paymentResult.data.payment_id,
      selfOrderRequestId,
    );
    if (!invoicePayload.success || !invoicePayload.data) {
      return {
        success: true,
        data: {
          ...paymentResult.data,
          invoice: {
            status: "failed",
            error: invoicePayload.error ?? SELF_ORDER_INVOICE_BINDING_ERROR,
          },
        },
      };
    }
  }

  const invoiceResult = await createTaxInvoice({
    orderId,
    ...invoicePayload.data,
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

/* ─── fetchVietQrConfig ─── */

export interface VietQrConfig {
  bankCode: string;
  accountNo: string;
  accountName: string;
}

/**
 * Returns VietQR bank config from Admin settings.
 * Returns null when VietQR is disabled or not configured.
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
    if (!isPosBranchInScope(claims, branchId)) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    let settings: Record<string, string>;
    try {
      settings = await getCachedPaymentSettings(claims.tenant_id);
    } catch {
      return {
        success: false,
        error: messages.pos.payment.vietQrConfigLoadFailed,
      };
    }

    const enabled = truthySetting(
      settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR],
    );
    const bankCode =
      settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] || "";
    const accountNo =
      settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] || "";
    const accountName =
      settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME] || "";

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
 * Atomic cashier-confirm fallback for a pending VietQR bank transfer.
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

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
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
  invoice: InvoicePayload,
): Promise<ActionResult<VietQrPaymentWithInvoiceResult>> {
  const invoicePayload = parseInvoicePayload(invoice);
  if (!invoicePayload.success || !invoicePayload.data) {
    return invoicePayload as ActionResult<VietQrPaymentWithInvoiceResult>;
  }

  const paymentResult = await confirmVietQrPayment(branchId, orderId, amount);
  if (!paymentResult.success || !paymentResult.data) {
    return paymentResult as ActionResult<VietQrPaymentWithInvoiceResult>;
  }

  // Idempotent replay: VietQR signals replay via `idempotent` (its result
  // carries no `status` field). Only short-circuit on a genuinely-issued
  // invoice; otherwise fall through to createTaxInvoice (NĐ 254/2026).
  if (paymentResult.data.idempotent === true) {
    const replayInvoice = existingIssuedInvoiceOutcome(
      await resolveExistingInvoiceForOrder(orderId),
    );
    if (replayInvoice) {
      return {
        success: true,
        data: { ...paymentResult.data, invoice: replayInvoice },
      };
    }
  }

  const invoiceResult = await createTaxInvoice({
    orderId,
    ...invoicePayload.data,
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
