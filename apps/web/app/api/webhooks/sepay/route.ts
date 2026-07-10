import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import {
  issueTaxInvoiceForPaidOrder,
  type CreateInvoiceInput,
} from "@lib/hddt-per-order";

const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET ?? "";
const SIGNATURE_TOLERANCE_SECONDS = 300;
// Transfer-memo match. The configured prefix (Payment Settings →
// payment_vietqr_code_prefix) is fetched per webhook and built into the regex,
// mirroring the SQL vietqr_payment_code_prefix() helper. FALLBACK_CODE_PREFIX
// matches the seeded default; LEGACY_SOUNDBOX_PREFIX and DH… stay as grandfather
// branches for in-flight orders created before the prefix became configurable.
const FALLBACK_CODE_PREFIX = "QAJZRU5550 MBBMS01382716 1";
const LEGACY_SOUNDBOX_PREFIX = "VQRLOAMB20260626100157757";
const LEGACY_PAYMENT_CODE_RE = /\bDH\s+\d{6}\s+[A-Z0-9]{5}\b/gi;

type BankContentSettings = {
  prefix: string;
  orderToken: string;
  expenseToken: string;
  cashDepositToken: string;
};

const FALLBACK_BANK_CONTENT_SETTINGS = {
  prefix: "MATU",
  orderToken: "DON",
  expenseToken: "CHI",
  cashDepositToken: "NOP",
} as const satisfies BankContentSettings;
const BANK_CONTENT_SETTING_KEYS = [
  SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX,
  SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_ORDER_TOKEN,
  SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN,
  SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN,
] as const;

type BankContentCommand =
  | { kind: "order"; value: string | null }
  | { kind: "expense"; value: string | null }
  | { kind: "cash_deposit"; value: string | null };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sanitise to uppercase single-spaced [A-Z0-9 ], mirroring the SQL helper, then
// fall back to the seeded default when the setting is unset.
function sanitizeCodePrefix(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return cleaned || FALLBACK_CODE_PREFIX;
}

function normalizeBankContentMemo(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeContentToken(
  value: string | null | undefined,
  fallback: string,
): string {
  return normalizeBankContentMemo(value).replace(/\s+/g, "") || fallback;
}

function commandValue(words: string[], startIndex: number): string | null {
  const value = words.slice(startIndex).join(" ").trim();
  return value || null;
}

function findBankContentCommand(
  memo: string,
  settings: BankContentSettings,
): BankContentCommand | null {
  const words = normalizeBankContentMemo(memo).split(" ").filter(Boolean);
  for (let index = 0; index < words.length - 1; index += 1) {
    if (words[index] !== settings.prefix) continue;
    const token = words[index + 1];
    const value = commandValue(words, index + 2);
    if (token === settings.orderToken) return { kind: "order", value };
    if (token === settings.expenseToken) return { kind: "expense", value };
    if (token === settings.cashDepositToken) {
      return { kind: "cash_deposit", value };
    }
  }
  return null;
}

function extractBankContentCommand(
  payload: SepayPayload,
  settings: BankContentSettings,
): BankContentCommand | null {
  return (
    findBankContentCommand(payload.content, settings) ??
    findBankContentCommand(payload.description, settings) ??
    findBankContentCommand(payload.code ?? "", settings)
  );
}

function parseExpenseCommandId(value: string | null): number | null {
  const token = value?.split(/\s+/)[0] ?? "";
  if (!/^[0-9]+$/.test(token)) return null;
  const id = Number(token);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function buildPaymentCodeRe(prefix: string): RegExp {
  const configured = escapeRegExp(sanitizeCodePrefix(prefix));
  return new RegExp(
    `\\b${configured} [A-Z0-9]{12}\\b` +
      `|\\b${LEGACY_SOUNDBOX_PREFIX} [A-Z0-9]{12}\\b` +
      `|\\bDH[A-Z0-9]{3,12}\\b`,
    "gi",
  );
}

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
    transferAmount: z.coerce.number(),
    accumulated: z.coerce.number().optional().default(0),
    referenceCode: nullableTrimmedStringSchema.default(""),
  })
  .superRefine((payload, ctx) => {
    if (payload.transferType === "in" && payload.transferAmount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["transferAmount"],
        message: "incoming transferAmount must be positive",
      });
    }
    if (payload.transferType === "out" && payload.transferAmount === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["transferAmount"],
        message: "outgoing transferAmount must be non-zero",
      });
    }
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

const cashDepositRpcResultSchema = z
  .object({
    expense_id: z.number().nullable().optional(),
  })
  .passthrough();

type SepayPayload = z.infer<typeof sepayPayloadSchema>;
type ServiceClient = ReturnType<typeof createServiceClient>;
type InvoiceBuyerInput = Omit<CreateInvoiceInput, "orderId">;
type SelfOrderInvoiceCandidate = {
  id: number;
  payment_id: number | null;
  method: string;
  invoice_payload: unknown;
  payment_code_snapshot: string | null;
  amount_snapshot: number;
};
type SelfOrderInvoiceResolution =
  | { status: "resolved"; input: InvoiceBuyerInput }
  | {
      status: "manual_review";
      reason:
        | "lookup_failed"
        | "invalid_invoice_payload"
        | "ambiguous_invoice_payload";
    };
type WebhookEventClaim =
  | { status: "claimed"; id: number }
  | { status: "already_final" }
  | { status: "error" };

type UntypedQueryResponse<T> = {
  data: T | null;
  error: { code?: string | null; message?: string | null } | null;
};

type UntypedQueryBuilder<T> = PromiseLike<UntypedQueryResponse<T[]>> & {
  select(columns: string): UntypedQueryBuilder<T>;
  eq(column: string, value: unknown): UntypedQueryBuilder<T>;
  order(
    column: string,
    options?: Record<string, unknown>,
  ): UntypedQueryBuilder<T>;
  limit(count: number): UntypedQueryBuilder<T>;
  maybeSingle(): Promise<UntypedQueryResponse<T>>;
};

type UntypedQueryClient = {
  from<T>(table: string): UntypedQueryBuilder<T>;
};

type UntypedRpcClient = {
  rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<UntypedQueryResponse<T>>;
};

const invoiceBuyerInputSchema = z.object({
  buyerName: z.string().trim().max(200).optional(),
  buyerTaxCode: z
    .string()
    .trim()
    .regex(/^\d{10}(-\d{3})?$/)
    .optional(),
  buyerAddress: z.string().trim().max(500).optional(),
  buyerEmail: z.email().optional(),
  buyerNotGetInvoice: z.boolean().optional(),
});

function payloadToJson(payload: SepayPayload): Json {
  return JSON.parse(JSON.stringify(payload)) as Json;
}

function parseStoredInvoicePayload(value: unknown): InvoiceBuyerInput | null {
  const parsed = invoiceBuyerInputSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

function invoiceBuyerInputKey(input: InvoiceBuyerInput): string {
  return JSON.stringify({
    buyerName: input.buyerName ?? null,
    buyerTaxCode: input.buyerTaxCode ?? null,
    buyerAddress: input.buyerAddress ?? null,
    buyerEmail: input.buyerEmail ?? null,
    buyerNotGetInvoice: input.buyerNotGetInvoice ?? null,
  });
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
  codeRe: RegExp,
): string[] {
  if (!value) return [];
  const text = value.trim().toUpperCase().replace(/\s+/g, " ");
  return [
    ...(text.match(codeRe) ?? []).map((match) => match.toUpperCase()),
    ...(text.match(LEGACY_PAYMENT_CODE_RE) ?? []).map((match) =>
      match.toUpperCase().replace(/^DH\s+/, "DH "),
    ),
  ];
}

function pickLongestPaymentCode(candidates: string[]): string | null {
  return (
    candidates.sort(
      (a, b) => b.replace(/\s+/g, "").length - a.replace(/\s+/g, "").length,
    )[0] ?? null
  );
}

function extractPaymentCodeFromText(
  value: string | null | undefined,
  codeRe: RegExp,
): string | null {
  return pickLongestPaymentCode(normalizePaymentCodeCandidates(value, codeRe));
}

function extractPaymentCode(
  payload: SepayPayload,
  codeRe: RegExp,
): string | null {
  return pickLongestPaymentCode([
    ...normalizePaymentCodeCandidates(payload.content, codeRe),
    ...normalizePaymentCodeCandidates(payload.description, codeRe),
    ...normalizePaymentCodeCandidates(payload.code ?? null, codeRe),
  ]);
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
    .eq("key", SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO)
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

async function resolvePaymentCodePrefix(
  supabase: ServiceClient,
  tenantId: number,
): Promise<string> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX)
    .maybeSingle();

  if (error) {
    console.warn("[sepay-webhook] code prefix lookup failed", error.code);
  }
  return sanitizeCodePrefix(data?.value ?? null);
}

async function resolveBankContentSettings(
  supabase: ServiceClient,
  tenantId: number,
): Promise<BankContentSettings> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .in("key", [...BANK_CONTENT_SETTING_KEYS]);

  if (error) {
    console.warn("[sepay-webhook] bank content settings lookup failed", {
      code: error.code,
    });
  }

  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    prefix: sanitizeContentToken(
      values.get(SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX),
      FALLBACK_BANK_CONTENT_SETTINGS.prefix,
    ),
    orderToken: sanitizeContentToken(
      values.get(SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_ORDER_TOKEN),
      FALLBACK_BANK_CONTENT_SETTINGS.orderToken,
    ),
    expenseToken: sanitizeContentToken(
      values.get(SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN),
      FALLBACK_BANK_CONTENT_SETTINGS.expenseToken,
    ),
    cashDepositToken: sanitizeContentToken(
      values.get(SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN),
      FALLBACK_BANK_CONTENT_SETTINGS.cashDepositToken,
    ),
  };
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
    expense_id?: number | null;
    processing_status: "processed" | "failed" | "ignored";
    http_status: number;
    error_code?: string | null;
  },
) {
  const { error } = await supabase
    .from("webhook_events")
    .update({
      payment_id: values.payment_id ?? null,
      expense_id: values.expense_id ?? null,
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

async function resolveSelfOrderInvoiceInput(
  supabase: ServiceClient,
  input: {
    tenantId: number;
    orderId: number;
    paymentId: number | null;
    paymentCode: string;
    transferAmount: number;
  },
): Promise<SelfOrderInvoiceResolution> {
  const untyped = supabase as unknown as UntypedQueryClient;
  const candidates = new Map<number, SelfOrderInvoiceCandidate>();

  if (input.paymentId !== null) {
    const { data, error } = await untyped
      .from<SelfOrderInvoiceCandidate>("self_order_payment_requests")
      .select(
        "id, payment_id, method, invoice_payload, payment_code_snapshot, amount_snapshot",
      )
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId)
      .eq("payment_id", input.paymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[sepay-webhook] exact self-order invoice lookup failed", {
        code: error.code ?? "unknown",
        orderId: input.orderId,
        paymentId: input.paymentId,
      });
      return { status: "manual_review", reason: "lookup_failed" };
    }
    if (data) {
      candidates.set(data.id, data);
    }
  }

  // A late transfer can complete a replacement payment after its original request
  // expired. All same-code, same-amount intents must agree on the buyer binding.
  const { data, error } = await untyped
    .from<SelfOrderInvoiceCandidate>("self_order_payment_requests")
    .select(
      "id, payment_id, method, invoice_payload, payment_code_snapshot, amount_snapshot",
    )
    .eq("tenant_id", input.tenantId)
    .eq("order_id", input.orderId)
    .eq("method", "vietqr")
    .eq("payment_code_snapshot", input.paymentCode)
    .eq("amount_snapshot", input.transferAmount)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.warn("[sepay-webhook] self-order invoice payload lookup failed", {
      code: error.code ?? "unknown",
      orderId: input.orderId,
      paymentId: input.paymentId,
      paymentCode: input.paymentCode,
      transferAmount: input.transferAmount,
    });
    return { status: "manual_review", reason: "lookup_failed" };
  }

  for (const candidate of data ?? []) {
    candidates.set(candidate.id, candidate);
  }

  if (candidates.size === 0) {
    return { status: "resolved", input: {} };
  }

  const payloads = new Map<string, InvoiceBuyerInput>();
  for (const candidate of candidates.values()) {
    const parsed = parseStoredInvoicePayload(candidate.invoice_payload);
    if (!parsed) {
      return { status: "manual_review", reason: "invalid_invoice_payload" };
    }
    payloads.set(invoiceBuyerInputKey(parsed), parsed);
  }

  if (payloads.size !== 1) {
    return { status: "manual_review", reason: "ambiguous_invoice_payload" };
  }

  const invoiceInput = payloads.values().next().value;
  return invoiceInput
    ? { status: "resolved", input: invoiceInput }
    : { status: "manual_review", reason: "invalid_invoice_payload" };
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
  const bankContentSettings = await resolveBankContentSettings(
    supabase,
    accountScope.tenantId,
  );
  const bankCommand = extractBankContentCommand(payload, bankContentSettings);

  if (payload.transferType === "out") {
    if (bankCommand?.kind === "expense") {
      const expenseId = parseExpenseCommandId(bankCommand.value);
      if (!expenseId) {
        await markWebhookEvent(supabase, webhookEventId, {
          processing_status: "failed",
          http_status: 200,
          error_code: "missing_expense_id",
        });
        return sepayAcceptedResponse();
      }

      const { error: expenseMatchError } = await supabase.rpc(
        "match_sepay_transaction_expenses",
        {
          p_event_id: webhookEventId,
          p_expense_ids: [expenseId],
        },
      );

      if (expenseMatchError) {
        console.error(
          "[sepay-webhook] expense match failed",
          expenseMatchError.code,
        );
        await markWebhookEvent(supabase, webhookEventId, {
          processing_status: "failed",
          http_status: 200,
          error_code: expenseMatchError.code ?? "expense_match_failed",
        });
        return sepayAcceptedResponse();
      }

      await markWebhookEvent(supabase, webhookEventId, {
        expense_id: expenseId,
        processing_status: "processed",
        http_status: 200,
      });
      return sepayAcceptedResponse();
    }

    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: bankCommand ? "failed" : "ignored",
      http_status: 200,
      error_code: bankCommand
        ? "bank_content_wrong_transfer_type"
        : "transfer_type_out",
    });
    return sepayAcceptedResponse();
  }

  if (bankCommand?.kind === "expense") {
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "failed",
      http_status: 200,
      error_code: "bank_content_wrong_transfer_type",
    });
    return sepayAcceptedResponse();
  }

  if (bankCommand?.kind === "cash_deposit") {
    const untyped = supabase as unknown as UntypedRpcClient;
    const { data: rawCashDepositData, error: cashDepositError } =
      await untyped.rpc("record_sepay_cash_deposit_as_system", {
        p_event_id: webhookEventId,
      });

    if (cashDepositError) {
      console.error(
        "[sepay-webhook] failed to record bank_deposit expense",
        cashDepositError.code,
      );
      await markWebhookEvent(supabase, webhookEventId, {
        processing_status: "failed",
        http_status: 500,
        error_code: "bank_deposit_insert_failed",
      });
      return NextResponse.json({ success: false }, { status: 500 });
    }

    const parsedCashDepositData =
      cashDepositRpcResultSchema.safeParse(rawCashDepositData);
    const expenseId = parsedCashDepositData.success
      ? (parsedCashDepositData.data.expense_id ?? null)
      : null;
    await markWebhookEvent(supabase, webhookEventId, {
      expense_id: expenseId,
      processing_status: "processed",
      http_status: 200,
    });
    return sepayAcceptedResponse();
  }

  const codeRe = buildPaymentCodeRe(
    await resolvePaymentCodePrefix(supabase, accountScope.tenantId),
  );
  const commandPaymentCode =
    bankCommand?.kind === "order" && bankCommand.value
      ? (extractPaymentCodeFromText(bankCommand.value, codeRe) ??
        bankCommand.value)
      : null;
  const paymentCode = commandPaymentCode ?? extractPaymentCode(payload, codeRe);
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
    const invoiceResolution = await resolveSelfOrderInvoiceInput(supabase, {
      tenantId: accountScope.tenantId,
      orderId: orderScope.orderId,
      paymentId,
      paymentCode,
      transferAmount: payload.transferAmount,
    });
    let invoiceErrorCode: string | null;

    if (invoiceResolution.status === "manual_review") {
      invoiceErrorCode = "invoice_binding_manual_review";
      console.error("[sepay-webhook] HĐĐT buyer binding needs review", {
        orderId: orderScope.orderId,
        paymentId,
        reason: invoiceResolution.reason,
      });
    } else {
      const invoiceResult = await issueTaxInvoiceForPaidOrder({
        supabase,
        tenantId: accountScope.tenantId,
        input: { orderId: orderScope.orderId, ...invoiceResolution.input },
        actorId: null,
        logPrefix: "sepay-webhook",
      });
      invoiceErrorCode =
        !invoiceResult.success &&
        invoiceResult.errorCode !== "invoice_exists" &&
        invoiceResult.errorCode !== "summary_invoice_exists"
          ? "invoice_attempt_failed"
          : null;
      if (invoiceErrorCode) {
        console.error("[sepay-webhook] HĐĐT attempt failed", {
          orderId: orderScope.orderId,
          code: invoiceResult.errorCode ?? "unknown",
        });
      }
    }

    await markWebhookEvent(supabase, webhookEventId, {
      payment_id: paymentId,
      processing_status: "processed",
      http_status: 200,
      error_code: invoiceErrorCode,
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
