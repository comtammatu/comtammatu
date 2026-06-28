import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { PermissionsClient } from "./permissions-client";
import { OverviewTab } from "./overview-tab";
import { HistoryTab } from "./history-tab";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StaffPermissionsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Target profile (RLS: viewer must have staff:view or hr:view_employee)
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, phone, branch_id, position_id, is_active, positions(code)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  const [
    { data: branches },
    { data: permissionKeys },
    { data: templates },
    { data: grants },
    { data: position },
    { data: recentAudit },
    { data: branchRows },
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("permission_keys")
      .select("key, module, description, scope")
      .order("module")
      .order("key"),
    supabase
      .from("role_templates")
      .select("id, name, position_code, permission_keys")
      .order("name"),
    supabase
      .from("staff_permissions")
      .select(
        "id, branch_id, permission_key, source_template, granted_at, valid_until",
      )
      .eq("user_id", id)
      .order("permission_key"),
    profile.position_id
      ? supabase
          .from("positions")
          .select("code, label_vi")
          .eq("id", profile.position_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("permission_audit_log")
      .select(
        "id, action, permission_key, branch_id, at, actor_user_id, source_template_id",
      )
      .eq("target_user_id", id)
      .order("at", { ascending: false })
      .limit(50),
    supabase.from("branches").select("id, name").order("name"),
  ]);

  const branchList = branches ?? [];
  const permList = permissionKeys ?? [];
  const templateList = templates ?? [];
  const grantList = grants ?? [];
  const auditList = recentAudit ?? [];
  const positionLabel = position
    ? `${position.label_vi} (${position.code})`
    : messages.admin.staffPermissions.positionUnassigned;

  // Resolve actor names for the "Lịch sử" tab
  const actorIds = Array.from(
    new Set(auditList.map((a) => a.actor_user_id).filter(Boolean) as string[]),
  );
  const { data: actorProfiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameByUserId = new Map<string, string>(
    (actorProfiles ?? []).map((p) => [p.id, p.full_name]),
  );

  const branchNameById = new Map<number, string>(
    (branchRows ?? []).map((b) => [b.id, b.name]),
  );

  const defaultBranchName = profile.branch_id
    ? (branchNameById.get(profile.branch_id) ?? String(profile.branch_id))
    : messages.admin.staffPermissions.tenantWide;

  return (
    <AppPage>
      <AppPageHeader
        title={profile.full_name}
        description={messages.admin.staffPermissions.headerDescription(
          positionLabel,
          defaultBranchName,
        )}
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/hr/staff">
              <IconArrowLeft className="mr-1 size-4" />
              {messages.admin.staffPermissions.backToList}
            </Link>
          </Button>
        }
        badge={
          profile.is_active
            ? {
                children: messages.admin.staffPermissions.statusActive,
                variant: "success" as const,
              }
            : {
                children: messages.admin.staffPermissions.statusInactive,
                variant: "secondary" as const,
              }
        }
        tabs={
          <AppPageTabs
            items={[
              {
                value: "overview",
                label: messages.admin.staffPermissions.tabOverview,
              },
              {
                value: "permissions",
                label: messages.admin.staffPermissions.tabPermissions,
              },
              {
                value: "history",
                label: messages.admin.staffPermissions.tabHistory,
              },
            ]}
            defaultValue="overview"
          >
            <TabsContent value="overview">
              <OverviewTab
                fullName={profile.full_name}
                phone={profile.phone}
                positionLabel={positionLabel}
                defaultBranchName={defaultBranchName}
                positionCode={profile.positions?.code}
                isActive={profile.is_active ?? false}
              />
            </TabsContent>

            <TabsContent value="permissions">
              <PermissionsClient
                targetUserId={profile.id}
                targetFullName={profile.full_name}
                currentGrants={grantList.map((g) => ({
                  id: g.id,
                  branchId: g.branch_id,
                  permissionKey: g.permission_key,
                  sourceTemplate: g.source_template,
                  grantedAt: g.granted_at,
                  validUntil: g.valid_until,
                }))}
                branches={branchList.map((b) => ({
                  id: b.id,
                  name: b.name,
                  branchKind: b.branch_kind,
                }))}
                permissionKeys={permList.map((p) => ({
                  key: p.key,
                  module: p.module,
                  description: p.description,
                  scope: p.scope,
                }))}
                templates={templateList.map((t) => ({
                  id: t.id,
                  name: t.name,
                  positionCode: t.position_code,
                  permissionKeys: t.permission_keys,
                }))}
              />
            </TabsContent>

            <TabsContent value="history">
              <HistoryTab
                entries={auditList.map((a) => ({
                  id: a.id,
                  action: a.action,
                  permissionKey: a.permission_key,
                  branchId: a.branch_id,
                  at: a.at,
                  actorUserId: a.actor_user_id,
                }))}
                branchNameById={branchNameById}
                actorNameById={nameByUserId}
              />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
