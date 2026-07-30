import { createClient as createServerClient } from "@comtammatu/database/supabase/server";
import type { createClient } from "@comtammatu/database/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Append a row to `audit_logs` via the `log_audit` RPC. Fire-and-forget.
 * `tenant_id` and `user_id` are forced server-side by the SECURITY DEFINER RPC.
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

export type AuditLogRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  actorName: string | null;
  createdAt: string;
};

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

  const rows = data ?? [];
  const userIds = [
    ...new Set(rows.flatMap((row) => (row.user_id ? [row.user_id] : []))),
  ];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorNameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: String(row.entity_id ?? ""),
    userId: row.user_id,
    actorName: row.user_id ? (actorNameById.get(row.user_id) ?? null) : null,
    createdAt: row.created_at,
  }));
}
