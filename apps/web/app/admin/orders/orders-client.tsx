"use client";

import { useState, useTransition, useMemo } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
): "secondary" | "outline" | "default" | "destructive" {
  switch (status as OrderStatus) {
    case "pending":
      return "secondary";
    case "in_progress":
      return "outline";
    case "ready":
      return "default";
    case "completed":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
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

  return (
    <>
      {/* ─── Filter bar ─── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-from" className="text-xs">
            Từ ngày
          </Label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-to" className="text-xs">
            Đến ngày
          </Label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-filter" className="text-xs">
            Trạng thái
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status-filter" className="w-40">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-filter" className="text-xs">
              Chi nhánh
            </Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="branch-filter" className="w-44">
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

        <div className="flex items-end gap-2">
          <Button onClick={handleFilter} disabled={isPending} size="sm">
            {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Lọc
          </Button>
          {hasFilters && (
            <Button
              onClick={handleReset}
              disabled={isPending}
              variant="outline"
              size="sm"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      {/* ─── Summary ─── */}
      <p className="text-sm text-muted-foreground">
        {displayOrders.length} đơn hàng
      </p>

      {/* ─── Table ─── */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã đơn</TableHead>
              <TableHead className="hidden sm:table-cell">Chi nhánh</TableHead>
              <TableHead className="hidden md:table-cell">Nhân viên</TableHead>
              <TableHead className="hidden lg:table-cell">Thời gian</TableHead>
              <TableHead className="text-right">Tổng tiền</TableHead>
              <TableHead className="hidden sm:table-cell">Thanh toán</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Không có đơn hàng nào
                  </p>
                </TableCell>
              </TableRow>
            )}
            {displayOrders.map((order) => (
              <TableRow
                key={order.id}
                className="cursor-pointer hover:bg-muted/50"
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
                    variant={statusBadgeVariant(order.status)}
                    className={
                      order.status === "completed"
                        ? "bg-green-500 text-white hover:bg-green-500"
                        : order.status === "in_progress"
                          ? "border-yellow-500 text-yellow-700"
                          : order.status === "ready"
                            ? "bg-blue-500 text-white hover:bg-blue-500"
                            : ""
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

      {/* ─── Detail sheet ─── */}
      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
      />
    </>
  );
}
