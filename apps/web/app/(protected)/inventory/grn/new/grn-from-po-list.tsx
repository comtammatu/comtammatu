"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  FileClock as IconFileTime,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import { InteractiveCard } from "../../_components/mobile/interactive-card";
import { createGrnFromPo } from "../../grn-actions";
import { formatVND } from "../../_lib/format";

type OpenPoRow = {
  id: number;
  po_number: string;
  status: string;
  supplier_name: string;
  line_count: number;
  total_est: number | null;
  ordered_at: string | null;
};

type Props = {
  openPos: OpenPoRow[];
};

function formatOrderedAt(iso: string | null): string {
  if (!iso) return "—";
  const days = diffVNDateDays(getVNDateString(iso), getVNDateString());
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  return formatVNDate(iso);
}

export function GrnFromPoList({ openPos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [pendingPoId, setPendingPoId] = React.useState<number | null>(null);

  function handleCreate(poId: number) {
    setPendingPoId(poId);
    startTransition(async () => {
      const res = await createGrnFromPo(poId);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo phiếu nhập từ PO.");
        setPendingPoId(null);
        return;
      }
      const grn = res.data as { id: number };
      router.push(`/inventory/grn/${grn.id}?review=1`);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          Từ PO chờ nhận
        </p>
        <Badge variant="secondary" className="h-5 px-2 text-3xs">
          {openPos.length}
        </Badge>
      </div>
      {openPos.map((po) => {
        const rowPending = isPending && pendingPoId === po.id;
        return (
          <InteractiveCard
            key={po.id}
            asChild
            minHeight="mobile"
            padding="default"
            className="h-auto"
          >
            <button
              type="button"
              className="w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              onClick={() => handleCreate(po.id)}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconFileTime className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-base font-semibold leading-tight">
                    {po.po_number}
                  </p>
                  {po.status === "partially_received" ? (
                    <Badge variant="outline" className="h-5 px-1.5 text-3xs">
                      Nhận một phần
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {po.supplier_name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{po.line_count} mặt hàng</span>
                  {po.total_est != null ? (
                    <span>~{formatVND(po.total_est)} đ</span>
                  ) : null}
                  <span>{formatOrderedAt(po.ordered_at)}</span>
                </div>
              </div>
              <IconChevronRight
                className={
                  rowPending
                    ? "size-5 shrink-0 animate-pulse text-primary"
                    : "size-5 shrink-0 text-muted-foreground"
                }
              />
            </button>
          </InteractiveCard>
        );
      })}
    </section>
  );
}
