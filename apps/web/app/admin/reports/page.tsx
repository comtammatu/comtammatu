import Link from "next/link";
import {
  ArrowLeftRight,
  BookOpen,
  CreditCard,
  FileText,
  Package,
  Receipt,
  Shield,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";

const REPORT_LINK_CLASS =
  "group flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Báo cáo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kho, tài chính, nhân sự
        </p>
      </div>

      {/* ─── Kho ─── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Kho hàng
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/reports/inventory-value"
            className={REPORT_LINK_CLASS}
          >
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Package className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-medium leading-tight">Giá trị tồn kho</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Theo hệ thống, khu vực, chi nhánh
              </p>
            </div>
          </Link>

          <Link
            href="/admin/reports/stock-movement"
            className={REPORT_LINK_CLASS}
          >
            <div className="rounded-lg bg-primary/10 p-2.5">
              <TrendingUp className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-medium leading-tight">Biến động tồn kho</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Nhập, xuất, tiêu thụ, điều chỉnh
              </p>
            </div>
          </Link>

          <Link
            href="/admin/reports/stock-movement"
            className={REPORT_LINK_CLASS}
          >
            <div className="rounded-lg bg-primary/10 p-2.5">
              <ArrowLeftRight className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-medium leading-tight">Tổng hợp chi nhánh</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Biến động kho gom theo chi nhánh
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* ─── Tài chính ─── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tài chính
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/finance/statements" className={REPORT_LINK_CLASS}>
            <div className="rounded-lg bg-green-100 p-2.5">
              <FileText className="size-5 text-green-700" />
            </div>
            <div>
              <p className="font-medium leading-tight">BCTC (VAS)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Bảng CĐKT, KQKD, tổng hợp VAT
              </p>
            </div>
          </Link>

          <Link
            href="/admin/finance/chart-of-accounts"
            className={REPORT_LINK_CLASS}
          >
            <div className="rounded-lg bg-green-100 p-2.5">
              <BookOpen className="size-5 text-green-700" />
            </div>
            <div>
              <p className="font-medium leading-tight">Hệ thống tài khoản</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tài khoản kế toán chuẩn VAS
              </p>
            </div>
          </Link>

          <Link href="/admin/finance" className={REPORT_LINK_CLASS}>
            <div className="rounded-lg bg-green-100 p-2.5">
              <UtensilsCrossed className="size-5 text-green-700" />
            </div>
            <div>
              <p className="font-medium leading-tight">Food cost</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Chi phí nguyên liệu theo món
              </p>
            </div>
          </Link>

          <Link href="/admin/finance" className={REPORT_LINK_CLASS}>
            <div className="rounded-lg bg-green-100 p-2.5">
              <Receipt className="size-5 text-green-700" />
            </div>
            <div>
              <p className="font-medium leading-tight">Hóa đơn điện tử</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                HĐĐT đầu ra + doanh thu
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* ─── Nhân sự ─── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Nhân sự & Lương
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/hr/payroll" className={REPORT_LINK_CLASS}>
            <div className="rounded-lg bg-blue-100 p-2.5">
              <CreditCard className="size-5 text-blue-700" />
            </div>
            <div>
              <p className="font-medium leading-tight">Bảng lương</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tính lương, duyệt, thanh toán
              </p>
            </div>
          </Link>

          <Link href="/admin/hr" className={REPORT_LINK_CLASS}>
            <div className="rounded-lg bg-blue-100 p-2.5">
              <Shield className="size-5 text-blue-700" />
            </div>
            <div>
              <p className="font-medium leading-tight">Bảo hiểm</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                BHXH, BHYT, BHTN theo tháng
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
