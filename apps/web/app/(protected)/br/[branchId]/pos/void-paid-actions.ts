"use server";

import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import type { ActionResult } from "@comtammatu/shared/types";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { mapRpcError } from "@/_lib/rpc-error-map";
import {
  REFUND_PAID_ORDER_MAPPINGS,
  REFUND_PAID_ORDER_FALLBACK,
} from "./_lib/void-paid-messages";

const voidPaidOrderSchema = z.object({
  orderId: z.coerce.number().int().positive(),
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
): Promise<ActionResult<VoidPaidOrderData>> {
  const parsed = voidPaidOrderSchema.safeParse({ orderId, reason });
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

  const { data, error } = await supabase.rpc("refund_paid_order", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });

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
      ensureInvoiceProviderRegistered();
      const invoiceProvider = getInvoiceProvider();
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
