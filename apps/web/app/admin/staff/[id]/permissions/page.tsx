import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppPage, AppPageHeader, AppSection, AppEmptyState } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { PermissionsClient } from "./permissions-client";

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
      "id, full_name, phone, branch_id, position_id, is_active, positions(legacy_role_code)",
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
      .select("id, branch_id, permission_key, source_template, granted_at, valid_until")
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
      .select("id, action, permission_key, branch_id, at, actor_user_id, source_template_id")
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
    : "Chưa gán";

  // Resolve actor names for Lịch sử tab
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
    : "tenant-wide";

  return (
    <AppPage>
      <AppPageHeader
        title={profile.full_name}
        description={`Chức vụ: ${positionLabel} · Chi nhánh mặc định: ${defaultBranchName}`}
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/admin/staff">
              <IconArrowLeft className="mr-1 size-4" />
              Quay lại danh sách
            </Link>
          </Button>
        }
        badge={
          profile.is_active
            ? { children: "Đang hoạt động", variant: "success" as const }
            : { children: "Ngưng hoạt động", variant: "secondary" as const }
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "permissions", label: "Quyền" },
              { value: "history", label: "Lịch sử" },
            ]}
            defaultValue="overview"
          >
            <TabsContent value="overview" className="mt-4">
              <AppSection title="Thông tin nhân viên">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Họ tên</dt>
                    <dd className="mt-0.5 text-sm">{profile.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Số điện thoại</dt>
                    <dd className="mt-0.5 font-mono text-sm">{profile.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Chức vụ</dt>
                    <dd className="mt-0.5 text-sm">{positionLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Chi nhánh mặc định</dt>
                    <dd className="mt-0.5 text-sm">{defaultBranchName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Legacy role</dt>
                    <dd className="mt-0.5 font-mono text-sm">
                      {profile.positions?.legacy_role_code ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Trạng thái</dt>
                    <dd className="mt-0.5">
                      <Badge variant={profile.is_active ? "success" : "secondary"}>
                        {profile.is_active ? "Đang hoạt động" : "Ngưng hoạt động"}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </AppSection>
            </TabsContent>

            <TabsContent value="permissions" className="mt-4">
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

            <TabsContent value="history" className="mt-4">
              <AppSection title={`Lịch sử thay đổi (${auditList.length} mục gần nhất)`}>
                {auditList.length === 0 ? (
                  <AppEmptyState mode="no-data" description="Chưa có thay đổi quyền hạn." compact />
                ) : (
                  <ItemGroup>
                    {auditList.map((a) => (
                      <Item key={a.id} variant="outline" size="sm">
                        <ItemContent>
                          <ItemTitle
                            className={
                              a.action === "revoke"
                                ? "text-destructive"
                                : undefined
                            }
                          >
                            <Badge
                              variant={
                                a.action === "revoke"
                                  ? "destructive"
                                  : a.action === "apply_template"
                                    ? "outline"
                                    : "default"
                              }
                              className="mr-2 text-xs"
                            >
                              {a.action}
                            </Badge>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-normal">
                              {a.permission_key}
                            </code>
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {a.branch_id === null
                                ? "tenant-wide"
                                : (branchNameById.get(a.branch_id) ?? `branch #${a.branch_id}`)}
                            </span>
                          </ItemTitle>
                          <p className="text-xs text-muted-foreground">
                            {nameByUserId.get(a.actor_user_id) ?? (
                              <code>{a.actor_user_id.slice(0, 8)}</code>
                            )}
                          </p>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.at).toLocaleString("vi-VN")}
                          </span>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </AppSection>
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
