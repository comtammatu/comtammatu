"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import {
  PERMISSION_KEYS,
  TENANT_STRATEGY_SETTINGS_ROLES,
} from "@comtammatu/shared/auth";
import { branchCodeSchema } from "@lib/branch-code";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, withFormAction } from "@/_lib/with-action";

/* ─── Schemas ─── */

const optionalText = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional().default(""),
);

const branchSchema = z.object({
  name: z.string().min(1, { error: "Tên điểm vận hành không được để trống" }),
  address: optionalText,
  phone: optionalText,
  googleReviewUrl: optionalText,
});

const createBranchSchema = branchSchema.extend({
  code: branchCodeSchema,
});

const updateBranchSchema = branchSchema.extend({
  id: z.coerce.number().int().positive(),
});

const toggleIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "Mã chi nhánh không hợp lệ" }),
});

function normalizeGoogleReviewUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.length > 500 || !/^https?:\/\//i.test(value)) {
    return "__invalid__";
  }
  return value;
}

/* ─── Actions ─── */

export const createBranch = withFormAction(
  {
    roles: TENANT_STRATEGY_SETTINGS_ROLES,
    schema: createBranchSchema,
    extract: (fd) => ({
      name: fd.get("name"),
      code: fd.get("code"),
      address: fd.get("address"),
      phone: fd.get("phone"),
      googleReviewUrl: fd.get("googleReviewUrl"),
    }),
  },
  async (data, { supabase, claims }) => {
    const googleReviewUrl = normalizeGoogleReviewUrl(data.googleReviewUrl);
    if (googleReviewUrl === "__invalid__") {
      return {
        success: false,
        error:
          "Đường dẫn đánh giá Google không hợp lệ (cần bắt đầu bằng http:// hoặc https://).",
      };
    }

    const { error } = await supabase.from("branches").insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      code: data.code,
      address: data.address || null,
      phone: data.phone || null,
      google_review_url: googleReviewUrl,
      branch_kind: "branch",
    });

    if (error) {
      console.error("[branches/actions:createBranch] Insert branch error:", error);
      if (error.code === "23505") {
        return {
          success: false,
          error: "Tên hoặc mã điểm vận hành đã tồn tại",
        };
      }
      if (error.code === "42703") {
        return {
          success: false,
          error:
            "Hệ thống chưa sẵn sàng để tạo hoặc sửa loại điểm vận hành.",
        };
      }
      return {
        success: false,
        error: "Không thể tạo điểm vận hành. Vui lòng thử lại.",
      };
    }

    revalidateSurfacePath("/branches");
    updateTag("branches-list");
    return { success: true };
  },
);

export const updateBranch = withFormAction(
  {
    roles: TENANT_STRATEGY_SETTINGS_ROLES,
    schema: updateBranchSchema,
    extract: (fd) => ({
      id: fd.get("id"),
      name: fd.get("name"),
      address: fd.get("address"),
      phone: fd.get("phone"),
      googleReviewUrl: fd.get("googleReviewUrl"),
    }),
  },
  async (data, { supabase, claims }) => {
    const googleReviewUrl = normalizeGoogleReviewUrl(data.googleReviewUrl);
    if (googleReviewUrl === "__invalid__") {
      return {
        success: false,
        error:
          "Đường dẫn đánh giá Google không hợp lệ (cần bắt đầu bằng http:// hoặc https://).",
      };
    }

    const { error } = await supabase
      .from("branches")
      .update({
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        google_review_url: googleReviewUrl,
        branch_kind: "branch",
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      console.error("[branches/actions:updateBranch] Update branch error:", error);
      if (error.code === "23505") {
        return { success: false, error: "Tên điểm vận hành đã tồn tại" };
      }
      if (error.code === "42703") {
        return {
          success: false,
          error:
            "Hệ thống chưa sẵn sàng để tạo hoặc sửa loại điểm vận hành.",
        };
      }
      return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
    }

    revalidateSurfacePath("/branches");
    updateTag("branches-list");
    return { success: true };
  },
);

export const toggleBranchActive = withAction(
  {
    roles: TENANT_STRATEGY_SETTINGS_ROLES,
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
      console.error("[branches/actions:toggleBranchActive] Update branch is_active status error:", error);
      return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
    }

    revalidateSurfacePath("/branches");
    updateTag("branches-list");
    return { success: true };
  },
);
