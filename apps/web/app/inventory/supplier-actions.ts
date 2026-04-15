"use server";

import { z } from "zod";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "../_lib/with-action";
import { getAuthContext } from "./_lib/auth";

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

export const createSupplier = withAction(
  { roles: ROLES, schema: supplierSchema },
  async (data, { supabase, claims }) => {
    const { paymentTermsDays, paymentTermsNote, ...rest } = data;
    const { data: row, error } = await supabase
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
    return { success: true, data: row };
  },
);

// Skip withAction: updateSupplier has (id, input) positional args
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
