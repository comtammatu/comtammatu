"use server";

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
