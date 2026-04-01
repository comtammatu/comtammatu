import { Settings } from "lucide-react";

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt chung</h1>
        <p className="mt-1 text-muted-foreground">Thuế VAT, phí dịch vụ, thông tin cửa hàng</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <Settings className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cài đặt hệ thống sẽ có trong Sprint 1 S2.</p>
      </div>
    </div>
  );
}
