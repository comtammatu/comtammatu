import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { messages } from "@lib/messages";

import { BRANCH_VI } from "@comtammatu/shared/messages";
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

  if (params.action && ["grant", "revoke", "apply_template"].includes(params.action)) {
    query = query.eq("action", params.action);
  }
  if (params.target) {
    query = query.eq("target_user_id", params.target);
  }
  if (params.since) {
    query = query.gte("at", `${params.since}T00:00:00Z`);
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
    new Set(auditRows.flatMap((r) => [r.actor_user_id, r.target_user_id].filter(Boolean) as string[])),
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds)
    : { data: [] as { id: string; full_name: string }[] };

  const nameByUserId = new Map<string, string>(
    (profiles ?? []).map((p) => [p.id, p.full_name]),
  );

  const branches = branchesResult.data;
  const branchNameById = new Map<number, string>(
    (branches ?? []).map((b) => [b.id, b.name]),
  );
  const copy = messages.admin.staffAudit;

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {copy.recentItems(auditRows.length)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {auditRows.length === 0 ? (
            <AppEmptyState mode="no-data" description={copy.empty} compact />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead variant="eyebrow">
                    {copy.time}
                  </TableHead>
                  <TableHead variant="eyebrow">
                    {copy.action}
                  </TableHead>
                  <TableHead variant="eyebrow">
                    {copy.actor}
                  </TableHead>
                  <TableHead variant="eyebrow">
                    {copy.target}
                  </TableHead>
                  <TableHead variant="eyebrow">
                    Permission
                  </TableHead>
                  <TableHead variant="eyebrow">
                    {BRANCH_VI.long}
                  </TableHead>
                  <TableHead variant="eyebrow">
                    {copy.expires}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditRows.map((r) => {
                  const meta = (r.metadata ?? {}) as Record<string, unknown>;
                  const validUntil =
                    typeof meta.valid_until === "string" ? meta.valid_until : null;
                  const actionVariant: "default" | "outline" | "destructive" =
                    r.action === "revoke"
                      ? "destructive"
                      : r.action === "apply_template"
                        ? "outline"
                        : "default";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.at).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant}>{r.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {nameByUserId.get(r.actor_user_id) ?? (
                          <code className="text-xs">
                            {r.actor_user_id.slice(0, 8)}
                          </code>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link
                          href={`/admin/staff/${r.target_user_id}/permissions`}
                          className="hover:underline"
                        >
                          {nameByUserId.get(r.target_user_id) ?? (
                            <code className="text-xs">
                              {r.target_user_id.slice(0, 8)}
                            </code>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {r.permission_key}
                        </code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.branch_id === null
                          ? copy.tenantWide
                          : (branchNameById.get(r.branch_id) ??
                            `#${r.branch_id}`)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {validUntil
                          ? new Date(validUntil).toLocaleDateString("vi-VN")
                          : copy.forever}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppPage>
  );
}
