"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Banknote as IconCash,
  Clock as IconClock,
  Receipt as IconReceipt,
  CookingPot as IconToolsKitchen2,
  AlertTriangle as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { CloseSessionSheet } from "../../pos/close-session-sheet";

import { FORM_VI } from "@comtammatu/shared/messages";
export interface PosSessionRow {
  id: number;
  // Per-branch model (Owner D7, 2026-04-27): nullable. NULL = ca chung của
  // chi nhánh, không liên kết terminal vật lý cụ thể.
  terminal_id: number | null;
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
  variance_approval_note: string | null;
  pos_terminals: { name: string } | null;
  opened_by_profile: { full_name: string } | null;
  closed_by_profile: { full_name: string } | null;
}

/** Resolve display name của ca: ưu tiên tên terminal nếu còn, fallback
 * "Ca chung của chi nhánh" cho ca không liên kết terminal (post-D7). */
function resolveSessionLabel(session: PosSessionRow): string {
  if (session.pos_terminals?.name) return session.pos_terminals.name;
  if (session.terminal_id != null) return `POS #${String(session.terminal_id)}`;
  return "Ca chung của chi nhánh";
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
  /** @deprecated D8 (2026-04-27): variance gate retired. Prop giữ để
   * backward-compat với CloseSessionSheet, không gate UI nữa. */
  canOverrideVariance: boolean;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  preparing: "Đang làm",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  completed: "Hòan thành",
  cancelled: "Đã hủy",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
  bank_transfer: "Chuyển khoản",
};

function paymentMethodLabel(method: string | null): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABEL[method] ?? method;
}

/** Server tính: max(50.000đ, 0.5% × expected_cash). Mirror inline cho UI
 * khi server không trả về (sessions cũ trước D8 chỉ có cash_difference). */
function computeVarianceThreshold(expectedCash: number | null): number {
  if (expectedCash == null) return 50_000;
  return Math.max(50_000, Math.round(expectedCash * 0.005 * 100) / 100);
}

function isVarianceBreached(session: PosSessionRow): boolean {
  if (session.cash_difference == null) return false;
  const threshold = computeVarianceThreshold(session.expected_cash);
  return Math.abs(session.cash_difference) > threshold;
}

export function PosSessionsClient({
  branchId,
  sessions,
  selectedSessionId,
  orders,
  canOverrideVariance,
}: PosSessionsClientProps) {
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;

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
            const breached = isVarianceBreached(session);
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
                      {resolveSessionLabel(session)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDateTime(session.opened_at)}
                    </span>
                  </span>
                  {breached ? (
                    <Badge variant="destructive">Lệch</Badge>
                  ) : null}
                  <Badge
                    variant={session.status === "open" ? "warning" : "outline"}
                  >
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
            <SessionDetailCard
              session={selectedSession}
              summary={summary}
              onCloseShift={() => setCloseSheetOpen(true)}
            />

            <Card>
              <CardHeader className="gap-2">
                <CardTitle>Bill trong ca ({orders.length})</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Bấm vào dòng để xem chi tiết bill (món, giảm giá, phí dịch vụ,
                  thanh toán).
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Giờ</TableHead>
                      <TableHead>{FORM_VI.status}</TableHead>
                      <TableHead>Thanh toán</TableHead>
                      <TableHead className="text-right">{FORM_VI.total}</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <TableCell className="max-w-sm">
                          <div className="font-medium">
                            {order.order_number}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.order_type === "dine_in"
                              ? `Bàn ${order.tables?.number ?? "-"}${order.customer_count > 0 ? ` · ${order.customer_count} khách` : ""}`
                              : "Mang về"}
                          </div>
                        </TableCell>
                        <TableCell>{formatTime(order.created_at)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.status === "cancelled"
                                ? "destructive"
                                : order.status === "completed"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {ORDER_STATUS_LABEL[order.status] ?? order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {order.payment_status === "paid" ? (
                            <span className="text-success">
                              {paymentMethodLabel(order.payment_method)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Chưa TT
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatVND(order.total_amount)}
                        </TableCell>
                        <TableCell>
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-muted-foreground"
                        >
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
          canOverrideVariance={canOverrideVariance}
        />
      ) : null}

      <OrderDetailSheet
        order={selectedOrder}
        open={selectedOrder !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedOrderId(null);
        }}
      />
    </div>
  );
}

interface SessionSummary {
  billCount: number;
  revenue: number;
  servedItems: number;
  cashRevenue: number;
  noncashRevenue: number;
  paidCount: number;
  unpaidCount: number;
  cancelledCount: number;
  paymentBreakdown: Array<{ method: string; count: number; amount: number }>;
}

function SessionDetailCard({
  session,
  summary,
  onCloseShift,
}: {
  session: PosSessionRow;
  summary: SessionSummary;
  onCloseShift: () => void;
}) {
  const breached = isVarianceBreached(session);
  const threshold = computeVarianceThreshold(session.expected_cash);
  const isOpen = session.status === "open";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{resolveSessionLabel(session)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mở bởi {session.opened_by_profile?.full_name ?? "—"} ·{" "}
            {formatDateTime(session.opened_at)}
          </p>
          {!isOpen ? (
            <p className="text-sm text-muted-foreground">
              Đóng bởi {session.closed_by_profile?.full_name ?? "—"} ·{" "}
              {formatDateTime(session.closed_at)} · Kéo dài{" "}
              {formatDuration(session.opened_at, session.closed_at)}
            </p>
          ) : null}
        </div>
        {isOpen ? (
          <Button onClick={onCloseShift}>Chốt ca</Button>
        ) : (
          <Badge variant="outline" className="self-start">
            Đã chốt
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {breached ? (
          <Alert className="border-destructive/30 bg-destructive/10 text-destructive">
            <IconAlertTriangle className="size-4" />
            <AlertDescription className="text-current">
              <strong>Lệch quỹ vượt ngưỡng.</strong> Chênh lệch{" "}
              {formatVND(session.cash_difference ?? 0)} &gt; ngưỡng{" "}
              {formatVND(threshold)}. Đã gửi cảnh báo cho quản lý.
              {session.variance_approval_note ? (
                <span className="mt-1 block text-sm">
                  Ghi chú duyệt: {session.variance_approval_note}
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : !isOpen && (session.cash_difference ?? 0) === 0 ? (
          <Alert className="border-success/20 bg-success/10 text-success">
            <IconCircleCheck className="size-4" />
            <AlertDescription className="text-current">
              Số dư khớp hòan toàn.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<IconReceipt className="size-4" />}
            label="Tổng bill"
            value={String(summary.billCount)}
          />
          <Metric
            icon={<IconCash className="size-4" />}
            label="Doanh thu (đã thanh toán)"
            value={formatVND(summary.revenue)}
          />
          <Metric
            icon={<IconToolsKitchen2 className="size-4" />}
            label="Món đã phục vụ"
            value={String(summary.servedItems)}
          />
          <Metric
            icon={<IconCash className="size-4" />}
            label="Chênh lệch quỹ"
            value={
              session.cash_difference == null
                ? "Chưa chốt"
                : formatVND(session.cash_difference)
            }
            tone={
              session.cash_difference == null
                ? "muted"
                : session.cash_difference === 0
                  ? "success"
                  : breached
                    ? "destructive"
                    : "warning"
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CashLine label="Tiền đầu ca" value={session.opening_cash} />
          <CashLine label="Tiền kỳ vọng (cash)" value={session.expected_cash} />
          <CashLine label="Tiền thực đếm" value={session.closing_cash} />
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <KV label="Tiền mặt thu được" value={formatVND(summary.cashRevenue)} />
          <KV
            label="Chuyển khoản"
            value={formatVND(summary.noncashRevenue)}
          />
          <KV label="Đơn đã thanh toán" value={String(summary.paidCount)} />
          <KV label="Đơn chưa thanh toán" value={String(summary.unpaidCount)} />
        </div>

        {summary.paymentBreakdown.length > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chi tiết phương thức thanh toán
            </div>
            <div className="grid gap-1 text-sm">
              {summary.paymentBreakdown.map((row) => (
                <div
                  key={row.method}
                  className="flex items-center justify-between"
                >
                  <span>
                    {paymentMethodLabel(row.method)} · {row.count} đơn
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatVND(row.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {summary.cancelledCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {summary.cancelledCount} đơn đã hủy (không tính vào doanh thu).
          </p>
        ) : null}

        {session.note ? (
          <NoteCallout label="Ghi chú ca">{session.note}</NoteCallout>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OrderDetailSheet({
  order,
  open,
  onOpenChange,
}: {
  order: PosSessionOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 data-[side=right]:w-full sm:max-w-lg"
      >
        <SheetHeader className="border-b px-4 pt-5 pb-3 text-left">
          <SheetTitle>
            Bill {order?.order_number ?? ""}
          </SheetTitle>
          <SheetDescription>
            {order
              ? `${order.order_type === "dine_in" ? `Bàn ${order.tables?.number ?? "-"}` : "Mang về"} · ${formatDateTime(order.created_at)}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          {order ? (
            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    order.status === "cancelled"
                      ? "destructive"
                      : order.status === "completed"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </Badge>
                <Badge
                  variant={
                    order.payment_status === "paid" ? "secondary" : "outline"
                  }
                >
                  {order.payment_status === "paid"
                    ? `Đã thanh toán · ${paymentMethodLabel(order.payment_method)}`
                    : "Chưa thanh toán"}
                </Badge>
                {order.customer_count > 0 ? (
                  <Badge variant="outline">{order.customer_count} khách</Badge>
                ) : null}
              </div>

              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Món
                </h4>
                <div className="mt-2 divide-y rounded-lg border">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex gap-3 px-3 py-2">
                      <span className="w-10 shrink-0 font-medium tabular-nums">
                        ×{item.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {item.item_name}
                          {item.variant_name ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({item.variant_name})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatVND(item.unit_price)} ×{item.quantity}
                          {item.status === "cancelled" ? (
                            <span className="ml-2 text-destructive">
                              (đã hủy)
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          item.status === "cancelled" &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {formatVND(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border px-3 py-2 space-y-1.5 text-sm">
                <KVRow
                  label="Tạm tính"
                  value={formatVND(order.subtotal)}
                />
                {order.discount_amount > 0 ? (
                  <KVRow
                    label="Giảm giá"
                    value={`-${formatVND(order.discount_amount)}`}
                    tone="success"
                  />
                ) : null}
                {order.service_charge > 0 ? (
                  <KVRow
                    label="Phí dịch vụ"
                    value={formatVND(order.service_charge)}
                  />
                ) : null}
                {order.tax_amount > 0 ? (
                  <KVRow
                    label="Thuế"
                    value={formatVND(order.tax_amount)}
                  />
                ) : null}
                <Separator />
                <KVRow
                  label="Tổng"
                  value={formatVND(order.total_amount)}
                  bold
                />
              </div>

              {order.note ? (
                <NoteCallout label="Ghi chú bill">{order.note}</NoteCallout>
              ) : null}
            </div>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "muted" | "success" | "warning" | "destructive";
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-lg font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CashLine({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium tabular-nums">
        {value == null ? "Chưa có" : formatVND(value)}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function KVRow({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", bold && "text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          bold && "text-base font-semibold",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function buildSummary(orders: PosSessionOrder[]): SessionSummary {
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const paid = activeOrders.filter((o) => o.payment_status === "paid");
  const breakdownMap = new Map<string, { count: number; amount: number }>();
  let cashRevenue = 0;
  let noncashRevenue = 0;
  for (const order of paid) {
    const method = order.payment_method ?? "unknown";
    const entry = breakdownMap.get(method) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += order.total_amount;
    breakdownMap.set(method, entry);
    if (method === "cash") cashRevenue += order.total_amount;
    else noncashRevenue += order.total_amount;
  }
  const paymentBreakdown = Array.from(breakdownMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    billCount: activeOrders.length,
    revenue: paid.reduce((sum, o) => sum + o.total_amount, 0),
    servedItems: activeOrders.reduce((sum, o) => sum + countItems(o), 0),
    cashRevenue,
    noncashRevenue,
    paidCount: paid.length,
    unpaidCount: activeOrders.length - paid.length,
    cancelledCount: orders.length - activeOrders.length,
    paymentBreakdown,
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

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}
