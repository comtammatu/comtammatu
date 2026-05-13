"use server";

/**
 * Admin actions for HĐĐT archive:
 *   - getArchiveDownloadUrl(invoiceId, kind) — mint 5-min signed URL
 *     for /finance/invoices "Tải PDF/XML" buttons. Gate: finance:view.
 *   - forceArchiveTaxInvoice(invoiceId) — single-row manual archive.
 *     Gate: settings:tenant (matches reconcile force-resync siết).
 *   - backfillArchiveByDateRange(branchId, from, to) — bulk backfill
 *     for invoices issued before this feature shipped. Gate:
 *     settings:tenant. Enqueues + processes sequentially (respects
 *     per-row budget; not a true queue, just a bounded loop).
 *
 * Service-role client is used for Storage signed-URL minting + DB
 * writes. Permission checks happen HERE at the action layer.
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import {
  ARCHIVE_BUCKET,
  ARCHIVE_SIGNED_URL_TTL_SECONDS,
} from "@comtammatu/shared/hddt";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import {
  archiveSingleInvoice,
  type ArchiveCandidate,
} from "@lib/hddt-archive";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/admin/_lib/branch-scope";
import { logAudit } from "@/admin/_lib/audit";

const READ_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];
const WRITE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── getArchiveDownloadUrl ─── */

const downloadSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  kind: z.enum(["pdf", "xml"]),
});

export async function getArchiveDownloadUrl(
  invoiceId: number,
  kind: "pdf" | "xml",
): Promise<ActionResult> {
  const parsed = downloadSchema.safeParse({ invoiceId, kind });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    READ_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase: authSupabase, claims } = ctx;

  const { data: row, error: fetchErr } = await authSupabase
    .from("tax_invoices")
    .select("id, branch_id, pdf_url, xml_url, archived_at")
    .eq("id", parsed.data.invoiceId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !row) {
    return { success: false, error: "Hóa đơn không tồn tại." };
  }
  if (!(await canAccessBranch(authSupabase, claims, row.branch_id))) {
    return { success: false, error: "Không có quyền xem hóa đơn này." };
  }
  if (!row.archived_at) {
    return { success: false, error: "Hóa đơn chưa lưu trữ — chờ cron tải." };
  }

  const path = parsed.data.kind === "pdf" ? row.pdf_url : row.xml_url;
  if (!path) {
    return {
      success: false,
      error: `Không tìm thấy file ${parsed.data.kind.toUpperCase()}.`,
    };
  }

  // Service-role client to mint signed URL (RLS would otherwise force
  // a re-check we've already done above).
  const supabase = createServiceClient();
  const { data: signed, error: signErr } = await supabase.storage
    .from(ARCHIVE_BUCKET)
    .createSignedUrl(path, ARCHIVE_SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed) {
    return { success: false, error: "Không thể tạo link tải." };
  }

  return {
    success: true,
    data: {
      url: signed.signedUrl,
      kind: parsed.data.kind,
      expires_in: ARCHIVE_SIGNED_URL_TTL_SECONDS,
    },
  };
}

/* ─── forceArchiveTaxInvoice ─── */

const forceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
});

export async function forceArchiveTaxInvoice(
  invoiceId: number,
): Promise<ActionResult> {
  const enabled =
    (process.env["HDDT_ARCHIVE_ENABLED"] ?? "false") === "true";
  if (!enabled) {
    return {
      success: false,
      error: "Tính năng lưu trữ HĐĐT chưa được kích hoạt.",
    };
  }

  const parsed = forceSchema.safeParse({ invoiceId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    WRITE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase: authSupabase, claims, user } = ctx;

  const { data: row, error: fetchErr } = await authSupabase
    .from("tax_invoices")
    .select(
      "id, tenant_id, branch_id, status, invoice_number, provider, provider_ref, issued_at, archive_attempts, pdf_url",
    )
    .eq("id", parsed.data.invoiceId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !row) {
    return { success: false, error: "Hóa đơn không tồn tại." };
  }
  // Legal retention scope (TT78 §10): issued + replaced + cancelled
  // all need archived PDFs for tax audit. Per HDDT-ARCHIVE-INCLUDES-
  // REPLACED-AND-CANCELLED rule.
  if (
    row.status !== "issued" &&
    row.status !== "replaced" &&
    row.status !== "cancelled"
  ) {
    return {
      success: false,
      error: "Chỉ lưu trữ được HĐ đã phát hành / đã thay thế / đã hủy.",
    };
  }
  if (row.pdf_url) {
    return { success: false, error: "Hóa đơn đã được lưu trữ trước đó." };
  }
  if (!row.invoice_number || !row.provider_ref || !row.issued_at) {
    return {
      success: false,
      error: "Hóa đơn thiếu thông tin cần thiết (mã / providerRef / ngày phát hành).",
    };
  }
  if (row.provider === "skipped") {
    return { success: false, error: "Hóa đơn 'không bắt buộc' — không có gì để lưu." };
  }
  if (!(await canAccessBranch(authSupabase, claims, row.branch_id))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  ensureInvoiceProviderRegistered();
  const provider = getInvoiceProvider();
  if (!provider) {
    return { success: false, error: "Provider HĐĐT chưa được cấu hình." };
  }

  const supabase = createServiceClient();
  const candidate: ArchiveCandidate = {
    id: row.id,
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    invoice_number: row.invoice_number,
    provider: row.provider,
    provider_ref: row.provider_ref,
    issued_at: row.issued_at,
    archive_attempts: row.archive_attempts,
  };

  const outcome = await archiveSingleInvoice(
    supabase,
    provider,
    candidate,
    "manual",
    user.id,
  );

  await logAudit(authSupabase, {
    action: "archive",
    entityType: "tax_invoice",
    entityId: row.id,
    newData: { outcome },
  });

  return { success: true, data: { outcome } };
}

/* ─── backfillArchiveByDateRange ─── */

const backfillSchema = z.object({
  branchId: z.coerce.number().int().positive().nullable(),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

const BACKFILL_MAX_ROWS = 500;
const BACKFILL_BUDGET_MS = 60_000;

export async function backfillArchiveByDateRange(
  branchId: number | null,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const enabled =
    (process.env["HDDT_ARCHIVE_ENABLED"] ?? "false") === "true";
  if (!enabled) {
    return {
      success: false,
      error: "Tính năng lưu trữ HĐĐT chưa được kích hoạt.",
    };
  }

  const parsed = backfillSchema.safeParse({ branchId, startDate, endDate });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  if (parsed.data.startDate > parsed.data.endDate) {
    return { success: false, error: "Ngày bắt đầu sau ngày kết thúc." };
  }

  const ctx = await getAuthContextWithPermission(
    WRITE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase: authSupabase, claims, user } = ctx;

  if (
    parsed.data.branchId !== null &&
    !(await canAccessBranch(authSupabase, claims, parsed.data.branchId))
  ) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  ensureInvoiceProviderRegistered();
  const provider = getInvoiceProvider();
  if (!provider) {
    return { success: false, error: "Provider HĐĐT chưa được cấu hình." };
  }

  const supabase = createServiceClient();

  // Bounded loop — no true queue, just sequential drain. Caller can
  // re-invoke if BACKFILL_MAX_ROWS exhausted. The cron will catch
  // remainders eventually anyway.
  let query = supabase
    .from("tax_invoices")
    .select(
      "id, tenant_id, branch_id, invoice_number, provider, provider_ref, issued_at, archive_attempts",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["issued", "replaced", "cancelled"])
    .is("pdf_url", null)
    .neq("provider", "skipped")
    .not("invoice_number", "is", null)
    .not("provider_ref", "is", null)
    .gte("issued_at", parsed.data.startDate)
    .lte("issued_at", `${parsed.data.endDate}T23:59:59`)
    .order("issued_at", { ascending: true })
    .limit(BACKFILL_MAX_ROWS);

  if (parsed.data.branchId !== null) {
    query = query.eq("branch_id", parsed.data.branchId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không tải được danh sách hóa đơn." };
  }

  const startedAt = Date.now();
  const counters = {
    found: data?.length ?? 0,
    archived: 0,
    provider_error: 0,
    storage_error: 0,
    invalid_payload: 0,
    giveup: 0,
    no_change: 0,
    budget_exceeded: false,
  };

  for (const row of data ?? []) {
    if (Date.now() - startedAt > BACKFILL_BUDGET_MS) {
      counters.budget_exceeded = true;
      break;
    }
    if (!row.invoice_number || !row.provider_ref || !row.issued_at) continue;
    const outcome = await archiveSingleInvoice(
      supabase,
      provider,
      {
        id: row.id,
        tenant_id: row.tenant_id,
        branch_id: row.branch_id,
        invoice_number: row.invoice_number,
        provider: row.provider,
        provider_ref: row.provider_ref,
        issued_at: row.issued_at,
        archive_attempts: row.archive_attempts,
      },
      "backfill",
      user.id,
    );
    switch (outcome) {
      case "archived":
        counters.archived += 1;
        break;
      case "provider_error":
        counters.provider_error += 1;
        break;
      case "storage_error":
        counters.storage_error += 1;
        break;
      case "invalid_payload":
        counters.invalid_payload += 1;
        break;
      case "giveup":
        counters.giveup += 1;
        break;
      case "no_change":
        counters.no_change += 1;
        break;
      case "hash_mismatch":
        counters.provider_error += 1;
        break;
    }
  }

  await logAudit(authSupabase, {
    action: "archive_backfill",
    entityType: "tax_invoice",
    entityId: null,
    newData: {
      branch_id: parsed.data.branchId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      ...counters,
    },
  });

  return { success: true, data: counters };
}
