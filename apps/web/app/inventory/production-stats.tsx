"use client";

import { useMemo } from "react";
import { SectionCard } from "@/components/patterns";
import type { ProductionOrderRow } from "./production-types";

interface ProductionStatsProps {
  orders: ProductionOrderRow[];
  readinessMessage: string | null;
  centralKitchenCount: number;
  branchKindSchemaAvailable: boolean;
}

export function ProductionStats({
  orders,
  readinessMessage,
  centralKitchenCount,
  branchKindSchemaAvailable,
}: ProductionStatsProps) {
  const totals = useMemo(() => {
    const draft = orders.filter((order) => order.status === "draft").length;
    const completed = orders.filter(
      (order) => order.status === "completed",
    ).length;
    const cancelled = orders.filter(
      (order) => order.status === "cancelled",
    ).length;
    return { draft, completed, cancelled };
  }, [orders]);

  return (
    <>
      {readinessMessage && (
        <SectionCard
          className="rounded-lg border-warning/20 bg-warning/10"
          density="compact"
        >
          {readinessMessage}
        </SectionCard>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Lệnh nháp
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.draft}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đã hoàn tất
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.completed}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đã hủy
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.cancelled}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div className="text-sm text-muted-foreground">
          {centralKitchenCount > 0
            ? `Có ${centralKitchenCount} bếp trung tâm đang hoạt động`
            : branchKindSchemaAvailable
              ? "Chưa có bếp trung tâm nào được cấu hình"
              : "Chưa thể đọc danh sách bếp trung tâm vì thiếu migration"}
        </div>
      </div>
    </>
  );
}
