/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: security role binding surface */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MODULE_ACL, PERMISSION_KEYS, isOwnerPositionCode } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { getAuthContextWithPermission, probePermission } from "@/_lib/auth";
import {
  RoleBindingsClient,
  type AccessRole,
  type RoleBinding,
} from "./role-bindings-client";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

const STAFF_ROLES = MODULE_ACL.staff.allowedRoles;

export default async function StaffPermissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { id } = await params;
  const branchScope = resolveHrBranchScope((await searchParams).branch);
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.AUTH_BINDING_READ,
  );
  if (!ctx) notFound();

  const [
    profileResult,
    branchesResult,
    rolesResult,
    bindingsResult,
    canManage,
  ] = await Promise.all([
    ctx.supabase
      .from("profiles")
      .select("id, full_name, is_active, positions(code, label_vi)")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("id", id)
      .maybeSingle(),
    ctx.supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    ctx.supabase
      .from("auth_access_roles")
      .select("code, label_vi, allowed_scope")
      .order("label_vi"),
    ctx.supabase
      .from("auth_role_bindings")
      .select("id, role_code, branch_id, granted_at")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("user_id", id)
      .is("valid_until", null)
      .order("granted_at"),
    probePermission(ctx, PERMISSION_KEYS.AUTH_BINDING_MANAGE),
  ]);

  const profile = profileResult.data;
  if (!profile) notFound();
  const position = profile.positions as {
    code: string | null;
    label_vi: string | null;
  } | null;
  if (isOwnerPositionCode(position?.code)) notFound();
  const roles = (
    (rolesResult.data ?? []) as Array<{
      code: string;
      label_vi: string;
      allowed_scope: "tenant" | "branch";
    }>
  ).map<AccessRole>((role) => ({
    code: role.code,
    label: role.label_vi,
    allowedScope: role.allowed_scope,
  }));
  const bindings = (
    (bindingsResult.data ?? []) as Array<{
      id: number;
      role_code: string;
      branch_id: number | null;
      granted_at: string;
    }>
  ).map<RoleBinding>((binding) => ({
    id: binding.id,
    roleCode: binding.role_code,
    branchId: binding.branch_id,
    grantedAt: binding.granted_at,
  }));

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={profile.full_name}
        description={`${position?.label_vi ?? "Chưa gán chức danh"} · Tài khoản & phân quyền`}
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
            <ArrowLeft className="mr-1 size-4" />
            Về danh sách tài khoản
          </Button>
        }
        badge={{
          children: profile.is_active ? "Đang hoạt động" : "Đã khóa",
          variant: profile.is_active ? "success" : "secondary",
        }}
      />
      <RoleBindingsClient
        targetUserId={profile.id}
        roles={roles}
        bindings={bindings}
        branches={branchesResult.data ?? []}
        canManage={canManage}
        canOpenSecuritySettings={ctx.claims.user_role === "owner"}
      />
    </AppPage>
  );
}
