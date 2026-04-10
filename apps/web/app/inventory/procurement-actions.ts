"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../admin/_lib/auth";
import { fetchHeadquartersBranchId } from "./_lib/headquarters";

const ROLES = PROCUREMENT_ROLES;

const supplierSchema = z.object({
  name: z.string().min(1, { error: "Tên NCC không được để trống" }),
  tax_code: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).optional().nullable(),
  paymentTermsNote: z.string().optional(),
});

export async function fetchSuppliers(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("name");
  if (error) return { success: false, error: "Không thể tải nhà cung cấp." };
  return { success: true, data: data ?? [] };
}

export async function createSupplier(
  input: z.infer<typeof supplierSchema>,
): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { paymentTermsDays, paymentTermsNote, ...rest } = parsed.data;
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      tenant_id: claims.tenant_id,
      ...rest,
      payment_terms_days: paymentTermsDays ?? null,
      payment_terms_note: paymentTermsNote ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Tên NCC đã tồn tại." };
    }
    return { success: false, error: "Không thể tạo nhà cung cấp." };
  }
  return { success: true, data };
}

export async function updateSupplier(
  id: number,
  input: z.infer<typeof supplierSchema>,
): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(id);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const {
    paymentTermsDays: ptd,
    paymentTermsNote: ptn,
    ...updateRest
  } = parsed.data;
  const { error } = await supabase
    .from("suppliers")
    .update({
      ...updateRest,
      payment_terms_days: ptd ?? null,
      payment_terms_note: ptn ?? null,
    })
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Tên NCC đã tồn tại." };
    }
    return { success: false, error: "Không thể cập nhật nhà cung cấp." };
  }
  return { success: true };
}

export async function deleteSupplier(id: number): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(id);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);
  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: "Không thể xóa — NCC đang được dùng trong đơn hàng.",
      };
    }
    return { success: false, error: "Không thể xóa nhà cung cấp." };
  }
  return { success: true };
}

export async function fetchPurchaseOrders(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, ordered_at, notes, supplier_id, branch_id, suppliers ( id, name )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false });
  if (error) return { success: false, error: "Không thể tải đơn đặt hàng." };
  return { success: true, data: data ?? [] };
}

const poCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  notes: z.string().optional(),
});

export async function createPurchaseOrder(
  input: z.infer<typeof poCreateSchema>,
): Promise<ActionResult> {
  const parsed = poCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;
  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId) {
    return { success: false, error: "Chưa cấu hình chi nhánh Trụ sở." };
  }
  const poNumber = `PO-${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: hqId,
      supplier_id: parsed.data.supplierId,
      po_number: poNumber,
      status: "draft",
      notes: parsed.data.notes ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    return { success: false, error: "Không thể tạo đơn đặt hàng." };
  }
  return { success: true, data };
}

export async function fetchPurchaseOrderDetail(
  poId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: po, error: e1 } = await supabase
    .from("purchase_orders")
    .select("*, suppliers ( id, name )")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (e1 || !po)
    return { success: false, error: "Không tìm thấy đơn đặt hàng." };
  const { data: lines, error: e2 } = await supabase
    .from("purchase_order_items")
    .select("*, ingredients ( id, name, unit )")
    .eq("po_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("id");
  if (e2)
    return { success: false, error: "Không thể tải chi tiết đơn đặt hàng." };
  return { success: true, data: { po, lines: lines ?? [] } };
}

const poLineSchema = z.object({
  poId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive({ error: "Số lượng phải lớn hơn 0" }),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  unitPriceEst: z.union([z.number().min(0), z.null()]).optional(),
});

export async function upsertPurchaseOrderLine(
  input: z.infer<typeof poLineSchema>,
): Promise<ActionResult> {
  const parsed = poLineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const d = parsed.data;
  const { data: po, error: pe } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", d.poId)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (pe || !po) {
    return { success: false, error: "Không tìm thấy PO." };
  }
  if (po.status !== "draft") {
    return {
      success: false,
      error: "Chỉ chỉnh sửa dòng khi PO đang ở trạng thái nháp.",
    };
  }
  const unitPrice = d.unitPriceEst ?? null;
  const lineTotal =
    unitPrice != null ? Number((d.quantity * unitPrice).toFixed(2)) : null;
  const { error } = await supabase.from("purchase_order_items").upsert(
    {
      tenant_id: claims.tenant_id,
      po_id: d.poId,
      ingredient_id: d.ingredientId,
      quantity: d.quantity,
      unit: d.unit,
      unit_price_est: unitPrice,
      line_total: lineTotal,
    },
    { onConflict: "po_id,ingredient_id,tenant_id" },
  );
  if (error) {
    return { success: false, error: "Không thể lưu dòng PO." };
  }
  return { success: true };
}

const deletePoLineSchema = z.object({
  poId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

export async function deletePurchaseOrderLine(
  input: z.infer<typeof deletePoLineSchema>,
): Promise<ActionResult> {
  const parsed = deletePoLineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: po, error: pe } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (pe || !po) {
    return { success: false, error: "Không tìm thấy PO." };
  }
  if (po.status !== "draft") {
    return {
      success: false,
      error: "Chỉ xóa dòng khi PO đang ở trạng thái nháp.",
    };
  }
  const { error } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("id", parsed.data.lineId)
    .eq("po_id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id);
  if (error) {
    return { success: false, error: "Không thể xóa dòng." };
  }
  return { success: true };
}

const poStatusSchema = z.object({
  poId: z.coerce.number().int().positive(),
  status: z.enum(["sent", "cancelled"]),
});

export async function updatePurchaseOrderStatus(
  poId: number,
  status: string,
): Promise<ActionResult> {
  const parsed = poStatusSchema.safeParse({ poId, status });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: po, error: pe } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (pe || !po) return { success: false, error: "Không tìm thấy PO." };
  if (po.status !== "draft") {
    return { success: false, error: "Chỉ gửi/hủy PO đang ở trạng thái nháp." };
  }
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id);
  if (error)
    return { success: false, error: "Không thể cập nhật trạng thái PO." };
  return { success: true };
}

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

export async function fetchGrns(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, notes, supplier_id, branch_id, po_id, suppliers ( id, name ), purchase_orders ( po_number )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false });
  if (error) return { success: false, error: "Không thể tải phiếu nhập." };
  return { success: true, data: data ?? [] };
}

const grnCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  poId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional(),
});

export async function createGrnDraft(
  input: z.infer<typeof grnCreateSchema>,
): Promise<ActionResult> {
  const parsed = grnCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;
  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId) {
    return { success: false, error: "Chưa cấu hình chi nhánh Trụ sở." };
  }
  const grnNumber = `GRN-${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: hqId,
      supplier_id: parsed.data.supplierId,
      po_id: parsed.data.poId ?? null,
      grn_number: grnNumber,
      status: "draft",
      notes: parsed.data.notes ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    return { success: false, error: "Không thể tạo phiếu nhập." };
  }
  return { success: true, data };
}

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

export async function upsertGrnLine(
  input: z.infer<typeof grnLineSchema>,
): Promise<ActionResult> {
  const parsed = grnLineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const d = parsed.data;
  const totalCost = d.receivedQuantity * d.unitCost;
  const { error } = await supabase.from("grn_items").upsert(
    {
      tenant_id: claims.tenant_id,
      grn_id: d.grnId,
      ingredient_id: d.ingredientId,
      received_quantity: d.receivedQuantity,
      unit: d.unit,
      unit_cost: d.unitCost,
      total_cost: totalCost,
      quality_status: d.qualityStatus,
      receiving_temperature: d.receivingTemperature ?? null,
      batch_number: d.batchNumber ?? null,
      expiry_date: d.expiryDate ?? null,
    },
    { onConflict: "grn_id,ingredient_id,tenant_id" },
  );
  if (error) {
    return { success: false, error: "Không thể lưu dòng phiếu nhập." };
  }
  return { success: true };
}

export async function deleteGrnLine(lineId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(lineId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // Verify GRN is still draft before allowing delete
  const { data: line } = await supabase
    .from("grn_items")
    .select("grn_id, goods_received_notes!inner(status)")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (!line) return { success: false, error: "Không tìm thấy dòng hàng" };
  const grnStatus = (line.goods_received_notes as { status: string } | null)
    ?.status;
  if (grnStatus !== "draft") {
    return {
      success: false,
      error: "Chỉ có thể xoá dòng hàng ở trạng thái nháp",
    };
  }

  const { error } = await supabase
    .from("grn_items")
    .delete()
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id);
  if (error) return { success: false, error: "Không thể xoá dòng hàng." };
  return { success: true };
}

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

  // Auto-update PO status when a linked GRN is confirmed
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

  return { success: true, data };
}

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

export async function createSupplierInvoice(
  input: z.infer<typeof invoiceSchema>,
): Promise<ActionResult> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;

  // Auto-compute due_date from supplier payment_terms_days if not provided
  let dueDate: string | null = parsed.data.dueDate ?? null;
  if (!dueDate) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("payment_terms_days")
      .eq("id", parsed.data.supplierId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    const termsDays = supplier?.payment_terms_days ?? null;
    if (termsDays && termsDays > 0) {
      const invoiceDt = new Date(parsed.data.invoiceDate);
      invoiceDt.setDate(invoiceDt.getDate() + termsDays);
      dueDate = invoiceDt.toISOString().slice(0, 10);
    }
  }

  const { data, error } = await supabase
    .from("supplier_invoices")
    .insert({
      tenant_id: claims.tenant_id,
      supplier_id: parsed.data.supplierId,
      grn_id: parsed.data.grnId ?? null,
      po_id: parsed.data.poId ?? null,
      invoice_number: parsed.data.invoiceNumber,
      invoice_date: parsed.data.invoiceDate,
      subtotal: parsed.data.subtotal,
      vat_rate: parsed.data.vatRate,
      vat_amount: parsed.data.vatAmount,
      total_amount: parsed.data.totalAmount,
      matching_notes: parsed.data.matchingNotes ?? null,
      created_by: user.id,
      due_date: dueDate,
      payment_status: "unpaid",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Số hóa đơn đã tồn tại cho NCC này." };
    }
    return { success: false, error: "Không thể tạo hóa đơn NCC." };
  }
  return { success: true, data };
}

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

const recipeSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  note: z.string().optional(),
  yieldFactor: z.coerce.number().positive().default(1.0),
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `
      id, menu_item_id, ingredient_id, quantity, unit, note, yield_factor,
      menu_items ( id, name ),
      ingredients ( id, name, unit )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("menu_item_id");
  if (error) return { success: false, error: "Không thể tải công thức." };
  return { success: true, data: data ?? [] };
}

export async function upsertRecipe(
  input: z.infer<typeof recipeSchema>,
): Promise<ActionResult> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { error } = await supabase.from("recipes").upsert(
    {
      tenant_id: claims.tenant_id,
      menu_item_id: parsed.data.menuItemId,
      ingredient_id: parsed.data.ingredientId,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      note: parsed.data.note ?? null,
      yield_factor: parsed.data.yieldFactor,
    },
    { onConflict: "menu_item_id,ingredient_id,tenant_id" },
  );
  if (error) {
    return { success: false, error: "Không thể lưu công thức." };
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// PO Suggestions — auto-suggest order quantities from consumption + stock
// ---------------------------------------------------------------------------

const poSuggestionsSchema = z.object({
  periodDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7),
});

export interface PoSuggestionRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  hq_current_qty: number;
  reorder_point: number;
  max_stock_level: number;
  suggested_qty: number;
  avg_daily_consumption: number;
  period_days: number;
  below_reorder: boolean;
}

export async function fetchPoSuggestions(input?: {
  periodDays?: 7 | 14 | 30;
}): Promise<ActionResult> {
  const parsed = poSuggestionsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId) {
    return { success: false, error: "Chưa cấu hình chi nhánh Trụ sở." };
  }

  const periodDays = parsed.data.periodDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  // 1. HQ stock levels for active ingredients with reorder_point
  const { data: hqStock, error: e1 } = await supabase
    .from("stock_levels")
    .select(
      `
      ingredient_id,
      current_quantity,
      ingredients!inner (
        id, name, unit, reorder_point, max_stock_level, is_active
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", hqId)
    .eq("ingredients.is_active", true)
    .not("ingredients.reorder_point", "is", null);

  if (e1) return { success: false, error: "Không thể tải tồn kho HQ." };

  // 2. Consumption data across ALL branches over the period
  const { data: movements, error: e2 } = await supabase
    .from("stock_movements")
    .select("ingredient_id, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .eq("type", "consumption")
    .gte("created_at", cutoff.toISOString());

  if (e2) return { success: false, error: "Không thể tải dữ liệu tiêu thụ." };

  // Aggregate consumption per ingredient (quantity_change is negative for consumption)
  const consumptionMap = new Map<number, number>();
  for (const m of movements ?? []) {
    const prev = consumptionMap.get(m.ingredient_id) ?? 0;
    consumptionMap.set(m.ingredient_id, prev + Math.abs(m.quantity_change));
  }

  // 3. Build suggestion rows
  const suggestions: PoSuggestionRow[] = [];

  for (const sl of hqStock ?? []) {
    const ing = sl.ingredients as unknown as {
      id: number;
      name: string;
      unit: string;
      reorder_point: number;
      max_stock_level: number | null;
    };
    if (!ing || ing.reorder_point == null) continue;

    const maxStock = ing.max_stock_level ?? 0;
    const currentQty = sl.current_quantity;
    const suggestedQty = Math.max(0, maxStock - currentQty);
    const totalConsumed = consumptionMap.get(ing.id) ?? 0;
    const avgDaily = totalConsumed / periodDays;
    const belowReorder = currentQty <= ing.reorder_point;

    // Only suggest if below reorder OR has consumption data and space to restock
    if (!belowReorder && suggestedQty <= 0) continue;

    suggestions.push({
      ingredient_id: ing.id,
      ingredient_name: ing.name,
      unit: ing.unit,
      hq_current_qty: currentQty,
      reorder_point: ing.reorder_point,
      max_stock_level: maxStock,
      suggested_qty: suggestedQty,
      avg_daily_consumption: Math.round(avgDaily * 100) / 100,
      period_days: periodDays,
      below_reorder: belowReorder,
    });
  }

  // Sort: below reorder first, then by consumption rate descending
  suggestions.sort((a, b) => {
    if (a.below_reorder !== b.below_reorder) return a.below_reorder ? -1 : 1;
    return b.avg_daily_consumption - a.avg_daily_consumption;
  });

  return { success: true, data: suggestions };
}

// ---------------------------------------------------------------------------
// Price Intelligence — deviation alerts + supplier price history
// ---------------------------------------------------------------------------

export interface PriceDeviationRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  current_price: number;
  avg_price: number;
  deviation_pct: number; // positive = more expensive, negative = cheaper
  sample_count: number;
}

const priceDeviationsSchema = z.object({
  poId: z.coerce.number().int().positive(),
});

/**
 * For a draft PO, compare each line's unit_price_est against the average
 * of the last 3 confirmed GRN unit_costs for the same ingredient + supplier.
 * Returns only lines with >5% deviation.
 */
export async function fetchPriceDeviations(
  input: z.infer<typeof priceDeviationsSchema>,
): Promise<ActionResult> {
  const parsed = priceDeviationsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dữ liệu không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // 1. Fetch PO with supplier_id
  const { data: po, error: e1 } = await supabase
    .from("purchase_orders")
    .select("id, supplier_id")
    .eq("id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (e1 || !po) return { success: false, error: "Không tìm thấy PO." };

  // 2. Fetch PO lines that have a price estimate
  const { data: lines, error: e2 } = await supabase
    .from("purchase_order_items")
    .select("ingredient_id, unit_price_est, unit, ingredients ( id, name )")
    .eq("po_id", po.id)
    .eq("tenant_id", claims.tenant_id)
    .not("unit_price_est", "is", null);
  if (e2) return { success: false, error: "Không thể tải dòng đơn đặt hàng." };
  if (!lines || lines.length === 0) return { success: true, data: [] };

  // 3. For each line, get last 3 confirmed GRN unit_costs for same ingredient + supplier
  const deviations: PriceDeviationRow[] = [];

  for (const line of lines) {
    const { data: history } = await supabase
      .from("grn_items")
      .select(
        "unit_cost, goods_received_notes!inner ( supplier_id, status, received_date )",
      )
      .eq("ingredient_id", line.ingredient_id)
      .eq("tenant_id", claims.tenant_id)
      .eq("goods_received_notes.supplier_id", po.supplier_id)
      .eq("goods_received_notes.status", "confirmed")
      .order("received_date", {
        referencedTable: "goods_received_notes",
        ascending: false,
      })
      .limit(3);

    if (!history || history.length === 0) continue;

    const avgPrice =
      history.reduce((sum, h) => sum + h.unit_cost, 0) / history.length;
    if (avgPrice === 0) continue;

    const currentPrice = line.unit_price_est!;
    const deviationPct = ((currentPrice - avgPrice) / avgPrice) * 100;

    if (Math.abs(deviationPct) > 5) {
      const ing = line.ingredients as unknown as {
        id: number;
        name: string;
      } | null;
      deviations.push({
        ingredient_id: line.ingredient_id,
        ingredient_name: ing?.name ?? `#${line.ingredient_id}`,
        unit: line.unit,
        current_price: currentPrice,
        avg_price: Math.round(avgPrice * 100) / 100,
        deviation_pct: Math.round(deviationPct * 10) / 10,
        sample_count: history.length,
      });
    }
  }

  return { success: true, data: deviations };
}

export interface SinglePriceDeviation {
  avg_price: number;
  deviation_pct: number;
  sample_count: number;
}

const singleDeviationSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
  currentPrice: z.coerce.number().min(0),
});

/**
 * Check price deviation for a single ingredient + supplier pair.
 * Used inline during PO creation when user enters a price.
 */
export async function fetchSinglePriceDeviation(
  input: z.infer<typeof singleDeviationSchema>,
): Promise<ActionResult> {
  const parsed = singleDeviationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dữ liệu không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data: history } = await supabase
    .from("grn_items")
    .select(
      "unit_cost, goods_received_notes!inner ( supplier_id, status, received_date )",
    )
    .eq("ingredient_id", parsed.data.ingredientId)
    .eq("tenant_id", claims.tenant_id)
    .eq("goods_received_notes.supplier_id", parsed.data.supplierId)
    .eq("goods_received_notes.status", "confirmed")
    .order("received_date", {
      referencedTable: "goods_received_notes",
      ascending: false,
    })
    .limit(3);

  if (!history || history.length === 0) return { success: true, data: null };

  const avgPrice =
    history.reduce((sum, h) => sum + h.unit_cost, 0) / history.length;
  if (avgPrice === 0) return { success: true, data: null };

  const deviationPct = ((parsed.data.currentPrice - avgPrice) / avgPrice) * 100;

  const result: SinglePriceDeviation = {
    avg_price: Math.round(avgPrice * 100) / 100,
    deviation_pct: Math.round(deviationPct * 10) / 10,
    sample_count: history.length,
  };
  return { success: true, data: result };
}

export interface PriceHistoryRow {
  grn_id: number;
  grn_number: string;
  received_date: string;
  unit_cost: number;
  received_quantity: number;
  unit: string;
  supplier_name: string;
  supplier_id: number;
}

const priceHistorySchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive().optional(),
});

/**
 * Fetch price history for an ingredient from confirmed GRNs.
 * Optionally filter by supplier.
 */
export async function fetchIngredientPriceHistory(
  input: z.infer<typeof priceHistorySchema>,
): Promise<ActionResult> {
  const parsed = priceHistorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dữ liệu không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  let query = supabase
    .from("grn_items")
    .select(
      "grn_id, unit_cost, received_quantity, unit, goods_received_notes!inner ( id, grn_number, received_date, status, supplier_id, suppliers ( id, name ) )",
    )
    .eq("ingredient_id", parsed.data.ingredientId)
    .eq("tenant_id", claims.tenant_id)
    .eq("goods_received_notes.status", "confirmed")
    .order("received_date", {
      referencedTable: "goods_received_notes",
      ascending: false,
    })
    .limit(20);

  if (parsed.data.supplierId) {
    query = query.eq(
      "goods_received_notes.supplier_id",
      parsed.data.supplierId,
    );
  }

  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải lịch sử giá." };

  const rows: PriceHistoryRow[] = (data ?? []).map((item) => {
    const grn = item.goods_received_notes as unknown as {
      id: number;
      grn_number: string;
      received_date: string;
      supplier_id: number;
      suppliers: { id: number; name: string } | null;
    };
    return {
      grn_id: grn.id,
      grn_number: grn.grn_number,
      received_date: grn.received_date,
      unit_cost: item.unit_cost,
      received_quantity: item.received_quantity,
      unit: item.unit,
      supplier_name: grn.suppliers?.name ?? "—",
      supplier_id: grn.supplier_id,
    };
  });

  return { success: true, data: rows };
}

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

// ---------------------------------------------------------------------------
// AP Payment — mark supplier invoice as partially/fully paid
// ---------------------------------------------------------------------------

const markPaidSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce
    .number()
    .positive({ error: "Số tiền thanh toán phải lớn hơn 0" }),
  paidAt: z.string().optional(),
});

export async function markInvoicePaid(
  input: z.infer<typeof markPaidSchema>,
): Promise<ActionResult> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // 1. Fetch invoice totals
  const { data: invoice, error: fetchErr } = await supabase
    .from("supplier_invoices")
    .select("id, total_amount, paid_amount")
    .eq("id", parsed.data.invoiceId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !invoice) {
    return { success: false, error: "Không tìm thấy hóa đơn." };
  }

  const currentPaid = Number(invoice.paid_amount ?? 0);
  const totalAmount = Number(invoice.total_amount);
  const newPaid = currentPaid + parsed.data.amount;

  if (newPaid > totalAmount) {
    return {
      success: false,
      error: `Số tiền vượt quá tổng hóa đơn. Còn lại: ${(totalAmount - currentPaid).toLocaleString("vi-VN")} đ`,
    };
  }

  const paymentStatus = newPaid >= totalAmount ? "paid" : "partial";
  const paidAt = parsed.data.paidAt ?? new Date().toISOString();

  // 2. Update invoice
  const { data: updated, error: updateErr } = await supabase
    .from("supplier_invoices")
    .update({
      paid_amount: newPaid,
      payment_status: paymentStatus,
      paid_at: paidAt,
    })
    .eq("id", parsed.data.invoiceId)
    .eq("tenant_id", claims.tenant_id)
    .select("id, payment_status, paid_amount, paid_at")
    .single();

  if (updateErr) {
    return { success: false, error: "Không thể cập nhật thanh toán." };
  }

  return { success: true, data: updated };
}

// ─── PO → GRN helpers ────────────────────────────────────────────────────────

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

export async function createGrnFromPo(poId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, supplier_id, status")
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

  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId)
    return { success: false, error: "Chưa cấu hình chi nhánh Trụ sở." };

  const grnNumber = `GRN-${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: hqId,
      supplier_id: po.supplier_id,
      po_id: po.id,
      grn_number: grnNumber,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: "Không thể tạo phiếu nhập." };
  return { success: true, data };
}
