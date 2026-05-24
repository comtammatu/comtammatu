import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { cn } from "@comtammatu/ui";
import { buildRunnerQueue, type RunnerQueueItem } from "@comtammatu/shared/runner";
import { AppPage } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import { RunnerRealtimeRefresh } from "./runner-realtime-refresh";

const RUNNER_TICKET_LIMIT = 180;

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
    .in("status", ["pending", "preparing", "ready"])
    .gte("created_at", todayStartIso)
    .order("created_at", { ascending: true })
    .limit(RUNNER_TICKET_LIMIT);

  if (ticketsError) {
    return <RunnerErrorState />;
  }

  const tickets = ticketRows ?? [];
  const orderIds = [...new Set(tickets.map((ticket) => ticket.order_id))];
  const orderItemIds = [...new Set(tickets.map((ticket) => ticket.order_item_id))];
  const batchIds = [
    ...new Set(
      tickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    ),
  ];

  const [ordersRes, itemsRes, batchesRes] =
    orderIds.length > 0
      ? await Promise.all([
          supabase
            .from("orders")
            .select("id, order_number, order_type, table_id, status, created_at, tables(number)")
            .eq("branch_id", branchIdNum)
            .in("id", orderIds),
          supabase
            .from("order_items")
            .select("id, order_id, item_name, quantity, status")
            .in("id", orderItemIds),
          batchIds.length > 0
            ? supabase
                .from("kitchen_send_batches")
                .select("id, order_id, kitchen_ticket_number, send_seq, kind, created_at")
                .in("id", batchIds)
            : Promise.resolve({ data: [], error: null }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (ordersRes.error || itemsRes.error || batchesRes.error) {
    return <RunnerErrorState />;
  }

  const queue = buildRunnerQueue({
    tickets,
    orders: (ordersRes.data ?? []) as Parameters<typeof buildRunnerQueue>[0]["orders"],
    orderItems: (itemsRes.data ?? []) as Parameters<typeof buildRunnerQueue>[0]["orderItems"],
    kitchenBatches: (batchesRes.data ?? []) as Parameters<typeof buildRunnerQueue>[0]["kitchenBatches"],
  });

  const calling = queue.filter((item) => item.lane === "calling");
  const preparing = queue.filter((item) => item.lane === "preparing");
  const pending = queue.filter((item) => item.lane === "pending");
  const focus = calling[0] ?? null;
  const sideCalling = calling.slice(1, 5);
  const upcoming = [...preparing, ...pending].slice(0, 8);

  return (
    <AppPage
      density="compact"
      width="full"
      className="flex overflow-hidden"
      contentClassName="min-h-0 flex-1 overflow-hidden"
    >
      <RunnerRealtimeRefresh branchId={branchIdNum} />
      <RunnerHeader
        branchName={branch.name}
        callingCount={calling.length}
        upcomingCount={preparing.length + pending.length}
      />

      {focus ? (
        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
          <RunnerFocusCard item={focus} />
          <aside className="grid min-h-0 gap-3 overflow-hidden">
            <RunnerQueueColumn title="Đang gọi thêm" items={sideCalling} empty="Không có số khác" />
            <RunnerQueueColumn title="Đang chuẩn bị" items={upcoming} empty="Chưa có đơn tiếp theo" />
          </aside>
        </section>
      ) : (
        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <RunnerEmptyState />
          <RunnerQueueColumn title="Đang chuẩn bị" items={upcoming} empty="Chưa có đơn tiếp theo" />
        </section>
      )}
    </AppPage>
  );
}

function RunnerHeader({
  branchName,
  callingCount,
  upcomingCount,
}: {
  branchName: string;
  callingCount: number;
  upcomingCount: number;
}) {
  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {branchName}
        </p>
        <h1 className="font-heading text-xl font-semibold sm:text-2xl">
          Mời nhận món
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="font-mono tabular-nums">
          Đang gọi {callingCount}
        </Badge>
        <Badge variant="outline" className="font-mono tabular-nums">
          Chuẩn bị {upcomingCount}
        </Badge>
      </div>
    </header>
  );
}

function RunnerFocusCard({ item }: { item: RunnerQueueItem }) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Số đang gọi
            </p>
            <CardTitle className="font-mono text-6xl font-semibold leading-none tabular-nums sm:text-7xl lg:text-8xl">
              {item.callNumber}
            </CardTitle>
          </div>
          <RunnerContextBadges item={item} large />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-4">
        <div className="space-y-3">
          <p className="font-heading text-xl font-semibold sm:text-2xl">
            Vui lòng đối chiếu số trên phiếu
          </p>
          <div className="grid gap-2">
            {item.itemPreview.map((line) => (
              <div
                key={line}
                className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xl font-semibold sm:text-2xl"
              >
                {line}
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Nhân viên sẽ giao món theo số hiển thị trên phiếu hoặc hóa đơn.
        </p>
      </CardContent>
    </Card>
  );
}

function RunnerQueueColumn({
  title,
  items,
  empty,
}: {
  title: string;
  items: RunnerQueueItem[];
  empty: string;
}) {
  return (
    <Card size="sm" className="min-h-0 overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardTitle className="font-heading text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid content-start gap-2 overflow-auto">
        {items.length > 0 ? (
          items.map((item) => <RunnerCompactRow key={item.id} item={item} />)
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RunnerCompactRow({ item }: { item: RunnerQueueItem }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-2xl font-semibold leading-none tabular-nums">
            {item.callNumber}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {item.itemPreview[0] ?? `${String(item.itemCount)} món`}
          </p>
        </div>
        <RunnerContextBadges item={item} />
      </div>
    </div>
  );
}

function RunnerContextBadges({
  item,
  large = false,
}: {
  item: RunnerQueueItem;
  large?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-1.5", large && "gap-2")}>
      <Badge variant="secondary" className={cn("font-mono tabular-nums", large && "text-base")}>
        {item.tableNumber !== null ? `Bàn ${item.tableNumber}` : "Mang về"}
      </Badge>
      <Badge variant="outline" className={cn("font-mono tabular-nums", large && "text-base")}>
        {item.ticketCount} món
      </Badge>
    </div>
  );
}

function RunnerEmptyState() {
  return (
    <Card className="min-h-0">
      <CardContent className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
        <p className="font-heading text-xl font-semibold sm:text-2xl">
          Chưa có số đang gọi
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Khi bếp báo món sẵn sàng, số trên phiếu sẽ xuất hiện tại đây.
        </p>
      </CardContent>
    </Card>
  );
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
        <AlertDescription>
          Không tải được màn gọi số. Vui lòng tải lại trang.
        </AlertDescription>
      </Alert>
    </AppPage>
  );
}
