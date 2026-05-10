"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const TEMPLATE_ROLES = [
  "owner",
  "super_manager",
] as const satisfies readonly StaffRole[];

const TEMPLATE_KINDS = [
  "receipt",
  "provisional_bill",
  "kitchen_ticket",
  "cancel_ticket",
  "shift_close_report",
  "tax_invoice",
] as const;

const saveTemplateSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  branchId: z.coerce.number().int().positive().nullable(),
  name: z.string().trim().min(1, { error: "Nhập tên phiên bản mẫu in" }),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  fontProfile: z.string().trim().min(1, { error: "Nhập font profile" }),
  contentText: z
    .string()
    .trim()
    .min(2, { error: "Nhập nội dung JSON của mẫu in" }),
});

const activateTemplateSchema = z.object({
  id: z.coerce.number().int().positive(),
});

function revalidateTemplatePaths() {
  revalidatePath("/admin/settings/printers");
  revalidatePath("/admin/settings/printers/templates");
}

function parseTemplateContent(raw: string): Json | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as { blocks?: unknown }).blocks)
    ) {
      return null;
    }
    return parsed as Json;
  } catch {
    return null;
  }
}

async function ensureBranchBelongsToTenant(
  ctx: NonNullable<
    Awaited<ReturnType<typeof getAuthContextWithPermission>>
  >,
  branchId: number | null,
): Promise<boolean> {
  if (branchId == null) return true;
  const { data, error } = await ctx.supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("tenant_id", ctx.claims.tenant_id)
    .maybeSingle();
  return !error && data != null;
}

export async function savePrintTemplateVersion(
  input: z.input<typeof saveTemplateSchema>,
): Promise<ActionResult<{ id: number }>> {
  const parsed = saveTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const content = parseTemplateContent(parsed.data.contentText);
  if (content == null) {
    return {
      success: false,
      error: "JSON mẫu in phải là object và có mảng blocks",
      errorCode: "invalid_template_json",
    };
  }

  const ctx = await getAuthContextWithPermission(
    TEMPLATE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền sửa mẫu in" };
  }

  const branchOk = await ensureBranchBelongsToTenant(ctx, parsed.data.branchId);
  if (!branchOk) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const { data, error } = await ctx.supabase.rpc(
    "save_print_template_version",
    {
      p_kind: parsed.data.kind,
      p_scope_branch_id: parsed.data.branchId,
      p_name: parsed.data.name,
      p_paper_width_mm: parsed.data.paperWidthMm,
      p_font_profile: parsed.data.fontProfile,
      p_content: content,
      p_activate: true,
    },
  );

  if (error || data == null) {
    return {
      success: false,
      error: "Không thể lưu mẫu in",
      errorCode: "save_template_failed",
    };
  }

  revalidateTemplatePaths();
  return { success: true, data: { id: data } };
}

export async function activatePrintTemplateVersion(
  input: z.input<typeof activateTemplateSchema>,
): Promise<ActionResult> {
  const parsed = activateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Mẫu in không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    TEMPLATE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền kích hoạt mẫu in" };
  }

  const { data, error } = await ctx.supabase.rpc(
    "activate_print_template_version",
    {
      p_template_id: parsed.data.id,
    },
  );

  if (error || data !== true) {
    return {
      success: false,
      error: "Không thể kích hoạt mẫu in",
      errorCode: "activate_template_failed",
    };
  }

  revalidateTemplatePaths();
  return { success: true, data: null };
}
