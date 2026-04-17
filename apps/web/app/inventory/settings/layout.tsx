import type { ReactNode } from "react";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { loadAuthState } from "../../_lib/auth";
import { InventoryHeader } from "../_components/inventory-header";
import { SettingsSectionNav } from "./settings-section-nav";

export default async function InventorySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();

  return (
    <>
      <InventoryHeader title="Cài đặt" />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-6">
      <Card>
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
          <SettingsSectionNav role={claims.user_role} />
        </CardContent>
      </Card>
      <div>{children}</div>
    </div>
    </div>
    </>
  );
}
