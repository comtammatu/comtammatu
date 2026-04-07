"use server";

import { z } from "zod";
import { INVENTORY_CATALOG_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";

const branchIdSchema = z.coerce.number().int().positive();

export async function fetchBranchesForAllowlist(): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("branches")
    .select("id, name, is_active, is_headquarters")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("is_headquarters", { ascending: false })
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải danh sách chi nhánh." };
  }

  return { success: true, data: data ?? [] };
}

export async function fetchBranchIngredientIds(
  branchId: number,
): Promise<ActionResult> {
  const parsed = branchIdSchema.safeParse(branchId);
  if (!parsed.success) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("branch_ingredients")
    .select("ingredient_id")
    .eq("branch_id", parsed.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể tải cấu hình nguyên liệu." };
  }

  const ids = (data ?? []).map((r) => r.ingredient_id);
  return { success: true, data: ids };
}

const syncSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  ingredientIds: z.array(z.coerce.number().int().positive()),
});

export async function syncBranchIngredients(
  input: z.infer<typeof syncSchema>,
): Promise<ActionResult> {
  const parsed = syncSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(INVENTORY_CATALOG_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const tenantId = claims.tenant_id;
  const branchId = parsed.data.branchId;
  const target = new Set(parsed.data.ingredientIds);

  const { data: branchRow, error: branchErr } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (branchErr || !branchRow) {
    return { success: false, error: "Chi nhánh không tồn tại." };
  }

  const { data: existingRows, error: exErr } = await supabase
    .from("branch_ingredients")
    .select("ingredient_id")
    .eq("branch_id", branchId)
    .eq("tenant_id", tenantId);

  if (exErr) {
    return { success: false, error: "Không thể đồng bộ cấu hình." };
  }

  const current = new Set(
    (existingRows ?? []).map((r) => r.ingredient_id as number),
  );

  const toRemove = [...current].filter((id) => !target.has(id));
  const toAdd = [...target].filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("branch_ingredients")
      .delete()
      .eq("branch_id", branchId)
      .eq("tenant_id", tenantId)
      .in("ingredient_id", toRemove);

    if (delErr) {
      return { success: false, error: "Không thể cập nhật (xoá) mục đã chọn." };
    }
  }

  if (toAdd.length > 0) {
    const { error: insErr } = await supabase.from("branch_ingredients").insert(
      toAdd.map((ingredient_id) => ({
        tenant_id: tenantId,
        branch_id: branchId,
        ingredient_id,
      })),
    );

    if (insErr) {
      return {
        success: false,
        error: "Không thể thêm nguyên liệu cho chi nhánh.",
      };
    }
  }

  return { success: true };
}
