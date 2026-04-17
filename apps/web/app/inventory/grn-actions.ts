"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "../_lib/with-action";
import { getAuthContext } from "./_lib/auth";
import { fetchProcurementBranches } from "./_lib/procurement-branches";

const ROLES = PROCUREMENT_ROLES;

/* ─── Recent Activity (cross-domain) ─── */

export type RecentActivityItem = {
  id: number;
  type: "po" | "grn" | "invoice";
  code: string;
  supplier: string;
  date: string; // ISO datetime
  status: string;
  total: number | null;
};

export async function fetchRecentActivity(): Promise<
  ActionResult<RecentActivityItem[]>
> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const [poRes, grnRes, invRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_number, status, ordered_at, suppliers ( name ), purchase_order_items ( line_total )",
      )
      .eq("tenant_id", claims.tenant_id)
      .order("ordered_at", { ascending: false })
      .limit(5),
    supabase
      .from("goods_received_notes")
      .select(
        "id, grn_number, status, received_date, suppliers ( name ), grn_items ( total_cost )",
      )
      .eq("tenant_id", claims.tenant_id)
      .order("received_date", { ascending: false })
      .limit(5),
    supabase
      .from("supplier_invoices")
      .select(
        "id, invoice_number, matching_status, invoice_date, total_amount, suppliers ( name )",
      )
      .eq("tenant_id", claims.tenant_id)
      .order("invoice_date", { ascending: false })
      .limit(5),
  ]);

  if (poRes.error || grnRes.error || invRes.error) {
    return { success: false, error: "Không thể tải hoạt động gần đây." };
  }

  const items: RecentActivityItem[] = [
    ...(poRes.data ?? []).map((po) => {
      const lines =
        (po.purchase_order_items as Array<{
          line_total: number | null;
        }> | null) ?? [];
      const hasAllPrices =
        lines.length > 0 && lines.every((l) => l.line_total != null);
      const total = hasAllPrices
        ? lines.reduce((s, l) => s + Number(l.line_total), 0)
        : null;
      return {
        id: po.id,
        type: "po" as const,
        code: po.po_number,
        supplier:
          (po.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
        date: po.ordered_at ?? "",
        status: po.status,
        total,
      };
    }),
    ...(grnRes.data ?? []).map((grn) => {
      const lines =
        (grn.grn_items as Array<{ total_cost: number | null }> | null) ?? [];
      const total =
        lines.length > 0
          ? lines.reduce((s, l) => s + Number(l.total_cost ?? 0), 0)
          : null;
      return {
        id: grn.id,
        type: "grn" as const,
        code: grn.grn_number,
        supplier:
          (grn.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
        date: grn.received_date ?? "",
        status: grn.status,
        total,
      };
    }),
    ...(invRes.data ?? []).map((inv) => ({
      id: inv.id,
      type: "invoice" as const,
      code: inv.invoice_number,
      supplier:
        (inv.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
      date: inv.invoice_date ?? "",
      status: inv.matching_status,
      total: inv.total_amount ? Number(inv.total_amount) : null,
    })),
  ];

  items.sort((a, b) => (b.date > a.date ? 1 : -1));

  return { success: true, data: items.slice(0, 5) };
}

/* ─── fetchGrns ─── */

export async function fetchGrns(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, notes, supplier_id, branch_id, po_id, suppliers ( id, name ), purchase_orders ( po_number ), grn_items ( total_cost )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false });
  if (error) return { success: false, error: "Không thể tải phiếu nhập." };
  return { success: true, data: data ?? [] };
}

/* ─── fetchGrnDetail ─── */

export async function fetchGrnDetail(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: grn, error: e1 } = await supabase
    .from("goods_received_notes")
    .select(
      "*, branches ( id, name, is_headquarters ), suppliers ( id, name ), purchase_orders ( id, po_number )",
    )
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (e1 || !grn)
    return { success: false, error: "Không tìm thấy phiếu nhập." };
  const { data: lines, error: e2 } = await supabase
    .from("grn_items")
    .select("*, ingredients ( id, name, unit )")
    .eq("grn_id", id.data)
    .eq("tenant_id", claims.tenant_id);
  if (e2)
    return { success: false, error: "Không thể tải chi tiết phiếu nhập." };
  return { success: true, data: { grn, lines: lines ?? [] } };
}

/* ─── createGrnDraft ─── */

const grnCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive().optional(),
  poId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional(),
});

export const createGrnDraft = withAction(
  { roles: ROLES, schema: grnCreateSchema },
  async (data, { supabase, claims, user }) => {
    let targetBranchId = data.branchId;

    if (!targetBranchId) {
      const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
      targetBranchId = branches[0]?.id;
    }

    if (!targetBranchId) {
      return { success: false, error: "Chưa cấu hình kho tổng hoặc bếp trung tâm." };
    }

    // Branch-scoped roles: must match their assigned branch
    if (
      (claims.user_role === "warehouse_manager" || claims.user_role === "production_manager") &&
      claims.branch_id != null &&
      claims.branch_id !== targetBranchId
    ) {
      return { success: false, error: "Bạn chỉ được tạo phiếu nhập cho kho của mình." };
    }

    const grnNumber = `GRN-${randomUUID().slice(0, 8)}`;
    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: targetBranchId,
        supplier_id: data.supplierId,
        po_id: data.poId ?? null,
        grn_number: grnNumber,
        status: "draft",
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      return { success: false, error: "Không thể tạo phiếu nhập." };
    }
    return { success: true, data: row };
  },
);

/* ─── upsertGrnLine ─── */

const grnLineSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  receivedQuantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitCost: z.coerce.number().min(0),
  qualityStatus: z
    .enum(["accepted", "rejected", "partial"])
    .default("accepted"),
  receivingTemperature: z.coerce.number().optional().nullable(),
  batchNumber: z.string().trim().optional().nullable(),
  expiryDate: z.string().date().optional().nullable(),
});

export const upsertGrnLine = withAction(
  { roles: ROLES, schema: grnLineSchema },
  async (data, { supabase, claims }) => {
    const totalCost = data.receivedQuantity * data.unitCost;
    const { error } = await supabase.from("grn_items").upsert(
      {
        tenant_id: claims.tenant_id,
        grn_id: data.grnId,
        ingredient_id: data.ingredientId,
        received_quantity: data.receivedQuantity,
        unit: data.unit,
        unit_cost: data.unitCost,
        total_cost: totalCost,
        quality_status: data.qualityStatus,
        receiving_temperature: data.receivingTemperature ?? null,
        batch_number: data.batchNumber ?? null,
        expiry_date: data.expiryDate ?? null,
      },
      { onConflict: "grn_id,ingredient_id,tenant_id" },
    );
    if (error) {
      return { success: false, error: "Không thể lưu dòng phiếu nhập." };
    }
    return { success: true };
  },
);

/* ─── confirmGrn ─── */

export async function confirmGrn(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // Fetch po_id before confirming so we can update PO status afterward
  const { data: grnMeta } = await supabase
    .from("goods_received_notes")
    .select("po_id")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  const { data, error } = await supabase.rpc("confirm_goods_receipt_note", {
    p_grn_id: id.data,
  });
  if (error) {
    console.error("confirmGrn", error);
    return { success: false, error: "Không thể xác nhận phiếu nhập." };
  }

  // Auto-update PO status when a linked GRN is confirmed.
  // NOTE: siblings fetch + PO update are not atomic. For a single-tenant restaurant
  // the concurrent-confirm risk is negligible, but this should eventually move into
  // the confirm_goods_receipt_note RPC to be fully atomic.
  const poId = grnMeta?.po_id ?? null;
  if (poId) {
    const { data: siblings } = await supabase
      .from("goods_received_notes")
      .select("status")
      .eq("po_id", poId)
      .eq("tenant_id", claims.tenant_id)
      .neq("status", "cancelled");
    if (siblings && siblings.length > 0) {
      const allConfirmed = siblings.every((g) => g.status === "confirmed");
      await supabase
        .from("purchase_orders")
        .update({ status: allConfirmed ? "received" : "partially_received" })
        .eq("id", poId)
        .eq("tenant_id", claims.tenant_id)
        .in("status", ["sent", "partially_received"]);
    }
  }

  revalidatePath("/inventory/grn");
  if (poId) revalidatePath(`/inventory/purchase-orders/${poId}`);

  return { success: true, data };
}

/* ─── fetchGrnsForPo ─── */

export interface LinkedGrnRow {
  id: number;
  grn_number: string;
  status: string;
  received_date: string;
}

export async function fetchGrnsForPo(poId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select("id, grn_number, status, received_date")
    .eq("po_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false });
  if (error) return { success: false, error: "Không thể tải phiếu nhập." };
  return { success: true, data: data ?? [] };
}

/* ─── createGrnFromPo ─── */

export async function createGrnFromPo(poId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, supplier_id, status, branch_id")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (poErr || !po) return { success: false, error: "Không tìm thấy PO." };
  if (!["sent", "partially_received"].includes(po.status)) {
    return {
      success: false,
      error: "Chỉ tạo GRN từ PO đã gửi hoặc nhận một phần.",
    };
  }

  let targetBranchId: number | null = po.branch_id;
  if (!targetBranchId) {
    const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
    targetBranchId = branches[0]?.id ?? null;
  }
  if (!targetBranchId)
    return { success: false, error: "Chưa cấu hình kho tổng." };

  const { data: poLines, error: linesErr } = await supabase
    .from("purchase_order_items")
    .select("ingredient_id, quantity, unit, unit_price_est")
    .eq("po_id", po.id)
    .eq("tenant_id", claims.tenant_id);
  if (linesErr) {
    return { success: false, error: "Không thể đọc dòng PO." };
  }
  if (!poLines || poLines.length === 0) {
    return {
      success: false,
      error: "PO không có dòng nào để chuyển sang phiếu nhập.",
    };
  }

  const grnNumber = `GRN-${randomUUID().slice(0, 8)}`;
  const { data: grn, error } = await supabase
    .from("goods_received_notes")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: targetBranchId,
      supplier_id: po.supplier_id,
      po_id: po.id,
      grn_number: grnNumber,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !grn)
    return { success: false, error: "Không thể tạo phiếu nhập." };

  const grnItems = poLines.map((line) => {
    const unitCost = Number(line.unit_price_est ?? 0);
    const qty = Number(line.quantity);
    return {
      tenant_id: claims.tenant_id,
      grn_id: grn.id,
      ingredient_id: line.ingredient_id,
      po_quantity: qty,
      received_quantity: qty,
      unit: line.unit,
      unit_cost: unitCost,
      total_cost: Number((qty * unitCost).toFixed(2)),
      quality_status: "accepted" as const,
    };
  });

  const { error: itemsErr } = await supabase
    .from("grn_items")
    .insert(grnItems);
  if (itemsErr) {
    // Best-effort rollback to avoid leaving an empty GRN behind.
    await supabase
      .from("goods_received_notes")
      .delete()
      .eq("id", grn.id)
      .eq("tenant_id", claims.tenant_id);
    return {
      success: false,
      error: "Không thể sao chép dòng từ PO sang phiếu nhập.",
    };
  }

  return { success: true, data: grn };
}

/* ─── Supplier Invoices ─── */

const invoiceSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  grnId: z.coerce.number().int().positive().optional().nullable(),
  poId: z.coerce.number().int().positive().optional().nullable(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string(),
  subtotal: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0).default(8),
  vatAmount: z.coerce.number().min(0),
  totalAmount: z.coerce.number().min(0),
  matchingNotes: z.string().optional(),
  dueDate: z.string().optional().nullable(),
});

export const createSupplierInvoice = withAction(
  { roles: ROLES, schema: invoiceSchema },
  async (data, { supabase, claims, user }) => {
    // Auto-compute due_date from supplier payment_terms_days if not provided
    let dueDate: string | null = data.dueDate ?? null;
    if (!dueDate) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("payment_terms_days")
        .eq("id", data.supplierId)
        .eq("tenant_id", claims.tenant_id)
        .single();
      const termsDays = supplier?.payment_terms_days ?? null;
      if (termsDays && termsDays > 0) {
        const invoiceDt = new Date(data.invoiceDate);
        invoiceDt.setDate(invoiceDt.getDate() + termsDays);
        dueDate = invoiceDt.toISOString().slice(0, 10);
      }
    }

    const { data: row, error } = await supabase
      .from("supplier_invoices")
      .insert({
        tenant_id: claims.tenant_id,
        supplier_id: data.supplierId,
        grn_id: data.grnId ?? null,
        po_id: data.poId ?? null,
        invoice_number: data.invoiceNumber,
        invoice_date: data.invoiceDate,
        subtotal: data.subtotal,
        vat_rate: data.vatRate,
        vat_amount: data.vatAmount,
        total_amount: data.totalAmount,
        matching_notes: data.matchingNotes ?? null,
        created_by: user.id,
        due_date: dueDate,
        payment_status: "unpaid",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "Số hóa đơn đã tồn tại cho NCC này.",
        };
      }
      return { success: false, error: "Không thể tạo hóa đơn NCC." };
    }

    // Auto-trigger 3-way matching (non-fatal — invoice creation still succeeds)
    if (row?.id) {
      const { error: matchErr } = await supabase.rpc(
        "recompute_supplier_invoice_matching",
        { p_invoice_id: row.id },
      );
      if (matchErr) {
        console.error(
          "[createSupplierInvoice] auto-matching failed:",
          matchErr.message,
        );
      }
    }

    return { success: true, data: row };
  },
);

export async function fetchSupplierInvoices(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select(
      "id, invoice_number, invoice_date, total_amount, matching_status, subtotal, supplier_id, grn_id, due_date, payment_status, paid_amount, paid_at, suppliers ( id, name ), goods_received_notes ( id, grn_number )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("invoice_date", { ascending: false });
  if (error) return { success: false, error: "Không thể tải hóa đơn NCC." };
  return { success: true, data: data ?? [] };
}

export async function recomputeInvoiceMatching(
  invoiceId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(invoiceId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { data, error } = await supabase.rpc(
    "recompute_supplier_invoice_matching",
    { p_invoice_id: id.data },
  );
  if (error) {
    console.error("recomputeInvoiceMatching", error);
    return { success: false, error: "Không thể tính khớp." };
  }
  return { success: true, data };
}

/* ─── Recipes ─── */

const recipeLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  note: z.string().optional().nullable(),
  yieldFactor: z.coerce.number().positive().default(1.0),
});

const recipeBatchSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  lines: z.array(recipeLineSchema),
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
      id, name, updated_at,
      menu_categories ( name ),
      recipes (
        ingredient_id, quantity, unit, note, yield_factor,
        ingredients ( id, name, unit, unit_cost )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("fetchRecipes", error);
    return { success: false, error: "Không thể tải công thức." };
  }
  return { success: true, data: data ?? [] };
}

export const upsertRecipeLines = withAction(
  { roles: ROLES, schema: recipeBatchSchema },
  async (data, { supabase }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("upsert_recipe_lines", {
      p_menu_item_id: data.menuItemId,
      p_lines: data.lines.map((l) => ({
        ingredient_id: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        note: l.note ?? null,
        yield_factor: l.yieldFactor,
      })),
    });
    if (error) {
      console.error("upsertRecipeLines", error);
      return { success: false, error: "Không thể lưu công thức." };
    }
    return { success: true };
  },
);

export async function fetchMenuItemsForRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, is_active")
    .eq("tenant_id", claims.tenant_id)
    .order("name");
  if (error) return { success: false, error: "Không thể tải món." };
  return { success: true, data: data ?? [] };
}

/* ─── AP Payment ─── */

const markPaidSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce
    .number()
    .positive({ error: "Số tiền thanh toán phải lớn hơn 0" }),
  paidAt: z.string().optional(),
});

export const markInvoicePaid = withAction(
  { roles: ROLES, schema: markPaidSchema },
  async (data, { supabase, claims }) => {
    // 1. Fetch invoice totals
    const { data: invoice, error: fetchErr } = await supabase
      .from("supplier_invoices")
      .select("id, total_amount, paid_amount")
      .eq("id", data.invoiceId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (fetchErr || !invoice) {
      return { success: false, error: "Không tìm thấy hóa đơn." };
    }

    const currentPaid = Number(invoice.paid_amount ?? 0);
    const totalAmount = Number(invoice.total_amount);
    const newPaid = currentPaid + data.amount;

    if (newPaid > totalAmount) {
      return {
        success: false,
        error: `Số tiền vượt quá tổng hóa đơn. Còn lại: ${(totalAmount - currentPaid).toLocaleString("vi-VN")} đ`,
      };
    }

    const paymentStatus = newPaid >= totalAmount ? "paid" : "partial";
    const paidAt = data.paidAt ?? new Date().toISOString();

    // 2. Update invoice (optimistic concurrency: match current paid_amount to prevent race)
    // TODO: migrate to atomic RPC (UPDATE SET paid_amount = paid_amount + $1 WHERE paid_amount + $1 <= total_amount)
    const { data: updated, error: updateErr } = await supabase
      .from("supplier_invoices")
      .update({
        paid_amount: newPaid,
        payment_status: paymentStatus,
        paid_at: paidAt,
      })
      .eq("id", data.invoiceId)
      .eq("tenant_id", claims.tenant_id)
      .eq("paid_amount", currentPaid) // optimistic lock: fail if concurrent write changed paid_amount
      .select("id, payment_status, paid_amount, paid_at")
      .single();

    if (updateErr || !updated) {
      return {
        success: false,
        error: "Không thể cập nhật thanh toán. Có thể đã có thay đổi đồng thời — vui lòng tải lại.",
      };
    }

    return { success: true, data: updated };
  },
);
