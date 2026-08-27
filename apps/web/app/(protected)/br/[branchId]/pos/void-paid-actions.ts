"use server";

import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createInvoiceProvider } from "@lib/invoice-provider-init";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { mapRpcError } from "@/_lib/rpc-error-map";
import {
  REFUND_PAID_ORDER_MAPPINGS,
  REFUND_PAID_ORDER_FALLBACK,
} from "./_lib/void-paid-messages";
import {
  REFUND_PAYOUT_METHODS,
  type RefundPayoutMethod,
} from "@lib/refund-payout";

const voidPaidOrderSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  payoutMethod: z.enum(REFUND_PAYOUT_METHODS),
  reason: z
    .string()
    .trim()
    .min(20, "Lý do huỷ phải có ít nhất 20 ký tự")
    .max(500, "Lý do huỷ quá dài"),
});

type RefundRpcResult = {
  status: string;
  refund_id: number;
  amount: number;
  method: string;
  payout_method: RefundPayoutMethod;
  invoice_id: number | null;
  invoice_action: "none" | "cancel_predispatch" | "cancel_issued";
  invoice_provider_ref: string | null;
  invoice_provider: string | null;
};

export interface VoidPaidOrderData extends RefundRpcResult {
  providerWarning?: string;
}

const VOID_PAID_ROLES = ["owner"] as const;

export async function voidPaidOrder(
  orderId: number,
  reason: string,
  payoutMethod: RefundPayoutMethod,
): Promise<ActionResult<VoidPaidOrderData>> {
  const parsed = voidPaidOrderSchema.safeParse({
    orderId,
    reason,
    payoutMethod,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    VOID_PAID_ROLES,
    PERMISSION_KEYS.POS_VOID_PAID_ORDER,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Bạn không có quyền huỷ đơn đã thanh toán.",
    };
  }

  const { supabase } = ctx;

  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "refund_paid_order_with_payout",
      args: {
        p_order_id: number;
        p_reason: string;
        p_payout_method: RefundPayoutMethod;
      },
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  )(
    "refund_paid_order_with_payout",
    {
      p_order_id: parsed.data.orderId,
      p_reason: parsed.data.reason,
      p_payout_method: parsed.data.payoutMethod,
    },
  );

  if (error) {
    return mapRpcError<VoidPaidOrderData>(
      error,
      REFUND_PAID_ORDER_MAPPINGS,
      REFUND_PAID_ORDER_FALLBACK,
    );
  }

  const result = data as unknown as RefundRpcResult;

  let providerWarning: string | undefined;

  // For an ISSUED HĐĐT the RPC only flipped LOCAL state — it must be cancelled
  // at the provider/CQT post-commit. Any cancel_issued path that cannot
  // auto-cancel MUST surface a warning, never silently skip, or a live CQT
  // invoice goes unnoticed.
  if (
    result.invoice_action === "cancel_issued" &&
    result.invoice_provider_ref
  ) {
    if (result.invoice_provider === "viettel") {
      const { data: invoiceProfile } = await supabase
        .from("tax_invoices")
        .select("template_code, invoice_series, seller_tax_code")
        .eq("id", result.invoice_id ?? 0)
        .maybeSingle();
      const invoiceProvider =
        invoiceProfile?.template_code &&
        invoiceProfile.invoice_series &&
        invoiceProfile.seller_tax_code
          ? createInvoiceProvider({
              provider: "viettel",
              templateCode: invoiceProfile.template_code,
              invoiceSeries: invoiceProfile.invoice_series,
              sellerTaxCode: invoiceProfile.seller_tax_code,
            })
          : null;
      if (invoiceProvider) {
        try {
          await invoiceProvider.cancelInvoice(
            result.invoice_provider_ref,
            parsed.data.reason,
          );
        } catch {
          providerWarning =
            "Đơn đã huỷ trong hệ thống — sẽ thử huỷ HĐĐT phía nhà cung cấp sau. Báo Kế toán nếu HĐĐT vẫn còn hiệu lực.";
        }
      } else {
        providerWarning =
          "Đơn đã huỷ trong hệ thống — chưa huỷ được HĐĐT (nhà cung cấp chưa sẵn sàng). Báo Kế toán.";
      }
    } else {
      // Non-Viettel issued invoice: runtime cannot auto-cancel.
      providerWarning =
        "Đơn đã huỷ trong hệ thống — HĐĐT thuộc nhà cung cấp khác, cần Kế toán huỷ thủ công.";
    }
  }

  return {
    success: true,
    data: {
      ...result,
      ...(providerWarning !== undefined ? { providerWarning } : {}),
    },
  };
}
