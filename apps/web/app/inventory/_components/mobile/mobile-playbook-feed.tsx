import {
  TriangleAlert as IconAlertTriangle,
  ClipboardList as IconClipboardList,
  Hourglass as IconHourglass,
  PackageX as IconPackageOff,
  Receipt as IconReceipt,
  Send as IconSend,
  ShoppingCart as IconShoppingCart,
  Truck as IconTruck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { MobileEmptyState } from "./mobile-empty-state";
import { MobilePlaybookTaskCard } from "./mobile-playbook-task-card";
import { branchHrefOrPath } from "../../_lib/href";
import {
  severityBucket,
  severityBucketLabel,
  type PlaybookSeverityBucket,
  type PlaybookTask,
} from "../../_lib/playbook-types";

interface MobilePlaybookFeedProps {
  tasks: PlaybookTask[];
  branchId: number | null;
}

interface RenderedTask {
  task: PlaybookTask;
  view: ReturnType<typeof renderTask>;
}

function renderTask(task: PlaybookTask, branchId: number | null) {
  switch (task.kind) {
    case "po_draft_pending":
      return {
        icon: IconShoppingCart,
        title: `${task.pos.length} PO chờ gửi`,
        description: "Mở để gửi cho NCC.",
        count: task.pos.length,
        meta: task.pos[0]
          ? `Sớm nhất: ${task.pos[0].po_number} · ${task.pos[0].supplier_name}`
          : null,
        preview: task.pos.slice(0, 3).map(
          (po) => `${po.po_number} · ${po.supplier_name} (${po.line_count} dòng)`,
        ),
        totalItems: task.pos.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/grn", {
            filter: "draft",
          }),
          label: "Mở danh sách",
        },
      };

    case "reorder_critical": {
      const isProcurement =
        task.branch_kind === "central_warehouse" ||
        task.branch_kind === "central_kitchen";
      return {
        icon: IconAlertTriangle,
        title: `${task.ingredients.length} NL chạm ngưỡng`,
        description: isProcurement
          ? "Cần đặt PO bù tồn."
          : "Cần yêu cầu cấp hàng từ Kho.",
        count: task.ingredients.length,
        meta: task.ingredients
          .slice(0, 3)
          .map((i) => i.name)
          .join(", "),
        preview: task.ingredients
          .slice(0, 3)
          .map((i) => `${i.name} · còn ${i.current} ${i.unit}`),
        totalItems: task.ingredients.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/stock"),
          label: "Mở Tồn kho",
        },
      };
    }

    case "transfer_inbound_unconfirmed":
      return {
        icon: IconTruck,
        title: `${task.transfers.length} phiếu chờ nhận`,
        description: "Xác nhận tại trang Điều chuyển.",
        count: task.transfers.length,
        meta: task.transfers[0]
          ? `Sớm nhất: ${task.transfers[0].transfer_number} từ ${task.transfers[0].from_branch_name}`
          : null,
        preview: task.transfers
          .slice(0, 3)
          .map(
            (t) =>
              `${t.transfer_number} · ${t.from_branch_name} → ${t.to_branch_name}`,
          ),
        totalItems: task.transfers.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/transfers"),
          label: "Mở danh sách",
        },
      };

    case "transfer_outbound_pending":
      return {
        icon: IconSend,
        title: `${task.transfers.length} phiếu chờ ship`,
        description: "Xác nhận tại trang Điều chuyển.",
        count: task.transfers.length,
        meta: task.transfers[0]
          ? `Sớm nhất: ${task.transfers[0].transfer_number} → ${task.transfers[0].to_branch_name}`
          : null,
        preview: task.transfers
          .slice(0, 3)
          .map(
            (t) =>
              `${t.transfer_number} · ${t.from_branch_name} → ${t.to_branch_name}`,
          ),
        totalItems: task.transfers.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/transfers"),
          label: "Mở danh sách",
        },
      };

    case "expiry_urgent": {
      const expiredCount = task.lots.filter((l) => l.days_left <= 0).length;
      return {
        icon: IconHourglass,
        title:
          expiredCount > 0
            ? `${expiredCount} lô hết hạn + ${task.lots.length - expiredCount} cận hạn`
            : `${task.lots.length} lô cận hạn`,
        description: "Xuất FEFO hoặc ghi hao hụt.",
        count: task.lots.length,
        meta: task.lots[0]
          ? `Sớm nhất: ${task.lots[0].ingredient_name}${task.lots[0].lot ? ` (Lô ${task.lots[0].lot})` : ""}`
          : null,
        preview: task.lots
          .slice(0, 3)
          .map(
            (l) =>
              `${l.ingredient_name}${l.lot ? ` · Lô ${l.lot}` : ""} · còn ${l.days_left} ngày`,
          ),
        totalItems: task.lots.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/expiry"),
          label: "Mở Hạn dùng",
        },
      };
    }

    case "stocktake_in_progress": {
      const sample = task.sessions[0];
      return {
        icon: IconClipboardList,
        title: `${task.sessions.length} phiên kiểm kê đang mở`,
        description: "Hoàn tất đếm để khoá chênh lệch.",
        count: task.sessions.length,
        meta: sample
          ? `#${sample.id}: ${sample.counted}/${sample.total} (${sample.progress}%)`
          : null,
        preview: task.sessions
          .slice(0, 3)
          .map(
            (s) =>
              `#${s.id} · ${s.branch_name} · ${s.counted}/${s.total} (${s.progress}%)`,
          ),
        totalItems: task.sessions.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/stocktake"),
          label: "Mở Kiểm kê",
        },
      };
    }

    case "grn_draft_pending":
      return {
        icon: IconReceipt,
        title: `${task.grns.length} GRN nháp`,
        description: "Hoàn tất nhập kho.",
        count: task.grns.length,
        meta: task.grns[0]
          ? `Sớm nhất: ${task.grns[0].grn_number} · ${task.grns[0].supplier_name}`
          : null,
        preview: task.grns
          .slice(0, 3)
          .map((g) => `${g.grn_number} · ${g.supplier_name}`),
        totalItems: task.grns.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/grn", {
            filter: "draft",
          }),
          label: "Mở danh sách",
        },
      };

    case "price_review_pending":
      return {
        icon: IconPackageOff,
        title: `${task.lines.length} dòng GRN cần kiểm giá`,
        description: "Giá lệch baseline 30 ngày.",
        count: task.lines.length,
        meta: task.lines[0]
          ? `${task.lines[0].grn_number} · ${task.lines[0].ingredient_name} (${task.lines[0].variance_pct > 0 ? "+" : ""}${task.lines[0].variance_pct}%)`
          : null,
        preview: task.lines
          .slice(0, 3)
          .map(
            (l) =>
              `${l.grn_number} · ${l.ingredient_name} (${l.variance_pct > 0 ? "+" : ""}${l.variance_pct}%)`,
          ),
        totalItems: task.lines.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/grn", {
            priceReview: "1",
          }),
          label: "Kiểm tra GRN",
        },
      };

    case "transfer_suggestion": {
      const totalIngredients = task.pairs.reduce(
        (sum, p) => sum + p.ingredients.length,
        0,
      );
      const sample = task.pairs[0];
      return {
        icon: IconSend,
        title: `Đề xuất chuyển ${task.pairs.length} phiếu`,
        description: "Bù tồn từ kho dư sang kho thiếu.",
        count: totalIngredients,
        meta:
          sample && sample.ingredients[0]
            ? `${sample.from_branch_name} → ${sample.to_branch_name} · ${sample.ingredients[0].name}`
            : null,
        preview: task.pairs
          .slice(0, 3)
          .map(
            (p) =>
              `${p.from_branch_name} → ${p.to_branch_name} (${p.ingredients.length} NL)`,
          ),
        totalItems: task.pairs.length,
        deeplink: {
          href: branchHrefOrPath(branchId, "/inventory/m/transfers"),
          label: "Mở Điều chuyển",
        },
      };
    }
  }
}

export function MobilePlaybookFeed({
  tasks,
  branchId,
}: MobilePlaybookFeedProps) {
  if (tasks.length === 0) {
    return (
      <MobileEmptyState
        icon={IconShoppingCart}
        title="Hôm nay không có việc gấp"
        description="Mọi luồng kho đang vận hành ổn định."
      />
    );
  }

  const buckets: Record<PlaybookSeverityBucket, RenderedTask[]> = {
    now: [],
    warning: [],
    watch: [],
  };
  for (const task of tasks) {
    buckets[severityBucket(task.severity)].push({
      task,
      view: renderTask(task, branchId),
    });
  }

  const order: PlaybookSeverityBucket[] = ["now", "warning", "watch"];

  return (
    <div className="flex flex-col gap-4">
      {order.map((bucket) => {
        const items = buckets[bucket];
        if (items.length === 0) return null;
        return (
          <section key={bucket} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {severityBucketLabel(bucket)}
              </h2>
              <Badge variant="outline" className="tabular-nums">
                {items.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {items.map(({ task, view }) => (
                <MobilePlaybookTaskCard
                  key={task.kind}
                  icon={view.icon}
                  severity={task.severity}
                  title={view.title}
                  description={view.description}
                  count={view.count}
                  meta={view.meta}
                  preview={view.preview}
                  totalItems={view.totalItems}
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
