import Link from "next/link";
import {
  ShieldCheck as IconShieldCheck,
  UserCircle as IconUserCircle,
} from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { loadAuthState } from "@/_lib/auth";
import { fetchCurrentUserPermissions } from "@/_lib/permissions";
import {
  EmployeeDetailList,
  EmployeePage,
  EmployeePanel,
} from "../components/employee-page";
import { messages } from "@lib/messages";

const copy = messages.employee.permissions;

export default async function PermissionsPage() {
  const { supabase, claims } = await loadAuthState();

  const [branchPermsRes, positionsRes, permKeysRes] = await Promise.all([
    fetchCurrentUserPermissions(claims.branch_id),
    supabase
      .from("positions")
      .select("code, label_vi")
      .eq("tenant_id", claims.tenant_id),
    supabase.from("permission_keys").select("key, description"),
  ]);

  const positionLabel = new Map(
    (positionsRes.data ?? []).map((p) => [p.code, p.label_vi]),
  );
  const permissionLabel = new Map(
    (permKeysRes.data ?? []).map((k) => [k.key, k.description]),
  );

  const tenantPerms = branchPermsRes.filter((p) => p.branchId === null);
  const scopedPerms = branchPermsRes.filter((p) => p.branchId !== null);

  const position = claims.position ?? null;
  const legacyRole = claims.user_role;
  const positionDisplay = position
    ? (positionLabel.get(position) ?? position)
    : copy.notAssigned;
  const roleDisplay = ROLE_LABEL_VI[legacyRole] ?? legacyRole;

  return (
    <EmployeePage
      title={copy.title}
      description={copy.description}
      action={
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/profile">
            <IconUserCircle data-icon="inline-start" />
            {copy.profileAction}
          </Link>
        </Button>
      }
    >
      <EmployeePanel
        icon={IconShieldCheck}
        title={copy.accessInfoTitle}
        description={copy.accessInfoDescription}
        tone="info"
      >
        <EmployeeDetailList
          rows={[
            {
              label: copy.position,
              value: positionDisplay,
              muted: !position,
            },
            {
              label: copy.compatibleRole,
              value: roleDisplay,
            },
          ]}
        />
      </EmployeePanel>

      <PermissionCard
        title={`${copy.tenantPermsTitle} (${tenantPerms.length})`}
        emptyTitle={copy.tenantPermsEmptyTitle}
        emptyDescription={copy.tenantPermsEmptyDescription}
        permissions={tenantPerms.map((p) => ({
          key: p.permissionKey,
          label: permissionLabel.get(p.permissionKey) ?? p.permissionKey,
        }))}
      />

      <PermissionCard
        title={`${copy.branchPermsTitle} (${scopedPerms.length})`}
        emptyTitle={copy.branchPermsEmptyTitle}
        emptyDescription={copy.branchPermsEmptyDescription}
        permissions={scopedPerms.map((p) => ({
          key: p.permissionKey,
          label: permissionLabel.get(p.permissionKey) ?? p.permissionKey,
        }))}
      />
    </EmployeePage>
  );
}

function PermissionCard({
  title,
  emptyTitle,
  emptyDescription,
  permissions,
}: {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  permissions: { key: string; label: string }[];
}) {
  return (
    <EmployeePanel title={title}>
      {permissions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {permissions.map((p) => (
            <Badge key={p.key} variant="secondary" title={p.key}>
              {p.label}
            </Badge>
          ))}
        </div>
      )}
    </EmployeePanel>
  );
}
