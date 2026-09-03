import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  buildSinvoiceTransactionUuid,
  getInvoiceProvider,
  type InvoiceLookupOutcome,
  type InvoiceProvider,
  type InvoiceRequest,
  type InvoiceResult,
} from "@comtammatu/shared/providers";
import {
  applyInvoiceLineDiscount,
  buildInvoiceLineItemsFromOrderItems,
} from "@comtammatu/shared/hddt";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { z } from "zod";

const MST_REGEX = /^\d{10}(-\d{3})?$/;

export const createInvoiceSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
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
  })
  .refine(
    (v) =>
      v.buyerNotGetInvoice !== false ||
      Boolean(
        v.buyerName?.trim() ||
        v.buyerTaxCode?.trim() ||
        v.buyerAddress?.trim() ||
        v.buyerEmail?.trim(),
      ),
    {
      error: "Cần ít nhất một thông tin người mua",
      path: ["buyerName"],
    },
  );

export interface TaxInvoiceIssueRow {
  id: number;
  invoice_number: string | null;
  status: string | null;
}

interface IssuePreparedTaxInvoiceDeps {
  supabase: SupabaseClient<Database>;
  jobId: number;
  taxInvoiceId: number;
  input: unknown;
  logPrefix?: string;
}

const draftOrderItemSchema = z.object({
  item_name: z.string().nullable(),
  variant_name: z.string().nullable().optional(),
  quantity: z.union([z.number(), z.string()]).nullable(),
  unit_price: z.union([z.number(), z.string()]).nullable(),
  subtotal: z.union([z.number(), z.string()]).nullable().optional(),
  discount_amount: z.union([z.number(), z.string()]).nullable().optional(),
  modifiers: z.unknown().optional(),
  sides: z.unknown().optional(),
  status: z.string().nullable(),
});

const preparedInvoicePayloadSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
    buyerName: z.string().trim().min(1).max(200),
    buyerTaxCode: z.string().trim().regex(MST_REGEX).optional(),
    buyerAddress: z.string().trim().max(500).optional(),
    buyerEmail: z.email().optional(),
    buyerNotGetInvoice: z.boolean(),
    draftSnapshot: z.object({
      version: z.literal(1),
      orderId: z.coerce.number().int().positive(),
      branchId: z.coerce.number().int().positive(),
      orderNumber: z.string().trim().min(1).max(100),
      invoiceTime: z.string().datetime({ offset: true }),
      orderDiscountAmount: z.coerce.number().finite().nonnegative(),
      subtotal: z.coerce.number().finite().nonnegative(),
      vatRate: z.coerce.number().finite().nonnegative(),
      vatAmount: z.coerce.number().finite().nonnegative(),
      totalAmount: z.coerce.number().finite().nonnegative(),
      items: z.array(draftOrderItemSchema).min(1),
    }),
  })
  .refine((value) => value.orderId === value.draftSnapshot.orderId, {
    error: "Dữ liệu hóa đơn không khớp đơn hàng",
    path: ["draftSnapshot", "orderId"],
  })
  .refine(
    (value) =>
      value.buyerNotGetInvoice ||
      Boolean(
        value.buyerTaxCode &&
        value.buyerName &&
        value.buyerAddress &&
        value.buyerEmail,
      ),
    {
      error: "Thông tin người mua chưa đầy đủ",
      path: ["buyerTaxCode"],
    },
  );

async function submitReservedTaxInvoice({
  supabase,
  invoiceProvider,
  logPrefix,
  reservedInvoiceId,
  request,
}: {
  supabase: SupabaseClient<Database>;
  invoiceProvider: InvoiceProvider;
  logPrefix: string;
  reservedInvoiceId: number;
  request: InvoiceRequest;
}): Promise<ActionResult<TaxInvoiceIssueRow>> {
  let result: InvoiceResult;
  try {
    result = await invoiceProvider.createInvoice(request);
  } catch (error) {
    console.error(`[${logPrefix}] Invoice provider error:`, error);
    return {
      success: false,
      error:
        "Chưa xác định nhà cung cấp HĐĐT đã nhận hóa đơn hay chưa. Lệnh được giữ để đối soát, không tự gửi lại.",
      errorCode: "invoice_provider_failed",
    };
  }
  const invoiceNumber = result.invoiceNumber;
  const providerRef = result.providerRef;
  const providerData = result.providerData;
  const providerErrorCode = providerData?.["errorCode"];
  const providerOutcomeUnknown =
    result.status === "failed" &&
    (providerErrorCode === "exception" ||
      providerErrorCode === "TRANSACTION_IS_BEING_PROCESSED");
  const invoiceStatus: "draft" | "signing" | "submitted" | "issued" =
    result.status === "failed"
      ? providerOutcomeUnknown
        ? "signing"
        : "draft"
      : result.status;
  const cqtCode =
    typeof result.codeOfTax === "string" && result.codeOfTax.trim().length > 0
      ? result.codeOfTax
      : null;

  let resolvedStatus = invoiceStatus;
  let resolvedNumber = invoiceNumber;
  let resolvedCqt = cqtCode;
  let resolvedPayload = providerData
    ? (JSON.parse(JSON.stringify(providerData)) as Record<string, unknown>)
    : null;
  let resolvedIssuedAt = new Date().toISOString();

  if (
    (resolvedStatus === "signing" || resolvedStatus === "submitted") &&
    providerRef.trim().length >= 10
  ) {
    const lookup = await invoiceProvider.lookupInvoice(providerRef);
    if (lookup.outcome === "issued" && lookup.invoiceNumber) {
      resolvedStatus = "issued";
      resolvedNumber = lookup.invoiceNumber;
      resolvedCqt =
        typeof lookup.codeOfTax === "string" &&
        lookup.codeOfTax.trim().length > 0
          ? lookup.codeOfTax.trim()
          : resolvedCqt;
      resolvedPayload = lookup.providerData
        ? (JSON.parse(JSON.stringify(lookup.providerData)) as Record<
            string,
            unknown
          >)
        : resolvedPayload;
      resolvedIssuedAt = lookup.issuedAt ?? resolvedIssuedAt;
    }
  }

  if (resolvedStatus === "issued") {
    if (!resolvedNumber || !providerRef) {
      return {
        success: false,
        error:
          "Nhà cung cấp đã phản hồi không đầy đủ. Hệ thống giữ lệnh để Finance đối soát.",
        errorCode: "invoice_provider_incomplete",
      };
    }
    return writeIssuedReconciliation({
      supabase,
      logPrefix,
      taxInvoiceId: reservedInvoiceId,
      providerRef,
      invoiceNumber: resolvedNumber,
      cqtCode: resolvedCqt,
      providerPayload: resolvedPayload,
      issuedAt: resolvedIssuedAt,
      triggerSource: "cron",
    });
  }

  if (resolvedStatus === "signing") {
    return {
      success: true,
      data: {
        id: reservedInvoiceId,
        invoice_number: null,
        status: "signing",
      },
    };
  }

  const transition = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { code?: string | null } | null }>;
  };
  const { error: transitionErr } = await transition.rpc(
    "transition_tax_invoice_state_as_system",
    {
      p_tax_invoice_id: reservedInvoiceId,
      p_to_status: invoiceStatus,
      p_actor: null,
      p_payload: resolvedPayload,
      p_note:
        invoiceStatus === "draft"
          ? "Provider rejected invoice issuance"
          : "Provider submitted invoice",
    },
  );
  if (transitionErr) {
    console.error(
      `[${logPrefix}] Invoice state transition error:`,
      transitionErr,
    );
    return {
      success: false,
      error:
        "Hóa đơn đã được gửi nhưng chưa lưu đủ trạng thái. Hệ thống đã giữ lệnh để đối soát.",
      errorCode: "invoice_write_failed",
    };
  }

  return {
    success: true,
    data: {
      id: reservedInvoiceId,
      invoice_number: null,
      status: invoiceStatus,
    },
  };
}

export async function issuePreparedTaxInvoice({
  supabase,
  jobId,
  taxInvoiceId,
  input,
  logPrefix = "hddt-prepared",
}: IssuePreparedTaxInvoiceDeps): Promise<ActionResult<TaxInvoiceIssueRow>> {
  const parsed = preparedInvoicePayloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Dữ liệu draft HĐĐT không hợp lệ.",
      errorCode: "invoice_snapshot_invalid",
    };
  }

  const activeItems = parsed.data.draftSnapshot.items.filter(
    (item) => item.status !== "cancelled",
  );
  if (activeItems.length === 0) {
    return {
      success: false,
      error: "Đơn hàng không có món nào để xuất hóa đơn.",
      errorCode: "no_invoice_items",
    };
  }

  const invoiceItems = applyInvoiceLineDiscount(
    buildInvoiceLineItemsFromOrderItems(activeItems),
    parsed.data.draftSnapshot.orderDiscountAmount,
  );
  ensureInvoiceProviderRegistered();
  const invoiceProvider = getInvoiceProvider();
  if (invoiceProvider?.name !== "viettel") {
    return {
      success: false,
      error: "Nhà cung cấp HĐĐT chưa được cấu hình.",
      errorCode: "invoice_provider_not_configured",
    };
  }
  const providerRef = buildSinvoiceTransactionUuid(parsed.data.orderId);

  const rpc = supabase as unknown as {
    rpc: <T>(
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: { code?: string | null } | null }>;
  };
  const { data: prepared, error: prepareError } = await rpc.rpc<{
    id: number;
    status: string;
  }>("prepare_tax_invoice_issue_job_as_system", {
    p_job_id: jobId,
    p_tax_invoice_id: taxInvoiceId,
    p_provider_ref: providerRef,
  });
  if (
    prepareError ||
    prepared?.id !== taxInvoiceId ||
    prepared.status !== "signing"
  ) {
    console.error(
      `[${logPrefix}] Prepare invoice submission error:`,
      prepareError,
    );
    return {
      success: false,
      error: "Không thể khóa draft HĐĐT để phát hành.",
      errorCode: "invoice_prepare_failed",
    };
  }

  const buyerNotGetInvoice = parsed.data.buyerNotGetInvoice;
  return submitReservedTaxInvoice({
    supabase,
    invoiceProvider,
    logPrefix,
    reservedInvoiceId: taxInvoiceId,
    request: {
      orderId: parsed.data.orderId,
      orderNumber: parsed.data.draftSnapshot.orderNumber,
      invoiceIssuedAt: parsed.data.draftSnapshot.invoiceTime,
      sellerName: "",
      sellerTaxCode: process.env["COMPANY_TAX_CODE"] ?? "",
      sellerAddress: "",
      buyerName: buyerNotGetInvoice
        ? BUYER_NOT_GET_INVOICE_NAME
        : parsed.data.buyerName,
      buyerTaxCode: buyerNotGetInvoice ? undefined : parsed.data.buyerTaxCode,
      buyerAddress: buyerNotGetInvoice ? undefined : parsed.data.buyerAddress,
      buyerEmail: buyerNotGetInvoice ? undefined : parsed.data.buyerEmail,
      buyerNotGetInvoice,
      items: invoiceItems,
      subtotal: parsed.data.draftSnapshot.subtotal,
      vatRate: parsed.data.draftSnapshot.vatRate,
      vatAmount: parsed.data.draftSnapshot.vatAmount,
      totalAmount: parsed.data.draftSnapshot.totalAmount,
    },
  });
}

async function writeIssuedReconciliation({
  supabase,
  logPrefix,
  taxInvoiceId,
  providerRef,
  invoiceNumber,
  cqtCode,
  providerPayload,
  issuedAt,
  triggerSource,
}: {
  supabase: SupabaseClient<Database>;
  logPrefix: string;
  taxInvoiceId: number;
  providerRef: string;
  invoiceNumber: string;
  cqtCode: string | null;
  providerPayload: Record<string, unknown> | null;
  issuedAt: string;
  triggerSource: "manual" | "cron";
}): Promise<ActionResult<TaxInvoiceIssueRow>> {
  const rpc = supabase as unknown as {
    rpc: <T>(
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: { code?: string | null } | null }>;
  };
  const { data: invoice, error: reconcileErr } =
    await rpc.rpc<TaxInvoiceIssueRow>("reconcile_tax_invoice_provider_issued", {
      p_tax_invoice_id: taxInvoiceId,
      p_provider_ref: providerRef,
      p_invoice_number: invoiceNumber,
      p_cqt_code: cqtCode,
      p_provider_data: providerPayload,
      p_issued_at: issuedAt,
      p_trigger_source: triggerSource,
    });

  if (reconcileErr || !invoice) {
    console.error(`[${logPrefix}] Reconcile issued invoice error:`, {
      taxInvoiceId,
      code: reconcileErr?.code,
    });
    return {
      success: false,
      error:
        "Hóa đơn đã được gửi nhưng chưa lưu đủ trạng thái. Hệ thống đã giữ lệnh để đối soát.",
      errorCode: "invoice_write_failed",
    };
  }

  return {
    success: true,
    data: invoice as unknown as TaxInvoiceIssueRow,
  };
}

export type TaxInvoiceProviderLookupData = {
  outcome: InvoiceLookupOutcome;
  invoiceNumber: string | null;
};

export async function lookupAndReconcileTaxInvoiceFromProvider({
  supabase,
  taxInvoiceId,
  tenantId,
  triggerSource,
  logPrefix = "hddt-lookup",
}: {
  supabase: SupabaseClient<Database>;
  taxInvoiceId: number;
  tenantId: number;
  triggerSource: "manual" | "cron";
  logPrefix?: string;
}): Promise<ActionResult<TaxInvoiceProviderLookupData>> {
  const { data: invoice, error } = await supabase
    .from("tax_invoices")
    .select("id, status, provider_ref, invoice_number")
    .eq("id", taxInvoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error(`[${logPrefix}] invoice read failed`, {
      taxInvoiceId,
      tenantId,
      code: error.code,
    });
    return {
      success: false,
      error: "Không thể tra cứu HĐĐT.",
      errorCode: "invoice_lookup_read_failed",
    };
  }
  if (!invoice) {
    return {
      success: false,
      error: "Không tìm thấy hóa đơn.",
      errorCode: "invoice_not_found",
    };
  }
  if (invoice.status === "issued") {
    return {
      success: true,
      data: {
        outcome: "issued",
        invoiceNumber: invoice.invoice_number,
      },
    };
  }
  if (invoice.status !== "signing" && invoice.status !== "submitted") {
    return {
      success: false,
      error: "Hóa đơn không ở trạng thái cần đối soát.",
      errorCode: "invoice_lookup_status_invalid",
    };
  }
  const providerRef = invoice.provider_ref?.trim() ?? "";
  if (providerRef.length < 10) {
    return {
      success: false,
      error: "Thiếu mã giao dịch Viettel để tra cứu.",
      errorCode: "invoice_provider_ref_missing",
    };
  }

  ensureInvoiceProviderRegistered();
  const invoiceProvider = getInvoiceProvider();
  if (invoiceProvider?.name !== "viettel") {
    return {
      success: false,
      error: "Nhà cung cấp HĐĐT chưa được cấu hình.",
      errorCode: "invoice_provider_not_configured",
    };
  }

  const lookup = await invoiceProvider.lookupInvoice(providerRef);
  if (lookup.outcome !== "issued" || !lookup.invoiceNumber) {
    return {
      success: true,
      data: {
        outcome: lookup.outcome === "not_found" ? "not_found" : "unknown",
        invoiceNumber: null,
      },
    };
  }

  const written = await writeIssuedReconciliation({
    supabase,
    logPrefix,
    taxInvoiceId,
    providerRef,
    invoiceNumber: lookup.invoiceNumber,
    cqtCode: lookup.codeOfTax ?? null,
    providerPayload: lookup.providerData
      ? (JSON.parse(JSON.stringify(lookup.providerData)) as Record<
          string,
          unknown
        >)
      : null,
    issuedAt: lookup.issuedAt ?? new Date().toISOString(),
    triggerSource,
  });
  if (!written.success) {
    return {
      success: false,
      error: written.error,
      errorCode: written.errorCode,
    };
  }
  return {
    success: true,
    data: {
      outcome: "issued",
      invoiceNumber: lookup.invoiceNumber,
    },
  };
}
