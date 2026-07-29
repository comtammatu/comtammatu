"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const MANAGER_ROLES = ["owner", "branch_manager"] as const;
const PRINT_TYPES = [
  "receipt",
  "provisional_bill",
  "shift_close_report",
  "kitchen_ticket",
  "cancel_ticket",
] as const;

const printerSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  role: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, { error: "Nhập tên máy in" }).max(120),
  lan_host: z.string().trim().min(1, { error: "Nhập LAN host" }),
  lan_port: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  paper_width_mm: z.union([z.literal(58), z.literal(80)]).default(80),
  code_page: z.string().trim().default("CP1258"),
  is_active: z.boolean().default(true),
  print_types: z.array(z.enum(PRINT_TYPES)).default([]),
  category_ids: z.array(z.coerce.number().int().positive()).default([]),
});

type PrinterInput = z.infer<typeof printerSchema>;

function revalidatePrinterPaths(branchId: number) {
  revalidatePath(`/br/${branchId}/settings/printers`);
}

export async function upsertPrinter(
  input: PrinterInput & { id?: number },
): Promise<ActionResult<{ id: number }>> {
  const parsed = printerSchema.safeParse(input);
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

  if (
    claims.user_role === "branch_manager" &&
    (claims.branch_id == null || parsed.data.branch_id !== claims.branch_id)
  ) {
    return { success: false, error: "Không có quyền với chi nhánh này" };
  }

  const { data, error } = await supabase.rpc("upsert_printer_with_routes", {
    p_printer_id: input.id,
    p_branch_id: parsed.data.branch_id,
    p_role: parsed.data.role ?? "custom",
    p_name: parsed.data.name,
    p_lan_host: parsed.data.lan_host,
    p_lan_port: parsed.data.lan_port ?? 9100,
    p_paper_width_mm: parsed.data.paper_width_mm,
    p_code_page: parsed.data.code_page,
    p_is_active: parsed.data.is_active,
    p_print_types: parsed.data.print_types,
    p_category_ids: parsed.data.category_ids,
  });

  if (error || data == null) {
    if (error) {
      console.error(
        "[branch-settings/printers:upsertPrinter] RPC upsert_printer_with_routes error:",
        error,
      );
    }
    const msg = String(error?.message ?? "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return {
        success: false,
        error: "Chi nhánh đã có máy in cùng tên",
      };
    }
    if (msg.includes("category")) {
      return { success: false, error: "Danh mục gắn máy in không hợp lệ" };
    }
    if (msg.includes("branch")) {
      return { success: false, error: "Không có quyền với chi nhánh này" };
    }
    return { success: false, error: "Không thể lưu máy in" };
  }

  revalidatePrinterPaths(parsed.data.branch_id);
  return { success: true, data: { id: data } };
}

export async function deletePrinter(id: number): Promise<ActionResult> {
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
    console.error(
      "[branch-settings/printers:deletePrinter] Delete printer error:",
      error,
    );
    return { success: false, error: "Không thể xóa máy in" };
  }
  revalidatePrinterPaths(existing.branch_id);
  return { success: true, data: null };
}
