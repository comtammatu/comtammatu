import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
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
      "id, full_name, phone, branch_id, position_id, is_active, positions(code)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  const [
    { data: branches },
    { data: permissionKeys },
    { data: grants },
    { data: position },
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
    supabase.from("branches").select("id, name").order("name"),
  ]);

  const branchList = branches ?? [];
  const permList = permissionKeys ?? [];
  const grantList = grants ?? [];
  const positionLabel = position
    ? `${position.label_vi} (${position.code})`
    : "Chưa gán";

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
            ]}
            defaultValue="overview"
          >
            <TabsContent value="overview" className="mt-4">
              <AppSection title="Thông tin nhân viên">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Họ tên
                    </dt>
                    <dd className="mt-0.5 text-sm">{profile.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Số điện thoại
                    </dt>
                    <dd className="mt-0.5 font-mono text-sm">
                      {profile.phone ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Chức vụ
                    </dt>
                    <dd className="mt-0.5 text-sm">{positionLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Chi nhánh mặc định
                    </dt>
                    <dd className="mt-0.5 text-sm">{defaultBranchName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Role
                    </dt>
                    <dd className="mt-0.5 font-mono text-sm">
                      {staffRoleFromPositionCode(profile.positions?.code)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Trạng thái
                    </dt>
                    <dd className="mt-0.5">
                      <Badge
                        variant={profile.is_active ? "success" : "secondary"}
                      >
                        {profile.is_active
                          ? "Đang hoạt động"
                          : "Ngưng hoạt động"}
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
              />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
