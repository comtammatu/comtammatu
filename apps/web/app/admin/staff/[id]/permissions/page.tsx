import { notFound } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
      .limit(10),
  ]);

  const branchList = branches ?? [];
  const permList = permissionKeys ?? [];
  const templateList = templates ?? [];
  const grantList = grants ?? [];
  const auditList = recentAudit ?? [];
  const positionLabel = position
    ? `${position.label_vi} (${position.code})`
    : "Chưa gán";

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Button asChild variant="ghost" size="sm" className="-ml-3">
                <Link href="/admin/staff">
                  <IconArrowLeft className="mr-1 size-4" />
                  Quay lại danh sách
                </Link>
              </Button>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {profile.full_name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chức vụ: {positionLabel} · Legacy role:{" "}
                  <code>{profile.positions?.legacy_role_code ?? "—"}</code> · Branch mặc định:{" "}
                  {profile.branch_id ?? "tenant"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Nhật ký thay đổi (10 mục gần nhất)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có thay đổi.</p>
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
                      {a.action}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-normal">
                        {a.permission_key}
                      </code>
                      <span className="text-xs font-normal text-muted-foreground">
                        branch={a.branch_id ?? "tenant-wide"}
                      </span>
                    </ItemTitle>
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
        </CardContent>
      </Card>
    </div>
  );
}
