import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  isAdminRole,
} from "@comtammatu/shared/auth";
import { SettingsNav } from "./settings-nav";
import { PageHeader } from "@/components/v2/patterns";

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
  if (!claims) redirect(buildLoginBlockedStatePath());

  const isOwner = claims.user_role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description={
          isOwner
            ? "Chi nhánh, thương hiệu, thanh toán và phân vùng."
            : isAdminRole(claims.user_role)
              ? "Chi nhánh, bàn, bếp và cấu hình hệ thống."
              : "Cấu hình chi nhánh được phân công."
        }
      />
      <SettingsNav role={claims.user_role} />
      <div className="pt-2">{children}</div>
    </div>
  );
}
