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
import { ItemGroup } from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { transferReceive } from "@/(protected)/inventory/transfer-actions";
import type { TransferDetail } from "@/(protected)/inventory/transfers/[id]/transfer-detail-client";
import { messages } from "@lib/messages";

type TransferReceiveClientProps = {
  transfer: TransferDetail;
  backHref: string;
  detailHref: string;
};

const RECEIVABLE_TRANSFER_STATUSES = new Set(["in_transit", "confirmed_receive"]);

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
  const [notes, setNotes] = useState<Record<number, string>>(() => ({}));
  // The line whose number-pad drawer is open (null = closed). The pad is a
  // bottom sheet so the line list stays scrollable and the keypad rises to the
  // thumb on tap — no scrolling to a fixed inline pad.
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const isReceiveMode = RECEIVABLE_TRANSFER_STATUSES.has(transfer.status);
  const isWaitingForTransit = transfer.status === "confirmed_ship";
  const remaining = total - confirmed.size;
  const progress = total === 0 ? 0 : confirmed.size / total;

  const sheetItem = useMemo(
    () => items.find((item) => item.ingredientId === sheetId) ?? null,
    [items, sheetId],
  );
  const nextItem = useMemo(
    () => items.find((item) => !confirmed.has(item.ingredientId)) ?? null,
    [items, confirmed],
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
    const payload: Record<string, { qty: number; note?: string }> = {};
    for (const item of items) {
      const qty = values[item.ingredientId] ?? item.qty;
      if (!Number.isFinite(qty) || qty < 0 || qty > item.qty) {
        setSheetId(item.ingredientId);
        toast.error(receiveCopy.receiveExceedsSent);
        return;
      }
      const note = notes[item.ingredientId]?.trim() ?? "";
      if (qty < item.qty && note.length < 3) {
        toast.error(copy.shortageNoteMinLength);
        return;
      }
      payload[String(item.ingredientId)] =
        qty < item.qty ? { qty, note } : { qty };
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
      <>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href={backHref} aria-label={ACTIONS_VI.back}>
              <IconArrowLeft className="size-4" />
            </Link>
          </Button>
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
            {transfer.code}
          </span>
        </div>
        <AppEmptyState
          compact
          mode="no-data"
          title={
            isWaitingForTransit
              ? receiveCopy.receiveWaitingTransit
              : receiveCopy.receiveNotReady
          }
          description={
            isWaitingForTransit
              ? receiveCopy.receiveWaitingTransitDescription
              : receiveCopy.receiveNotReadyDescription
          }
        >
          <Button asChild variant="outline" size="sm">
            <Link href={isWaitingForTransit ? backHref : detailHref}>
              {isWaitingForTransit
                ? receiveCopy.receiveBackToList
                : receiveCopy.receiveOpenDetail}
            </Link>
          </Button>
        </AppEmptyState>
      </>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href={backHref} aria-label={ACTIONS_VI.back}>
            <IconArrowLeft className="size-4" />
          </Link>
        </Button>
        <span className="font-mono text-sm font-semibold">{transfer.code}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {receiveCopy.receiveFrom(transfer.fromBranch)}
        </span>
      </div>

      <div className="rounded-md bg-muted/50 p-2.5">
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

        {nextItem ? (
          <InteractiveCard
            asChild
            padding="compact"
            minHeight="tap"
            className="mt-2"
          >
            <button
              type="button"
              className="w-full flex-col items-start justify-center text-left"
              onClick={() => setSheetId(nextItem.ingredientId)}
            >
              <SectionLabel>
                {receiveCopy.receiveNextLine}
              </SectionLabel>
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {nextItem.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {receiveCopy.receiveSent(String(nextItem.qty), nextItem.unit)}
                </span>
              </span>
            </button>
          </InteractiveCard>
        ) : null}
      </div>

      <ItemGroup className="gap-2">
        {items.map((item) => {
          const isConfirmed = confirmed.has(item.ingredientId);
          const isNext = nextItem?.ingredientId === item.ingredientId;
          const value = values[item.ingredientId] ?? item.qty;
          const isShortage = isConfirmed && value < item.qty;
          return (
            <InteractiveCard
              key={item.ingredientId}
              padding="compact"
              minHeight="tap"
              className="flex-col items-stretch gap-2"
            >
              <button
                type="button"
                onClick={() => setSheetId(item.ingredientId)}
                className="flex w-full items-center gap-3 text-left"
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
                      : isNext
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {isConfirmed ? value : receiveCopy.receiveTapToEnter}
                </span>
              </button>
              {isShortage ? (
                <label className="flex flex-col gap-1.5" data-vaul-no-drag>
                  <span className="text-xs font-medium text-destructive">
                    {copy.shortageNoteTitle}
                  </span>
                  <Textarea
                    value={notes[item.ingredientId] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [item.ingredientId]: event.target.value,
                      }))
                    }
                    placeholder={copy.shortageNotePlaceholder}
                    className="min-h-20"
                    maxLength={300}
                    disabled={isPending}
                  />
                </label>
              ) : null}
            </InteractiveCard>
          );
        })}
      </ItemGroup>

      <AppDetailFooter
        sticky
        trailing={
          <Button
            type="button"
            size="touch-lg"
            variant={remaining > 0 ? "outline" : "default"}
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? <Spinner className="size-5" /> : null}
            {remaining > 0
              ? receiveCopy.receiveConfirmRemaining(remaining)
              : receiveCopy.receiveConfirmAll}
          </Button>
        }
      />

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
        initialValue={
          sheetItem
            ? confirmed.has(sheetItem.ingredientId)
              ? (values[sheetItem.ingredientId] ?? sheetItem.qty)
              : null
            : null
        }
        onConfirm={handleSheetConfirm}
        allowDecimal
      />
    </div>
  );
}
