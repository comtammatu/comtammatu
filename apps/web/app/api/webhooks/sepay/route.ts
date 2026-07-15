import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";

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

const sepayOrderEvidenceRpcResultSchema = z
  .object({
    status: z.enum([
      "matched",
      "missing_payment_code",
      "order_not_found",
      "ambiguous_payment_code",
      "amount_mismatch",
      "payment_confirmation_failed",
      "invalid_payment_code",
      "invalid_amount",
    ]),
  })
  .passthrough();

const cashDepositRpcResultSchema = z
  .object({
    expense_id: z.number().nullable().optional(),
  })
  .passthrough();

const transferIntentRpcResultSchema = z.discriminatedUnion("matched", [
  z.object({ matched: z.literal(false) }).passthrough(),
  z
    .object({
      matched: z.literal(true),
      expense_id: z.number().int().positive(),
    })
    .passthrough(),
]);

const missingTransferIntentResolverCodes = new Set(["PGRST202", "42883"]);
const terminalTransferIntentResolverCodes = new Set(["23505", "23514"]);

type SepayPayload = z.infer<typeof sepayPayloadSchema>;
type ServiceClient = ReturnType<typeof createServiceClient>;
type WebhookEventClaim =
  | { status: "claimed"; id: number }
  | { status: "already_final" }
  | { status: "error" };

type UntypedQueryResponse<T> = {
  data: T | null;
  error: { code?: string | null; message?: string | null } | null;
};

type UntypedRpcClient = {
  rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<UntypedQueryResponse<T>>;
};

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
    const untyped = supabase as unknown as UntypedRpcClient;
    const { data: rawTransferIntentData, error: transferIntentError } =
      await untyped.rpc<unknown>("match_sepay_transfer_intent_event", {
        p_event_id: webhookEventId,
      });

    if (transferIntentError) {
      const errorCode = transferIntentError.code ?? "";
      if (missingTransferIntentResolverCodes.has(errorCode)) {
        console.warn(
          "[sepay-webhook] transfer intent resolver unavailable; using configured memo matching",
          errorCode,
        );
      } else {
        console.error(
          "[sepay-webhook] transfer intent match failed",
          errorCode,
        );
        if (terminalTransferIntentResolverCodes.has(errorCode)) {
          await markWebhookEvent(supabase, webhookEventId, {
            processing_status: "failed",
            http_status: 200,
            error_code: errorCode,
          });
          return sepayAcceptedResponse();
        }
        return NextResponse.json({ success: false }, { status: 500 });
      }
    } else {
      const transferIntentData = transferIntentRpcResultSchema.safeParse(
        rawTransferIntentData,
      );
      if (!transferIntentData.success) {
        return NextResponse.json({ success: false }, { status: 500 });
      }

      if (transferIntentData.data.matched) {
        return sepayAcceptedResponse();
      }
    }

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
        : null,
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
      ? extractPaymentCodeFromText(bankCommand.value, codeRe)
      : null;
  const paymentCode = extractPaymentCode(payload, codeRe) ?? commandPaymentCode;

  const untyped = supabase as unknown as UntypedRpcClient;
  const { data: rawRpcData, error: rpcError } = await untyped.rpc(
    "reconcile_sepay_order_evidence",
    { p_event_id: webhookEventId, p_payment_code: paymentCode ?? "" },
  );

  if (rpcError) {
    console.error(
      "[sepay-webhook] order evidence reconciliation failed",
      rpcError.code,
    );
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "failed",
      http_status: 500,
      error_code: "rpc_failed",
    });
    return NextResponse.json({ success: false }, { status: 500 });
  }

  if (!sepayOrderEvidenceRpcResultSchema.safeParse(rawRpcData).success) {
    await markWebhookEvent(supabase, webhookEventId, {
      processing_status: "failed",
      http_status: 500,
      error_code: "rpc_result_invalid",
    });
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return sepayAcceptedResponse();
}
