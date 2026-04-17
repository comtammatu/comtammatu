"use client";

import { useState, useTransition, useMemo } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { fetchOrders } from "./actions";
import { OrderDetailSheet } from "./order-detail-sheet";
import type { OrderRow, FetchOrdersFilters } from "./actions";
import { TableEmptyStateRow } from "../components/table-empty-state-row";

/* ─── Status config ─── */

const ORDER_STATUSES = [
  { value: "pending", label: "Chờ xử lý" },
  { value: "in_progress", label: "Đang làm" },
  { value: "ready", label: "Sẵn sàng" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

function statusBadgeVariant(
  status: string,
): "neutral" | "info" | "success" | "danger" | "warning" {
  switch (status as OrderStatus) {
    case "pending":
      return "warning";
    case "in_progress":
      return "info";
    case "ready":
      return "success";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  return ORDER_STATUSES.find((s) => s.value === status)?.label ?? status;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};

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
      (order) => order.status === "pending" || order.status === "in_progress",
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
        <div className="rounded-lg border bg-muted/30 text-card-foreground p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đang xử lý
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {orderSummary.pending}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn đang chờ hoặc đang làm cần theo dõi.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 text-card-foreground p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Hoàn thành
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {orderSummary.completed}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn đã hoàn tất trong tập kết quả hiện tại.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 text-card-foreground p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Giá trị đơn
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatVND(orderSummary.revenue)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tổng doanh thu hiển thị sau khi áp bộ lọc.
          </p>
        </div>
      </div>

      {/* ─── Filter bar ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="date-from" className="text-xs">
            Từ ngày
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
            Đến ngày
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
            Trạng thái
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status-filter" className="w-full sm:w-40">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showBranchFilter && branches.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 sm:w-48 sm:flex-none">
            <Label htmlFor="branch-filter" className="text-xs">
              Chi nhánh
            </Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="branch-filter" className="w-full sm:w-44">
                <SelectValue placeholder="Tất cả chi nhánh" />
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
            {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
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
      </div>

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
          {displayOrders.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 text-card-foreground border-dashed px-6 py-16 text-center">
              <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Không có đơn hàng nào</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? "Thử xóa bộ lọc hoặc đổi mốc thời gian để mở rộng kết quả."
                  : "Hệ thống chưa có đơn nào trong phạm vi đang xem."}
              </p>
            </div>
          ) : null}

          <div className="space-y-3 md:hidden">
            {displayOrders.map((order) => (
              <button
                key={order.id}
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
                  <Badge
                    variant={
                      statusBadgeVariant(order.status) === "warning"
                        ? "warning"
                        : statusBadgeVariant(order.status) === "info"
                          ? "info"
                          : statusBadgeVariant(order.status) === "success"
                            ? "success"
                            : statusBadgeVariant(order.status) === "danger"
                              ? "destructive"
                              : "secondary"
                    }
                  >
                    {statusLabel(order.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Nhân viên</p>
                    <p className="mt-1 font-medium">{order.created_by_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Tổng tiền</p>
                    <p className="mt-1 font-mono font-medium">
                      {formatVND(order.total_amount)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {order.payment_method ? (
                    <Badge variant="outline" className="text-xs">
                      {PAYMENT_METHOD_LABELS[order.payment_method] ??
                        order.payment_method}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Chi nhánh
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Nhân viên
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Thời gian
                  </TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Thanh toán
                  </TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayOrders.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={7}
                    paddingClassName="py-16"
                    title="Không có đơn hàng nào"
                    description={
                      hasFilters
                        ? "Thử xóa bộ lọc hoặc đổi mốc thời gian để mở rộng kết quả."
                        : "Hệ thống chưa có đơn nào trong phạm vi đang xem."
                    }
                    icon={
                      <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
                    }
                  />
                )}
                {displayOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/45"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <TableCell>
                      <span className="font-mono text-sm font-medium">
                        {order.order_number}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {order.branch_name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {order.created_by_name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatVND(order.total_amount)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {order.payment_method ? (
                        <Badge variant="outline" className="text-xs">
                          {PAYMENT_METHOD_LABELS[order.payment_method] ??
                            order.payment_method}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          statusBadgeVariant(order.status) === "warning"
                            ? "warning"
                            : statusBadgeVariant(order.status) === "info"
                              ? "info"
                              : statusBadgeVariant(order.status) === "success"
                                ? "success"
                                : statusBadgeVariant(order.status) === "danger"
                                  ? "destructive"
                                  : "secondary"
                        }
                      >
                        {statusLabel(order.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
