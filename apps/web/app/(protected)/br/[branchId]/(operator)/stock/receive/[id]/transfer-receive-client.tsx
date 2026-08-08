"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CheckCircle2 as IconCheckCircle,
  Circle as IconCircle,
  RotateCcw as IconRotateCcw,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { useIsOnline } from "@/components/pwa-runtime";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import {
  transferConfirmReceive,
  transferReceive,
} from "@/(protected)/inventory/transfer-actions";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  isTransferReceiveReady,
  isTransferReceiveStartable,
  type TransferDetail,
} from "@lib/inventory/transfer-detail-model";
import { messages } from "@lib/messages";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";

type TransferReceiveClientProps = {
  transfer: TransferDetail;
  backHref: string;
  /** Omit on store branch — CN confirms under YCH, not DC detail. */
  detailHref?: string | null;
  /** Prefer parent YCH number on store branch receive chrome. */
  documentTitle?: string | null;
};

/** Prevents Strict Mode / remount double-start for the same transfer. */
const receiveSessionStartRequested = new Set<number>();

function ReceiveChrome({
  transfer,
  backHref,
  documentTitle,
  children,
}: {
  transfer: TransferDetail;
  backHref: string;
  documentTitle: string;
  children: ReactNode;
}) {
  const receiveCopy = messages.inventory.transfer.receiveNative;
  return (
    <BranchOperatorPage
      title={documentTitle}
      description={receiveCopy.receiveFrom(transfer.fromBranch)}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            className="shrink-0"
            render={<Link href={backHref} aria-label={ACTIONS_VI.back} />}
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold tabular-nums">
              {documentTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {receiveCopy.receiveFrom(transfer.fromBranch)}
            </p>
          </div>
        </BranchOperatorControlBar>
        {children}
      </div>
    </BranchOperatorPage>
  );
}

export function TransferReceiveClient({
  transfer,
  backHref,
  detailHref = null,
  documentTitle = null,
}: TransferReceiveClientProps) {
  const router = useRouter();
  const isOnline = useIsOnline();
  const copy = messages.inventory.transfer;
  const receiveCopy = copy.receiveNative;
  const chromeTitle =
    documentTitle?.trim() ||
    transfer.stockRequestNumber?.trim() ||
    transfer.code;
  const items = transfer.items;
  const total = items.length;

  const [values, setValues] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    for (const item of items) {
      initial[item.ingredientId] = item.qty;
    }
    return initial;
  });
  const [confirmed, setConfirmed] = useState<Set<number>>(() => new Set());
  const [notes, setNotes] = useState<Record<number, string>>(() => ({}));
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isStarting, setIsStarting] = useState(() =>
    isTransferReceiveStartable(transfer.status),
  );
  const [startError, setStartError] = useState<string | null>(null);

  const isReceiveMode = isTransferReceiveReady(transfer.status);
  const canStartReceive = isTransferReceiveStartable(transfer.status);
  const showReceiveWorkspace = isReceiveMode || canStartReceive;
  const remaining = total - confirmed.size;
  const progress = total === 0 ? 0 : confirmed.size / total;
  const confirmBlocked =
    isPending || !isOnline || (canStartReceive && (isStarting || startError != null));

  const sheetItem = useMemo(
    () => items.find((item) => item.ingredientId === sheetId) ?? null,
    [items, sheetId],
  );
  const nextItem = useMemo(
    () => items.find((item) => !confirmed.has(item.ingredientId)) ?? null,
    [items, confirmed],
  );

  function startReceiveSession({ force = false }: { force?: boolean } = {}) {
    if (!canStartReceive) return;
    if (!isOnline) {
      setIsStarting(false);
      setStartError(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }
    if (!force && receiveSessionStartRequested.has(transfer.id)) return;
    receiveSessionStartRequested.add(transfer.id);
    setIsStarting(true);
    setStartError(null);
    startTransition(async () => {
      const result = await transferConfirmReceive(transfer.id);
      if (result.success) {
        setIsStarting(false);
        router.refresh();
        return;
      }
      // Allow retry; refresh recovers races where status already advanced.
      receiveSessionStartRequested.delete(transfer.id);
      router.refresh();
      setIsStarting(false);
      setStartError(
        applyInventoryActionError(result, receiveCopy.receiveStartFailed)
          .toastMessage,
      );
    });
  }

  useEffect(() => {
    if (!canStartReceive) {
      receiveSessionStartRequested.delete(transfer.id);
      setIsStarting(false);
      setStartError(null);
      return;
    }
    startReceiveSession();
    // Auto-open the receive session once when the pad loads in_transit.
  }, [canStartReceive, isOnline, transfer.id]);

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

  function handleConfirmAllAsSent() {
    setConfirmed(() => new Set(items.map((item) => item.ingredientId)));
  }

  function handleConfirm() {
    if (!isOnline) {
      toast.error(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }
    const payload: Record<string, { qty: number; note?: string }> = {};
    for (const item of items) {
      const qty = values[item.ingredientId] ?? item.qty;
      if (!Number.isFinite(qty) || qty < 0 || qty > item.qty) {
        setSheetId(item.ingredientId);
        toast.error(receiveCopy.receiveExceedsSent);
        return;
      }
      const note = notes[item.ingredientId]?.trim() ?? "";
      if (qty < item.qty && note.length < 5) {
        toast.error(copy.shortageNoteMinLength);
        return;
      }
      payload[String(item.ingredientId)] =
        qty < item.qty ? { qty, note } : { qty };
    }
    startTransition(async () => {
      if (canStartReceive) {
        const startResult = await transferConfirmReceive(transfer.id);
        if (!startResult.success) {
          toast.error(
            applyInventoryActionError(
              startResult,
              receiveCopy.receiveStartFailed,
            ).toastMessage,
          );
          return;
        }
      }
      const result = await transferReceive(transfer.id, payload);
      if (result.success) {
        toast.success(receiveCopy.receiveSuccess);
        router.push(backHref);
        router.refresh();
        return;
      }
      toast.error(
        applyInventoryActionError(result, receiveCopy.receiveFailed)
          .toastMessage,
      );
    });
  }

  if (!showReceiveWorkspace) {
    const waitingShip = transfer.status === "confirmed_ship";
    return (
      <ReceiveChrome
        transfer={transfer}
        backHref={backHref}
        documentTitle={chromeTitle}
      >
        <AppEmptyState
          compact
          mode="no-data"
          title={
            waitingShip
              ? receiveCopy.receiveWaitingShipTitle
              : receiveCopy.receiveNotReady
          }
          description={
            waitingShip
              ? receiveCopy.receiveWaitingShipDescription
              : receiveCopy.receiveNotReadyDescription
          }
          symbol="riceGrain"
        >
          {detailHref ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={detailHref} />}
            >
              {receiveCopy.receiveOpenDetail}
            </Button>
          ) : null}
        </AppEmptyState>
      </ReceiveChrome>
    );
  }

  return (
    <ReceiveChrome
      transfer={transfer}
      backHref={backHref}
      documentTitle={chromeTitle}
    >
      {canStartReceive && isStarting ? (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>{receiveCopy.receiveStarting}</span>
        </div>
      ) : null}

      {canStartReceive && startError != null ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-2">
            <p>{startError}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!isOnline || isPending}
              onClick={() => startReceiveSession({ force: true })}
            >
              <IconRotateCcw data-icon="inline-start" />
              {receiveCopy.receiveStartRetry}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

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

        {remaining > 0 ? (
          <Button
            type="button"
            size="touch"
            variant="secondary"
            className="mt-2 w-full"
            disabled={confirmBlocked}
            onClick={handleConfirmAllAsSent}
          >
            {receiveCopy.receiveConfirmAllAsSent}
          </Button>
        ) : null}

        {nextItem ? (
          <InteractiveCard
            padding="compact"
            minHeight="tap"
            className="mt-2"
            render={
              <button
                type="button"
                className="w-full flex-col items-start justify-center text-left"
                onClick={() => setSheetId(nextItem.ingredientId)}
              />
            }
          >
            <SectionLabel>{receiveCopy.receiveNextLine}</SectionLabel>
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {nextItem.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {receiveCopy.receiveSent(String(nextItem.qty), nextItem.unit)}
              </span>
            </span>
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
            <div key={item.ingredientId} className="flex flex-col gap-2">
              <InteractiveCard
                padding="compact"
                minHeight="tap"
                render={
                  <button
                    type="button"
                    onClick={() => setSheetId(item.ingredientId)}
                    className="flex w-full items-center gap-3 text-left"
                  />
                }
              >
                {isConfirmed ? (
                  <IconCheckCircle className="size-5 shrink-0 text-primary" />
                ) : (
                  <IconCircle className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.name}</div>
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
              </InteractiveCard>
              {isShortage ? (
                <Item
                  variant="outline"
                  className="flex-col items-stretch gap-1.5"
                  render={<label />}
                >
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
                    disabled={isPending || !isOnline}
                  />
                </Item>
              ) : null}
            </div>
          );
        })}
      </ItemGroup>

      <AppDetailFooter
        sticky
        leading={
          <Button
            variant="outline"
            size="touch"
            render={<Link href={backHref} />}
          >
            <IconArrowLeft data-icon="inline-start" />
            {ACTIONS_VI.back}
          </Button>
        }
        trailing={
          <div className="flex flex-col items-end gap-1">
            {remaining > 0 ? (
              <span className="text-2xs leading-none text-muted-foreground">
                {receiveCopy.receiveDefaultRemainingHint(remaining)}
              </span>
            ) : null}
            <Button
              type="button"
              size="touch-lg"
              variant={remaining > 0 ? "outline" : "default"}
              disabled={confirmBlocked}
              onClick={handleConfirm}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {receiveCopy.receiveConfirmAll}
            </Button>
          </div>
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
    </ReceiveChrome>
  );
}
