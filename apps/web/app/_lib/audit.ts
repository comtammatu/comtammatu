import { createClient as createServerClient } from "@comtammatu/database/supabase/server";
import type { createClient } from "@comtammatu/database/supabase/server";
import { resolveEntityHref } from "@lib/entity-href";

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

export type TenantAuditLogRow = AuditLogRow & {
  entityLabel: string | null;
  href: string | null;
};

export type TenantAuditLogDetail = TenantAuditLogRow & {
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
};

async function resolveActorNames(
  supabase: SupabaseServerClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  return new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name]),
  );
}

function mapAuditRows(
  rows: Array<{
    id: number;
    action: string;
    entity_type: string;
    entity_id: number | null;
    user_id: string | null;
    created_at: string;
  }>,
  actorNameById: Map<string, string>,
): AuditLogRow[] {
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
  const actorNameById = await resolveActorNames(supabase, userIds);
  return mapAuditRows(rows, actorNameById);
}

/** Owner/system-log deep links always use the L0 control plane. */
export function auditEntityHref(
  entityType: string,
  entityId: string,
): string | null {
  return resolveEntityHref({
    entityType,
    entityId,
    plane: "control",
  });
}

async function resolveEntityLabels(
  supabase: SupabaseServerClient,
  rows: AuditLogRow[],
): Promise<Map<string, string>> {
  const byType = new Map<string, number[]>();
  for (const row of rows) {
    const id = Number(row.entityId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const list = byType.get(row.entityType) ?? [];
    list.push(id);
    byType.set(row.entityType, list);
  }

  const labels = new Map<string, string>();
  const key = (entityType: string, id: number) => `${entityType}:${id}`;

  const unique = (ids: number[]) => [...new Set(ids)];

  const grnIds = unique(byType.get("goods_received_note") ?? []);
  if (grnIds.length) {
    const { data } = await supabase
      .from("goods_received_notes")
      .select("id, grn_number")
      .in("id", grnIds);
    for (const row of data ?? []) {
      labels.set(key("goods_received_note", row.id), row.grn_number);
    }
  }

  const transferIds = unique(byType.get("stock_transfer") ?? []);
  if (transferIds.length) {
    const { data } = await supabase
      .from("stock_transfers")
      .select("id, transfer_number")
      .in("id", transferIds);
    for (const row of data ?? []) {
      labels.set(key("stock_transfer", row.id), row.transfer_number);
    }
  }

  const requestIds = unique(byType.get("stock_request") ?? []);
  if (requestIds.length) {
    const { data } = await supabase
      .from("stock_requests")
      .select("id, request_number")
      .in("id", requestIds);
    for (const row of data ?? []) {
      labels.set(key("stock_request", row.id), row.request_number);
    }
  }

  const issueIds = unique(byType.get("stock_issue") ?? []);
  if (issueIds.length) {
    const { data } = await supabase
      .from("stock_issues")
      .select("id, issue_number")
      .in("id", issueIds);
    for (const row of data ?? []) {
      labels.set(key("stock_issue", row.id), row.issue_number);
    }
  }

  const stocktakeIds = unique(byType.get("stocktake_session") ?? []);
  if (stocktakeIds.length) {
    const { data } = await supabase
      .from("stocktake_sessions")
      .select("id, session_number")
      .in("id", stocktakeIds);
    for (const row of data ?? []) {
      labels.set(key("stocktake_session", row.id), row.session_number);
    }
  }

  return labels;
}

export async function fetchTenantAuditLogs(params: {
  sinceIso?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  actorUserId?: string | null;
  limit?: number;
}): Promise<TenantAuditLogRow[]> {
  const supabase = await createServerClient();
  // List stays narrow: never pull old_data/new_data blobs into the table payload.
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 200);

  if (params.sinceIso) {
    query = query.gte("created_at", params.sinceIso);
  }
  if (params.entityType) {
    query = query.eq("entity_type", params.entityType);
  }
  if (params.entityId != null) {
    query = query.eq("entity_id", params.entityId);
  }
  if (params.actorUserId) {
    query = query.eq("user_id", params.actorUserId);
  }

  const { data } = await query;
  const rows = data ?? [];
  const userIds = [
    ...new Set(rows.flatMap((row) => (row.user_id ? [row.user_id] : []))),
  ];
  const actorNameById = await resolveActorNames(supabase, userIds);
  const mapped = mapAuditRows(rows, actorNameById);
  const entityLabels = await resolveEntityLabels(supabase, mapped);

  return mapped.map((row) => {
    const numericId = Number(row.entityId);
    const entityLabel =
      Number.isFinite(numericId) && numericId > 0
        ? (entityLabels.get(`${row.entityType}:${numericId}`) ?? null)
        : null;
    return {
      ...row,
      entityLabel,
      href: auditEntityHref(row.entityType, row.entityId),
    };
  });
}

/**
 * Owner/Security evidence sheet: loads JSON diffs only for one selected row.
 */
export async function fetchTenantAuditLogDetail(
  id: number,
): Promise<TenantAuditLogDetail | null> {
  if (!Number.isFinite(id) || id <= 0) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, user_id, created_at, old_data, new_data, ip_address",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const actorNameById = await resolveActorNames(
    supabase,
    data.user_id ? [data.user_id] : [],
  );
  const mapped = mapAuditRows([data], actorNameById);
  const row = mapped[0];
  if (!row) return null;

  const entityLabels = await resolveEntityLabels(supabase, [row]);
  const numericId = Number(row.entityId);
  const entityLabel =
    Number.isFinite(numericId) && numericId > 0
      ? (entityLabels.get(`${row.entityType}:${numericId}`) ?? null)
      : null;

  const oldData = isJsonRecord(data.old_data) ? data.old_data : null;
  const newData = isJsonRecord(data.new_data) ? data.new_data : null;

  return {
    ...row,
    entityLabel,
    href: auditEntityHref(row.entityType, row.entityId),
    oldData,
    newData,
    ipAddress: data.ip_address ?? null,
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
