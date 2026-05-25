import type { ReactNode } from "react";
import Image from "next/image";
import {
  CheckCircle2 as IconCheckCircle,
  CircleAlert as IconAlertCircle,
  Clock3 as IconClock,
  CookingPot as IconCookingPot,
  Sparkles as IconSparkles,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { cn } from "@comtammatu/ui";
import {
  buildRunnerQueue,
  type RunnerQueueItem,
} from "@comtammatu/shared/runner";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import {
  formatVNTime,
  getVNDateString,
  getVNDayUtcRange,
} from "@/_lib/format-datetime";
import { RunnerRealtimeRefresh } from "./runner-realtime-refresh";

const RUNNER_TICKET_LIMIT = 180;
const RUNNER_SERVED_WINDOW_MINUTES = 10;
const RUNNER_MASCOT_SRC = "/brand/mascot/be-suon-tuoi-runner.png";
const RUNNER_RECEIVED_PREFIX = "Nhận đơn";
const RUNNER_WAIT_PREFIX = "chờ";
const RUNNER_TRACKING_LABEL = "Theo dõi lượt gọi";
const RUNNER_CURRENT_LABEL = "Đơn hiện tại";
const RUNNER_EMPTY_CURRENT_TITLE = "Chưa có đơn bếp đang làm";
const RUNNER_EMPTY_CURRENT_DESCRIPTION =
  "Khi KDS có đơn đang chờ hoặc đang chuẩn bị, số bàn hoặc mã mang về sẽ hiện lớn tại đây.";
const RUNNER_ERROR_MESSAGE =
  "Không tải được màn gọi số. Vui lòng tải lại trang.";

export default async function RunnerPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const branchIdNum = Number(branchId);
  const { supabase, claims } = await loadAuthState();
  const { startIso: todayStartIso } = getVNDayUtcRange(getVNDateString());
  const servedAfterIso = new Date(
    Date.now() - RUNNER_SERVED_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

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
      "id, order_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at",
    )
    .eq("branch_id", branchIdNum)
    .in("status", ["pending", "preparing", "ready", "served"])
    .gte("created_at", todayStartIso)
    .order("created_at", { ascending: true })
    .limit(RUNNER_TICKET_LIMIT);

  if (ticketsError) {
    return <RunnerErrorState />;
  }

  const tickets = ticketRows ?? [];
  const orderIds = [...new Set(tickets.map((ticket) => ticket.order_id))];
  const batchIds = [
    ...new Set(
      tickets
        .map((ticket) => ticket.kitchen_send_batch_id)
        .filter((id): id is number => id !== null),
    ),
  ];

  const [ordersRes, batchesRes] =
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
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (ordersRes.error || batchesRes.error) {
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
    servedAfterIso,
  });

  const preparingItems = queue
    .filter((item) => item.lane === "preparing")
    .sort(compareRunnerItemAsc);
  const completedItems = queue
    .filter((item) => item.lane === "served")
    .sort(compareRunnerItemDesc);
  const currentItem = preparingItems[0] ?? null;
  const nextItem = preparingItems[1] ?? null;
  const previousItem = completedItems[0] ?? null;
  const nextCount = Math.max(preparingItems.length - 1, 0);

  return (
    <AppPage
      density="compact"
      width="full"
      className="flex overflow-hidden bg-gradient-to-br from-background via-secondary to-accent"
      contentClassName="min-h-0 flex-1 overflow-hidden"
    >
      <RunnerRealtimeRefresh branchId={branchIdNum} />

      <RunnerDisplayBoard
        branchName={branch.name}
        previousItem={previousItem}
        currentItem={currentItem}
        nextItem={nextItem}
        currentCount={preparingItems.length}
        nextCount={nextCount}
        completedCount={completedItems.length}
        nowMs={Date.now()}
      />
    </AppPage>
  );
}

function RunnerDisplayBoard({
  branchName,
  previousItem,
  currentItem,
  nextItem,
  currentCount,
  nextCount,
  completedCount,
  nowMs,
}: {
  branchName: string;
  previousItem: RunnerQueueItem | null;
  currentItem: RunnerQueueItem | null;
  nextItem: RunnerQueueItem | null;
  currentCount: number;
  nextCount: number;
  completedCount: number;
  nowMs: number;
}) {
  return (
    <section
      aria-label={`Màn chạy đơn ${branchName}`}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto lg:overflow-hidden"
    >
      <AppPageHeader
        eyebrow="Màn gọi món"
        title={branchName}
        className="shrink-0"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <RunnerSummaryBadge
              icon={<IconCookingPot className="size-3" />}
              label="Bếp đang làm"
              value={currentCount}
              variant="default"
            />
            <RunnerSummaryBadge
              icon={<IconClock className="size-3" />}
              label="Tiếp theo"
              value={nextCount}
              variant="info"
            />
            <RunnerSummaryBadge
              icon={<IconCheckCircle className="size-3" />}
              label="Đã phục vụ"
              value={completedCount}
              variant="success"
            />
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-12 lg:overflow-hidden">
        <RunnerStagePanel
          branchName={branchName}
          item={currentItem}
          nowMs={nowMs}
        />

        <aside
          aria-label={RUNNER_TRACKING_LABEL}
          className="grid min-h-0 gap-3 lg:col-span-4 lg:grid-rows-2 lg:overflow-hidden xl:col-span-3"
        >
          <RunnerSidePanel
            panelLabel="Đơn tiếp theo"
            item={nextItem}
            stateLabel="Trong hàng KDS"
            emptyLabel="Chưa có lượt tiếp theo"
            tone="info"
          />
          <RunnerSidePanel
            panelLabel="Đã phục vụ"
            item={previousItem}
            stateLabel="Bếp đã hoàn thành"
            emptyLabel="Chưa có lượt đã phục vụ"
            tone="success"
          />
        </aside>
      </div>
    </section>
  );
}

function RunnerSummaryBadge({
  icon,
  label,
  value,
  variant,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  variant: "default" | "info" | "success";
}) {
  return (
    <Badge variant={variant} className="gap-1 font-mono tabular-nums">
      {icon}
      <span className="font-sans">{label}</span>
      <span>{value}</span>
    </Badge>
  );
}

function RunnerStagePanel({
  branchName,
  item,
  nowMs,
}: {
  branchName: string;
  item: RunnerQueueItem | null;
  nowMs: number;
}) {
  return (
    <Card
      aria-label={`Đơn hiện tại ${branchName}`}
      className="relative min-h-0 border-primary/30 bg-gradient-to-br from-card via-card to-accent/20 shadow-lg ring-2 ring-primary/10 lg:col-span-8 lg:h-full xl:col-span-9"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-primary"
      />
      <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2 text-left">
            <Badge variant={item ? "default" : "outline"} className="w-fit">
              {item ? "Bếp đang làm" : "Đang chờ đơn KDS"}
            </Badge>
            <p className="font-heading text-base font-semibold text-foreground">
              {RUNNER_CURRENT_LABEL}
            </p>
          </div>
          <RunnerMascot quiet={!item} />
        </div>

        {item ? (
          <div className="grid min-h-0 flex-1 place-items-center gap-6 text-center">
            <RunnerTargetDisplay item={item} size="stage" />
          </div>
        ) : (
          <div className="mx-auto grid max-w-md flex-1 place-items-center gap-3 text-center text-muted-foreground">
            <p className="font-heading text-base font-semibold">
              {RUNNER_EMPTY_CURRENT_TITLE}
            </p>
            <p className="text-sm leading-6">
              {RUNNER_EMPTY_CURRENT_DESCRIPTION}
            </p>
          </div>
        )}

        {item ? <RunnerStageMeta item={item} nowMs={nowMs} /> : null}
      </CardContent>
    </Card>
  );
}

function RunnerStageMeta({
  item,
  nowMs,
}: {
  item: RunnerQueueItem;
  nowMs: number;
}) {
  return (
    <dl className="grid gap-2 border-t border-border/70 pt-4 text-left sm:grid-cols-3">
      <RunnerMetaItem
        icon={<IconClock className="size-3" />}
        label={RUNNER_RECEIVED_PREFIX}
        value={formatVNTime(item.orderReceivedAt)}
      />
      <RunnerMetaItem
        icon={<IconCookingPot className="size-3" />}
        label={RUNNER_WAIT_PREFIX}
        value={formatWaitDuration(item.orderReceivedAt, nowMs)}
      />
      <RunnerMetaItem
        icon={<IconSparkles className="size-3" />}
        label="Phiếu tham chiếu"
        value={item.referenceNumber}
      />
    </dl>
  );
}

function RunnerMetaItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="truncate font-mono text-sm text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function RunnerSidePanel({
  panelLabel,
  item,
  stateLabel,
  emptyLabel,
  tone,
}: {
  panelLabel: "Đã phục vụ" | "Đơn tiếp theo";
  item: RunnerQueueItem | null;
  stateLabel: string;
  emptyLabel: string;
  tone: "primary" | "info" | "success";
}) {
  const badgeVariant: "success" | "info" | "outline" =
    tone === "success" ? "success" : tone === "info" ? "info" : "outline";

  return (
    <Card
      size="sm"
      aria-label={panelLabel}
      className="min-h-0 border-border/80 bg-card/90 shadow-sm lg:h-full"
    >
      <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="grid gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {panelLabel}
            </p>
            <Badge variant={item ? badgeVariant : "outline"} className="w-fit">
              {item ? stateLabel : "Trống"}
            </Badge>
          </div>
        </div>

        {item ? (
          <div className="grid min-h-0 flex-1 place-items-center gap-3 text-center">
            <RunnerTargetDisplay item={item} size="slot" />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-center text-muted-foreground">
            <p className="font-heading text-sm font-semibold">{emptyLabel}</p>
          </div>
        )}

        {item ? (
          <p className="truncate border-t border-border/70 pt-3 font-mono text-sm text-muted-foreground">
            {item.referenceNumber}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunnerMascot({ quiet = false }: { quiet?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-primary/20 bg-accent/70 shadow-sm",
        quiet ? "aspect-square w-20 opacity-80" : "aspect-square w-16",
      )}
    >
      <Image
        src={RUNNER_MASCOT_SRC}
        alt=""
        width={192}
        height={256}
        className={cn("h-auto object-contain", quiet ? "w-16" : "w-12")}
        priority={!quiet}
      />
    </span>
  );
}

function RunnerTargetDisplay({
  item,
  size,
}: {
  item: RunnerQueueItem;
  size: "stage" | "slot";
}) {
  const target = formatRunnerTarget(item);
  const isStage = size === "stage";
  const isSlot = size === "slot";
  const isLongCode = target.kind === "code" && target.display.length > 12;

  return (
    <div className="grid min-w-0 gap-3">
      <p className="font-heading text-base font-semibold uppercase tracking-wide text-primary">
        {target.label}
      </p>
      <p
        className={cn(
          "break-words font-mono font-semibold leading-none text-foreground tabular-nums",
          isStage &&
            target.kind === "table" &&
            "text-6xl sm:text-7xl lg:text-8xl",
          isStage &&
            target.kind === "code" &&
            (isLongCode
              ? "text-2xl sm:text-2xl lg:text-6xl"
              : "text-6xl sm:text-7xl lg:text-8xl"),
          isSlot && target.kind === "table" && "text-6xl",
          isSlot && target.kind === "code" && "text-xl sm:text-2xl",
        )}
      >
        {target.display}
      </p>
    </div>
  );
}

function formatRunnerTarget(item: RunnerQueueItem): {
  kind: "table" | "code";
  label: string;
  display: string;
} {
  if (item.tableNumber !== null) {
    return {
      kind: "table",
      label: "Bàn",
      display: String(item.tableNumber),
    };
  }

  if (item.orderType === "dine_in") {
    return {
      kind: "code",
      label: "Bàn chưa rõ",
      display: item.callNumber,
    };
  }

  return {
    kind: "code",
    label: "Mang về",
    display: item.callNumber,
  };
}

function formatWaitDuration(receivedAt: string, nowMs: number): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((nowMs - new Date(receivedAt).getTime()) / 60_000),
  );

  if (elapsedMinutes < 1) return "dưới 1 phút";
  if (elapsedMinutes < 60) return `${String(elapsedMinutes)} phút`;

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  if (minutes === 0) return `${String(hours)} giờ`;
  return `${String(hours)} giờ ${String(minutes)} phút`;
}

function compareRunnerItemAsc(a: RunnerQueueItem, b: RunnerQueueItem): number {
  return new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime();
}

function compareRunnerItemDesc(a: RunnerQueueItem, b: RunnerQueueItem): number {
  return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
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
