import type { ReactNode } from "react";
import {
  CircleAlert as IconAlertCircle,
  Clock3 as IconClock,
  CookingPot as IconCookingPot,
} from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  buildRunnerQueue,
  formatRunnerOrderLabel,
  type RunnerQueueItem,
} from "@comtammatu/shared/runner";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { loadAuthState } from "@/_lib/auth";
import {
  getVNDateString,
  getVNDayUtcRange,
} from "@/_lib/format-datetime";
import { RunnerRealtimeRefresh } from "./runner-realtime-refresh";

const RUNNER_TICKET_LIMIT = 180;
const RUNNER_ERROR_MESSAGE =
  "Không tải được màn gọi số. Vui lòng tải lại trang.";
const RUNNER_COPY = {
  eyebrow: "Runner",
  preparing: "Đang làm",
  waiting: "Chờ",
  itemShort: "Món",
  sectionTitle: "Danh sách đơn",
  orderCount: (count: number) => `${String(count)} đơn`,
  emptyTitle: "Chưa có đơn Runner",
  emptyDescription: "KDS chưa có đơn đang làm hoặc đang chờ.",
  itemUnit: "món",
  tableHeaders: {
    sequence: "STT",
    order: "Đơn",
    quantity: "Số lượng món",
    status: "Trạng thái",
  },
} as const;

type RunnerTicketSnapshot = Parameters<
  typeof buildRunnerQueue
>[0]["tickets"][number] & {
  order_item_id: number;
};

type RunnerOrderItemQuantityRow = {
  id: number;
  quantity: number | string | null;
};

type RunnerListStatus = "preparing" | "pending";

type RunnerListRow = {
  key: string;
  item: RunnerQueueItem;
  orderLabel: string;
  itemQuantity: number;
  status: RunnerListStatus;
};

export default async function RunnerPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const branchIdNum = Number(branchId);
  const { supabase, claims } = await loadAuthState();
  const { startIso: todayStartIso } = getVNDayUtcRange(getVNDateString());

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("id", branchIdNum)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (branchError || !branch) {
    return <RunnerErrorState />;
  }

  const { data: ticketRows, error: ticketsError } = await supabase
    .from("kds_tickets")
    .select(
      "id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at",
    )
    .eq("branch_id", branchIdNum)
    .in("status", ["pending", "preparing"])
    .gte("created_at", todayStartIso)
    .order("created_at", { ascending: true })
    .limit(RUNNER_TICKET_LIMIT);

  if (ticketsError) {
    return <RunnerErrorState />;
  }

  const tickets = (ticketRows ?? []) as RunnerTicketSnapshot[];
  const orderIds = [...new Set(tickets.map((ticket) => ticket.order_id))];
  const orderItemIds = [
    ...new Set(tickets.map((ticket) => ticket.order_item_id)),
  ];
  const batchIds = [
    ...new Set(
      tickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    ),
  ];

  const [ordersRes, batchesRes, orderItemsRes] =
    orderIds.length > 0
      ? await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, order_number, order_type, table_id, status, created_at, tables(number)",
            )
            .eq("branch_id", branchIdNum)
            .in("id", orderIds),
          batchIds.length > 0
            ? supabase
                .from("kitchen_send_batches")
                .select(
                  "id, order_id, kitchen_ticket_number, send_seq, kind, created_at",
                )
                .in("id", batchIds)
            : Promise.resolve({ data: [], error: null }),
          orderItemIds.length > 0
            ? supabase
                .from("order_items")
                .select("id, quantity")
                .in("id", orderItemIds)
            : Promise.resolve({ data: [], error: null }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (ordersRes.error || batchesRes.error || orderItemsRes.error) {
    return <RunnerErrorState />;
  }

  const queue = buildRunnerQueue({
    tickets,
    orders: (ordersRes.data ?? []) as Parameters<
      typeof buildRunnerQueue
    >[0]["orders"],
    kitchenBatches: (batchesRes.data ?? []) as Parameters<
      typeof buildRunnerQueue
    >[0]["kitchenBatches"],
  });

  const activeItems = queue
    .filter((item) => item.lane === "preparing")
    .sort(compareRunnerItemAsc);
  const quantityByOrderItemId = new Map(
    ((orderItemsRes.data ?? []) as RunnerOrderItemQuantityRow[]).map((row) => [
      row.id,
      normalizeQuantity(row.quantity),
    ]),
  );
  const orderItemIdByTicketId = new Map(
    tickets.map((ticket) => [ticket.id, ticket.order_item_id]),
  );
  const statusByTicketId = new Map(
    tickets.map((ticket) => [ticket.id, ticket.status]),
  );
  const rows = activeItems.map((item) =>
    toRunnerListRow({
      item,
      orderItemIdByTicketId,
      quantityByOrderItemId,
      statusByTicketId,
    }),
  );
  const preparingCount = rows.filter((row) => row.status === "preparing").length;
  const waitingCount = rows.length - preparingCount;
  const itemCount = rows.reduce((sum, row) => sum + row.itemQuantity, 0);

  return (
    <AppPage
      density="compact"
      width="full"
      scroll
      className="bg-background"
      contentClassName="min-h-0 flex-1"
    >
      <RunnerRealtimeRefresh branchId={branchIdNum} />

      <section
        aria-label={`Runner ${branch.name}`}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <AppPageHeader
          eyebrow={RUNNER_COPY.eyebrow}
          title={branch.name}
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <RunnerSummaryBadge
                icon={<IconCookingPot className="size-3" />}
                label={RUNNER_COPY.preparing}
                value={preparingCount}
                variant="default"
              />
              <RunnerSummaryBadge
                icon={<IconClock className="size-3" />}
                label={RUNNER_COPY.waiting}
                value={waitingCount}
                variant="info"
              />
              <RunnerSummaryBadge
                label={RUNNER_COPY.itemShort}
                value={itemCount}
                variant="secondary"
              />
            </div>
          }
        />

        <AppSection
          title={RUNNER_COPY.sectionTitle}
          badge={{
            children: RUNNER_COPY.orderCount(rows.length),
            variant: rows.length > 0 ? "secondary" : "outline",
          }}
          contentClassName="p-0"
          size="sm"
        >
          <RunnerOrderTable rows={rows} />
        </AppSection>
      </section>
    </AppPage>
  );
}

function RunnerSummaryBadge({
  icon,
  label,
  value,
  variant,
}: {
  icon?: ReactNode;
  label: string;
  value: number;
  variant: BadgeProps["variant"];
}) {
  return (
    <Badge variant={variant} className="gap-1 font-mono tabular-nums">
      {icon}
      <span className="font-sans">{label}</span>
      <span>{formatItemQuantity(value)}</span>
    </Badge>
  );
}

function RunnerOrderTable({ rows }: { rows: RunnerListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 text-center">
            {RUNNER_COPY.tableHeaders.sequence}
          </TableHead>
          <TableHead>{RUNNER_COPY.tableHeaders.order}</TableHead>
          <TableHead className="w-32 text-right">
            {RUNNER_COPY.tableHeaders.quantity}
          </TableHead>
          <TableHead className="w-32">
            {RUNNER_COPY.tableHeaders.status}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmptyStateRow
            colSpan={4}
            title={RUNNER_COPY.emptyTitle}
            description={RUNNER_COPY.emptyDescription}
            paddingClassName="py-10"
          />
        ) : (
          rows.map((row, index) => {
            const status = getRunnerStatusMeta(row.status);

            return (
              <TableRow
                key={row.key}
                className={
                  row.status === "preparing"
                    ? "bg-primary/5 hover:bg-primary/10"
                    : undefined
                }
              >
                <TableCell className="text-center font-mono text-base tabular-nums">
                  {index + 1}
                </TableCell>
                <TableCell className="min-w-40 whitespace-normal break-words font-mono text-6xl font-semibold leading-none tabular-nums sm:text-7xl lg:text-8xl">
                  {row.orderLabel}
                </TableCell>
                <TableCell className="text-right font-mono text-base tabular-nums">
                  {formatItemQuantity(row.itemQuantity)} {RUNNER_COPY.itemUnit}
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function toRunnerListRow({
  item,
  orderItemIdByTicketId,
  quantityByOrderItemId,
  statusByTicketId,
}: {
  item: RunnerQueueItem;
  orderItemIdByTicketId: Map<number, number>;
  quantityByOrderItemId: Map<number, number>;
  statusByTicketId: Map<number, string>;
}): RunnerListRow {
  return {
    key: item.id,
    item,
    orderLabel: formatRunnerOrderLabel(item),
    itemQuantity: countItemQuantity({
      item,
      orderItemIdByTicketId,
      quantityByOrderItemId,
    }),
    status: resolveRunnerListStatus(item, statusByTicketId),
  };
}

function countItemQuantity({
  item,
  orderItemIdByTicketId,
  quantityByOrderItemId,
}: {
  item: RunnerQueueItem;
  orderItemIdByTicketId: Map<number, number>;
  quantityByOrderItemId: Map<number, number>;
}): number {
  const seenOrderItemIds = new Set<number>();
  let total = 0;

  for (const ticketId of item.ticketIds) {
    const orderItemId = orderItemIdByTicketId.get(ticketId);
    if (orderItemId === undefined || seenOrderItemIds.has(orderItemId)) {
      continue;
    }

    seenOrderItemIds.add(orderItemId);
    total += quantityByOrderItemId.get(orderItemId) ?? 0;
  }

  return total > 0 ? total : item.ticketCount;
}

function resolveRunnerListStatus(
  item: RunnerQueueItem,
  statusByTicketId: Map<number, string>,
): RunnerListStatus {
  for (const ticketId of item.ticketIds) {
    if (statusByTicketId.get(ticketId) === "preparing") return "preparing";
  }

  return "pending";
}

function getRunnerStatusMeta(status: RunnerListStatus): {
  label: "Đang làm" | "Chờ";
  variant: BadgeProps["variant"];
} {
  if (status === "preparing") {
    return { label: "Đang làm", variant: "default" };
  }

  return { label: "Chờ", variant: "info" };
}

function normalizeQuantity(value: number | string | null): number {
  const quantity = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return quantity;
}

function formatItemQuantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(value);
}

function compareRunnerItemAsc(a: RunnerQueueItem, b: RunnerQueueItem): number {
  return new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime();
}

function RunnerErrorState() {
  return (
    <AppPage
      density="compact"
      width="full"
      className="flex overflow-hidden"
      contentClassName="min-h-0 flex-1 items-center justify-center"
    >
      <Alert variant="destructive" className="max-w-md">
        <IconAlertCircle />
        <AlertDescription>{RUNNER_ERROR_MESSAGE}</AlertDescription>
      </Alert>
    </AppPage>
  );
}
