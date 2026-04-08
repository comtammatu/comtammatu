import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Báo cáo</h1>
        <p className="mt-1 text-muted-foreground">
          Doanh thu, top món, food cost
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/admin/reports/inventory-value"
            className="text-primary underline-offset-4 hover:underline"
          >
            Giá trị tồn kho
          </Link>
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <BarChart3 className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Chưa có dữ liệu</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Báo cáo sẽ hiển thị khi có đơn hàng hoàn thành.
        </p>
      </div>
    </div>
  );
}
