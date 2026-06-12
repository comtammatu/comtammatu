"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  materializeDocument,
  SAMPLE_PAYLOADS,
  type PrintKind,
  type TemplateContent,
} from "@comtammatu/print-render";
import { renderDocumentToPng } from "@comtammatu/print-render/png";
import { getAuthContextWithPermission } from "@/_lib/auth";

const TENANT_TEMPLATE_ROLES = ["owner", "super_manager"] as const;

const kindSchema = z.enum([
  "receipt",
  "provisional_bill",
  "kitchen_ticket",
  "cancel_ticket",
  "shift_close_report",
]);

const blockSchema = z.looseObject({
  type: z.enum([
    "text",
    "row",
    "divider",
    "spacer",
    "brandHeader",
    "branchInfo",
    "billMeta",
    "paymentMethod",
    "itemsTable",
    "totals",
    "cashChange",
    "note",
    "paymentQr",
    "footer",
    "kitchenItems",
    "cancelItems",
    "shiftCashReconciliation",
    "paymentBreakdown",
    "shiftOrderSummary",
    "shiftItemBreakdown",
    "shiftVarianceNotice",
    "shiftSignature",
  ]),
  text: z.string().max(512).optional(),
  left: z.string().max(512).optional(),
  right: z.string().max(512).optional(),
  heading: z.string().max(512).optional(),
  prefix: z.string().max(512).optional(),
  eyebrow: z.string().max(512).optional(),
  name: z.string().max(512).optional(),
  tagline: z.string().max(512).optional(),
  char: z.string().max(1).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional(),
  double: z.boolean().optional(),
  inverse: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  lines: z
    .union([
      z.number().int().min(1).max(5),
      z.array(z.string().max(512)).max(10),
    ])
    .optional(),
});

const contentSchema = z.object({
  blocks: z.array(blockSchema).min(1).max(160),
});

const saveSchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(1, { error: "Nhập tên bản mẫu" }).max(120),
  paper_width_mm: z.union([z.literal(58), z.literal(80)]).default(80),
  content: contentSchema,
});

const previewSchema = z.object({
  kind: kindSchema,
  content: contentSchema,
});

const testPrintSchema = z.object({
  kind: kindSchema,
  branch_id: z.coerce.number().int().positive(),
  content: contentSchema,
});

function templateContext() {
  return getAuthContextWithPermission(
    TENANT_TEMPLATE_ROLES,
    PERMISSION_KEYS.PRINTER_MANAGE,
  );
}

function toSupabaseJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export async function savePrintTemplate(
  input: z.infer<typeof saveSchema>,
): Promise<ActionResult<{ id: number; version: number }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await templateContext();
  if (!ctx) return { success: false, error: "Không có quyền sửa mẫu phiếu" };

  const { data, error } = await ctx.supabase.rpc(
    "save_print_template_version",
    {
      p_kind: parsed.data.kind,
      p_name: parsed.data.name,
      p_paper_width_mm: parsed.data.paper_width_mm,
      p_content: toSupabaseJson(parsed.data.content),
    },
  );

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("could not find the function")) {
      return {
        success: false,
        error:
          "Máy chủ chưa được cập nhật chức năng lưu mẫu (migration chưa apply).",
      };
    }
    return { success: false, error: "Không thể lưu mẫu phiếu" };
  }

  const result = data as { id?: number; version?: number } | null;
  revalidatePath("/admin/settings/printers/templates");
  return {
    success: true,
    data: { id: result?.id ?? 0, version: result?.version ?? 0 },
  };
}

export async function restorePrintTemplateDefault(
  kindInput: PrintKind,
): Promise<ActionResult<{ deactivated: number }>> {
  const parsed = kindSchema.safeParse(kindInput);
  if (!parsed.success) {
    return { success: false, error: "Loại phiếu không hợp lệ" };
  }

  const ctx = await templateContext();
  if (!ctx) return { success: false, error: "Không có quyền sửa mẫu phiếu" };

  const { data, error } = await ctx.supabase
    .from("print_template_versions")
    .update({ is_active: false })
    .eq("tenant_id", ctx.claims.tenant_id)
    .is("branch_id", null)
    .eq("kind", parsed.data)
    .eq("is_active", true)
    .select("id");

  if (error) {
    return { success: false, error: "Không thể khôi phục mẫu mặc định" };
  }

  revalidatePath("/admin/settings/printers/templates");
  return { success: true, data: { deactivated: data?.length ?? 0 } };
}

export async function previewPrintTemplate(
  input: z.infer<typeof previewSchema>,
): Promise<ActionResult<{ png: string }>> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Nội dung mẫu không hợp lệ",
    };
  }

  const ctx = await templateContext();
  if (!ctx) return { success: false, error: "Không có quyền xem mẫu phiếu" };

  try {
    const document = materializeDocument(
      parsed.data.kind,
      SAMPLE_PAYLOADS[parsed.data.kind] as unknown as Record<string, unknown>,
      parsed.data.content as TemplateContent,
    );
    const png = await renderDocumentToPng(document);
    return {
      success: true,
      data: { png: `data:image/png;base64,${png.toString("base64")}` },
    };
  } catch {
    return { success: false, error: "Không thể dựng bản xem trước" };
  }
}

export async function testPrintTemplate(
  input: z.infer<typeof testPrintSchema>,
): Promise<ActionResult<{ job_id: number }>> {
  const parsed = testPrintSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await templateContext();
  if (!ctx) return { success: false, error: "Không có quyền in thử" };

  const { kind, branch_id: branchId, content } = parsed.data;
  const preferredRole =
    kind === "kitchen_ticket" || kind === "cancel_ticket"
      ? "kitchen_1"
      : "receipt";

  const { data: printers, error: printersError } = await ctx.supabase
    .from("printers")
    .select("id, role")
    .eq("branch_id", branchId)
    .eq("is_active", true);

  if (printersError) {
    return { success: false, error: "Không thể tải máy in chi nhánh" };
  }
  const printer =
    (printers ?? []).find((p) => p.role === preferredRole) ?? printers?.[0];
  if (!printer) {
    return {
      success: false,
      error: "Chi nhánh chưa có máy in đang hoạt động",
    };
  }

  // Embed the draft document so the paper matches the on-screen preview
  // exactly; the attach trigger keeps payloads that already carry one.
  const document = materializeDocument(
    kind,
    SAMPLE_PAYLOADS[kind] as unknown as Record<string, unknown>,
    content as TemplateContent,
  );
  const payload = {
    ...(SAMPLE_PAYLOADS[kind] as unknown as Record<string, unknown>),
    template_version: "draft-test",
    document,
  };

  const { data: job, error } = await ctx.supabase
    .from("print_jobs")
    .insert({
      tenant_id: ctx.claims.tenant_id,
      branch_id: branchId,
      printer_id: printer.id,
      job_type: kind,
      payload: payload as never,
      idempotency_key: `template-test:${kind}:${branchId}:${Date.now()}`,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { success: false, error: "Không thể gửi phiếu in thử" };
  }

  return { success: true, data: { job_id: job.id } };
}
