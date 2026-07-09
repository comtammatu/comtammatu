"use server";

import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction, withActionPositional } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "./_lib/auth";
import { PG_ERR } from "./_lib/constants";

const ROLES = PROCUREMENT_ROLES;

const supplierSchema = z.object({
  name: z.string().min(1, { error: "Tên NCC không được để trống" }),
  tax_code: z
    .string()
    .max(20, { error: "Mã số thuế tối đa 20 ký tự" })
    .optional(),
  phone: z
    .string()
    .max(30, { error: "Số điện thoại tối đa 30 ký tự" })
    .optional(),
  address: z
    .string()
    .max(300, { error: "Địa chỉ tối đa 300 ký tự" })
    .optional(),
  notes: z.string().max(500, { error: "Ghi chú tối đa 500 ký tự" }).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).optional().nullable(),
  paymentTermsNote: z.string().optional(),
});

export async function fetchSuppliers(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("name");
  if (error) {
    return { success: false, error: messages.inventory.suppliers.loadFailed };
  }
  return { success: true, data: data ?? [] };
}

export const createSupplier = withAction(
  {
    roles: ROLES,
    schema: supplierSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  },
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
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Tên NCC đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo nhà cung cấp." };
    }
    return { success: true, data: row };
  },
);

// id-first merged shape: the hand-rolled version validated `id` BEFORE the
// supplier body and returned the hard-coded "ID không hợp lệ" for ANY id
// failure — so the id field carries that copy at every level to keep the
// wrapped helper's `issues[0]?.message` identical.
const updateSupplierSchema = z.object({
  id: z.coerce
    .number({ error: "ID không hợp lệ" })
    .int({ error: "ID không hợp lệ" })
    .positive({ error: "ID không hợp lệ" }),
  ...supplierSchema.shape,
});

export const updateSupplier = withActionPositional(
  {
    argsToInput: (id: number, input: z.infer<typeof supplierSchema>) => ({
      id,
      ...input,
    }),
    schema: updateSupplierSchema,
    roles: ROLES,
    permission: PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  },
  async (
    { id, paymentTermsDays: ptd, paymentTermsNote: ptn, ...updateRest },
    { supabase, claims },
  ): Promise<ActionResult> => {
    const { error } = await supabase
      .from("suppliers")
      .update({
        ...updateRest,
        payment_terms_days: ptd ?? null,
        payment_terms_note: ptn ?? null,
      })
      .eq("id", id)
      .eq("tenant_id", claims.tenant_id);
    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Tên NCC đã tồn tại." };
      }
      return { success: false, error: "Không thể cập nhật nhà cung cấp." };
    }
    return { success: true };
  },
);

export async function deleteSupplier(id: number): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(id);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);
  if (error) {
    if (error.code === PG_ERR.FK_VIOLATION) {
      return {
        success: false,
        error: "Không thể xóa — NCC đang được dùng trong đơn hàng.",
      };
    }
    return { success: false, error: "Không thể xóa nhà cung cấp." };
  }
  return { success: true };
}
