import { ShieldCheck as IconShieldCheck } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { loadAuthState } from "@/_lib/auth";
import { fetchCurrentUserPermissions } from "@/_lib/permissions";

/**
 * Auth v2 self-service — shows the current user's JWT position + permission grants.
 * Used for manual QA verification during migration rollout. Visible to any
 * authenticated user (RLS restricts staff_permissions to self).
 */
export default async function PermissionsPage() {
  const { claims } = await loadAuthState();

  const branchPerms = await fetchCurrentUserPermissions(claims.branch_id);
  const tenantPerms = branchPerms.filter((p) => p.branchId === null);
  const scopedPerms = branchPerms.filter((p) => p.branchId !== null);

  const position = claims.position ?? null;
  const legacyRole = claims.user_role;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconShieldCheck className="size-4" /> Quyền hạn của tôi
          </CardTitle>
          <CardDescription>
            Trang kiểm tra quyền hiện tại của tài khoản đang đăng nhập.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Mã chức vụ:</span>
            <Badge variant="secondary">{position ?? "Chưa gắn"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Vai trò cũ:</span>
            <Badge variant="outline">{legacyRole}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Chức vụ là nhãn HR. Quyền truy cập hệ thống được quyết định bởi{" "}
            <code>staff_permissions</code>, không phải chức vụ.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Quyền tenant-wide ({tenantPerms.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tenantPerms.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Không có quyền tenant-wide</EmptyTitle>
                <EmptyDescription>
                  Tài khoản này không có grant cấp tenant.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tenantPerms.map((p) => (
                <Badge key={p.permissionKey} variant="secondary">
                  {p.permissionKey}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Quyền theo chi nhánh hiện tại ({scopedPerms.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scopedPerms.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Không có quyền theo chi nhánh</EmptyTitle>
                <EmptyDescription>
                  Không có grant cho branch_id={claims.branch_id ?? "null"}.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {scopedPerms.map((p) => (
                <Badge key={`${p.branchId}:${p.permissionKey}`}>
                  {p.permissionKey}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
