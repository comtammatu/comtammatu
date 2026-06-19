"use server";

/**
 * Admin actions for HĐĐT archive:
 *   - getArchiveDownloadUrl(invoiceId, kind) — mint 5-min signed URL
 *     for /finance/invoices "Tải PDF/XML" buttons. Gate: finance:view.
 *
 * Service-role client is used for Storage signed-URL minting + DB
 * writes. Permission checks happen HERE at the action layer.
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  ARCHIVE_BUCKET,
  ARCHIVE_SIGNED_URL_TTL_SECONDS,
} from "@comtammatu/shared/hddt";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";

const READ_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

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

