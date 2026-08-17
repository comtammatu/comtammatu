import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  buildSinvoiceItemInfo,
  buildSinvoiceTransactionUuid,
  type InvoiceLineItem,
  type InvoiceProvider,
  type InvoiceRequest,
  type InvoiceResult,
} from "@comtammatu/shared/providers";
import {
  buildHddtProviderLines,
} from "@comtammatu/shared/hddt";
import { getVNDateString } from "@comtammatu/shared/time";
import { createInvoiceProvider } from "@lib/invoice-provider-init";
import { z } from "zod";

const MST_REGEX = /^\d{10}(-\d{3})?$/;
const buyerKindSchema = z.enum(["consumer", "individual", "business"]);

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
    buyerKind: z.enum(["individual", "business"]).optional(),
    buyerNotGetInvoice: z.boolean().optional(),
  })
  .refine((v) => !v.buyerTaxCode || (v.buyerName && v.buyerName.length > 0), {
    error: "Có MST thì phải nhập tên người mua",
    path: ["buyerName"],
  })
  .refine(
    (v) =>
      v.buyerNotGetInvoice === true ||
      v.buyerKind !== "business" ||
      Boolean(v.buyerTaxCode?.trim()),
    {
      error: "Doanh nghiệp cần mã số thuế",
      path: ["buyerTaxCode"],
    },
  )
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
  vat_rate: z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
  modifiers: z.unknown().optional(),
  sides: z.unknown().optional(),
  status: z.string().nullable(),
});

const invoiceLineSchema = z.object({
  name: z.string().min(1),
  unit: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().finite().nonnegative(),
  amount: z.number().finite().nonnegative(),
  vatRate: z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(10)]),
  discountAmount: z.number().finite().nonnegative().optional(),
});

const preparedInvoicePayloadSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
    buyerName: z.string().trim().min(1).max(200),
    buyerTaxCode: z.string().trim().regex(MST_REGEX).optional(),
    buyerAddress: z.string().trim().max(500).optional(),
    buyerEmail: z.email().optional(),
    buyerKind: buyerKindSchema.optional(),
    buyerNotGetInvoice: z.boolean(),
    replacement: z
      .object({
        originalInvoiceNumber: z.string().trim().min(1),
        originalIssuedAt: z.string().datetime({ offset: true }),
        originalInvoiceType: z.literal("1"),
        originalTemplateCode: z.literal("1"),
        reason: z.string().trim().min(20).max(255),
        agreementRef: z.string().trim().min(1).max(225),
        agreementDate: z.string().datetime({ offset: true }),
      })
      .optional(),
    submissionSnapshot: z
      .object({
        version: z.literal(1),
        invoiceProfile: z.object({
          id: z.coerce.number().int().positive(),
          version: z.coerce.number().int().positive(),
          provider: z.literal("viettel"),
          templateCode: z.string().regex(/^1\//),
          invoiceSeries: z.string().trim().min(1),
          sellerName: z.string().trim().min(1),
          sellerTaxCode: z.string().trim().regex(MST_REGEX),
          sellerAddress: z.string().trim().min(1),
        }),
        items: z.array(invoiceLineSchema).min(1),
        subtotal: z.number().finite().nonnegative(),
        vatAmount: z.number().finite().nonnegative(),
        totalAmount: z.number().finite().nonnegative(),
      })
      .optional(),
    draftSnapshot: z.object({
      version: z.literal(1),
      orderId: z.coerce.number().int().positive(),
      branchId: z.coerce.number().int().positive(),
      orderNumber: z.string().trim().min(1).max(100),
      invoiceTime: z.string().datetime({ offset: true }),
      orderDiscountAmount: z.coerce.number().finite().nonnegative(),
      serviceCharge: z.coerce.number().finite().nonnegative().optional(),
      invoiceProfile: z.object({
        id: z.coerce.number().int().positive(),
        version: z.coerce.number().int().positive(),
        provider: z.literal("viettel"),
        templateCode: z.string().regex(/^1\//),
        invoiceSeries: z.string().trim().min(1),
        sellerName: z.string().trim().min(1),
        sellerTaxCode: z.string().trim().regex(MST_REGEX),
        sellerAddress: z.string().trim().min(1),
      }),
      subtotal: z.coerce.number().finite().nonnegative(),
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
    (value) => {
      if (value.replacement !== undefined || value.buyerNotGetInvoice) {
        return true;
      }
      const kind =
        value.buyerKind ??
        (value.buyerTaxCode ? ("business" as const) : ("individual" as const));
      if (kind === "business") {
        return Boolean(
          value.buyerTaxCode &&
          value.buyerName &&
          value.buyerAddress &&
          value.buyerEmail,
        );
      }
      if (kind === "individual") {
        return Boolean(value.buyerName && value.buyerEmail);
      }
      return false;
    },
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
    (providerData?.["outcomeUnknown"] === true ||
      providerErrorCode === "exception" ||
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

  const providerPayload = providerData
    ? JSON.parse(JSON.stringify(providerData))
    : null;

  if (invoiceStatus === "issued") {
    if (!invoiceNumber || !providerRef) {
      return {
        success: false,
        error:
          "Nhà cung cấp đã phản hồi không đầy đủ. Hệ thống giữ lệnh để Finance đối soát.",
        errorCode: "invoice_provider_incomplete",
      };
    }

    const rpc = supabase as unknown as {
      rpc: <T>(
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: T | null; error: { code?: string | null } | null }>;
    };
    const { data: invoice, error: reconcileErr } =
      await rpc.rpc<TaxInvoiceIssueRow>(
        "reconcile_tax_invoice_provider_issued",
        {
          p_tax_invoice_id: reservedInvoiceId,
          p_provider_ref: providerRef,
          p_invoice_number: invoiceNumber,
          p_cqt_code: cqtCode,
          p_provider_data: providerPayload,
          p_issued_at: new Date().toISOString(),
          p_trigger_source: "cron",
        },
      );

    if (reconcileErr || !invoice) {
      console.error(
        `[${logPrefix}] Reconcile issued invoice error:`,
        reconcileErr,
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
      data: invoice as unknown as TaxInvoiceIssueRow,
    };
  }

  if (invoiceStatus === "signing") {
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
      p_payload: providerPayload,
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
      error: "Dữ liệu bản nháp HĐĐT không hợp lệ.",
      errorCode: "invoice_snapshot_invalid",
    };
  }

  if (
    getVNDateString(parsed.data.draftSnapshot.invoiceTime) !==
    getVNDateString()
  ) {
    return {
      success: false,
      error:
        "Ngày lập HĐĐT phải trùng ngày bán theo giờ Việt Nam. Không gửi sang Viettel khi đã sang ngày mới.",
      errorCode: "invoice_issue_date_not_today",
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

  let invoiceItems: InvoiceLineItem[];
  if (parsed.data.submissionSnapshot) {
    invoiceItems = parsed.data.submissionSnapshot.items.map((line) => ({
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      vatRate: line.vatRate,
    }));
  } else {
    try {
      invoiceItems = buildHddtProviderLines({
        items: activeItems,
        orderDiscountAmount: parsed.data.draftSnapshot.orderDiscountAmount,
        serviceCharge: parsed.data.draftSnapshot.serviceCharge ?? 0,
        totalAmount: parsed.data.draftSnapshot.totalAmount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("hddt_projection_total_mismatch:")) {
        return {
          success: false,
          error: "Tổng dòng, thuế GTGT và số tiền thanh toán không khớp.",
          errorCode: "invoice_total_mismatch",
        };
      }
      return {
        success: false,
        error: "Dòng hóa đơn thiếu thuế suất GTGT hợp lệ.",
        errorCode: "invoice_vat_invalid",
      };
    }
  }
  if (invoiceItems.length === 0) {
    return {
      success: false,
      error: "Đơn hàng không có món nào để xuất hóa đơn.",
      errorCode: "no_invoice_items",
    };
  }
  const profile = parsed.data.draftSnapshot.invoiceProfile;
  const invoiceProvider = createInvoiceProvider(profile);
  if (!invoiceProvider) {
    return {
      success: false,
      error: "Nhà cung cấp HĐĐT chưa được cấu hình.",
      errorCode: "invoice_provider_not_configured",
    };
  }
  const providerRef = buildSinvoiceTransactionUuid(taxInvoiceId);
  let lineMath: ReturnType<typeof buildSinvoiceItemInfo>;
  try {
    lineMath = buildSinvoiceItemInfo(invoiceItems);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("sinvoice_gross_residual_unresolved:")) {
      return {
        success: false,
        error: "Tổng dòng, thuế GTGT và số tiền thanh toán không khớp.",
        errorCode: "invoice_total_mismatch",
      };
    }
    return {
      success: false,
      error: "Không thể tính và đối soát các dòng HĐĐT.",
      errorCode: "invoice_line_math_invalid",
    };
  }
  const subtotal = lineMath.sumLineNet - lineMath.sumLineDiscount;
  const drift = Math.abs(
    lineMath.totalGross - parsed.data.draftSnapshot.totalAmount,
  );
  if (drift !== 0) {
    return {
      success: false,
      error: "Tổng dòng, thuế GTGT và số tiền thanh toán không khớp.",
      errorCode: "invoice_total_mismatch",
    };
  }
  const submissionSnapshot = parsed.data.submissionSnapshot ?? {
    version: 1,
    invoiceProfile: profile,
    items: invoiceItems,
    subtotal,
    vatAmount: lineMath.sumLineTax,
    totalAmount: lineMath.totalGross,
  };

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
    p_submission_snapshot: submissionSnapshot,
    p_subtotal: subtotal,
    p_vat_amount: lineMath.sumLineTax,
    p_total_amount: lineMath.totalGross,
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
      error: "Không thể khóa bản nháp HĐĐT để phát hành.",
      errorCode: "invoice_prepare_failed",
    };
  }

  const buyerNotGetInvoice = parsed.data.buyerNotGetInvoice;
  const buyerKind = buyerNotGetInvoice
    ? ("consumer" as const)
    : (parsed.data.buyerKind ??
      (parsed.data.buyerTaxCode ? ("business" as const) : ("individual" as const)));
  return submitReservedTaxInvoice({
    supabase,
    invoiceProvider,
    logPrefix,
    reservedInvoiceId: taxInvoiceId,
    request: {
      orderId: taxInvoiceId,
      orderNumber: parsed.data.draftSnapshot.orderNumber,
      invoiceIssuedAt: parsed.data.draftSnapshot.invoiceTime,
      sellerName: profile.sellerName,
      sellerTaxCode: profile.sellerTaxCode,
      sellerAddress: profile.sellerAddress,
      buyerName: buyerNotGetInvoice
        ? BUYER_NOT_GET_INVOICE_NAME
        : parsed.data.buyerName,
      buyerTaxCode: buyerNotGetInvoice ? undefined : parsed.data.buyerTaxCode,
      buyerAddress: buyerNotGetInvoice ? undefined : parsed.data.buyerAddress,
      buyerEmail: buyerNotGetInvoice ? undefined : parsed.data.buyerEmail,
      buyerKind,
      buyerNotGetInvoice,
      items: invoiceItems,
      subtotal,
      vatAmount: lineMath.sumLineTax,
      totalAmount: lineMath.totalGross,
      replacement: parsed.data.replacement,
    },
  });
}
