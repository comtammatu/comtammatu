"use client";

import { useMemo } from "react";
import {
  TriangleAlert as IconAlertTriangle,
  ChartBar as IconChartBar,
  ClipboardList as IconClipboardList,
  Hourglass as IconHourglass,
  PackageX as IconPackageOff,
  Receipt as IconReceipt,
  Send as IconSend,
  ShoppingCart as IconShoppingCart,
  Sparkles as IconSparkles,
  Truck as IconTruck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import Link from "next/link";
import { PlaybookTaskCard } from "./playbook-task-card";
import { PlaybookActionButtons } from "./playbook-action-buttons";
import {
  severityBucket,
  severityBucketLabel,
  type PlaybookSeverityBucket,
  type PlaybookTask,
} from "../_lib/playbook-types";

interface PlaybookFeedProps {
  tasks: PlaybookTask[];
  branchId: number | null;
  branchKind: "central_warehouse" | "central_kitchen" | "branch";
  /** Snapshot for empty-state metrics. */
  emptySnapshot: {
    pendingPoCount: number;
    activeTransfers: number;
    activeStocktakes: number;
  };
  /** Inline action context (currently: supply branch for Smart Requisition). */
  defaultSupplyBranchId: number | null;
}

interface RenderedTask {
  task: PlaybookTask;
  view: ReturnType<typeof renderTask>;
}

function branchHref(branchId: number | null, path: string): string {
  return branchId != null ? `${path}?branchId=${branchId}` : path;
}

function renderTask(
  task: PlaybookTask,
  branchId: number | null,
  defaultSupplyBranchId: number | null,
) {
  const action = (
    <PlaybookActionButtons
      task={task}
      context={{ defaultSupplyBranchId }}
    />
  );

  switch (task.kind) {
    case "po_draft_pending": {
      const first = task.pos[0];
      const meta =
        first != null
          ? `Sớm nhất: ${first.po_number} · ${first.supplier_name} · ${first.line_count} dòng`
          : null;
      return {
        icon: IconShoppingCart,
        title: `${task.pos.length} PO chờ gửi NCC`,
        description: "Gửi để khoá đơn và bắt đầu chu trình giao hàng.",
        count: task.pos.length,
        meta,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/purchase-orders"),
          label: "Mở danh sách",
        },
      };
    }

    case "reorder_critical": {
      const isProcurement =
        task.branch_kind === "central_warehouse" ||
        task.branch_kind === "central_kitchen";
      const sample = task.ingredients
        .slice(0, 3)
        .map((i) => i.name)
        .join(", ");
      return {
        icon: IconAlertTriangle,
        title: `${task.ingredients.length} nguyên liệu chạm ngưỡng`,
        description: isProcurement
          ? "Tạo PO ngay để bù tồn (tự nhóm theo NCC)."
          : "Yêu cầu cấp hàng từ Kho Tổng / Bếp TT.",
        count: task.ingredients.length,
        meta: sample
          ? `Ưu tiên: ${sample}${task.ingredients.length > 3 ? "..." : ""}`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/stock"),
          label: "Mở Tồn kho",
        },
      };
    }

    case "transfer_inbound_unconfirmed": {
      const sample = task.transfers[0];
      return {
        icon: IconTruck,
        title: `${task.transfers.length} phiếu chuyển đến chờ nhận`,
        description: "Xác nhận đã nhận và kiểm số lượng từng dòng.",
        count: task.transfers.length,
        meta: sample
          ? `Sớm nhất: ${sample.transfer_number} từ ${sample.from_branch_name}`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/transfers"),
          label: "Mở danh sách",
        },
      };
    }

    case "transfer_outbound_pending": {
      const sample = task.transfers[0];
      return {
        icon: IconSend,
        title: `${task.transfers.length} phiếu chuyển đi chờ ship`,
        description: "Xác nhận đã xuất và khởi vận chuyển.",
        count: task.transfers.length,
        meta: sample
          ? `Sớm nhất: ${sample.transfer_number} → ${sample.to_branch_name}`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/transfers"),
          label: "Mở danh sách",
        },
      };
    }

    case "expiry_urgent": {
      const expiredCount = task.lots.filter((l) => l.days_left <= 0).length;
      const sample = task.lots[0];
      return {
        icon: IconHourglass,
        title:
          expiredCount > 0
            ? `${expiredCount} lô đã hết hạn + ${task.lots.length - expiredCount} cận hạn`
            : `${task.lots.length} lô cận hạn ≤ 3 ngày`,
        description:
          "Ưu tiên xuất FEFO hoặc ghi nhận hao hụt để tránh phát sinh chi phí.",
        count: task.lots.length,
        meta: sample
          ? `Sớm nhất: ${sample.ingredient_name}${sample.lot ? ` (Lô ${sample.lot})` : ""} · còn ${sample.days_left} ngày`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/expiry"),
          label: "Mở danh sách",
        },
      };
    }

    case "stocktake_in_progress": {
      const sample = task.sessions[0];
      return {
        icon: IconClipboardList,
        title: `${task.sessions.length} phiên kiểm kê đang mở`,
        description:
          "Hoàn tất đếm để khoá chênh lệch và phát sinh điều chỉnh tồn.",
        count: task.sessions.length,
        meta: sample
          ? `Tiến độ #${sample.id}: ${sample.counted}/${sample.total} (${sample.progress}%)`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/stocktake"),
          label: "Mở danh sách",
        },
      };
    }

    case "grn_draft_pending": {
      const sample = task.grns[0];
      return {
        icon: IconReceipt,
        title: `${task.grns.length} GRN nháp chưa xác nhận`,
        description: "Hoàn tất nhập kho để tồn được cập nhật.",
        count: task.grns.length,
        meta: sample
          ? `Sớm nhất: ${sample.grn_number} · ${sample.supplier_name}`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/grn"),
          label: "Mở danh sách",
        },
      };
    }

    case "price_review_pending": {
      const sample = task.lines[0];
      return {
        icon: IconPackageOff,
        title: `${task.lines.length} dòng GRN cần kiểm giá`,
        description: "Giá nhập lệch lớn so với lịch sử 30 ngày.",
        count: task.lines.length,
        meta: sample
          ? `Sớm nhất: ${sample.grn_number} · ${sample.ingredient_name} (${sample.variance_pct > 0 ? "+" : ""}${sample.variance_pct}%)`
          : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/grn"),
          label: "Kiểm tra GRN",
        },
      };
    }

    case "transfer_suggestion": {
      const totalIngredients = task.pairs.reduce(
        (sum, pair) => sum + pair.ingredients.length,
        0,
      );
      const isProcurement =
        task.branch_kind === "central_warehouse" ||
        task.branch_kind === "central_kitchen";
      const samplePair = task.pairs[0];
      const sampleIngredient = samplePair?.ingredients[0];
      return {
        icon: IconSend,
        title: isProcurement
          ? `Đề xuất chuyển hàng (${task.pairs.length} chi nhánh)`
          : `Kho có dư cho ${totalIngredients} nguyên liệu bạn đang thiếu`,
        description: isProcurement
          ? "Bạn đang dư kho, các chi nhánh đang thiếu cùng nguyên liệu — tạo phiếu chuyển 1-click."
          : "Bù tồn ngay từ Kho Tổng / Bếp TT đang dư.",
        count: totalIngredients,
        meta:
          samplePair && sampleIngredient
            ? `Sớm nhất: ${samplePair.from_branch_name} → ${samplePair.to_branch_name} · ${sampleIngredient.name} ${sampleIngredient.suggested_qty} ${sampleIngredient.unit}`
            : null,
        actionSlot: action,
        deeplink: {
          href: branchHref(branchId, "/inventory/transfers"),
          label: "Mở danh sách chuyển",
        },
      };
    }
  }
}

export function PlaybookFeed({
  tasks,
  branchId,
  branchKind,
  emptySnapshot,
  defaultSupplyBranchId,
}: PlaybookFeedProps) {
  void branchKind;
  const grouped = useMemo(() => {
    const buckets: Record<PlaybookSeverityBucket, RenderedTask[]> = {
      now: [],
      warning: [],
      watch: [],
    };
    for (const task of tasks) {
      buckets[severityBucket(task.severity)].push({
        task,
        view: renderTask(task, branchId, defaultSupplyBranchId),
      });
    }
    return buckets;
  }, [tasks, branchId, defaultSupplyBranchId]);

  if (tasks.length === 0) {
    return (
      <PlaybookEmptyState
        branchId={branchId}
        snapshot={emptySnapshot}
      />
    );
  }

  const order: PlaybookSeverityBucket[] = ["now", "warning", "watch"];

  return (
    <div className="flex flex-col gap-5">
      {order.map((bucket) => {
        const items = grouped[bucket];
        if (items.length === 0) return null;
        return (
          <section key={bucket} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {severityBucketLabel(bucket)}
              </h2>
              <Badge variant="outline" className="tabular-nums">
                {items.length}
              </Badge>
            </div>
            <div className="grid gap-2">
              {items.map(({ task, view }) => (
                <PlaybookTaskCard
                  key={task.kind}
                  icon={view.icon}
                  severity={task.severity}
                  title={view.title}
                  description={view.description}
                  count={view.count}
                  meta={view.meta}
                  actionSlot={view.actionSlot}
                  deeplink={view.deeplink}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlaybookEmptyState({
  branchId,
  snapshot,
}: {
  branchId: number | null;
  snapshot: PlaybookFeedProps["emptySnapshot"];
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 border bg-card px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <IconSparkles className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">
          Hôm nay chưa có việc cần xử lý gấp
        </p>
        <p className="text-sm text-muted-foreground">
          Mọi luồng kho đang vận hành ổn định.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        <SnapshotMetric
          label="PO đang mở"
          value={snapshot.pendingPoCount}
          icon={IconShoppingCart}
        />
        <SnapshotMetric
          label="Phiếu chuyển đang xử lý"
          value={snapshot.activeTransfers}
          icon={IconTruck}
        />
        <SnapshotMetric
          label="Phiên kiểm kê đang mở"
          value={snapshot.activeStocktakes}
          icon={IconClipboardList}
        />
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={branchHref(branchId, "/inventory/reports")}>
          <IconChartBar className="size-3.5" />
          Xem báo cáo tổng
        </Link>
      </Button>
    </div>
  );
}

function SnapshotMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof IconShoppingCart;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
