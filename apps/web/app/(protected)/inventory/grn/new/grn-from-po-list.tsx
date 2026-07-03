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
import { INVENTORY_VI, TOAST_VI } from "@comtammatu/shared/messages";
import { InteractiveCard } from "@/components/data-table/interactive-card";
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
  grnBasePath?: string;
};

function formatOrderedAt(iso: string | null): string {
  if (!iso) return "—";
  const days = diffVNDateDays(getVNDateString(iso), getVNDateString());
  if (days <= 0) return INVENTORY_VI.today;
  if (days === 1) return INVENTORY_VI.yesterday;
  if (days < 7) return `${days} ngày trước`;
  return formatVNDate(iso);
}

export function GrnFromPoList({ openPos, grnBasePath = "/inventory/grn" }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [pendingPoId, setPendingPoId] = React.useState<number | null>(null);

  function handleCreate(poId: number) {
    setPendingPoId(poId);
    startTransition(async () => {
      const res = await createGrnFromPo(poId);
      if (!res.success || !res.data) {
        toast.error(res.error ?? TOAST_VI.createGrnFromPoFailed);
        setPendingPoId(null);
        return;
      }
      const grn = res.data as { id: number };
      router.push(`${grnBasePath}/${grn.id}?review=1`);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {INVENTORY_VI.fromPoPending}
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
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <IconFileTime className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-base font-semibold leading-tight">
                    {po.po_number}
                  </p>
                  {po.status === "partially_received" ? (
                    <Badge variant="outline" className="h-5 px-1.5 text-3xs">
                      {INVENTORY_VI.partialReceive}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {po.supplier_name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                    ? "size-5 shrink-0 motion-safe:animate-pulse text-primary"
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
