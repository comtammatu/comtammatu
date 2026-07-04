import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";

const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET ?? "";
const SIGNATURE_TOLERANCE_SECONDS = 300;
const SEPAY_PAYMENT_CODE_RE =
  /\bVQRLOAMB20260626100157757 [A-Z0-9]{12}\b|\bDH[A-Z0-9]{3,12}\b/gi;
const LEGACY_PAYMENT_CODE_RE = /\bDH\s+\d{6}\s+[A-Z0-9]{5}\b/gi;

const sepayAcceptedResponse = () => NextResponse.json({ success: true });

const nullableTrimmedStringSchema = z.preprocess(
  (value) => (value == null ? "" : value),
  z.string().trim(),
);

const nullableOptionalTrimmedStringSchema = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.string().trim().nullable(),
);

const transferTypeSchema = z.preprocess(
  (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase(),
  z.enum(["in", "out"]),
);

const sepayPayloadSchema = z
  .object({
    id: z.coerce.number().int().nonnegative(),
    gateway: nullableTrimmedStringSchema,
    transactionDate: nullableTrimmedStringSchema,
    accountNumber: nullableTrimmedStringSchema,
    subAccount: nullableTrimmedStringSchema.default(""),
    code: nullableOptionalTrimmedStringSchema.optional(),
    content: nullableTrimmedStringSchema,
    transferType: transferTypeSchema,
    description: nullableTrimmedStringSchema.default(""),
    transferAmount: z.coerce.number().nonnegative(),
    accumulated: z.coerce.number().optional().default(0),
    referenceCode: nullableTrimmedStringSchema.default(""),
  })
  .passthrough();

const sepayRpcResultSchema = z
  .object({
    status: z.string().optional(),
    order_id: z.number().nullable().optional(),
    payment_id: z.number().nullable().optional(),
    detail: z.string().nullable().optional(),
  })
  .passthrough();

type SepayPayload = z.infer<typeof sepayPayloadSchema>;
type ServiceClient = ReturnType<typeof createServiceClient>;
type WebhookEventClaim =
  | { status: "claimed"; id: number }
  | { status: "already_final" }
  | { status: "error" };

function payloadToJson(payload: SepayPayload): Json {
  return JSON.parse(JSON.stringify(payload)) as Json;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function verifySepaySignature(request: Request, rawBody: string): boolean {
  if (!SEPAY_WEBHOOK_SECRET) return false;

  const signature = request.headers.get("x-sepay-signature") ?? "";
  const timestampHeader = request.headers.get("x-sepay-timestamp") ?? "";
  const timestamp = Number(timestampHeader);
  if (!signature || !Number.isFinite(timestamp)) return false;

  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected =
    "sha256=" +
    createHmac("sha256", SEPAY_WEBHOOK_SECRET)
      .update(`${timestampHeader}.${rawBody}`)
      .digest("hex");
  return safeEqual(signature, expected);
}

function parseSepayPayload(request: Request, rawBody: string): unknown {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
  return JSON.parse(rawBody);
}

function logSepayPayloadIssues(error: z.ZodError) {
  console.warn("[sepay-webhook] invalid payload", {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
    })),
  });
}

function normalizePaymentCodeCandidates(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  const text = value.trim().toUpperCase().replace(/\s+/g, " ");
  return [
    ...(text.match(SEPAY_PAYMENT_CODE_RE) ?? []).map((match) =>
      match.toUpperCase(),
    ),
    ...(text.match(LEGACY_PAYMENT_CODE_RE) ?? []).map((match) =>
      match.toUpperCase().replace(/^DH\s+/, "DH "),
    ),
  ];
}

function extractPaymentCode(payload: SepayPayload): string | null {
  return (
    [
      ...normalizePaymentCodeCandidates(payload.content),
      ...normalizePaymentCodeCandidates(payload.description),
      ...normalizePaymentCodeCandidates(payload.code ?? null),
    ].sort(
      (a, b) => b.replace(/\s+/g, "").length - a.replace(/\s+/g, "").length,
    )[0] ?? null
  );
}

function normalizeAccountNumber(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

async function resolveAccountScope(
  supabase: ServiceClient,
  accountNumber: string,
): Promise<
  | { status: "found"; tenantId: number }
  | { status: "not_found" | "ambiguous" | "error" }
> {
  const normalizedAccount = normalizeAccountNumber(accountNumber);
  if (!normalizedAccount) return { status: "not_found" };

  const { data, error } = await supabase
    .from("system_settings")
    .select("tenant_id, value")
    .eq("key", "payment_vietqr_account_no")
    .eq("value", normalizedAccount);

  if (error) {
    console.error("[sepay-webhook] account scope lookup failed", error.code);
    return { status: "error" };
  }

  const matches = data ?? [];
  if (matches.length === 0) return { status: "not_found" };

  const tenantIds = new Set(matches.map((row) => row.tenant_id));
  if (tenantIds.size > 1) return { status: "ambiguous" };

  const tenantId = matches[0]?.tenant_id;
  return typeof tenantId === "number"
    ? { status: "found", tenantId }
    : { status: "not_found" };
}

async function resolveOrderScope(
  supabase: ServiceClient,
  tenantId: number,
  paymentCode: string,
): Promise<
  | { status: "found"; orderId: number }
  | { status: "not_found" | "ambiguous" | "error" }
> {
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("payment_code", paymentCode)
    .neq("status", "cancelled")
    .limit(2);

  if (error) {
    console.error("[sepay-webhook] order lookup failed", error.code);
    return { status: "error" };
  }
  if (!data || data.length === 0) return { status: "not_found" };
  if (data.length > 1) return { status: "ambiguous" };
  const row = data[0];
  if (!row) return { status: "not_found" };
  return { status: "found", orderId: row.id };
}

async function markWebhookEvent(
  supabase: ServiceClient,
  eventId: number,
  values: {
    payment_id?: number | null;
    processing_status: "processed" | "failed" | "ignored";
    http_status: number;
    error_code?: string | null;
  },
) {
  const { error } = await supabase
    .from("webhook_events")
    .update({
      payment_id: values.payment_id ?? null,
      processing_status: values.processing_status,
      http_status: values.http_status,
      error_code: values.error_code ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) {
    console.error(
      "[sepay-webhook] failed to update webhook_events",
      error.code,
    );
  }
}

async function claimWebhookEvent(
  supabase: ServiceClient,
  input: {
    tenantId: number;
    requestId: string;
    payload: Json;
  },
): Promise<WebhookEventClaim> {
  const { data: webhookEvent, error: webhookInsertErr } = await supabase
    .from("webhook_events")
    .insert({
      tenant_id: input.tenantId,
      provider: "sepay",
      request_id: input.requestId,
      signature_valid: true,
      payload: input.payload,
      processing_status: "received",
    })
    .select("id")
    .single();

  if (!webhookInsertErr) {
    return { status: "claimed", id: webhookEvent.id };
  }

  if (webhookInsertErr.code !== "23505") {
    console.error(
      "[sepay-webhook] failed to insert webhook_events",
      webhookInsertErr.code,
    );
    return { status: "error" };
  }

  const { data: existingEvent, error: existingErr } = await supabase
    .from("webhook_events")
    .select("id, processing_status, http_status")
    .eq("provider", "sepay")
    .eq("request_id", input.requestId)
    .maybeSingle();

  if (existingErr || !existingEvent) {
    console.error(
      "[sepay-webhook] failed to read duplicate webhook_event",
      existingErr?.code,
    );
    return { status: "error" };
  }

  const existingHttpStatus = existingEvent.http_status ?? 200;
  if (
    existingEvent.processing_status === "processed" ||
    existingEvent.processing_status === "ignored" ||
    (existingEvent.processing_status === "failed" && existingHttpStatus < 500)
  ) {
    return { status: "already_final" };
  }

  return { status: "claimed", id: existingEvent.id };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySepaySignature(request, rawBody)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let payload: SepayPayload;
  try {
    const parsed = sepayPayloadSchema.safeParse(
      parseSepayPayload(request, rawBody),
    );
    if (!parsed.success) {
      logSepayPayloadIssues(parsed.error);
      return NextResponse.json({ success: false }, { status: 400 });
    }
    payload = parsed.data;
  } catch (err) {
    console.warn("[sepay-webhook] invalid payload body", {
      error: err instanceof SyntaxError ? "invalid_json" : "parse_failed",
    });
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const supabase = createServiceClient();
  const accountScope = await resolveAccountScope(
    supabase,
    payload.accountNumber,
  );
  if (accountScope.status !== "found") {
    console.warn("[sepay-webhook] account scope not found", {
      id: payload.id,
      accountNumber: payload.accountNumber,
      status: accountScope.status,
    });
    return accountScope.status === "error"
      ? NextResponse.json({ success: false }, { status: 500 })
      : sepayAcceptedResponse();
  }

  const payloadJson = payloadToJson(payload);
  const webhookClaim = await claimWebhookEvent(supabase, {
    tenantId: accountScope.tenantId,
    requestId: String(payload.id),
    payload: payloadJson,
  });
  if (webhookClaim.status === "already_final") {
    return sepayAcceptedResponse();
  }
  if (webhookClaim.status === "error") {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const webhookEventId = webhookClaim.id;

  if (payload.transferType !== "in") {
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "ignored",
      http_status: 200,
      error_code: "transfer_type_out",
    });
    return sepayAcceptedResponse();
  }

  const paymentCode = extractPaymentCode(payload);
  if (!paymentCode) {
    console.warn("[sepay-webhook] missing payment code", { id: payload.id });
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "failed",
      http_status: 200,
      error_code: "missing_payment_code",
    });
    return sepayAcceptedResponse();
  }

  const orderScope = await resolveOrderScope(
    supabase,
    accountScope.tenantId,
    paymentCode,
  );
  if (orderScope.status !== "found") {
    console.warn("[sepay-webhook] order scope not found", {
      id: payload.id,
      paymentCode,
      tenantId: accountScope.tenantId,
      status: orderScope.status,
    });
    if (orderScope.status === "error") {
      await markWebhookEvent(supabase, webhookEventId, {
        processing_status: "failed",
        http_status: 500,
        error_code: "order_lookup_failed",
      });
      return NextResponse.json({ success: false }, { status: 500 });
    }
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "failed",
      http_status: 200,
      error_code:
        orderScope.status === "ambiguous"
          ? "ambiguous_payment_code"
          : "order_not_found",
    });
    return sepayAcceptedResponse();
  }

  const { data: rawRpcData, error: rpcError } = await supabase.rpc(
    "confirm_sepay_payment",
    {
      p_tenant_id: accountScope.tenantId,
      p_order_id: orderScope.orderId,
      p_provider_ref: paymentCode,
      p_transfer_amount: payload.transferAmount,
      p_account_number: payload.accountNumber,
      p_bank_reference: payload.referenceCode || String(payload.id),
      p_provider_data: payloadJson,
    },
  );

  if (rpcError) {
    console.error(
      "[sepay-webhook] confirm_sepay_payment failed",
      rpcError.code,
    );
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "failed",
      http_status: 500,
      error_code: "rpc_failed",
    });
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const parsedRpcData = sepayRpcResultSchema.safeParse(rawRpcData);
  const rpcData = parsedRpcData.success ? parsedRpcData.data : null;
  const status = rpcData?.status ?? "unknown";
  const paymentId = rpcData?.payment_id ?? null;
  if (status === "completed" || status === "already_completed") {
    await markWebhookEvent(supabase, webhookEventId, {
      payment_id: paymentId,
      processing_status: "processed",
      http_status: 200,
    });
    return sepayAcceptedResponse();
  }

  if (status === "stock_failed") {
    await markWebhookEvent(supabase, webhookEventId, {
      payment_id: paymentId,
      processing_status: "failed",
      http_status: 500,
      error_code: "stock_consumption_failed",
    });
    return NextResponse.json({ success: false }, { status: 500 });
  }

  await markWebhookEvent(supabase, webhookEventId, {
    payment_id: paymentId,
    processing_status: "failed",
    http_status: 200,
    error_code: status,
  });
  return sepayAcceptedResponse();
}
