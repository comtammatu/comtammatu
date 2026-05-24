import { ShieldCheck as IconShieldCheck } from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
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

export default async function PermissionsPage() {
  const { supabase, claims } = await loadAuthState();

  const [branchPermsRes, positionsRes, permKeysRes] = await Promise.all([
    fetchCurrentUserPermissions(claims.branch_id),
    supabase
      .from("positions")
      .select("code, label_vi")
      .eq("tenant_id", claims.tenant_id),
    supabase
      .from("permission_keys")
      .select("key, description"),
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
    : "Chưa gắn";
  const roleDisplay = ROLE_LABEL_VI[legacyRole] ?? legacyRole;

  return (
    <EmployeePage
      title="Quyền hạn của tôi"
      description="Xem chức vụ và các quyền truy cập đang có hiệu lực."
    >
      <EmployeePanel
        icon={IconShieldCheck}
        title="Thông tin truy cập"
        description="Chức vụ là nhãn nhân sự; quyền hệ thống được cấp riêng."
        tone="info"
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chức vụ",
              value: positionDisplay,
              muted: !position,
            },
            {
              label: "Vai trò tương thích",
              value: roleDisplay,
            },
          ]}
        />
      </EmployeePanel>

      <PermissionCard
        title={`Quyền cấp tenant (${tenantPerms.length})`}
        emptyTitle="Không có quyền cấp tenant"
        emptyDescription="Tài khoản này không có grant cấp tenant."
        permissions={tenantPerms.map((p) => ({
          key: p.permissionKey,
          label: permissionLabel.get(p.permissionKey) ?? p.permissionKey,
        }))}
      />

      <PermissionCard
        title={`Quyền theo chi nhánh (${scopedPerms.length})`}
        emptyTitle="Không có quyền theo chi nhánh"
        emptyDescription="Không có grant cho chi nhánh hiện tại."
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
