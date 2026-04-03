import { Receipt } from "lucide-react";

export default function OrdersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Đơn hàng</h1>
        <p className="mt-1 text-muted-foreground">
          Lịch sử đơn hàng và trạng thái
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <Receipt className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý đơn hàng sẽ có trong M2 (POS).
        </p>
      </div>
    </div>
  );
}
