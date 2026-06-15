"use client";

import { useState, useTransition, useMemo } from "react";
import { ShoppingBag as IconShoppingBag } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  BRANCH_VI,
  FORM_VI,
  STAFF_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import {
  ORDER_STATUS_LABELS_VI,
  getPaymentMethodLabelVi,
} from "@comtammatu/shared/labels";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi/kpi-card";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { fetchOrders } from "./actions";
import { OrderDetailSheet } from "./order-detail-sheet";
import type { OrderRow, FetchOrdersFilters } from "./actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";

const ORDER_COLUMNS: DataTableColumn<OrderRow>[] = [
  {
    key: "order_number",
    header: "Mã đơn",
    render: (order) => (
      <span className="font-mono text-sm font-medium">
        {order.order_number}
      </span>
    ),
  },
  {
    key: "branch",
    header: BRANCH_VI.long,
    className: "text-sm",
    render: (order) => order.branch_name,
  },
  {
    key: "staff",
    header: STAFF_VI.long,
    className: "text-sm",
    render: (order) => order.created_by_name,
  },
  {
    key: "created_at",
    header: "Thời gian",
    className: "text-sm text-muted-foreground",
    render: (order) => formatVNDateTime(order.created_at),
  },
  {
    key: "total",
    header: FORM_VI.totalAmount,
    className: "text-right",
    render: (order) => (
      <span className="font-mono font-medium tabular-nums">
        {formatVND(order.total_amount)}
      </span>
    ),
  },
  {
    key: "payment",
    header: "Thanh toán",
    render: (order) =>
      order.payment_method ? (
        <Badge variant="outline" className="text-xs">
          {getPaymentMethodLabelVi(order.payment_method)}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: "status",
    header: FORM_VI.status,
    render: (order) => <StatusBadge domain="order" value={order.status} />,
  },
];

/* ─── Props ─── */

interface OrdersClientProps {
  initialOrders: OrderRow[];
  branches: { id: number; name: string }[];
  showBranchFilter: boolean;
}

/* ─── Component ─── */

export function OrdersClient({
  initialOrders,
  branches,
  showBranchFilter,
}: OrdersClientProps) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");

  function handleFilter() {
    const filters: FetchOrdersFilters = {};
    if (status) filters.status = status;
    if (branchId) filters.branchId = Number(branchId);
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    startTransition(async () => {
      const result = await fetchOrders(filters);
      if (result.success && result.data) {
        setOrders(result.data.orders);
      }
    });
  }

  function handleReset() {
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setBranchId("");
    startTransition(async () => {
      const result = await fetchOrders();
      if (result.success && result.data) {
        setOrders(result.data.orders);
      }
    });
  }

  const hasFilters = !!(dateFrom || dateTo || status || branchId);

  const displayOrders = useMemo(() => orders, [orders]);
  const orderSummary = useMemo(() => {
    const pending = displayOrders.filter(
      (order) => order.status !== "completed" && order.status !== "cancelled",
    ).length;
    const completed = displayOrders.filter(
      (order) => order.status === "completed",
    ).length;
    const revenue = displayOrders
      .filter((order) => order.status !== "cancelled")
      .reduce((sum, order) => sum + Number(order.total_amount), 0);

    return { pending, completed, revenue };
  }, [displayOrders]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="Đang xử lý"
          value={orderSummary.pending}
          hint="Đơn đang chờ hoặc đang làm cần theo dõi."
        />
        <KpiCard
          label={STATES_VI.completed}
          value={orderSummary.completed}
          hint="Đơn đã hoàn tất trong tập kết quả hiện tại."
        />
        <KpiCard
          label="Giá trị đơn"
          value={formatVND(orderSummary.revenue)}
          hint="Tổng doanh thu hiển thị sau khi áp bộ lọc."
        />
      </div>

      {/* ─── Filter bar ─── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
            <Label htmlFor="date-from" className="text-xs">
              {FORM_VI.fromDate}
            </Label>
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-36"
            />
          </div>

          <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
            <Label htmlFor="date-to" className="text-xs">
              {FORM_VI.toDate}
            </Label>
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-36"
            />
          </div>

          <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
            <Label htmlFor="status-filter" className="text-xs">
              {FORM_VI.status}
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status-filter" className="w-full sm:w-40">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_STATUS_LABELS_VI).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          {showBranchFilter && branches.length > 0 && (
            <div className="flex w-full flex-col gap-1.5 sm:w-48 sm:flex-none">
              <Label htmlFor="branch-filter" className="text-xs">
                {BRANCH_VI.long}
              </Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="branch-filter" className="w-full sm:w-44">
                  <SelectValue placeholder={BRANCH_VI.selectAll} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex w-full items-end gap-2 sm:w-auto">
            <Button
              onClick={handleFilter}
              disabled={isPending}
              size="sm"
              className="flex-1 sm:flex-none"
            >
              {isPending && <Spinner className="mr-1.5 size-3.5" />}
              Lọc
            </Button>
            {hasFilters && (
              <Button
                onClick={handleReset}
                disabled={isPending}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/30 text-card-foreground flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {displayOrders.length} đơn hàng
        </p>
        {hasFilters && (
          <Badge variant="info" className="rounded-full px-3 py-1.5">
            Bộ lọc đang áp dụng
          </Badge>
        )}
      </div>

      {/* ─── Table ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn</CardTitle>
          <p className="text-sm text-muted-foreground">
            Theo dõi trạng thái, thanh toán và tổng tiền của từng đơn hàng.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
<DataTable
            columns={ORDER_COLUMNS}
            data={displayOrders}
            getRowKey={(order) => order.id}
            onRowClick={setSelectedOrder}
            emptyTitle="Không có đơn hàng nào"
            emptyDescription={
              hasFilters
                ? "Thử xóa bộ lọc hoặc đổi mốc thời gian để mở rộng kết quả."
                : "Hệ thống chưa có đơn nào trong phạm vi đang xem."
            }
            emptyIcon={<IconShoppingBag />}
            emptyMode={hasFilters ? "no-results" : "no-data"}
            mobileCardRender={(order) => (
              <button
                type="button"
                onClick={() => setSelectedOrder(order)}
                className="rounded-lg border bg-muted/30 text-card-foreground w-full p-4 text-left transition-colors hover:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium">
                      {order.order_number}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {order.branch_name}
                    </p>
                  </div>
                  <StatusBadge domain="order" value={order.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">{STAFF_VI.long}</p>
                    <p className="mt-1 font-medium">{order.created_by_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">
                      {FORM_VI.totalAmount}
                    </p>
                    <p className="mt-1 font-mono font-medium">
                      {formatVND(order.total_amount)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {formatVNDateTime(order.created_at)}
                  </p>
                  {order.payment_method ? (
                    <Badge variant="outline" className="text-xs">
                      {getPaymentMethodLabelVi(order.payment_method)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </button>
            )}
          />
        </CardContent>
      </Card>

      {/* ─── Detail sheet ─── */}
      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
      />
    </>
  );
}
