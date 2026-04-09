import Link from "next/link";
import { ArrowLeftRight, BarChart3, Package, TrendingUp } from "lucide-react";
import { EmptyStatePanel } from "../components/empty-state-panel";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
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

        <Link
          href="/admin/reports/stock-movement"
          className="group flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <div className="rounded-lg bg-primary/10 p-2.5">
            <TrendingUp className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium leading-tight">Biến động tồn kho</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nhập, xuất, tiêu thụ, điều chỉnh theo kỳ
            </p>
          </div>
        </Link>

        <Link
          href="/admin/reports/stock-movement"
          className="group flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <div className="rounded-lg bg-primary/10 p-2.5">
            <ArrowLeftRight className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-medium leading-tight">Tổng hợp theo chi nhánh</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Biến động kho gom theo chi nhánh và loại
            </p>
          </div>
        </Link>
      </div>

      <EmptyStatePanel
        className="py-12"
        title="Chưa có dữ liệu"
        description="Báo cáo doanh thu và top món sẽ hiển thị khi có đơn hàng hoàn thành."
        icon={
          <div className="rounded-full bg-primary/10 p-4">
            <BarChart3 className="size-8 text-primary" />
          </div>
        }
      />
    </div>
  );
}
