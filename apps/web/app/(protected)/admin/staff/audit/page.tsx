import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { PermissionAuditTable } from "./permission-audit-table";

interface Props {
  searchParams: Promise<{
    action?: string;
    target?: string; // user_id
    since?: string; // YYYY-MM-DD
  }>;
}

/**
 * Permission audit viewer — lists entries from `permission_audit_log`.
 * RLS gates visibility: only callers with `staff:assign_permission` or
 * `settings:tenant` see the tenant-wide log (plus self-rows always).
 */
export default async function PermissionAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch audit rows (RLS-filtered) — newest first, up to 200
  let query = supabase
    .from("permission_audit_log")
    .select(
      "id, tenant_id, actor_user_id, target_user_id, branch_id, permission_key, action, source_template_id, metadata, at",
    )
    .order("at", { ascending: false })
    .limit(200);

  if (
    params.action &&
    ["grant", "revoke", "apply_template"].includes(params.action)
  ) {
    query = query.eq("action", params.action);
  }
  if (params.target) {
    query = query.eq("target_user_id", params.target);
  }
  if (params.since) {
    query = query.gte("at", getVNDayUtcRange(params.since).startIso);
  }

  // Audit log + branches list have no dependency on each other; profile
  // lookup needs the userIds from the audit rows, so it stays sequential.
  // Running audit + branches in parallel saves one RTT off TTFB.
  const [auditResult, branchesResult] = await Promise.all([
    query,
    supabase.from("branches").select("id, name").order("name"),
  ]);
  const auditRows = auditResult.data ?? [];

  // Look up actor + target names (bulk)
  const userIds = Array.from(
    new Set(
      auditRows.flatMap(
        (r) => [r.actor_user_id, r.target_user_id].filter(Boolean) as string[],
      ),
    ),
  );
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string }[] };

  const nameByUserId = new Map<string, string>(
    (profiles ?? []).map((p) => [p.id, p.full_name]),
  );

  const branches = branchesResult.data;
  const branchNameById = new Map<number, string>(
    (branches ?? []).map((b) => [b.id, b.name]),
  );
  const copy = messages.admin.staffAudit;
  const auditDisplayRows = auditRows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const validUntil =
      typeof meta.valid_until === "string" ? meta.valid_until : null;
    const actorUserId = String(r.actor_user_id ?? "");
    const targetUserId = String(r.target_user_id ?? "");

    return {
      id: r.id,
      actorUserId,
      actorName: nameByUserId.get(actorUserId) ?? null,
      targetUserId,
      targetName: nameByUserId.get(targetUserId) ?? null,
      branchId: r.branch_id,
      branchName:
        r.branch_id === null ? null : (branchNameById.get(r.branch_id) ?? null),
      permissionKey: r.permission_key,
      action: r.action,
      at: r.at,
      validUntil,
    };
  });

  return (
    <AppPage>
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/admin/staff">
              <IconArrowLeft className="mr-1 size-4" />
              {copy.backToStaff}
            </Link>
          </Button>
        }
      />

      <AppSection title={copy.recentItems(auditRows.length)} contentFlush>
        <PermissionAuditTable rows={auditDisplayRows} />
      </AppSection>
    </AppPage>
  );
}
