"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, withFormAction } from "@/_lib/with-action";

const SETTINGS_ROLES: StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const optionalText = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional().default(""),
);

const branchSchema = z.object({
  name: z.string().min(1, { error: "Tên điểm vận hành không được để trống" }),
  address: optionalText,
  phone: optionalText,
  branchKind: z.enum(["branch", "central_kitchen", "central_warehouse"]).default("branch"),
});

const updateBranchSchema = branchSchema.extend({
  id: z.coerce.number().int().positive(),
});

const toggleIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
});

/* ─── Actions ─── */

export const createBranch = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: branchSchema,
    extract: (fd) => ({
      name: fd.get("name"),
      address: fd.get("address"),
      phone: fd.get("phone"),
      branchKind: fd.get("branchKind"),
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("branches").insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      address: data.address || null,
      phone: data.phone || null,
      branch_kind: data.branchKind,
    });

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Tên điểm vận hành đã tồn tại" };
      }
      if (error.code === "42703") {
        return {
          success: false,
          error:
            "Cần áp dụng migration điểm vận hành trước khi tạo hoặc sửa loại điểm vận hành.",
        };
      }
      return {
        success: false,
        error: "Không thể tạo điểm vận hành. Vui lòng thử lại.",
      };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);

export const updateBranch = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateBranchSchema,
    extract: (fd) => ({
      id: fd.get("id"),
      name: fd.get("name"),
      address: fd.get("address"),
      phone: fd.get("phone"),
      branchKind: fd.get("branchKind"),
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("branches")
      .update({
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        branch_kind: data.branchKind,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Tên điểm vận hành đã tồn tại" };
      }
      if (error.code === "42703") {
        return {
          success: false,
          error:
            "Cần áp dụng migration điểm vận hành trước khi tạo hoặc sửa loại điểm vận hành.",
        };
      }
      return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);

export const toggleBranchActive = withAction(
  {
    roles: SETTINGS_ROLES,
    schema: toggleIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { data: branch } = await supabase
      .from("branches")
      .select("is_active")
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (!branch) {
      return { success: false, error: "Điểm vận hành không tồn tại" };
    }

    const { error } = await supabase
      .from("branches")
      .update({ is_active: !(branch.is_active ?? true) })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
    }

    revalidateSurfacePath("/admin/settings/branches");
    return { success: true };
  },
);

