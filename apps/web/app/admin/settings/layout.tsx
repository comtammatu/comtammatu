import type { ReactNode } from "react";
import { isAdminRole } from "@comtammatu/shared/auth";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { loadAuthState } from "../../_lib/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();
  const isOwner = claims.user_role === "owner";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Cài đặt
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {isOwner
                  ? "Chi nhánh, thương hiệu, thanh toán và phân vùng."
                  : isAdminRole(claims.user_role)
                    ? "Chi nhánh, bàn, bếp và cấu hình hệ thống."
                    : "Cấu hình chi nhánh được phân công."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <SettingsNav role={claims.user_role} />
      <div className="pt-2">{children}</div>
    </div>
  );
}
