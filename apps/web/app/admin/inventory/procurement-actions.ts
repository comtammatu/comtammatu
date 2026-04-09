"use server";

import { z } from "zod";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";
import { fetchHeadquartersBranchId } from "./_lib/headquarters";

const ROLES = PROCUREMENT_ROLES;

const supplierSchema = z.object({
  name: z.string().min(1, { error: "Tên NCC không được để trống" }),
  tax_code: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
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
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      tenant_id: claims.tenant_id,
      ...parsed.data,
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
  const { error } = await supabase
    .from("suppliers")
    .update(parsed.data)
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
  const poNumber = `PO-${Date.now()}`;
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
  if (e2) return { success: false, error: "Không tải được dòng PO." };
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

export async function fetchGrnDetail(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: grn, error: e1 } = await supabase
    .from("goods_received_notes")
    .select("*, branches ( id, name, is_headquarters )")
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
  if (e2) return { success: false, error: "Không tải được dòng phiếu." };
  return { success: true, data: { grn, lines: lines ?? [] } };
}

export async function fetchGrns(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, notes, supplier_id, branch_id, suppliers ( id, name )",
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
  const grnNumber = `GRN-${Date.now()}`;
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
    },
    { onConflict: "grn_id,ingredient_id,tenant_id" },
  );
  if (error) {
    return { success: false, error: "Không thể lưu dòng phiếu nhập." };
  }
  return { success: true };
}

export async function confirmGrn(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { data, error } = await supabase.rpc("confirm_goods_receipt_note", {
    p_grn_id: id.data,
  });
  if (error) {
    console.error("confirmGrn", error);
    return { success: false, error: "Không thể xác nhận phiếu nhập." };
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
      "id, invoice_number, invoice_date, total_amount, matching_status, subtotal, supplier_id, grn_id, suppliers ( id, name ), goods_received_notes ( id, grn_number )",
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
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `
      id, menu_item_id, ingredient_id, quantity, unit, note,
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
    },
    { onConflict: "menu_item_id,ingredient_id,tenant_id" },
  );
  if (error) {
    return { success: false, error: "Không thể lưu công thức." };
  }
  return { success: true };
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
