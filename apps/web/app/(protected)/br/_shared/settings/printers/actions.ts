"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { SAMPLE_PAYLOADS } from "@comtammatu/print-render";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { messages } from "@lib/messages";

const MANAGER_ROLES = ["owner", "branch_manager"] as const;
const PRINT_TYPES = [
  "receipt",
  "provisional_bill",
  "shift_close_report",
  "kitchen_ticket",
  "cancel_ticket",
] as const;

const printerCopy = messages.settings.printers;

function toSupabaseJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

const printerSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  role: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, { error: "Nhập tên máy in" }).max(120),
  lan_host: z
    .string()
    .trim()
    .min(1, { error: printerCopy.networkAddressRequired }),
  lan_port: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  paper_width_mm: z.union([z.literal(58), z.literal(80)]).default(80),
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
    // Bitmap render path ignores code page; keep DB default for schema compatibility.
    p_code_page: "CP1258",
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
    return { success: false, error: "Mã máy in không hợp lệ" };
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

const testPrintSchema = z.object({
  printer_id: z.coerce.number().int().positive(),
});

export async function testPrintPrinter(
  input: z.infer<typeof testPrintSchema>,
): Promise<ActionResult<{ job_id: number }>> {
  const parsed = testPrintSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Mã máy in không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    MANAGER_ROLES,
    PERMISSION_KEYS.PRINTER_MANAGE,
  );
  if (!ctx) return { success: false, error: printerCopy.testPrintDenied };

  const { supabase, claims } = ctx;

  const { data: printer, error: printerError } = await supabase
    .from("printers")
    .select("id, branch_id, is_active, lan_host")
    .eq("id", parsed.data.printer_id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (printerError) {
    console.error(
      "[branch-settings/printers:testPrintPrinter] Load printer error:",
      printerError,
    );
    return { success: false, error: printerCopy.loadPrintersFailed };
  }
  if (!printer) {
    return { success: false, error: printerCopy.testPrintMissing };
  }
  if (
    claims.user_role === "branch_manager" &&
    printer.branch_id !== claims.branch_id
  ) {
    return { success: false, error: "Không có quyền với chi nhánh này" };
  }
  if (!printer.is_active) {
    return { success: false, error: printerCopy.testPrintInactive };
  }
  if (!printer.lan_host?.trim()) {
    return { success: false, error: printerCopy.testPrintMissingHost };
  }

  const sample = SAMPLE_PAYLOADS.provisional_bill;
  const payload = {
    ...(sample as unknown as Record<string, unknown>),
    template_version: "printer-test",
    note: printerCopy.testPrintSlipNote,
  };

  const { data: job, error } = await supabase
    .from("print_jobs")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: printer.branch_id,
      printer_id: printer.id,
      job_type: "provisional_bill",
      payload: toSupabaseJson(payload),
      idempotency_key: `printer-test:${printer.id}:${Date.now()}`,
    })
    .select("id")
    .single();

  if (error || !job) {
    if (error) {
      console.error(
        "[branch-settings/printers:testPrintPrinter] Insert print job error:",
        error,
      );
    }
    return { success: false, error: printerCopy.testPrintFailed };
  }

  return { success: true, data: { job_id: job.id } };
}
