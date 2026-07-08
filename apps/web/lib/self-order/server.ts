import "server-only";

import { createServiceClient } from "@comtammatu/database/supabase/service";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { buildVietQrEmvco } from "@comtammatu/shared/providers";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type {
  PublicSelfOrderSnapshot,
  SelfOrderCartItem,
  SelfOrderVietQrResponse,
} from "./contracts";

type RpcResult<T> = { data: T | null; error: { message?: string } | null };

type UntypedQuery = PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
}> & {
  eq: (column: string, value: unknown) => UntypedQuery;
  in: (column: string, values: unknown[]) => UntypedQuery;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
  }>;
};

type UntypedServiceClient = {
  rpc: <T = unknown>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<T>>;
  from: (table: string) => {
    select: (columns: string) => UntypedQuery;
  };
};

type SelfOrderActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

function service(): UntypedServiceClient {
  return createServiceClient() as unknown as UntypedServiceClient;
}

function mapSelfOrderError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (message.includes("self_order_pending_payment_exists")) {
    return {
      status: 409,
      code: "pending_payment_exists",
      message: SELF_ORDER_VI.pendingPaymentBlocked,
    };
  }
  if (message.includes("self_order_payment_completed")) {
    return {
      status: 409,
      code: "payment_completed",
      message: SELF_ORDER_VI.paymentCompletedBlocked,
    };
  }
  if (
    message.includes("self_order_pos_session_closed") ||
    message.includes("POS session does not belong to this branch or is not open")
  ) {
    return {
      status: 409,
      code: "pos_session_closed",
      message: SELF_ORDER_VI.posSessionClosed,
    };
  }
  if (message.includes("invalid_invoice_payload")) {
    return {
      status: 422,
      code: "invalid_invoice",
      message: SELF_ORDER_VI.buyerBusinessMissing,
    };
  }
  if (
    message.includes("not_active") ||
    message.includes("order_not_appendable") ||
    message.includes("order_not_payable")
  ) {
    return {
      status: 409,
      code: "session_not_active",
      message: SELF_ORDER_VI.paymentCompletedBlocked,
    };
  }

  return {
    status: 500,
    code: "unknown",
    message: SELF_ORDER_VI.submitFailed,
  };
}

export async function getSelfOrderSnapshot(
  token: string,
): Promise<SelfOrderActionResult<PublicSelfOrderSnapshot>> {
  const { data, error } = await service().rpc<PublicSelfOrderSnapshot>(
    "self_order_get_snapshot",
    { p_token: token },
  );
  if (error) {
    console.error("[self-order] snapshot failed", error);
    return {
      ok: false,
      status: 500,
      code: "snapshot_failed",
      message: SELF_ORDER_VI.loadFailed,
    };
  }
  if (!data?.ok) {
    const code = data?.code ?? "not_found";
    return {
      ok: false,
      status: code === "pos_session_closed" ? 409 : 404,
      code,
      message:
        code === "pos_session_closed"
          ? SELF_ORDER_VI.posSessionClosed
          : SELF_ORDER_VI.unavailableDescription,
    };
  }
  return { ok: true, data };
}

export async function submitSelfOrderBatch(input: {
  token: string;
  clientOpId: string;
  items: SelfOrderCartItem[];
  customerNote?: string;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_submit_batch",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_items: input.items,
      p_customer_note: input.customerNote ?? null,
    },
  );
  if (error) {
    console.error("[self-order] submit batch failed", error);
    const mapped = mapSelfOrderError(error);
    return { ok: false, ...mapped };
  }
  return { ok: true, data: data ?? {} };
}

export async function cancelPendingPaymentAndAdd(input: {
  token: string;
  clientOpId: string;
  items: SelfOrderCartItem[];
  customerNote?: string;
}): Promise<SelfOrderActionResult<Record<string, unknown>>> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_cancel_pending_payment_and_add",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_items: input.items,
      p_customer_note: input.customerNote ?? null,
    },
  );
  if (error) {
    console.error("[self-order] cancel pending payment and add failed", error);
    const mapped = mapSelfOrderError(error);
    return { ok: false, ...mapped };
  }
  return { ok: true, data: data ?? {} };
}

export async function createSelfOrderPaymentRequest(input: {
  token: string;
  clientOpId: string;
  method: "cash_call" | "vietqr";
  invoice?: Record<string, unknown>;
}): Promise<
  SelfOrderActionResult<Record<string, unknown> & Partial<SelfOrderVietQrResponse>>
> {
  const { data, error } = await service().rpc<Record<string, unknown>>(
    "self_order_create_payment_request",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_method: input.method,
      p_invoice_payload: input.invoice ?? {},
    },
  );
  if (error) {
    console.error("[self-order] payment request failed", error);
    const mapped = mapSelfOrderError(error);
    return { ok: false, ...mapped };
  }

  const payload = data ?? {};
  if (input.method !== "vietqr") return { ok: true, data: payload };

  const amount = Number(payload.amount ?? 0);
  const paymentCode = String(payload.paymentCode ?? "");
  const config = await readVietQrConfigForToken(input.token);
  if (!config.ok) return config;

  const qrData = buildVietQrEmvco({
    bankCode: config.data.bankCode,
    accountNo: config.data.accountNo,
    accountName: config.data.accountName,
    amount,
    description: paymentCode,
  });

  if (!qrData) {
    return {
      ok: false,
      status: 409,
      code: "vietqr_config_invalid",
      message: SELF_ORDER_VI.paymentFailed,
    };
  }

  return {
    ok: true,
    data: {
      ...payload,
      qrData,
      amount,
      paymentCode,
      bankCode: config.data.bankCode,
      accountNo: config.data.accountNo,
      accountName: config.data.accountName,
    },
  };
}

async function readVietQrConfigForToken(token: string): Promise<
  SelfOrderActionResult<{
    bankCode: string;
    accountNo: string;
    accountName: string;
  }>
> {
  const client = service();
  const tableQuery = client
    .from("tables")
    .select("tenant_id")
    .eq("self_order_token", token)
    .eq("self_order_enabled", true) as PromiseLike<{
    data: Array<{ tenant_id: number }> | null;
    error: { message?: string } | null;
  }>;
  const { data: tableRows, error: tableError } = await tableQuery;
  const tenantId = tableRows?.[0]?.tenant_id;
  if (tableError || tenantId == null) {
    console.error("[self-order] vietqr token lookup failed", tableError);
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: SELF_ORDER_VI.unavailableDescription,
    };
  }

  const settingsQuery = client
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
      SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
    ]) as PromiseLike<{
    data: Array<{ key: string; value: string }> | null;
    error: { message?: string } | null;
  }>;
  const { data: rows, error } = await settingsQuery;
  if (error) {
    console.error("[self-order] vietqr settings failed", error);
    return {
      ok: false,
      status: 409,
      code: "vietqr_config_missing",
      message: SELF_ORDER_VI.paymentFailed,
    };
  }

  const settings = new Map((rows ?? []).map((row) => [row.key, row.value]));
  const bankCode = settings.get(SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE);
  const accountNo = settings.get(SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO);
  const accountName =
    settings.get(SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME) ?? "";

  if (!bankCode || !accountNo) {
    return {
      ok: false,
      status: 409,
      code: "vietqr_config_missing",
      message: SELF_ORDER_VI.paymentFailed,
    };
  }

  return { ok: true, data: { bankCode, accountNo, accountName } };
}
