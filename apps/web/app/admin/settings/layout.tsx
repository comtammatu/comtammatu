import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, isAdminRole } from "@comtammatu/shared/auth";
import { SettingsNav } from "./settings-nav";
import { PageHeader } from "@/components/foundation/ui-patterns";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const isOwner = claims.user_role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description={
          isOwner
            ? "Cấu hình chuỗi: chi nhánh, thương hiệu, thanh toán và phân vùng. Thiết lập bàn, bếp và ca POS do quản lý điều hành."
            : isAdminRole(claims.user_role)
              ? "Quản lý chi nhánh, sàn ăn, bếp và cấu hình hệ thống"
              : "Cấu hình theo chi nhánh được phân công"
        }
      />
      <SettingsNav role={claims.user_role} />
      <div className="pt-2">{children}</div>
    </div>
  );
}
