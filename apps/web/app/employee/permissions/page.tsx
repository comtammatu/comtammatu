import { ShieldCheck as IconShieldCheck } from "lucide-react";
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
  const { claims } = await loadAuthState();

  const branchPerms = await fetchCurrentUserPermissions(claims.branch_id);
  const tenantPerms = branchPerms.filter((p) => p.branchId === null);
  const scopedPerms = branchPerms.filter((p) => p.branchId !== null);

  const position = claims.position ?? null;
  const legacyRole = claims.user_role;

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
              label: "Mã chức vụ",
              value: position ?? "Chưa gắn",
              muted: !position,
            },
            {
              label: "Vai trò tương thích",
              value: legacyRole,
            },
          ]}
        />
      </EmployeePanel>

      <PermissionCard
        title={`Quyền cấp tenant (${tenantPerms.length})`}
        emptyTitle="Không có quyền cấp tenant"
        emptyDescription="Tài khoản này không có grant cấp tenant."
        permissions={tenantPerms.map((permission) => permission.permissionKey)}
      />

      <PermissionCard
        title={`Quyền theo chi nhánh (${scopedPerms.length})`}
        emptyTitle="Không có quyền theo chi nhánh"
        emptyDescription="Không có grant cho chi nhánh hiện tại."
        permissions={scopedPerms.map((permission) => permission.permissionKey)}
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
  permissions: string[];
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
          {permissions.map((permission) => (
            <Badge key={permission} variant="secondary">
              {permission}
            </Badge>
          ))}
        </div>
      )}
    </EmployeePanel>
  );
}
