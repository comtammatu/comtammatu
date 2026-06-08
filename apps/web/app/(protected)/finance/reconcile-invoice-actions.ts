"use server";

/**
 * Admin manual force-resync for a single HĐĐT row.
 *
 * Counterpart to /api/cron/hddt-reconcile. Both share
 * apps/web/lib/hddt-reconcile.ts::reconcileSingleInvoice().
 *
 * Permission: settings:tenant (owner/manager only — per owner
 * decision 2026-05-13). Reconcile is sensitive enough that we siết
 * gating to the same level as cancelTaxInvoice.
 *
 * Feature flag: HDDT_RECONCILE_ENABLED=true required.
 *
 * Service-role client is used for the privileged DB ops (state machine
 * RPC + reconcile_run_log insert). Permission is enforced HERE before
 * the service-role escalation.
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { reconcileSingleInvoice } from "@lib/hddt-reconcile";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { logAudit } from "@/_lib/audit";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "manager"];

const inputSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
});

export async function forceResyncTaxInvoice(
  invoiceId: number,
): Promise<ActionResult> {
  const enabled = (process.env["HDDT_RECONCILE_ENABLED"] ?? "false") === "true";
  if (!enabled) {
    return {
      success: false,
      error: "Tính năng đồng bộ HĐĐT chưa được kích hoạt.",
    };
  }

  const parsed = inputSchema.safeParse({ invoiceId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase: authSupabase, claims, user } = ctx;

  const { data: row, error: fetchErr } = await authSupabase
    .from("tax_invoices")
    .select(
      "id, tenant_id, branch_id, status, provider, provider_ref, signing_started_at, invoice_kind",
    )
    .eq("id", parsed.data.invoiceId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !row) {
    return { success: false, error: "Hóa đơn không tồn tại." };
  }

  if (row.status !== "signing" && row.status !== "submitted") {
    return {
      success: false,
      error: "Chỉ đồng bộ được hóa đơn đang chờ ('signing' hoặc 'submitted').",
    };
  }
  if (!row.provider_ref) {
    return {
      success: false,
      error: "Hóa đơn chưa có mã giao dịch — không thể đồng bộ.",
    };
  }
  if (row.provider === "skipped") {
    return {
      success: false,
      error: "Hóa đơn 'không bắt buộc' — không có gì để đồng bộ.",
    };
  }
  if (!row.signing_started_at) {
    return {
      success: false,
      error: "Hóa đơn chưa khởi tạo ký số — không có gì để đồng bộ.",
    };
  }
  if (
    row.invoice_kind !== "per_order" &&
    row.invoice_kind !== "daily_summary"
  ) {
    return {
      success: false,
      error: `Loại hóa đơn không hợp lệ: ${row.invoice_kind}`,
    };
  }

  if (!(await canAccessBranch(authSupabase, claims, row.branch_id))) {
    return {
      success: false,
      error: "Không có quyền đồng bộ hóa đơn chi nhánh này.",
    };
  }

  ensureInvoiceProviderRegistered();
  const provider = getInvoiceProvider();
  if (!provider) {
    return { success: false, error: "Provider HĐĐT chưa được cấu hình." };
  }

  const supabase = createServiceClient();

  const outcome = await reconcileSingleInvoice(
    supabase,
    provider,
    {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      status: row.status,
      provider: row.provider,
      provider_ref: row.provider_ref,
      signing_started_at: row.signing_started_at,
      invoice_kind: row.invoice_kind,
    },
    "manual",
    user.id,
    Date.now(),
  );

  await logAudit(authSupabase, {
    action: "reconcile",
    entityType: "tax_invoice",
    entityId: row.id,
    newData: { outcome, before_status: row.status },
  });

  return {
    success: true,
    data: { outcome },
  };
}
