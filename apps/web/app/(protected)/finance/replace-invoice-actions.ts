"use server";

/**
 * HĐĐT Replace flow — Path C (TT78/2021 §7 + NĐ 70/2025).
 *
 * User-path: owner/super_manager corrects buyer info errors on an
 * issued invoice. Server orchestrates:
 *   1. `replace_tax_invoice` RPC (SECURITY DEFINER + permission-gated):
 *      atomic dual transition — flips OLD to 'replaced', inserts NEW
 *      draft linked via replaced_by/replaced_for, writes 2 events.
 *   2. Transition NEW: draft → signing via canonical user RPC.
 *   3. Call provider.createInvoice with `replacement: ctx` — Viettel
 *      branches body shape to adjustmentType=3 + original refs.
 *   4. Transition NEW: signing → issued|submitted|draft based on
 *      provider result.
 *   5. UPDATE tax_invoices.{invoice_number, provider_ref, provider_data}
 *      on NEW row.
 *
 * Failsoft: if provider rejects, NEW stays at 'draft' (recovery
 * candidate); OLD stays at 'replaced' (per atomic RPC). User can
 * retry — same NEW row reused since chain.depth check would block
 * creating a 4th replacement.
 *
 * Line items + amounts come from the order — only buyer info is
 * editable. This matches the audit's "Mode (a)" decision: MVP scope
 * is buyer-info fixes (sai MST, sai tên, sai địa chỉ).
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import {
  SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_DEFAULTS,
} from "@comtammatu/shared/settings";
import {
  applyInvoiceLineDiscount,
  buildInvoiceLineItemsFromOrderItems,
} from "@comtammatu/shared/hddt";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

const MST_REGEX = /^\d{10}(-\d{3})?$/;

const replaceInvoiceSchema = z
  .object({
    originalId: z.coerce.number().int().positive(),
    reason: z
      .string()
      .trim()
      .min(20, "Lý do thay thế phải có ít nhất 20 ký tự")
      .max(255, "Lý do thay thế quá dài (≤255 ký tự)"),
    agreementRef: z
      .string()
      .trim()
      .min(1, "Văn bản thỏa thuận bắt buộc")
      .max(225, "Văn bản thỏa thuận quá dài (≤225 ký tự)"),
    agreementDate: z.string().date(),
    buyerName: z.string().trim().max(200).optional(),
    buyerTaxCode: z
      .string()
      .trim()
      .regex(MST_REGEX, { error: "MST phải có dạng 10 số hoặc 10-3 số" })
      .optional(),
    buyerAddress: z.string().trim().max(500).optional(),
  })
  .refine((v) => !v.buyerTaxCode || (v.buyerName && v.buyerName.length > 0), {
    error: "Có MST thì phải nhập tên người mua",
    path: ["buyerName"],
  });

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
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx)
    return { success: false, error: "Không có quyền thay thế hóa đơn." };

  const { supabase, claims } = ctx;

  // Fetch OLD invoice with order line items for VAT recomputation.
  const { data: oldInvoice, error: oldErr } = await supabase
    .from("tax_invoices")
    .select(
      `
      id, tenant_id, branch_id, order_id, status, invoice_kind,
      invoice_number, issued_at, provider_ref,
      orders!inner ( id, total_amount, discount_amount, order_discount_amount,
        order_items ( item_name, variant_name, quantity, unit_price, subtotal, discount_amount, modifiers, sides, status, vat_rate )
      )
    `,
    )
    .eq("id", parsed.data.originalId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (oldErr || !oldInvoice) {
    return { success: false, error: "Hóa đơn gốc không tồn tại." };
  }
  if (oldInvoice.status !== "issued") {
    return {
      success: false,
      error: "Chỉ thay thế được hóa đơn đã phát hành.",
    };
  }
  if (oldInvoice.invoice_kind !== "per_order") {
    return {
      success: false,
      error:
        "Chỉ hỗ trợ thay thế HĐ B2B (per_order). HĐ tổng hợp B2C sẽ hỗ trợ ở v2.",
    };
  }
  if (
    !oldInvoice.invoice_number ||
    !oldInvoice.issued_at ||
    !oldInvoice.provider_ref
  ) {
    return {
      success: false,
      error:
        "Hóa đơn gốc thiếu thông tin (số HĐ / ngày phát hành / providerRef).",
    };
  }
  if (!(await canAccessBranch(supabase, claims, oldInvoice.branch_id))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const order = oldInvoice.orders;
  if (!order) {
    return { success: false, error: "Không tìm thấy đơn hàng gốc." };
  }

  // Recompute VAT aggregation from current order_items — same logic
  // as createTaxInvoice (per HDDT-VAT-PER-LINE-NOT-PER-INVOICE rule).
  const activeItems = order.order_items.filter(
    (item) => item.status !== "cancelled",
  );
  if (activeItems.length === 0) {
    return {
      success: false,
      error: "Đơn hàng không có món nào để thay thế HĐ.",
    };
  }

  const orderTotal = Number(order.total_amount);
  const itemGrossSum = activeItems.reduce((s, i) => s + Number(i.subtotal), 0);

  let subtotal: number;
  let vatAmount: number;
  let vatRate: number;

  if (itemGrossSum > 0) {
    const scale = orderTotal / itemGrossSum;
    const grossByRate = new Map<number, number>();
    for (const item of activeItems) {
      const rate = Number(item.vat_rate);
      const gross = Number(item.subtotal) * scale;
      grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + gross);
    }
    let sumSub = 0;
    let sumVat = 0;
    let predRate = 0;
    let predGross = -1;
    for (const [rate, gross] of grossByRate) {
      const lineSub = gross / (1 + rate / 100);
      const lineVat = gross - lineSub;
      sumSub += lineSub;
      sumVat += lineVat;
      if (gross > predGross) {
        predRate = rate;
        predGross = gross;
      }
    }
    subtotal = sumSub;
    vatAmount = sumVat;
    vatRate = predRate;
  } else {
    const { data: vatSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("tenant_id", claims.tenant_id)
      .eq("key", SYSTEM_SETTING_KEYS.VAT_RATE)
      .maybeSingle();
    vatRate = Number(
      vatSetting?.value ??
        SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.VAT_RATE],
    );
    subtotal = orderTotal / (1 + vatRate / 100);
    vatAmount = orderTotal - subtotal;
  }

  ensureInvoiceProviderRegistered();
  const provider = getInvoiceProvider();
  if (!provider) {
    return { success: false, error: "Provider HĐĐT chưa được cấu hình." };
  }

  // STEP A — Atomic dual transition via RPC.
  // Old → replaced, new draft inserted, replaced_by/replaced_for linked.
  const { data: newIdRaw, error: rpcErr } = await supabase.rpc(
    "replace_tax_invoice",
    {
      p_old_id: parsed.data.originalId,
      p_reason: parsed.data.reason,
      p_agreement_ref: parsed.data.agreementRef,
      p_agreement_date: new Date(parsed.data.agreementDate).toISOString(),
      p_buyer_name: parsed.data.buyerName ?? "",
      p_buyer_tax_code: parsed.data.buyerTaxCode ?? "",
      p_buyer_address: parsed.data.buyerAddress ?? "",
      p_subtotal: Math.round(subtotal * 100) / 100,
      p_vat_rate: vatRate,
      p_vat_amount: Math.round(vatAmount * 100) / 100,
      p_total_amount: orderTotal,
      p_provider: provider.name,
    },
  );

  if (rpcErr || newIdRaw == null) {
    const code = rpcErr?.code ?? "";
    const msg = rpcErr?.message ?? "rpc_failed";
    if (msg.includes("only_issued_can_be_replaced")) {
      return {
        success: false,
        error: "Hóa đơn không ở trạng thái 'phát hành'.",
      };
    }
    if (msg.includes("already_replaced")) {
      return { success: false, error: "Hóa đơn này đã được thay thế." };
    }
    if (msg.includes("replacement_chain_too_deep")) {
      return {
        success: false,
        error: "Chuỗi thay thế quá sâu (tối đa 3 lần). Liên hệ kế toán.",
      };
    }
    if (
      msg.includes("agreement_date_in_future") ||
      msg.includes("agreement_date_before")
    ) {
      return { success: false, error: "Ngày văn bản thỏa thuận không hợp lệ." };
    }
    if (code === "42501") {
      return { success: false, error: "Không có quyền thay thế hóa đơn." };
    }
    return { success: false, error: "Không thể khởi tạo HĐ thay thế." };
  }

  const newId = Number(newIdRaw);

  // STEP B — Transition NEW: draft → signing (user RPC, enforces ACL).
  const { error: signErr } = await supabase.rpc(
    "transition_tax_invoice_state",
    {
      p_tax_invoice_id: newId,
      p_to_status: "signing",
      p_payload: { replacement_initiated: true },
    },
  );
  if (signErr) {
    // Leave new in draft; user can retry signing manually. Audit only.
    await logAudit(supabase, {
      action: "replace_signing_failed",
      entityType: "tax_invoice",
      entityId: newId,
      newData: { error: signErr.message },
    });
    return { success: false, error: "Không thể chuyển sang ký số." };
  }

  // STEP C — Call provider with replacement context.
  const invoiceItems = applyInvoiceLineDiscount(
    buildInvoiceLineItemsFromOrderItems(activeItems),
    Number(order.order_discount_amount ?? order.discount_amount ?? 0),
  );

  // For TT78 originalTemplateCode: strip series, keep digit (e.g. "2/001" → "2").
  const originalTemplateCode =
    process.env["SINVOICE_TEMPLATE_CODE"]?.split("/")[0] ?? "2";
  const originalInvoiceType = originalTemplateCode;

  const providerResult = await provider.createInvoice({
    orderId: newId, // CRITICAL: NEW row id → fresh transactionUuid
    orderNumber: `REPLACE-${parsed.data.originalId}-${newId}`,
    sellerName: "",
    sellerTaxCode: process.env["COMPANY_TAX_CODE"] ?? "",
    sellerAddress: "",
    buyerName: parsed.data.buyerName,
    buyerTaxCode: parsed.data.buyerTaxCode,
    buyerAddress: parsed.data.buyerAddress,
    items: invoiceItems,
    subtotal: Math.round(subtotal * 100) / 100,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    totalAmount: orderTotal,
    replacement: {
      originalInvoiceNumber: oldInvoice.invoice_number,
      originalIssuedAt: oldInvoice.issued_at,
      originalInvoiceType,
      originalTemplateCode,
      reason: parsed.data.reason,
      agreementRef: parsed.data.agreementRef,
      agreementDate: new Date(parsed.data.agreementDate).toISOString(),
    },
  });

  // STEP D — Transition NEW to final state based on provider result.
  const nextStatus: "issued" | "submitted" | "draft" =
    providerResult.status === "issued"
      ? "issued"
      : providerResult.status === "submitted"
        ? "submitted"
        : providerResult.status === "signing"
          ? "submitted" // treat unresolved as submitted; reconcile will poll
          : "draft";

  const providerDataPayload = providerResult.providerData
    ? JSON.parse(JSON.stringify(providerResult.providerData))
    : null;

  const { error: finalErr } = await supabase.rpc(
    "transition_tax_invoice_state",
    {
      p_tax_invoice_id: newId,
      p_to_status: nextStatus,
      p_payload: providerDataPayload,
      p_note:
        providerResult.status === "failed"
          ? "Provider call failed during replace"
          : "Replacement issued",
    },
  );
  if (finalErr) {
    await logAudit(supabase, {
      action: "replace_final_transition_failed",
      entityType: "tax_invoice",
      entityId: newId,
      newData: { error: finalErr.message, nextStatus },
    });
    return {
      success: false,
      error: "Không thể cập nhật trạng thái HĐ thay thế.",
    };
  }

  // STEP E — Persist invoice_number + provider_ref on NEW row.
  if (providerResult.invoiceNumber || providerResult.providerRef) {
    await supabase
      .from("tax_invoices")
      .update({
        invoice_number: providerResult.invoiceNumber,
        provider_ref: providerResult.providerRef,
      })
      .eq("id", newId);
  }

  await logAudit(supabase, {
    action: "replace",
    entityType: "tax_invoice",
    entityId: newId,
    oldData: {
      original_id: parsed.data.originalId,
      original_invoice_number: oldInvoice.invoice_number,
    },
    newData: {
      new_id: newId,
      new_status: nextStatus,
      new_invoice_number: providerResult.invoiceNumber,
    },
  });

  return {
    success: true,
    data: {
      old_id: parsed.data.originalId,
      new_id: newId,
      new_status: nextStatus,
      new_invoice_number: providerResult.invoiceNumber,
    },
  };
}
