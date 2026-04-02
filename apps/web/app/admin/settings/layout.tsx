import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt</h1>
        <p className="mt-1 text-muted-foreground">
          Quản lý chi nhánh, bàn và cấu hình hệ thống
        </p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
