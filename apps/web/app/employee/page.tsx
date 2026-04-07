import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  CalendarDays,
  ChefHat,
  CreditCard,
  MapPin,
  Monitor,
  User,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { canAccess } from "@comtammatu/shared/auth";
import { getEmployeeInfo } from "./actions";

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  super_manager: "Quản lý cấp cao",
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};

export default async function EmployeePage() {
  const info = await getEmployeeInfo();
  if (!info) redirect("/login");

  const { fullName, role, branchId, branchName } = info;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-lg font-semibold">Xin chào, {fullName}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="size-3.5" />
            {ROLE_LABELS[role]}
          </span>
          {branchName && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {branchName}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions — POS / KDS */}
      {branchId && (canAccess(role, "pos") || canAccess(role, "kds")) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Truy cập nhanh</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            {canAccess(role, "pos") && (
              <Button asChild className="flex-1" size="lg">
                <Link href={`/br/${branchId}/pos`}>
                  <Monitor className="mr-2 size-5" />
                  Mở POS
                </Link>
              </Button>
            )}
            {canAccess(role, "kds") && (
              <Button asChild className="flex-1" size="lg" variant="secondary">
                <Link href={`/br/${branchId}/kds`}>
                  <ChefHat className="mr-2 size-5" />
                  Mở KDS
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Placeholder sections for future features */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="opacity-60">
          <CardContent className="flex items-center gap-3 pt-6">
            <CalendarDays className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Ca làm & Nghỉ phép</p>
              <p className="text-xs text-muted-foreground">Sắp ra mắt</p>
            </div>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="flex items-center gap-3 pt-6">
            <CreditCard className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Lương & Phúc lợi</p>
              <p className="text-xs text-muted-foreground">Sắp ra mắt</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
