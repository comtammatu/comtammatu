"use server";

import { createClient as createServerClient } from "@comtammatu/database/supabase/server";
import type { createClient } from "@comtammatu/database/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Append a row to `audit_logs` via the `log_audit` RPC. Fire-and-forget —
 * does not throw on failure. Used by finance/payroll actions for
 * compliance tracking.
 *
 * `tenant_id` and `user_id` are forced server-side from auth claims by
 * the SECURITY DEFINER RPC; callers cannot pass them. Direct INSERT on
 * `audit_logs` is revoked.
 */
export async function logAudit(
  supabase: SupabaseServerClient,
  params: {
    action: string;
    entityType: string;
    entityId: number | null;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
  },
): Promise<void> {
  await supabase.rpc("log_audit", {
    p_action: params.action,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId ?? undefined,
    p_old: (params.oldData ?? null) as never,
    p_new: (params.newData ?? null) as never,
  });
}

/**
 * Explicit columns per rule UI-AUDIT-LOG-EXPLICIT-COLUMNS-IN-UI.
 * NO ip_address, NO old_data, NO new_data exposed to the UI layer.
 */
export type AuditLogRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  createdAt: string;
};

/**
 * Fetch audit_logs rows for a specific entity (entity_type + entity_id).
 * Explicit columns only — per rule UI-AUDIT-LOG-EXPLICIT-COLUMNS-IN-UI.
 * Does NOT read ip_address, old_data, or new_data.
 * Separate from finance/actions.ts:fetchAuditLogs — that file is frozen.
 */
export async function fetchEntityAuditLogs(
  entityType: string,
  entityId: number,
  limit = 50,
): Promise<AuditLogRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, user_id, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: String(row.entity_id ?? ""),
    userId: row.user_id,
    createdAt: row.created_at,
  }));
}
