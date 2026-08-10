import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  getStaffPermissionLabelVi,
} from "@lib/messages/control-surface";
import { PermissionAuditClient } from "./permission-audit-client";
import type { PermissionAuditTargetOption } from "./permission-audit-filters";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

interface Props {
  searchParams: Promise<{
    action?: string;
    target?: string;
    since?: string;
    branch?: string;
    q?: string;
  }>;
}

/**
 * Permission audit viewer — lists entries from `permission_audit_log`.
 * RLS gates visibility: only callers with `staff:assign_permission` or
 * `settings:tenant` see the tenant-wide log (plus self-rows always).
 */
export default async function PermissionAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const branchScope = resolveHrBranchScope(params.branch);
  const supabase = await createClient();

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

  const [auditResult, branchesResult, permissionKeysResult, templatesResult] =
    await Promise.all([
      query,
      supabase
        .from("branches")
        .select("id, name")
        .eq("branch_kind", "branch")
        .order("name"),
      supabase.from("permission_keys").select("key, description, module"),
      supabase.from("role_templates").select("id, position_code"),
    ]);
  const auditRows = auditResult.data ?? [];

  const userIds = Array.from(
    new Set(
      auditRows.flatMap(
        (r) => [r.actor_user_id, r.target_user_id].filter(Boolean) as string[],
      ),
    ),
  );
  const positionCodes = Array.from(
    new Set(
      (templatesResult.data ?? [])
        .map((template) => template.position_code)
        .filter((code): code is string => Boolean(code)),
    ),
  );

  const [{ data: profiles }, { data: positions }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    positionCodes.length
      ? supabase
          .from("positions")
          .select("code, label_vi")
          .in("code", positionCodes)
      : Promise.resolve({
          data: [] as { code: string; label_vi: string | null }[],
        }),
  ]);

  const nameByUserId = new Map<string, string>(
    (profiles ?? []).map((p) => [p.id, p.full_name]),
  );
  const positionLabelByCode = new Map(
    (positions ?? []).map((position) => [
      position.code,
      position.label_vi ?? UNKNOWN_LABEL_VI,
    ]),
  );
  const templateLabelById = new Map<number, string>();
  for (const template of templatesResult.data ?? []) {
    templateLabelById.set(
      template.id,
      template.position_code
        ? (positionLabelByCode.get(template.position_code) ??
          UNKNOWN_LABEL_VI)
        : UNKNOWN_LABEL_VI,
    );
  }

  const branches = branchesResult.data;
  const branchNameById = new Map<number, string>(
    (branches ?? []).map((b) => [b.id, b.name]),
  );
  const copy = messages.controlSurface.staffAudit;
  const permissionCopy = messages.controlSurface.staffPermissions;
  const permissionMetaByKey = new Map(
    (permissionKeysResult.data ?? []).map((permission) => [
      permission.key,
      {
        label: getStaffPermissionLabelVi(
          permission.key,
          permission.description ?? "",
        ),
        module: permission.module,
      },
    ]),
  );

  const targetOptionById = new Map<string, PermissionAuditTargetOption>();
  for (const r of auditRows) {
    const id = r.target_user_id ? String(r.target_user_id) : "";
    if (!id || targetOptionById.has(id)) continue;
    targetOptionById.set(id, {
      id,
      label: nameByUserId.get(id) ?? UNKNOWN_LABEL_VI,
    });
  }
  if (params.target && !targetOptionById.has(params.target)) {
    targetOptionById.set(params.target, {
      id: params.target,
      label: nameByUserId.get(params.target) ?? UNKNOWN_LABEL_VI,
    });
  }
  const targetOptions = Array.from(targetOptionById.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const q = params.q?.trim() || null;
  const hasServerFilters = Boolean(params.action || params.target || params.since);

  const auditDisplayRows = auditRows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const validUntil =
      typeof meta.valid_until === "string" ? meta.valid_until : null;
    const actorUserId = String(r.actor_user_id ?? "");
    const targetUserId = String(r.target_user_id ?? "");
    const permissionMeta = permissionMetaByKey.get(r.permission_key);
    const moduleKey = permissionMeta?.module ?? "";
    const workGroup =
      permissionCopy.permissionModuleLabels[moduleKey] ??
      permissionCopy.otherWorkArea;
    const templateLabel =
      r.source_template_id != null
        ? (templateLabelById.get(r.source_template_id) ?? null)
        : null;

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
      permissionLabel: permissionMeta?.label ?? UNKNOWN_LABEL_VI,
      workGroup,
      templateLabel,
      action: r.action,
      at: r.at,
      validUntil,
    };
  });

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        breadcrumb={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            render={
              <Link
                href={withHrBranchScope(
                  "/hr?view=accounts",
                  branchScope,
                )}
              />
            }
          >
            <IconArrowLeft className="mr-1 size-4" />
            {copy.backToStaff}
          </Button>
        }
      />

      <PermissionAuditClient
        rows={auditDisplayRows}
        filterValue={{
          action: params.action ?? null,
          target: params.target ?? null,
          since: params.since ?? null,
          q,
        }}
        targetOptions={targetOptions}
        branchScope={branchScope}
        hasServerFilters={hasServerFilters}
        listTitle={
          auditDisplayRows.length > 0
            ? copy.recentItems(auditDisplayRows.length)
            : undefined
        }
      />
    </AppPage>
  );
}
