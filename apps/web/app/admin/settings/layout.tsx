import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, isAdminRole } from "@comtammatu/shared/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const claims = extractClaims(user.app_metadata);
  if (!claims) redirect("/login");

  const isOwner = claims.user_role === "owner";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cài đặt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isOwner
            ? "Cấu hình chuỗi: chi nhánh, thương hiệu, thanh toán và phân vùng. Thiết lập bàn, bếp và ca POS do quản lý điều hành."
            : isAdminRole(claims.user_role)
              ? "Quản lý chi nhánh, sàn ăn, bếp và cấu hình hệ thống"
              : "Cấu hình theo chi nhánh được phân công"}
        </p>
      </div>
      <SettingsNav role={claims.user_role} />
      <div className="pt-2">{children}</div>
    </div>
  );
}
