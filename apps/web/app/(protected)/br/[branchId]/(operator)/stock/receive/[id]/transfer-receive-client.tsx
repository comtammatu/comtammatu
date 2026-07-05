"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CheckCircle2 as IconCheckCircle,
  Circle as IconCircle,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { AppEmptyState } from "@/components/surface";
import { NumberPadSheet } from "@/components/form";
import { transferReceive } from "@/(protected)/inventory/transfer-actions";
import type { TransferDetail } from "@/(protected)/inventory/transfers/[id]/transfer-detail-client";
import { messages } from "@lib/messages";

type TransferReceiveClientProps = {
  transfer: TransferDetail;
  backHref: string;
  detailHref: string;
};

export function TransferReceiveClient({
  transfer,
  backHref,
  detailHref,
}: TransferReceiveClientProps) {
  const router = useRouter();
  const copy = messages.inventory.transfer;
  const receiveCopy = copy.receiveNative;
  const items = transfer.items;
  const total = items.length;

  // Received quantity per line, defaulting to the sent quantity (the common
  // case is received == sent, so an unopened line already carries a valid value).
  const [values, setValues] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    for (const item of items) {
      initial[item.ingredientId] = item.qty;
    }
    return initial;
  });
  const [confirmed, setConfirmed] = useState<Set<number>>(() => new Set());
  // The line whose number-pad drawer is open (null = closed). The pad is a
  // bottom sheet so the line list stays scrollable and the keypad rises to the
  // thumb on tap — no scrolling to a fixed inline pad.
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const isReceiveMode = transfer.status === "confirmed_receive";
  const remaining = total - confirmed.size;
  const progress = total === 0 ? 0 : confirmed.size / total;

  const sheetItem = useMemo(
    () => items.find((item) => item.ingredientId === sheetId) ?? null,
    [items, sheetId],
  );

  function handleSheetConfirm(value: number) {
    if (sheetItem == null) return;
    if (!Number.isFinite(value) || value < 0) {
      toast.error(receiveCopy.receiveInvalidQty);
      return;
    }
    if (value > sheetItem.qty) {
      toast.error(receiveCopy.receiveExceedsSent);
      return;
    }
    const id = sheetItem.ingredientId;
    setValues((current) => ({ ...current, [id]: value }));
    setConfirmed((current) => new Set(current).add(id));
  }

  function handleConfirm() {
    const payload: Record<string, { qty: number }> = {};
    for (const item of items) {
      const qty = values[item.ingredientId] ?? item.qty;
      if (!Number.isFinite(qty) || qty < 0 || qty > item.qty) {
        setSheetId(item.ingredientId);
        toast.error(receiveCopy.receiveExceedsSent);
        return;
      }
      payload[String(item.ingredientId)] = { qty };
    }
    startTransition(async () => {
      const result = await transferReceive(transfer.id, payload);
      if (result.success) {
        toast.success(receiveCopy.receiveSuccess);
        router.push(backHref);
        router.refresh();
        return;
      }
      toast.error(result.error ?? receiveCopy.receiveFailed);
    });
  }

  if (!isReceiveMode) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            aria-label={ACTIONS_VI.back}
          >
            <IconArrowLeft className="size-4" />
          </Link>
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
            {transfer.code}
          </span>
        </div>
        <AppEmptyState
          compact
          mode="no-data"
          title={receiveCopy.receiveNotReady}
          description={receiveCopy.receiveNotReadyDescription}
        >
          <Button asChild variant="outline" size="sm">
            <Link href={detailHref}>{receiveCopy.receiveOpenDetail}</Link>
          </Button>
        </AppEmptyState>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
          aria-label={ACTIONS_VI.back}
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="font-mono text-sm font-semibold">{transfer.code}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {receiveCopy.receiveFrom(transfer.fromBranch)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {receiveCopy.receiveProgress(confirmed.size, total)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const isConfirmed = confirmed.has(item.ingredientId);
          const value = values[item.ingredientId] ?? item.qty;
          return (
            <InteractiveCard
              key={item.ingredientId}
              asChild
              padding="compact"
              minHeight="tap"
            >
              <button
                type="button"
                onClick={() => setSheetId(item.ingredientId)}
                className="w-full text-left"
              >
                {isConfirmed ? (
                  <IconCheckCircle className="size-5 shrink-0 text-primary" />
                ) : (
                  <IconCircle className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {item.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {receiveCopy.receiveSent(String(item.qty), item.unit)}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1 font-mono text-sm font-semibold tabular-nums",
                    isConfirmed
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {value}
                </span>
              </button>
            </InteractiveCard>
          );
        })}
      </div>

      <div className="sticky chrome-safe-bottom z-10 flex w-full flex-col gap-2">
        <Button
          type="button"
          size="touch-lg"
          variant={remaining > 0 ? "outline" : "default"}
          className="w-full"
          disabled={isPending}
          onClick={handleConfirm}
        >
          {isPending ? <Spinner className="size-5" /> : null}
          {remaining > 0
            ? receiveCopy.receiveConfirmRemaining(remaining)
            : receiveCopy.receiveConfirmAll}
        </Button>
      </div>

      <NumberPadSheet
        open={sheetItem != null}
        onOpenChange={(next) => {
          if (!next) setSheetId(null);
        }}
        title={
          sheetItem
            ? `${sheetItem.name} · ${receiveCopy.receiveSent(String(sheetItem.qty), sheetItem.unit)}`
            : ""
        }
        suffix={sheetItem?.unit}
        initialValue={sheetItem ? (values[sheetItem.ingredientId] ?? sheetItem.qty) : 0}
        onConfirm={handleSheetConfirm}
        allowDecimal
      />
    </div>
  );
}
