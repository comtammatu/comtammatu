import {
  IconRosetteDiscountCheck,
  IconBuilding,
  IconCalendarEvent,
  IconLogout,
  IconUser,
} from "@tabler/icons-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { loadAuthState } from "@/_lib/auth";

export default async function ProfilePage() {
  const { supabase, session, claims } = await loadAuthState();

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;

  const { data: employee } = await supabase
    .from("employees")
    .select("employee_code, start_date")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  let branchName: string | null = null;
  if (claims.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("name")
      .eq("id", claims.branch_id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchName = data?.name ?? null;
  }

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    "Nhân viên";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <IconUser className="size-8" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Thông tin cá nhân
                </p>
                <p className="text-xl font-semibold text-foreground">
                  {displayName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
            </div>
            <Badge variant="info">{roleLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Hồ sơ đang dùng</CardTitle>
          <CardDescription>
            Thông tin nhân viên gắn với tài khoản này.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {branchName ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconBuilding />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Chi nhánh</ItemTitle>
                  <p className="text-sm font-medium">{branchName}</p>
                </ItemContent>
              </Item>
            ) : null}

            {employee?.employee_code ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconRosetteDiscountCheck />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Mã nhân viên</ItemTitle>
                  <p className="text-sm font-medium">
                    {employee.employee_code}
                  </p>
                </ItemContent>
              </Item>
            ) : null}

            {employee?.start_date ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconCalendarEvent />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Ngày bắt đầu</ItemTitle>
                  <p className="text-sm font-medium">{employee.start_date}</p>
                </ItemContent>
              </Item>
            ) : null}
          </ItemGroup>
        </CardContent>
      </Card>

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline">
          <IconLogout data-icon="inline-start" />
          Đăng xuất
        </Button>
      </form>
    </div>
  );
}
