import Link from "next/link";
import { BarChart3, Package } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Báo cáo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Doanh thu, top món, food cost
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/reports/inventory-value"
          className="group flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Package className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium leading-tight">Giá trị tồn kho</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Xem theo hệ thống, khu vực, chi nhánh
            </p>
          </div>
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 py-32 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <BarChart3 className="size-8 text-primary" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">Chưa có dữ liệu</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Báo cáo doanh thu và top món sẽ hiển thị khi có đơn hàng hoàn thành.
        </p>
      </div>
    </div>
  );
}
