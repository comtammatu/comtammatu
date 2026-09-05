"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;
const MST_REGEX = /^\d{10}(-\d{3})?$/;

const replaceInvoiceSchema = z
  .object({
    originalId: z.coerce.number().int().positive(),
    reason: z.string().trim().min(20).max(255),
    agreementRef: z.string().trim().min(1).max(225),
    agreementDate: z.string().date(),
    buyerKind: z.enum(["individual", "business"]).optional(),
    buyerName: z.string().trim().max(200).optional(),
    buyerTaxCode: z.string().trim().regex(MST_REGEX).optional(),
    buyerAddress: z.string().trim().max(500).optional(),
  })
  .refine((value) => !value.buyerTaxCode || Boolean(value.buyerName), {
    error: "Có MST thì phải nhập tên người mua",
    path: ["buyerName"],
  })
  .refine(
    (value) =>
      value.buyerKind !== "business" || Boolean(value.buyerTaxCode?.trim()),
    {
      error: "Doanh nghiệp cần mã số thuế",
      path: ["buyerTaxCode"],
    },
  );

export async function replaceTaxInvoice(
  input: z.infer<typeof replaceInvoiceSchema>,
): Promise<ActionResult> {
  const parsed = replaceInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền thay thế hóa đơn." };
  }

  const rpc = ctx.supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: number | null;
      error: { code?: string | null; message?: string | null } | null;
    }>;
  };
  const { data: replacementId, error } = await rpc.rpc(
    "reserve_tax_invoice_replacement",
    {
      p_old_id: parsed.data.originalId,
      p_reason: parsed.data.reason,
      p_agreement_ref: parsed.data.agreementRef,
      p_agreement_date: getVNDayUtcRange(parsed.data.agreementDate).startIso,
      p_buyer_name: parsed.data.buyerName ?? "",
      p_buyer_tax_code: parsed.data.buyerTaxCode ?? "",
      p_buyer_address: parsed.data.buyerAddress ?? "",
      p_buyer_kind: parsed.data.buyerKind ?? null,
    },
  );

  if (error || replacementId === null) {
    const message = error?.message ?? "";
    if (message.includes("replacement_already_pending")) {
      return {
        success: false,
        error: "Hóa đơn này đã có bản thay thế chờ xử lý.",
      };
    }
    if (error?.code === "42501") {
      return { success: false, error: "Không có quyền thay thế hóa đơn." };
    }
    return {
      success: false,
      error: "Không thể đưa hóa đơn thay thế vào hàng đợi.",
    };
  }

  return {
    success: true,
    data: {
      old_id: parsed.data.originalId,
      new_id: Number(replacementId),
      new_status: "queued",
    },
  };
}
