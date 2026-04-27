"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const MANAGER_ROLES = ["owner", "super_manager", "branch_manager"] as const;

const printerBaseSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  role: z.enum(["receipt", "kitchen_1", "kitchen_2"]),
  name: z.string().trim().min(1, { error: "Nhập tên máy in" }),
  connection_type: z.enum(["lan", "usb"]),
  lan_host: z.string().trim().nullable().optional(),
  lan_port: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  usb_vendor_id: z.string().trim().nullable().optional(),
  usb_product_id: z.string().trim().nullable().optional(),
  paper_width_mm: z.union([z.literal(58), z.literal(80)]).default(80),
  code_page: z.string().trim().default("CP1258"),
  is_active: z.boolean().default(true),
});

const createPrinterSchema = printerBaseSchema.refine(
  (v) =>
    (v.connection_type === "lan" && !!v.lan_host) ||
    (v.connection_type === "usb" && !!v.usb_vendor_id),
  { error: "Cung cấp LAN host hoặc USB vendor ID" },
);

type PrinterInput = z.infer<typeof createPrinterSchema>;

function revalidatePrinterPaths(branchId: number) {
  revalidatePath("/admin/settings/printers");
  revalidatePath(`/br/${branchId}/settings/printers`);
}

export async function upsertPrinter(
  input: PrinterInput & { id?: number },
): Promise<ActionResult<{ id: number }>> {
  const parsed = createPrinterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    MANAGER_ROLES,
    PERMISSION_KEYS.PRINTER_MANAGE,
  );
  if (!ctx) return { success: false, error: "Không có quyền quản lý máy in" };

  const { supabase, claims } = ctx;

  // Branch Manager can only write to their own branch.
  if (
    claims.user_role === "branch_manager" &&
    (claims.branch_id == null || parsed.data.branch_id !== claims.branch_id)
  ) {
    return { success: false, error: "Không có quyền với chi nhánh này" };
  }

  const payload = {
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branch_id,
    role: parsed.data.role,
    name: parsed.data.name,
    connection_type: parsed.data.connection_type,
    lan_host: parsed.data.connection_type === "lan" ? parsed.data.lan_host : null,
    lan_port:
      parsed.data.connection_type === "lan"
        ? (parsed.data.lan_port ?? 9100)
        : null,
    usb_vendor_id:
      parsed.data.connection_type === "usb" ? parsed.data.usb_vendor_id : null,
    usb_product_id:
      parsed.data.connection_type === "usb"
        ? (parsed.data.usb_product_id ?? null)
        : null,
    paper_width_mm: parsed.data.paper_width_mm,
    code_page: parsed.data.code_page,
    is_active: parsed.data.is_active,
  };

  if (input.id) {
    // Pre-fetch row to verify ownership + prevent cross-branch hijack.
    const { data: existing } = await supabase
      .from("printers")
      .select("branch_id")
      .eq("id", input.id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    if (!existing) {
      return { success: false, error: "Máy in không tồn tại" };
    }
    if (
      claims.user_role === "branch_manager" &&
      existing.branch_id !== claims.branch_id
    ) {
      return { success: false, error: "Không có quyền với chi nhánh này" };
    }
    if (existing.branch_id !== parsed.data.branch_id) {
      return {
        success: false,
        error: "Không được chuyển máy in sang chi nhánh khác",
      };
    }

    const { data, error } = await supabase
      .from("printers")
      .update(payload)
      .eq("id", input.id)
      .eq("tenant_id", claims.tenant_id)
      .select("id")
      .single();
    if (error || !data) {
      return { success: false, error: "Không thể cập nhật máy in" };
    }
    revalidatePrinterPaths(parsed.data.branch_id);
    return { success: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("printers")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return {
        success: false,
        error: "Chi nhánh đã có máy in cho vai trò này",
      };
    }
    return { success: false, error: "Không thể thêm máy in" };
  }
  revalidatePrinterPaths(parsed.data.branch_id);
  return { success: true, data: { id: data.id } };
}

export async function deletePrinter(
  id: number,
): Promise<ActionResult> {
  const parsed = z.coerce.number().int().positive().safeParse(id);
  if (!parsed.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    MANAGER_ROLES,
    PERMISSION_KEYS.PRINTER_MANAGE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data: existing } = await supabase
    .from("printers")
    .select("branch_id")
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "Máy in không tồn tại" };
  }
  if (
    claims.user_role === "branch_manager" &&
    existing.branch_id !== claims.branch_id
  ) {
    return { success: false, error: "Không có quyền với chi nhánh này" };
  }

  const { error } = await supabase
    .from("printers")
    .delete()
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id);
  if (error) {
    return { success: false, error: "Không thể xóa máy in" };
  }
  revalidatePrinterPaths(existing.branch_id);
  return { success: true, data: null };
}
