/**
 * HĐĐT config-guard — fail-loud (audit HDDT-01).
 *
 * HĐĐT is MANDATORY (ND 70/2025). A production deploy with a malformed
 * COMPANY_TAX_CODE or missing SINVOICE_* credentials silently degrades the
 * per-order createTaxInvoice path into an INTERNAL DRAFT (no real e-invoice
 * ever reaches the tax authority). That must be impossible to miss.
 *
 * This module is the single source of truth for "is HĐĐT configured?" and is
 * consumed by:
 *   - /api/health (surfaces hddt: { ok, problems } so a probe/banner can alert)
 *   - createTaxInvoice draft fallback (emits a loud notification + log when an
 *     invoice silently lands in the no-provider draft branch)
 *
 * No secrets are returned — only booleans + problem codes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

/** MST (Vietnam tax code): 10 digits, optionally a 3-digit branch suffix. */
export const COMPANY_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;

const REQUIRED_SINVOICE_ENV = [
  "SINVOICE_USERNAME",
  "SINVOICE_PASSWORD",
  "SINVOICE_TEMPLATE_CODE",
  "SINVOICE_INVOICE_SERIES",
] as const;

export interface HddtConfigStatus {
  ok: boolean;
  /** Machine-readable problem codes; empty when ok. Never contains secrets. */
  problems: string[];
}

/**
 * Validate the HĐĐT provider configuration from the environment.
 *  - COMPANY_TAX_CODE must match the MST format.
 *  - All SINVOICE_* credentials must be present.
 */
export function checkHddtConfig(
  env: NodeJS.ProcessEnv = process.env,
): HddtConfigStatus {
  const problems: string[] = [];

  const taxCode = env["COMPANY_TAX_CODE"]?.trim();
  if (!taxCode) {
    problems.push("company_tax_code_missing");
  } else if (!COMPANY_TAX_CODE_REGEX.test(taxCode)) {
    problems.push("company_tax_code_invalid_format");
  }

  for (const key of REQUIRED_SINVOICE_ENV) {
    if (!env[key]?.trim()) {
      problems.push(`${key.toLowerCase()}_missing`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Emit a loud signal when a tax invoice silently falls into the no-provider
 * DRAFT branch on a deploy that is supposed to issue real HĐĐT. Logs to the
 * error stream (Vercel log drain) AND inserts a deduped critical notification
 * for owner/manager so a misconfigured deploy cannot quietly accumulate
 * internal-only drafts.
 *
 * Best-effort: a notification insert failure must never block invoice creation
 * (the draft row itself is still recorded for Finance recovery).
 */
export async function signalHddtDraftFallback(
  supabase: SupabaseClient<Database>,
  input: {
    tenantId: number;
    branchId: number;
    orderId: number;
  },
): Promise<void> {
  const config = checkHddtConfig();

  console.error("[hddt] config-guard: invoice fell to internal DRAFT branch", {
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    order_id: input.orderId,
    config_ok: config.ok,
    problems: config.problems,
    ts: new Date().toISOString(),
  });

  try {
    const { error } = await supabase.from("notifications").insert({
      tenant_id: input.tenantId,
      target_branch_id: input.branchId,
      target_roles: ["owner", "manager"],
      kind: "hddt.config_missing",
      severity: "critical",
      title: "HĐĐT chưa được cấu hình — hóa đơn chỉ là bản nháp nội bộ",
      body:
        "Hệ thống chưa kết nối nhà cung cấp HĐĐT (Viettel S-invoice). Hóa đơn " +
        "vừa tạo chỉ là bản nháp nội bộ, CHƯA phát hành hợp lệ. Vui lòng kiểm " +
        "tra cấu hình mã số thuế và thông tin S-invoice.",
      entity_type: "order",
      entity_id: input.orderId,
      action_url: "/admin/settings",
      // One alert per branch per day — avoids flooding on a busy misconfigured shift.
      dedup_key: `hddt_config_missing:${String(input.branchId)}:${new Date()
        .toISOString()
        .slice(0, 10)}`,
      meta: {
        order_id: input.orderId,
        branch_id: input.branchId,
        problems: config.problems,
        source: "create_tax_invoice_draft_fallback",
      },
    });
    // 23505 = dedup_key collision (already alerted today) — expected, ignore.
    if (error && error.code !== "23505") {
      console.error("[hddt] config-guard notification insert failed", {
        code: error.code,
      });
    }
  } catch (e) {
    console.error("[hddt] config-guard notification threw", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
