"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";
import { hasBranchKindSchema } from "../../_lib/branch-kind-schema";

const SETTINGS_ROLES: StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const branchSchema = z.object({
  name: z.string().min(1, { error: "Tên điểm vận hành không được để trống" }),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  branchKind: z.enum(["branch", "central_kitchen"]).default("branch"),
});

const updateBranchSchema = branchSchema.extend({
  id: z.coerce.number().int().positive(),
  branchKind: z.enum(["branch", "central_kitchen", "headquarters"]).default("branch"),
});

type BranchWritePayload = {
  tenant_id: number;
  name: string;
  address: string | null;
  phone: string | null;
  branch_kind?: "branch" | "central_kitchen" | "headquarters";
};

/* ─── Actions ─── */

export async function createBranch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    branchKind: formData.get("branchKind"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const branchKindSchemaAvailable = await hasBranchKindSchema(supabase);

  const branchPayload: BranchWritePayload = {
    tenant_id: claims.tenant_id,
    name: parsed.data.name,
    address: parsed.data.address || null,
    phone: parsed.data.phone || null,
  };
  if (branchKindSchemaAvailable) {
    branchPayload.branch_kind = parsed.data.branchKind;
  }

  const { error } = await supabase.from("branches").insert(branchPayload);

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

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

export async function updateBranch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateBranchSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    branchKind: formData.get("branchKind"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const branchKindSchemaAvailable = await hasBranchKindSchema(supabase);

  const { data: currentBranch, error: currentBranchError } = await supabase
    .from("branches")
    .select("is_headquarters")
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (currentBranchError || !currentBranch) {
    return { success: false, error: "Điểm vận hành không tồn tại" };
  }

  if (!currentBranch.is_headquarters && parsed.data.branchKind === "headquarters") {
    return {
      success: false,
      error: "Vui lòng dùng nút Đặt làm trụ sở chính để gán HQ.",
    };
  }

  const { error } = await supabase
    .from("branches")
    .update(
      branchKindSchemaAvailable
        ? ({
            name: parsed.data.name,
            address: parsed.data.address || null,
            phone: parsed.data.phone || null,
            branch_kind: currentBranch.is_headquarters
              ? "headquarters"
              : parsed.data.branchKind,
          } as BranchWritePayload)
        : ({
            name: parsed.data.name,
            address: parsed.data.address || null,
            phone: parsed.data.phone || null,
          } as Omit<BranchWritePayload, "tenant_id">),
    )
    .eq("id", parsed.data.id)
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

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

const idSchema = z.coerce.number().int().positive();

export async function toggleBranchActive(
  branchId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(branchId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Fetch current state
  const { data: branch } = await supabase
    .from("branches")
    .select("is_active")
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!branch) {
    return { success: false, error: "Điểm vận hành không tồn tại" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ is_active: !(branch.is_active ?? true) })
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}

export async function setHeadquarters(branchId: number): Promise<ActionResult> {
  const parsed = idSchema.safeParse(branchId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // Atomic RPC — avoids TOCTOU race from two separate UPDATEs
  const { error } = await supabase.rpc("set_headquarters", {
    p_branch_id: parsed.data,
  });

  if (error) {
    return { success: false, error: "Không thể cập nhật. Vui lòng thử lại." };
  }

  revalidatePath("/admin/settings/branches");
  return { success: true };
}
