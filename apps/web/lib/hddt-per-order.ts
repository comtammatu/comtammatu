import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  getInvoiceProvider,
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
  });

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

type SummaryInvoiceLink = {
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

  const { data: existing } = await supabase
    .from("tax_invoices")
    .select("id, status, invoice_number")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", tenantId)
    .not("status", "in", '("cancelled","replaced","not_required")')
    .maybeSingle();

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

  const { data: summaryLinks } = await supabase
    .from("tax_invoice_orders")
    .select("tax_invoices(summary_date, status)")
    .eq("order_id", parsed.data.orderId)
    .eq("tenant_id", tenantId);

  const summaryInvoice = ((summaryLinks ?? []) as SummaryInvoiceLink[])
    .map((link) => link.tax_invoices)
    .find(
      (invoice) =>
        invoice != null && !["cancelled", "replaced"].includes(invoice.status),
    );

  if (summaryInvoice) {
    const d = summaryInvoice.summary_date;
    const dateLabel = d ? formatVNBusinessDate(d) : "trước đó";
    return {
      success: false,
      error: `Đơn này đã nằm trong hóa đơn tổng hợp ngày ${dateLabel}. Vui lòng giữ biên nhận hoặc yêu cầu hóa đơn điều chỉnh qua kế toán.`,
      errorCode: "summary_invoice_exists",
    };
  }

  const activeItems = ((order.order_items ?? []) as OrderItemRow[]).filter(
    (item) => item.status !== "cancelled",
  );
  const orderTotal = Number(order.total_amount);
  const subtotal: number = orderTotal;
  const vatRate: number = 0;
  const vatAmount: number = 0;

  const buyerTaxCode = parsed.data.buyerTaxCode?.trim() || undefined;
  const buyerAddress = parsed.data.buyerAddress?.trim() || undefined;
  const buyerEmail = parsed.data.buyerEmail?.trim() || undefined;
  const buyerNotGetInvoice =
    parsed.data.buyerNotGetInvoice === true ||
    (!buyerTaxCode && !parsed.data.buyerName?.trim() && !buyerEmail);
  const buyerName = parsed.data.buyerName?.trim() || BUYER_NOT_GET_INVOICE_NAME;

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

  if (invoiceProvider) {
    const result = await invoiceProvider.createInvoice({
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
      subtotal: Math.round(subtotal * 100) / 100,
      vatRate,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalAmount: Number(order.total_amount),
    });
    invoiceNumber = result.invoiceNumber;
    providerRef = result.providerRef;
    invoiceStatus = result.status === "failed" ? "draft" : result.status;
    providerData = result.providerData;
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
    tenant_id: tenantId,
    branch_id: order.branch_id,
    order_id: parsed.data.orderId,
    invoice_number: invoiceNumber,
    status: invoiceStatus,
    buyer_name: buyerName,
    buyer_tax_code: buyerTaxCode ?? null,
    buyer_address: buyerAddress ?? null,
    buyer_email: buyerEmail ?? null,
    subtotal: Math.round(subtotal * 100) / 100,
    vat_rate: vatRate,
    vat_amount: Math.round(vatAmount * 100) / 100,
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

  const invoiceMutation = retryDraftInvoiceId
    ? supabase
        .from("tax_invoices")
        .update(invoiceWrite)
        .eq("id", retryDraftInvoiceId)
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
    : supabase.from("tax_invoices").insert({
        ...invoiceWrite,
        created_by: actorId ?? order.created_by ?? null,
      });

  const { data: invoice, error: insertErr } = await invoiceMutation
    .select("id, invoice_number, status")
    .single();

  if (insertErr) {
    console.error(`[${logPrefix}] Insert/update invoice error:`, insertErr);
    if (insertErr.code === "23505") {
      return {
        success: false,
        error: "Đơn hàng đã có hóa đơn.",
        errorCode: "invoice_exists",
      };
    }
    return {
      success: false,
      error: "Không thể tạo hóa đơn.",
      errorCode: "invoice_write_failed",
    };
  }

  return { success: true, data: invoice };
}
