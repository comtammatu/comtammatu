"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing orders review surface keeps operational copy inline */

import { useState, useTransition, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { ShoppingBag as IconShoppingBag, X as IconX } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { BRANCH_VI, FORM_VI, STAFF_VI } from "@comtammatu/shared/messages";
import {
  ORDER_STATUS_LABELS_VI,
  getPaymentMethodLabelVi,
} from "@comtammatu/shared/labels";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi/kpi-card";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { fetchOrders } from "./actions";
import { OrderDetailContent, OrderDetailSheet } from "./order-detail-sheet";
import { useIsXlUp } from "./_hooks/use-is-xl-up";
import type { OrderRow, OrdersSummary, FetchOrdersFilters } from "./actions";
import {
  computeOrderWaitInfo,
  getOrderAlertBadgeProps,
} from "./_lib/order-wait-time";
import { ORDERS_COPY as ORDERS_PAGE_COPY } from "./orders-copy";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppSection, AppToolbar, KpiRow } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";

type AlertFilter = "all" | "warning" | "critical";
const VALID_ALERT_FILTERS: readonly AlertFilter[] = [
  "all",
  "warning",
  "critical",
] as const;

function parseAlertFilter(value: string | null): AlertFilter {
  if (value && (VALID_ALERT_FILTERS as readonly string[]).includes(value)) {
    return value as AlertFilter;
  }
  return "all";
}

function OrderWaitTimeBadge({ order }: { order: OrderRow }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (
      order.status === "completed" ||
      order.status === "cancelled" ||
      order.kds_completed_at
    ) {
      return;
    }
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, [order.status, order.kds_completed_at]);

  const waitInfo = computeOrderWaitInfo(
    order.created_at,
    order.kds_completed_at,
    nowMs,
  );
  const badgeProps = getOrderAlertBadgeProps(waitInfo);

  return (
    <Badge
      variant={badgeProps.badgeVariant}
      className={badgeProps.badgeClassName}
    >
      {badgeProps.label}
    </Badge>
  );
}

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
    key: "wait_time",
    header: ORDERS_PAGE_COPY.waitTimeHeader,
    render: (order) => <OrderWaitTimeBadge order={order} />,
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
      (order.payment?.method ?? order.payment_method) ? (
        <Badge variant="outline" className="text-xs">
          {getPaymentMethodLabelVi(
            order.payment?.method ?? order.payment_method ?? "",
          )}
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

/* ─── Copy ─── */

const ORDERS_COPY = {
  inProgressLabel: "Đang xử lý",
  inProgressHint: "Đơn chưa hoàn tất trong kết quả lọc.",
  paidLabel: "Đơn đã thanh toán",
  paidHint: "Đơn đã thu tiền trong kết quả lọc.",
  revenueLabel: "Doanh thu đã thu",
  revenueHint: "Chỉ tính đơn đã thanh toán.",
  listCountNote: (shown: number, total: number) =>
    total > shown
      ? `Hiển thị 50 đơn mới nhất trong ${String(total)} đơn`
      : `${String(total)} đơn hàng`,
} as const;

/* ─── Props ─── */

interface OrdersClientProps {
  initialOrders: OrderRow[];
  initialSummary: OrdersSummary;
  branches: { id: number; name: string }[];
  showBranchFilter: boolean;
  initialSelectedOrder?: OrderRow | null;
}

/* ─── Component ─── */

export function OrdersClient({
  initialOrders,
  initialSummary,
  branches,
  showBranchFilter,
  initialSelectedOrder = null,
}: OrdersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [summary, setSummary] = useState<OrdersSummary>(initialSummary);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(
    initialSelectedOrder,
  );
  const [isPending, startTransition] = useTransition();
  // xl:+ swaps the OrderDetailSheet slide-over for an inline master-detail
  // right column — same OrderDetailContent body,
  // two mount points.
  const isXlUp = useIsXlUp();
  const controlSize = useFormControlSize();

  // Filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const alertFilter = parseAlertFilter(searchParams.get("alert"));
  const notifiedRef = useRef<Set<string>>(new Set());

  const setAlertFilter = useCallback(
    (next: AlertFilter) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (next === "all") nextParams.delete("alert");
      else nextParams.set("alert", next);
      const q = nextParams.toString();
      startTransition(() => {
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Sync prop-to-state for router.refresh() updates
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const routeBranchId = params?.branchId ? Number(params.branchId) : null;
  const currentBranchId =
    routeBranchId && !isNaN(routeBranchId)
      ? routeBranchId
      : branchId
        ? Number(branchId)
        : null;

  // Warning-only attention while viewing /orders. Critical SLA is durable via cron.
  useEffect(() => {
    const checkDelayAlerts = () => {
      const nowMs = Date.now();
      for (const order of orders) {
        if (order.status === "completed" || order.status === "cancelled") continue;
        if (order.kds_completed_at) continue;
        const info = computeOrderWaitInfo(
          order.created_at,
          order.kds_completed_at,
          nowMs,
        );

        if (info.alertLevel === "warning") {
          const warnKey = `warn:${order.id}`;
          if (!notifiedRef.current.has(warnKey)) {
            notifiedRef.current.add(warnKey);
            toast.warning(
              ORDERS_PAGE_COPY.warningToast(order.order_number, info.waitMinutes),
            );
          }
        }
      }
    };

    checkDelayAlerts();
    const timer = setInterval(checkDelayAlerts, 30000);
    return () => clearInterval(timer);
  }, [orders]);

  const initialSubscribeSeenRef = useRef(false);

  useRealtimeChannel(
    (supabase, token) => {
      let tenantId: number | null = null;
      if (token) {
        const claims = extractClaimsFromAccessToken(token);
        if (claims) {
          tenantId = claims.tenant_id;
        }
      }
      if (tenantId === null) return null;

      // Filter dynamically based on current branch selection or route context
      const realtimeFilter = currentBranchId
        ? `branch_id=eq.${String(currentBranchId)}`
        : `tenant_id=eq.${String(tenantId)}`;

      return supabase
        .channel(
          `orders-list-realtime-${String(tenantId)}-${String(currentBranchId ?? "all")}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: realtimeFilter,
          },
          () => {
            startTransition(() => {
              router.refresh();
            });
          },
        )
        .subscribe((subscriptionStatus) => {
          if (subscriptionStatus !== "SUBSCRIBED") return;
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          startTransition(() => {
            router.refresh();
          });
        });
    },
    [currentBranchId, router],
  );

  // Tab visibility reconnect backstop
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

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
        setSummary(result.data.summary);
      }
    });
  }

  function handleReset() {
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setBranchId("");
    setAlertFilter("all");
    startTransition(async () => {
      const result = await fetchOrders();
      if (result.success && result.data) {
        setOrders(result.data.orders);
        setSummary(result.data.summary);
      }
    });
  }

  const hasFilters = !!(dateFrom || dateTo || status || branchId || alertFilter !== "all");

  const { delayStats, displayOrders } = useMemo(() => {
    let warningCount = 0;
    let criticalCount = 0;

    const filtered = orders.filter((order) => {
      const info = computeOrderWaitInfo(order.created_at, order.kds_completed_at);
      if (info.alertLevel === "warning") warningCount++;
      if (info.alertLevel === "critical") criticalCount++;

      if (alertFilter === "warning") return info.alertLevel === "warning";
      if (alertFilter === "critical") return info.alertLevel === "critical";
      return true;
    });

    return {
      delayStats: { warningCount, criticalCount },
      displayOrders: filtered,
    };
  }, [orders, alertFilter]);

  const showInlineDetail = isXlUp && !!selectedOrder;

  const listContent = (
    <>
      <KpiRow density="compact" className="grid-cols-2 md:grid-cols-5">
        <KpiCard
          label={ORDERS_COPY.inProgressLabel}
          value={summary.inProgressCount}
          hint={ORDERS_COPY.inProgressHint}
          density="compact"
        />
        <KpiCard
          label={ORDERS_COPY.paidLabel}
          value={summary.paidCount}
          hint={ORDERS_COPY.paidHint}
          density="compact"
        />
        <KpiCard
          label={ORDERS_COPY.revenueLabel}
          value={formatVND(summary.paidRevenue)}
          hint={ORDERS_COPY.revenueHint}
          density="compact"
        />
        <KpiCard
          label={ORDERS_PAGE_COPY.warningCountLabel}
          value={delayStats.warningCount}
          hint={ORDERS_PAGE_COPY.warningCountHint}
          density="compact"
          className={delayStats.warningCount > 0 ? "border-warning/20 bg-warning/10" : ""}
        />
        <KpiCard
          label={ORDERS_PAGE_COPY.criticalCountLabel}
          value={delayStats.criticalCount}
          hint={ORDERS_PAGE_COPY.criticalCountHint}
          density="compact"
          className={delayStats.criticalCount > 0 ? "border-destructive/20 bg-destructive/10 text-destructive" : ""}
        />
      </KpiRow>

      {/* ─── Filter bar ─── */}
      <AppToolbar sticky className="items-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="date-from" className="text-xs">
            {FORM_VI.fromDate}
          </Label>
          <InputGroup
            size={controlSize}
            className="w-full sm:w-36"
          >
            <InputGroupInput
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </InputGroup>
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="date-to" className="text-xs">
            {FORM_VI.toDate}
          </Label>
          <InputGroup
            size={controlSize}
            className="w-full sm:w-36"
          >
            <InputGroupInput
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </InputGroup>
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="status-filter" className="text-xs">
            {FORM_VI.status}
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              id="status-filter"
              size={controlSize}
              className="w-full sm:w-40"
            >
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORDER_STATUS_LABELS_VI).map(([value, label]) => (
                <SelectItem
                  key={value}
                  value={value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="alert-filter" className="text-xs">
            {ORDERS_PAGE_COPY.alertFilterLabel}
          </Label>
          <Select
            value={alertFilter}
            onValueChange={(val) => setAlertFilter(parseAlertFilter(val))}
          >
            <SelectTrigger
              id="alert-filter"
              size={controlSize}
              className="w-full sm:w-44"
            >
              <SelectValue placeholder={ORDERS_PAGE_COPY.alertFilterAll} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {ORDERS_PAGE_COPY.alertFilterAll} ({orders.length})
              </SelectItem>
              <SelectItem value="warning">
                {ORDERS_PAGE_COPY.alertFilterWarning} ({delayStats.warningCount})
              </SelectItem>
              <SelectItem value="critical">
                {ORDERS_PAGE_COPY.alertFilterCritical} ({delayStats.criticalCount})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showBranchFilter && branches.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 sm:w-48 sm:flex-none">
            <Label htmlFor="branch-filter" className="text-xs">
              {BRANCH_VI.long}
            </Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger
                id="branch-filter"
                size={controlSize}
                className="w-full sm:w-44"
              >
                <SelectValue placeholder={BRANCH_VI.selectAll} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem
                    key={b.id}
                    value={String(b.id)}
                    size={controlSize === "touch" ? "touch" : "default"}
                  >
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
            size={controlSize}
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
              size={controlSize}
              className="flex-1 sm:flex-none"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </AppToolbar>

      <AppToolbar className="justify-between">
        <p className="text-sm text-muted-foreground">
          {ORDERS_COPY.listCountNote(displayOrders.length, summary.totalCount)}
        </p>
        {hasFilters && <Badge variant="info">Bộ lọc đang áp dụng</Badge>}
      </AppToolbar>

      {/* ─── Table ─── */}
      <AppSection
        title="Danh sách đơn"
        description="Trạng thái, thanh toán và tổng tiền từng đơn."
        contentFlush
        contentScroll
      >
        <DataTable
          columns={ORDER_COLUMNS}
          data={displayOrders}
          getRowKey={(order) => order.id}
          pageSize={50}
          onRowClick={setSelectedOrder}
          emptyTitle="Không có đơn hàng nào"
          emptyDescription={
            hasFilters
              ? "Thử xóa bộ lọc hoặc đổi mốc thời gian."
              : "Hệ thống chưa có đơn nào trong phạm vi đang xem."
          }
          emptyIcon={<IconShoppingBag />}
          emptyMode={hasFilters ? "no-results" : "no-data"}
          mobileCardRender={(order) => (
            <Item
              variant="outline"
              className="cursor-pointer text-left"
              render={
                <button type="button" onClick={() => setSelectedOrder(order)} />
              }
            >
              <ItemHeader>
                <ItemContent>
                  <ItemTitle className="font-mono">
                    {order.order_number}
                  </ItemTitle>
                  <ItemDescription>{order.branch_name}</ItemDescription>
                </ItemContent>
                <StatusBadge domain="order" value={order.status} />
              </ItemHeader>
              <ItemFooter>
                <span className="text-xs text-muted-foreground">
                  {STAFF_VI.long}: {order.created_by_name}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatVND(order.total_amount)}
                </span>
              </ItemFooter>
              <ItemFooter>
                <span className="text-xs text-muted-foreground">
                  {formatVNDateTime(order.created_at)}
                </span>
                {order.payment_method ? (
                  <Badge variant="outline" className="text-xs">
                    {getPaymentMethodLabelVi(order.payment_method)}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </ItemFooter>
            </Item>
          )}
        />
      </AppSection>
    </>
  );

  return (
    <>
      {showInlineDetail ? (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 flex flex-col gap-4">
            {listContent}
          </div>
          <AppSection
            title={`#${selectedOrder.order_number}`}
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Đóng chi tiết đơn"
                onClick={() => setSelectedOrder(null)}
              >
                <IconX />
              </Button>
            }
            className="sticky top-4 w-96 shrink-0"
          >
            <OrderDetailContent order={selectedOrder} />
          </AppSection>
        </div>
      ) : (
        listContent
      )}

      {/* ─── Detail sheet (<xl master-detail mode) ─── */}
      {!isXlUp && (
        <OrderDetailSheet
          order={selectedOrder}
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
        />
      )}
    </>
  );
}
