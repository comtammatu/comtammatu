import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "@comtammatu/shared/format";
import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { fetchAccessibleBranches, fetchOrdersForDay } from "../../actions";

interface OrderRow {
  order_id: number;
  order_number: string;
  branch_id: number;
  paid_at: string;
  paid_hour: number;
  order_type: "dine_in" | "takeaway";
  customer_count: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string | null;
  item_count: number;
  invoice_status: string | null;
  invoice_number: string | null;
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Tại quán",
  takeaway: "Mang đi",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};

const INVOICE_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  issued: "default",
  not_required: "secondary",
  draft: "outline",
  signing: "outline",
  submitted: "outline",
};

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatHourBucket(hour: number): string {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}:00–${end}:00`;
}

interface HourSummary {
  hour: number;
  order_count: number;
  total_revenue: number;
}

function summarizeByHour(orders: OrderRow[]): HourSummary[] {
  const map = new Map<number, HourSummary>();
  for (const o of orders) {
    const existing = map.get(o.paid_hour);
    if (existing) {
      existing.order_count += 1;
      existing.total_revenue += Number(o.total_amount);
    } else {
      map.set(o.paid_hour, {
        hour: o.paid_hour,
        order_count: 1,
        total_revenue: Number(o.total_amount),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

export default async function RevenueDrillPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { date } = await params;
  const sp = await searchParams;

  if (!isValidIsoDate(date)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Ngày không hợp lệ.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/revenue">Về báo cáo doanh thu</Link>
        </Button>
      </div>
    );
  }

  const branchParam = sp.branch;
  const parsedBranch = branchParam ? Number(branchParam) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0 ? parsedBranch : null;

  if (branchId == null) {
    const branchesRes = await fetchAccessibleBranches();
    const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
      id: number;
      name: string;
    }[];
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/finance/revenue" className="gap-2">
            <IconArrowLeft className="size-4" />
            Quay lại
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Chọn chi nhánh để xem chi tiết ngày {date}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Drill-down từ chế độ &quot;Tất cả chi nhánh&quot; cần chọn cụ thể
              chi nhánh để hiển thị danh sách đơn theo giờ.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {branches.map((b) => (
                <li key={b.id}>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link href={`/finance/revenue/${date}?branch=${b.id}`}>
                      {b.name}
                    </Link>
                  </Button>
                </li>
              ))}
              {branches.length === 0 ? (
                <li className="text-sm text-muted-foreground">
                  Bạn chưa có quyền xem chi nhánh nào.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [branchesRes, ordersRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchOrdersForDay(branchId, date),
  ]);

  const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
    id: number;
    name: string;
  }[];
  const branchName =
    branches.find((b) => b.id === branchId)?.name ?? `Chi nhánh ${branchId}`;
  const orders = (
    ordersRes.success ? (ordersRes.data ?? []) : []
  ) as OrderRow[];

  const hours = summarizeByHour(orders);
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalDiscount = orders.reduce(
    (s, o) => s + Number(o.discount_amount),
    0,
  );
  const totalTax = orders.reduce((s, o) => s + Number(o.tax_amount), 0);

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Tài chính · Doanh thu"
        title={`${branchName} · ${date}`}
        description={`Tổng ${totalOrders.toLocaleString("vi-VN")} đơn · ${formatVND(totalRevenue)}. Cột giờ tính theo thời điểm thanh toán (Asia/Ho_Chi_Minh).`}
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/finance/revenue" className="gap-2">
              <IconArrowLeft className="size-4" />
              Quay lại tổng
            </Link>
          </Button>
        }
        badge={{ children: "Drill-down theo ngày", variant: "secondary" }}
      />

      <AppPageTabs
        items={[
          { value: "tong-quan", label: "Tổng quan" },
          { value: "theo-gio", label: "Theo giờ", count: hours.length },
          {
            value: "danh-sach-don",
            label: "Danh sách đơn",
            count: totalOrders,
          },
        ]}
        defaultValue="tong-quan"
        paramKey="tab"
      >
        <TabsContent value="tong-quan">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Doanh thu</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatVND(totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Giảm giá</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatVND(totalDiscount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">VAT</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatVND(totalTax)}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="theo-gio">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Doanh thu theo giờ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {hours.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Không có đơn trong ngày này.
                </p>
              ) : (
                hours.map((h) => {
                  const pct = totalRevenue
                    ? Math.round((h.total_revenue / totalRevenue) * 100)
                    : 0;
                  return (
                    <div key={h.hour} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium tabular-nums">
                          {formatHourBucket(h.hour)}
                        </span>
                        <span className="tabular-nums">
                          {formatVND(h.total_revenue)}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {h.order_count} đơn
                          </span>
                        </span>
                      </div>
                      <Progress value={pct} size="sm" />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danh-sach-don">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Danh sách đơn ({totalOrders.toLocaleString("vi-VN")})
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Sắp xếp theo thời gian thanh toán. HĐĐT &quot;Không yêu
                cầu&quot; = khách lẻ không nhập MST.
              </p>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      Không có đơn đã thanh toán trong ngày.
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Giờ</TableHead>
                      <TableHead>Mã đơn</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead className="text-right">Khách</TableHead>
                      <TableHead className="text-right">Món</TableHead>
                      <TableHead>Thanh toán</TableHead>
                      <TableHead className="text-right">Giảm</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Tổng</TableHead>
                      <TableHead>HĐĐT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => {
                      const paid = new Date(o.paid_at);
                      const hh = String(paid.getHours()).padStart(2, "0");
                      const mm = String(paid.getMinutes()).padStart(2, "0");
                      const invoiceLabel =
                        o.invoice_status === "not_required"
                          ? "Không yêu cầu"
                          : o.invoice_status === "issued"
                            ? `Đã phát hành${o.invoice_number ? ` · ${o.invoice_number}` : ""}`
                            : (o.invoice_status ?? "—");
                      const invoiceVariant =
                        o.invoice_status &&
                        INVOICE_STATUS_VARIANT[o.invoice_status]
                          ? INVOICE_STATUS_VARIANT[o.invoice_status]
                          : "outline";
                      return (
                        <TableRow key={o.order_id}>
                          <TableCell className="tabular-nums">
                            {hh}:{mm}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {o.order_number}
                          </TableCell>
                          <TableCell>
                            {ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.customer_count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.item_count}
                          </TableCell>
                          <TableCell>
                            {o.payment_method
                              ? (PAYMENT_METHOD_LABEL[o.payment_method] ??
                                o.payment_method)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {Number(o.discount_amount) > 0
                              ? formatVND(o.discount_amount)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatVND(o.tax_amount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatVND(o.total_amount)}
                          </TableCell>
                          <TableCell>
                            {o.invoice_status ? (
                              <Badge variant={invoiceVariant}>
                                {invoiceLabel}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Chưa xuất
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="font-medium">
                        Tổng
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(totalDiscount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(totalTax)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold">
                        {formatVND(totalRevenue)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
