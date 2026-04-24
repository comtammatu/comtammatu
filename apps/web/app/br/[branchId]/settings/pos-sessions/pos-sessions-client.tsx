"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  IconCash,
  IconChevronRight,
  IconClock,
  IconReceipt,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { CloseSessionSheet } from "../../pos/close-session-sheet";

export interface PosSessionRow {
  id: number;
  terminal_id: number;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  status: string;
  note: string | null;
  pos_terminals: { name: string } | null;
  opened_by_profile: { full_name: string } | null;
  closed_by_profile: { full_name: string } | null;
}

export interface PosSessionOrderItem {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  status: string;
}

export interface PosSessionOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  total_amount: number;
  customer_count: number;
  note: string | null;
  created_at: string;
  table_id: number | null;
  tables: { number: number } | null;
  order_items: PosSessionOrderItem[];
}

interface PosSessionsClientProps {
  branchId: number;
  sessions: PosSessionRow[];
  selectedSessionId: number | null;
  orders: PosSessionOrder[];
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  preparing: "Đang làm",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

export function PosSessionsClient({
  branchId,
  sessions,
  selectedSessionId,
  orders,
}: PosSessionsClientProps) {
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;

  const summary = useMemo(() => buildSummary(orders), [orders]);

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium">Chưa có ca POS nào.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Khi nhân viên mở ca từ màn hình POS, lịch sử ca sẽ xuất hiện tại đây.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Lịch sử ca</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessions.map((session) => {
            const selected = session.id === selectedSessionId;
            return (
              <Button
                asChild
                key={session.id}
                variant={selected ? "secondary" : "ghost"}
                className="h-auto w-full justify-start rounded-lg px-3 py-2"
              >
                <Link
                  href={`/br/${branchId}/settings/pos-sessions?session=${session.id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <IconClock className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">
                      {session.pos_terminals?.name ?? `POS #${session.terminal_id}`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDateTime(session.opened_at)}
                    </span>
                  </span>
                  <Badge variant={session.status === "open" ? "warning" : "outline"}>
                    {session.status === "open" ? "Đang mở" : "Đã chốt"}
                  </Badge>
                </Link>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {selectedSession ? (
          <>
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>
                    {selectedSession.pos_terminals?.name ??
                      `POS #${selectedSession.terminal_id}`}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Mở bởi {selectedSession.opened_by_profile?.full_name ?? "Nhân viên"} ·{" "}
                    {formatDateTime(selectedSession.opened_at)}
                  </p>
                </div>
                {selectedSession.status === "open" ? (
                  <Button onClick={() => setCloseSheetOpen(true)}>
                    Chốt ca
                  </Button>
                ) : (
                  <Badge variant="outline">
                    Chốt lúc {formatDateTime(selectedSession.closed_at)}
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    icon={<IconReceipt className="size-4" />}
                    label="Tổng bill"
                    value={String(summary.billCount)}
                  />
                  <Metric
                    icon={<IconCash className="size-4" />}
                    label="Doanh thu bill"
                    value={formatVND(summary.revenue)}
                  />
                  <Metric
                    icon={<IconToolsKitchen2 className="size-4" />}
                    label="Món đã phục vụ"
                    value={String(summary.servedItems)}
                  />
                  <Metric
                    icon={<IconCash className="size-4" />}
                    label="Chênh lệch chốt"
                    value={
                      selectedSession.cash_difference == null
                        ? "Chưa chốt"
                        : formatVND(selectedSession.cash_difference)
                    }
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <CashLine label="Tiền đầu ca" value={selectedSession.opening_cash} />
                  <CashLine
                    label="Tiền kỳ vọng"
                    value={selectedSession.expected_cash}
                  />
                  <CashLine
                    label="Tiền thực đếm"
                    value={selectedSession.closing_cash}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bill trong ca</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Giờ</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Mon</TableHead>
                      <TableHead>Thanh toán</TableHead>
                      <TableHead className="text-right">Tổng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="max-w-sm whitespace-normal">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{order.order_number}</span>
                            <IconChevronRight className="size-3 text-muted-foreground" />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.order_type === "dine_in"
                              ? `Bàn ${order.tables?.number ?? "-"}`
                              : "Mang về"}
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {order.order_items.map((item) => (
                              <div key={item.id} className="flex gap-2">
                                <span className="font-medium text-foreground">
                                  {item.quantity}x
                                </span>
                                <span>
                                  {item.item_name}
                                  {item.variant_name ? ` (${item.variant_name})` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{formatTime(order.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant={order.status === "cancelled" ? "destructive" : "outline"}>
                            {ORDER_STATUS_LABEL[order.status] ?? order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{countItems(order)}</TableCell>
                        <TableCell>
                          {order.payment_status === "paid"
                            ? order.payment_method ?? "Đã thanh toán"
                            : "Chưa thanh toán"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatVND(order.total_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Ca này chưa có bill.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {selectedSession ? (
        <CloseSessionSheet
          sessionId={selectedSession.id}
          open={closeSheetOpen}
          onOpenChange={setCloseSheetOpen}
        />
      ) : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function CashLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium tabular-nums">
        {value == null ? "Chưa có" : formatVND(value)}
      </div>
    </div>
  );
}

function buildSummary(orders: PosSessionOrder[]) {
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  return {
    billCount: activeOrders.length,
    revenue: activeOrders.reduce((sum, order) => sum + order.total_amount, 0),
    servedItems: activeOrders.reduce((sum, order) => sum + countItems(order), 0),
  };
}

function countItems(order: PosSessionOrder): number {
  return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
