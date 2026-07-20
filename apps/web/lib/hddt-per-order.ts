import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  buildSinvoiceTransactionUuid,
  getInvoiceProvider,
  type InvoiceResult,
} from "@comtammatu/shared/providers";
import {
  applyInvoiceLineDiscount,
  buildInvoiceLineItemsFromOrderItems,
  type OrderItemForInvoiceLines,
} from "@comtammatu/shared/hddt";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
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

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export interface TaxInvoiceIssueRow {
  id: number;
  invoice_number: string | null;
  status: string | null;
}

interface IssueTaxInvoiceDeps {
  supabase: SupabaseClient<Database>;
  tenantId: number;
  input: CreateInvoiceInput;
  actorId?: string | null;
  canAccessBranch?: (branchId: number) => Promise<boolean>;
  logPrefix?: string;
}

type OrderItemRow = OrderItemForInvoiceLines & {
  status: string | null;
  subtotal: number | string | null;
};

type HistoricalAggregateInvoiceLink = {
  tax_invoices: {
    summary_date: string | null;
    status: string;
  } | null;
};

export async function issueTaxInvoiceForPaidOrder({
  supabase,
  tenantId,
  input,
  actorId,
  canAccessBranch,
  logPrefix = "hddt-per-order",
}: IssueTaxInvoiceDeps): Promise<ActionResult<TaxInvoiceIssueRow>> {
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      errorCode: "invalid_input",
    };
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, branch_id, created_by, subtotal, tax_amount, total_amount, discount_amount, order_discount_amount, payment_status, order_items(id, item_name, variant_name, quantity, unit_price, subtotal, discount_amount, modifiers, sides, status)",
    )
    .eq("id", parsed.data.orderId)
    .eq("tenant_id", tenantId)
    .single();

  if (orderErr || !order) {
    if (orderErr) {
      console.error(`[${logPrefix}] Fetch order error:`, orderErr);
    }
    return {
      success: false,
      error: "Đơn hàng không tồn tại.",
      errorCode: "order_not_found",
    };
  }

  if (order.payment_status !== "paid") {
    return {
      success: false,
      error: "Đơn hàng chưa thanh toán. Không thể xuất hóa đơn.",
      errorCode: "order_unpaid",
    };
  }

  if (canAccessBranch && !(await canAccessBranch(order.branch_id))) {
    return {
      success: false,
      error: "Không có quyền xuất hóa đơn cho chi nhánh này.",
      errorCode: "forbidden_branch",
    };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("tax_invoices")
    .select(
      "id, status, invoice_number, buyer_name, buyer_tax_code, buyer_address, buyer_email",
    )
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", tenantId)
    .not("status", "in", '("cancelled","replaced","not_required")')
    .maybeSingle();

  if (existingErr) {
    console.error(`[${logPrefix}] Fetch active invoice error:`, existingErr);
    return {
      success: false,
      error: "Không thể kiểm tra hóa đơn hiện có.",
      errorCode: "invoice_guard_failed",
    };
  }

  const retryDraftInvoiceId =
    existing?.status === "draft" && !existing.invoice_number
      ? existing.id
      : null;

  if (existing && !retryDraftInvoiceId) {
    return {
      success: false,
      error: "Đơn hàng đã có hóa đơn.",
      errorCode: "invoice_exists",
    };
  }

  const { data: aggregateLinks, error: aggregateLinksErr } = await supabase
    .from("tax_invoice_orders")
    .select("tax_invoices(summary_date, status)")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", tenantId);

  if (aggregateLinksErr) {
    console.error(
      `[${logPrefix}] Fetch historical aggregate invoice links error:`,
      aggregateLinksErr,
    );
    return {
      success: false,
      error: "Không thể kiểm tra lịch sử HĐĐT của đơn.",
      errorCode: "invoice_guard_failed",
    };
  }

  const historicalAggregateInvoice = (
    (aggregateLinks ?? []) as HistoricalAggregateInvoiceLink[]
  )
    .map((link) => link.tax_invoices)
    .find(
      (invoice) =>
        invoice != null && !["cancelled", "replaced"].includes(invoice.status),
    );

  if (historicalAggregateInvoice) {
    const d = historicalAggregateInvoice.summary_date;
    const dateLabel = d ? formatVNBusinessDate(d) : "trước đó";
    return {
      success: false,
      error: `Đơn này đã có HĐĐT gộp từ ngày ${dateLabel}. Vui lòng giữ biên nhận hoặc yêu cầu hóa đơn điều chỉnh qua kế toán.`,
      errorCode: "historical_aggregate_invoice_exists",
    };
  }

  const activeItems = ((order.order_items ?? []) as OrderItemRow[]).filter(
    (item) => item.status !== "cancelled",
  );
  const orderTotal = Number(order.total_amount);
  const subtotal: number = orderTotal;
  const vatRate: number = 0;
  const vatAmount: number = 0;

  const buyerTaxCode = (
    retryDraftInvoiceId
      ? existing?.buyer_tax_code
      : parsed.data.buyerTaxCode
  )?.trim() || undefined;
  const buyerAddress = (
    retryDraftInvoiceId ? existing?.buyer_address : parsed.data.buyerAddress
  )?.trim() || undefined;
  const buyerEmail = (
    retryDraftInvoiceId ? existing?.buyer_email : parsed.data.buyerEmail
  )?.trim() || undefined;
  const buyerNameInput = (
    retryDraftInvoiceId ? existing?.buyer_name : parsed.data.buyerName
  )?.trim();
  const buyerNotGetInvoiceInput = retryDraftInvoiceId
    ? undefined
    : parsed.data.buyerNotGetInvoice;
  const buyerNotGetInvoice =
    buyerNotGetInvoiceInput === true ||
    (buyerNotGetInvoiceInput !== false &&
      !buyerTaxCode &&
      (!buyerNameInput || buyerNameInput === BUYER_NOT_GET_INVOICE_NAME) &&
      !buyerAddress &&
      !buyerEmail);
  const buyerName = buyerNameInput || BUYER_NOT_GET_INVOICE_NAME;

  ensureInvoiceProviderRegistered();
  const invoiceProvider = getInvoiceProvider();

  let invoiceNumber: string | null;
  let providerRef: string | null;
  let invoiceStatus: "draft" | "signing" | "submitted" | "issued";
  let providerData: Record<string, unknown> | undefined;
  let cqtCode: string | null = null;

  if (activeItems.length === 0) {
    return {
      success: false,
      error: "Đơn hàng không có món nào để xuất hóa đơn.",
      errorCode: "no_invoice_items",
    };
  }

  const invoiceItems = applyInvoiceLineDiscount(
    buildInvoiceLineItemsFromOrderItems(activeItems),
    Number(order.order_discount_amount ?? order.discount_amount ?? 0),
  );

  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const roundedVatAmount = Math.round(vatAmount * 100) / 100;
  const claimTimestamp = new Date().toISOString();
  const reservationProviderRef =
    invoiceProvider?.name === "viettel"
      ? buildSinvoiceTransactionUuid(parsed.data.orderId)
      : null;
  const reservationWrite = {
    tenant_id: tenantId,
    branch_id: order.branch_id,
    order_id: parsed.data.orderId,
    buyer_name: buyerName,
    buyer_tax_code: buyerTaxCode ?? null,
    buyer_address: buyerAddress ?? null,
    buyer_email: buyerEmail ?? null,
    subtotal: roundedSubtotal,
    vat_rate: vatRate,
    vat_amount: roundedVatAmount,
    total_amount: Number(order.total_amount),
    provider: invoiceProvider?.name ?? "viettel",
    ...(reservationProviderRef ? { provider_ref: reservationProviderRef } : {}),
  };

  const reservationMutation = retryDraftInvoiceId
    ? supabase
        .from("tax_invoices")
        .update({
          ...reservationWrite,
          status: "signing",
          signing_started_at: claimTimestamp,
        })
        .eq("id", retryDraftInvoiceId)
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
    : supabase.from("tax_invoices").insert({
        ...reservationWrite,
        invoice_number: null,
        status: "signing",
        provider_ref: reservationProviderRef,
        provider_data: null,
        cqt_code: null,
        signing_started_at: claimTimestamp,
        issued_at: null,
        created_by: actorId ?? order.created_by ?? null,
      });

  const { data: reservedInvoice, error: reservationErr } =
    await reservationMutation.select("id").single();

  if (reservationErr || !reservedInvoice) {
    if (reservationErr) {
      console.error(`[${logPrefix}] Reserve invoice error:`, reservationErr);
    }
    if (reservationErr?.code === "23505") {
      const historicalAggregateConflict = reservationErr.message.includes(
        "active daily summary",
      );
      return {
        success: false,
        error: historicalAggregateConflict
          ? "Đơn này đã có HĐĐT gộp trước đây."
          : "Đơn hàng đã có hóa đơn.",
        errorCode: historicalAggregateConflict
          ? "historical_aggregate_invoice_exists"
          : "invoice_exists",
      };
    }
    return {
      success: false,
      error: "Không thể giữ chỗ phát hành hóa đơn.",
      errorCode: "invoice_write_failed",
    };
  }

  if (invoiceProvider) {
    let result: InvoiceResult;
    try {
      result = await invoiceProvider.createInvoice({
        orderId: parsed.data.orderId,
        orderNumber: `ORD-${parsed.data.orderId}`,
        sellerName: "",
        sellerTaxCode: process.env["COMPANY_TAX_CODE"] ?? "",
        sellerAddress: "",
        buyerName,
        buyerTaxCode,
        buyerAddress,
        buyerEmail,
        buyerNotGetInvoice,
        items: invoiceItems,
        subtotal: roundedSubtotal,
        vatRate,
        vatAmount: roundedVatAmount,
        totalAmount: Number(order.total_amount),
      });
    } catch (error) {
      console.error(`[${logPrefix}] Invoice provider error:`, error);
      return {
        success: false,
        error:
          "Chưa xác định nhà cung cấp HĐĐT đã nhận hóa đơn hay chưa. Lệnh được giữ để đối soát, không tự gửi lại.",
        errorCode: "invoice_provider_failed",
      };
    }
    invoiceNumber = result.invoiceNumber;
    providerRef = result.providerRef;
    providerData = result.providerData;
    const providerErrorCode = providerData?.["errorCode"];
    const providerOutcomeUnknown =
      result.status === "failed" &&
      (providerErrorCode === "exception" ||
        providerErrorCode === "TRANSACTION_IS_BEING_PROCESSED");
    invoiceStatus =
      result.status === "failed"
        ? providerOutcomeUnknown
          ? "signing"
          : "draft"
        : result.status;
    cqtCode =
      typeof result.codeOfTax === "string" && result.codeOfTax.trim().length > 0
        ? result.codeOfTax
        : null;
  } else {
    invoiceNumber = `DRAFT-${order.branch_id}-${crypto.randomUUID().slice(0, 8)}`;
    providerRef = invoiceNumber;
    invoiceStatus = "draft";
    providerData = undefined;
  }

  const stateTimestamp = new Date().toISOString();
  const hasProviderSubmission =
    invoiceStatus === "signing" ||
    invoiceStatus === "submitted" ||
    invoiceStatus === "issued";

  const invoiceWrite = {
    invoice_number: invoiceNumber,
    status: invoiceStatus,
    buyer_name: buyerName,
    buyer_tax_code: buyerTaxCode ?? null,
    buyer_address: buyerAddress ?? null,
    buyer_email: buyerEmail ?? null,
    subtotal: roundedSubtotal,
    vat_rate: vatRate,
    vat_amount: roundedVatAmount,
    total_amount: Number(order.total_amount),
    provider: invoiceProvider?.name ?? "viettel",
    provider_ref: providerRef,
    provider_data: providerData
      ? JSON.parse(JSON.stringify(providerData))
      : null,
    cqt_code: cqtCode,
    signing_started_at: hasProviderSubmission ? stateTimestamp : null,
    issued_at: invoiceStatus === "issued" ? stateTimestamp : null,
  };

  const { data: invoice, error: insertErr } = await supabase
    .from("tax_invoices")
    .update(invoiceWrite)
    .eq("id", reservedInvoice.id)
    .eq("tenant_id", tenantId)
    .eq("status", "signing")
    .select("id, invoice_number, status")
    .single();

  if (insertErr) {
    console.error(`[${logPrefix}] Insert/update invoice error:`, insertErr);
    return {
      success: false,
      error:
        "Hóa đơn đã được gửi nhưng chưa lưu đủ trạng thái. Hệ thống đã giữ lệnh để đối soát.",
      errorCode: "invoice_write_failed",
    };
  }

  return { success: true, data: invoice };
}
