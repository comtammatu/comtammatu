import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { SettingsSectionNav } from "./settings-section-nav";

export default async function InventorySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;
  const role = claims?.user_role ?? "branch_manager";

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardContent className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Settings
              </p>
              <p className="font-heading text-2xl font-semibold">
                Chính sách & mặc định
              </p>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Khu vực này chỉ giữ các cấu hình hành vi hoặc policy của
                Inventory. Danh mục master data đã được dồn về nhóm `Danh mục`
                để tránh trùng cửa vào.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              Policy layer
            </Badge>
          </div>
          <SettingsSectionNav role={role} />
        </CardContent>
      </Card>
      <div>{children}</div>
    </div>
  );
}
