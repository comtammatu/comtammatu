"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  BellRing as IconBell,
  Check as IconCheck,
  RefreshCw as IconRefresh,
  ReceiptText as IconReceipt,
  X as IconX,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import type { SessionOrder } from "../order-history";
import { ACTIVE_POS_STATUSES } from "../order-history";
import {
  approveSelfOrderBatch,
  approveSelfOrderDeviceJoin,
  cancelSelfOrderPaymentRequest,
  fetchSelfOrderStaffQueue,
  rejectSelfOrderBatch,
  rejectSelfOrderDeviceJoin,
  revokeSelfOrderSessionDevice,
  type SelfOrderApprovedDevice,
  type SelfOrderDeviceRequest,
  type SelfOrderPendingBatch,
  type SelfOrderStaffQueue,
} from "../self-order-actions";

interface SelfOrderApprovalSheetProps {
  branchId: number;
  posSessionId: number;
  orders: SessionOrder[];
  onUpdated: () => Promise<void> | void;
  onOpenPayment: (orderId: number) => void;
}

type TargetChoice = "new" | `order:${number}`;

function batchItemOptionSummary(item: SelfOrderPendingBatch["items"][number]) {
  return [
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      side.quantity > 1
        ? `${formatCount(side.quantity)}x ${side.name}`
        : side.name,
    ),
    item.note ? `${SELF_ORDER_VI.itemNoteLabel}: ${item.note}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function compactClock(value: string | null | undefined) {
  return formatVNTime(value, "") || null;
}

function requestedAtSuffix(value: string | null | undefined) {
  const time = compactClock(value);
  return time ? ` · ${SELF_ORDER_VI.staffRequestedAt(time)}` : "";
}

function expiresAtLabel(value: string | null | undefined) {
  const time = compactClock(value);
  return time ? SELF_ORDER_VI.staffExpiresAt(time) : null;
}

function isPairingCodeError(message: string) {
  return (
    message === SELF_ORDER_VI.staffPairingCodeRequired ||
    message === SELF_ORDER_VI.pairingCodeInvalid
  );
}

export function SelfOrderApprovalSheet({
  branchId,
  posSessionId,
  orders,
  onUpdated,
  onOpenPayment,
}: SelfOrderApprovalSheetProps) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<SelfOrderStaffQueue>({
    pendingBatches: [],
    paymentRequests: [],
    deviceRequests: [],
    approvedDevices: [],
  });
  const [targetByBatch, setTargetByBatch] = useState<
    Record<number, TargetChoice>
  >({});
  const [pairingCodeByDevice, setPairingCodeByDevice] = useState<
    Record<number, string>
  >({});
  const [pairingErrorByDevice, setPairingErrorByDevice] = useState<
    Record<number, string>
  >({});
  const [isPending, startTransition] = useTransition();
  const [isQueueRefreshing, setIsQueueRefreshing] = useState(false);
  const loadGenerationRef = useRef(0);
  const pairingInputByDeviceRef = useRef<
    Record<number, HTMLInputElement | null>
  >({});

  function showPairingCodeError(deviceId: number, message: string) {
    setPairingErrorByDevice((current) => ({
      ...current,
      [deviceId]: message,
    }));
    window.requestAnimationFrame(() => {
      pairingInputByDeviceRef.current[deviceId]?.focus();
    });
  }

  function updatePairingCode(deviceId: number, value: string) {
    setPairingCodeByDevice((current) => ({ ...current, [deviceId]: value }));
    setPairingErrorByDevice((current) => ({ ...current, [deviceId]: "" }));
  }

  const loadQueue = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setIsQueueRefreshing(true);
    const result = await fetchSelfOrderStaffQueue(branchId).catch(() => null);
    if (generation !== loadGenerationRef.current) return;
    if (!result?.success) {
      toast.error(result?.error ?? SELF_ORDER_VI.staffLoadFailed);
      setIsQueueRefreshing(false);
      return;
    }
    setQueue(
      result.data ?? {
        pendingBatches: [],
        paymentRequests: [],
        deviceRequests: [],
        approvedDevices: [],
      },
    );
    setIsQueueRefreshing(false);
  }, [branchId]);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => {
      void loadQueue();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void loadQueue();
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [loadQueue]);

  const count = queue.pendingBatches.length + queue.paymentRequests.length;
  const joinOnlyRequests = queue.deviceRequests.filter(
    (request) => request.batchId == null,
  );
  const countWithJoins = count + joinOnlyRequests.length;

  function approve(batch: SelfOrderPendingBatch) {
    const capabilityV2 =
      batch.capabilityVersion === 2 || Boolean(batch.deviceId);
    const pairingCode = batch.deviceId
      ? pairingCodeByDevice[batch.deviceId]?.trim()
      : undefined;
    if (capabilityV2 && !pairingCode) {
      if (batch.deviceId) {
        showPairingCodeError(
          batch.deviceId,
          SELF_ORDER_VI.staffPairingCodeRequired,
        );
      } else {
        toast.error(SELF_ORDER_VI.staffPairingCodeRequired);
      }
      return;
    }
    const choice = batch.canonicalOrderId
      ? (`order:${batch.canonicalOrderId}` as const)
      : (targetByBatch[batch.id] ?? "new");
    const targetOrderId =
      choice === "new" ? null : Number(choice.replace("order:", ""));
    if (choice !== "new" && !Number.isFinite(targetOrderId)) {
      toast.error(SELF_ORDER_VI.staffTargetRequired);
      return;
    }

    startTransition(async () => {
      const result = await approveSelfOrderBatch({
        batchId: batch.id,
        targetOrderId,
        posSessionId,
        pairingCode,
        capabilityV2,
      });
      if (!result.success) {
        const message = result.error ?? SELF_ORDER_VI.staffActionFailed;
        if (batch.deviceId && isPairingCodeError(message)) {
          showPairingCodeError(batch.deviceId, message);
        } else {
          toast.error(message);
        }
        return;
      }
      if (batch.deviceId) updatePairingCode(batch.deviceId, "");
      toast.success(SELF_ORDER_VI.staffApproved);
      await loadQueue();
      void onUpdated();
    });
  }

  async function reject(batch: SelfOrderPendingBatch) {
    const confirmed = await confirm({
      title: SELF_ORDER_VI.staffRejectTitle,
      description: SELF_ORDER_VI.staffRejectDescription,
      confirmText: SELF_ORDER_VI.staffReject,
      cancelText: "Đóng",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await rejectSelfOrderBatch({
        batchId: batch.id,
        capabilityV2: batch.capabilityVersion === 2 || Boolean(batch.deviceId),
      });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffRejected);
      await loadQueue();
    });
  }

  function approveDevice(request: SelfOrderDeviceRequest) {
    const pairingCode = pairingCodeByDevice[request.deviceId]?.trim();
    if (!pairingCode) {
      showPairingCodeError(
        request.deviceId,
        SELF_ORDER_VI.staffPairingCodeRequired,
      );
      return;
    }
    startTransition(async () => {
      const result = await approveSelfOrderDeviceJoin({
        deviceId: request.deviceId,
        pairingCode,
      });
      if (!result.success) {
        const message = result.error ?? SELF_ORDER_VI.staffActionFailed;
        if (isPairingCodeError(message)) {
          showPairingCodeError(request.deviceId, message);
        } else {
          toast.error(message);
        }
        return;
      }
      updatePairingCode(request.deviceId, "");
      toast.success(SELF_ORDER_VI.staffDeviceApproved);
      await loadQueue();
    });
  }

  async function rejectDevice(request: SelfOrderDeviceRequest) {
    const confirmed = await confirm({
      title: SELF_ORDER_VI.staffRejectTitle,
      description: SELF_ORDER_VI.staffRejectDescription,
      confirmText: SELF_ORDER_VI.staffReject,
      cancelText: "Đóng",
      variant: "destructive",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await rejectSelfOrderDeviceJoin({
        deviceId: request.deviceId,
        reason: "staff_rejected_from_pos_queue",
      });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffDeviceRejected);
      await loadQueue();
    });
  }

  async function revokeDevice(device: SelfOrderApprovedDevice) {
    const confirmed = await confirm({
      title: SELF_ORDER_VI.staffRevokeDeviceTitle,
      description: SELF_ORDER_VI.staffRevokeDeviceDescription,
      confirmText: SELF_ORDER_VI.staffRevokeDevice,
      cancelText: "Đóng",
      variant: "destructive",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await revokeSelfOrderSessionDevice({
        deviceId: device.deviceId,
        reason: "staff_revoked_from_pos_queue",
      });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }
      toast.success(SELF_ORDER_VI.staffDeviceRevoked);
      await loadQueue();
    });
  }

  async function cancelPaymentRequest(requestId: number) {
    const confirmed = await confirm({
      title: SELF_ORDER_VI.staffCancelPaymentTitle,
      description: SELF_ORDER_VI.staffCancelPaymentDescription,
      confirmText: SELF_ORDER_VI.staffCancelPayment,
      cancelText: "Đóng",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await cancelSelfOrderPaymentRequest({
        requestId,
        reason: "staff_cancelled_from_pos_queue",
      });
      if (!result.success) {
        toast.error(result.error ?? SELF_ORDER_VI.staffActionFailed);
        return;
      }

      if (result.data?.paymentCompleted) {
        toast.info(SELF_ORDER_VI.paymentCompletedBlocked);
      } else {
        toast.success(SELF_ORDER_VI.staffPaymentCancelled);
      }
      await loadQueue();
      void onUpdated();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="fixed right-3 bottom-20 z-40 lg:bottom-4"
        onClick={() => {
          setOpen(true);
          void loadQueue();
        }}
      >
        <IconBell data-icon="inline-start" />
        <span>{SELF_ORDER_VI.staffQueueButton}</span>
        {countWithJoins > 0 ? (
          <Badge variant="warning">{formatCount(countWithJoins)}</Badge>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{SELF_ORDER_VI.staffQueueTitle}</SheetTitle>
            <SheetDescription>
              {SELF_ORDER_VI.staffQueueDescription}
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={isQueueRefreshing}
                onClick={() => void loadQueue()}
              >
                {isQueueRefreshing ? (
                  <Spinner className="size-4" />
                ) : (
                  <IconRefresh data-icon="inline-start" />
                )}
                {SELF_ORDER_VI.staffRefresh}
              </Button>
            </div>

            {countWithJoins === 0 ? (
              <Item variant="outline" className="border-dashed">
                <ItemDescription>
                  {SELF_ORDER_VI.staffQueueEmpty}
                </ItemDescription>
              </Item>
            ) : null}

            {queue.pendingBatches.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {SELF_ORDER_VI.staffPendingBatches}
                </h3>
                {queue.pendingBatches.map((batch) => (
                  <PendingBatchCard
                    key={batch.id}
                    batch={batch}
                    orders={orders}
                    selected={targetByBatch[batch.id] ?? "new"}
                    pairingCode={
                      batch.deviceId
                        ? (pairingCodeByDevice[batch.deviceId] ?? "")
                        : ""
                    }
                    pairingError={
                      batch.deviceId
                        ? pairingErrorByDevice[batch.deviceId]
                        : undefined
                    }
                    pairingInputRef={(node) => {
                      if (batch.deviceId) {
                        pairingInputByDeviceRef.current[batch.deviceId] = node;
                      }
                    }}
                    isPending={isPending}
                    onSelectedChange={(choice) =>
                      setTargetByBatch((current) => ({
                        ...current,
                        [batch.id]: choice,
                      }))
                    }
                    onPairingCodeChange={(value) => {
                      if (!batch.deviceId) return;
                      updatePairingCode(batch.deviceId, value);
                    }}
                    onApprove={() => approve(batch)}
                    onReject={() => void reject(batch)}
                  />
                ))}
              </section>
            ) : null}

            {joinOnlyRequests.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {SELF_ORDER_VI.staffDeviceRequests}
                </h3>
                {joinOnlyRequests.map((request) => (
                  <DeviceRequestCard
                    key={request.deviceId}
                    request={request}
                    pairingCode={pairingCodeByDevice[request.deviceId] ?? ""}
                    pairingError={pairingErrorByDevice[request.deviceId]}
                    pairingInputRef={(node) => {
                      pairingInputByDeviceRef.current[request.deviceId] = node;
                    }}
                    isPending={isPending}
                    onPairingCodeChange={(value) =>
                      updatePairingCode(request.deviceId, value)
                    }
                    onApprove={() => approveDevice(request)}
                    onReject={() => void rejectDevice(request)}
                  />
                ))}
              </section>
            ) : null}

            {queue.approvedDevices.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {SELF_ORDER_VI.staffApprovedDevices}
                </h3>
                {queue.approvedDevices.map((device) => (
                  <ApprovedDeviceCard
                    key={device.deviceId}
                    device={device}
                    isPending={isPending}
                    onRevoke={() => void revokeDevice(device)}
                  />
                ))}
              </section>
            ) : null}

            {queue.paymentRequests.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {SELF_ORDER_VI.staffPaymentRequests}
                </h3>
                <ItemGroup data-size="sm">
                  {queue.paymentRequests.map((request) => (
                    <Item
                      key={request.id}
                      variant="outline"
                      className="flex-col"
                    >
                      <ItemHeader>
                        <ItemContent>
                          <ItemTitle>
                            {SELF_ORDER_VI.tableLabel(request.tableNumber)}
                          </ItemTitle>
                          <ItemDescription>
                            #{request.orderNumber}
                            {requestedAtSuffix(request.createdAt)}
                          </ItemDescription>
                          {request.paymentCode ? (
                            <ItemDescription className="font-mono tabular-nums">
                              {request.paymentCode}
                            </ItemDescription>
                          ) : null}
                          {expiresAtLabel(request.expiresAt) ? (
                            <ItemDescription>
                              {expiresAtLabel(request.expiresAt)}
                            </ItemDescription>
                          ) : null}
                        </ItemContent>
                        <Badge
                          variant={
                            request.status === "cash_call" ? "warning" : "info"
                          }
                        >
                          {request.status === "cash_call"
                            ? SELF_ORDER_VI.cashCallStaff
                            : SELF_ORDER_VI.vietQrPendingStaff}
                        </Badge>
                      </ItemHeader>
                      <ItemFooter className="flex-wrap justify-between gap-2">
                        <span className="text-sm font-bold">
                          {formatVND(request.amount)}
                        </span>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="touch"
                            disabled={isPending}
                            onClick={() => {
                              setOpen(false);
                              onOpenPayment(request.orderId);
                            }}
                          >
                            <IconReceipt data-icon="inline-start" />
                            {request.status === "cash_call"
                              ? SELF_ORDER_VI.staffCollectCash
                              : SELF_ORDER_VI.staffViewPayment}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="touch"
                            disabled={isPending}
                            onClick={() =>
                              void cancelPaymentRequest(request.id)
                            }
                          >
                            <IconX data-icon="inline-start" />
                            {SELF_ORDER_VI.staffCancelPayment}
                          </Button>
                        </div>
                      </ItemFooter>
                    </Item>
                  ))}
                </ItemGroup>
              </section>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function PendingBatchCard({
  batch,
  orders,
  selected,
  pairingCode,
  pairingError,
  pairingInputRef,
  isPending,
  onSelectedChange,
  onPairingCodeChange,
  onApprove,
  onReject,
}: {
  batch: SelfOrderPendingBatch;
  orders: SessionOrder[];
  selected: TargetChoice;
  pairingCode: string;
  pairingError?: string;
  pairingInputRef: (node: HTMLInputElement | null) => void;
  isPending: boolean;
  onSelectedChange: (choice: TargetChoice) => void;
  onPairingCodeChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const tableOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.table_id === batch.tableId &&
          ACTIVE_POS_STATUSES.includes(order.status) &&
          order.payment_status !== "paid",
      ),
    [batch.tableId, orders],
  );
  const quantity = batch.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Item variant="outline" className="flex-col items-stretch">
      <ItemHeader>
        <ItemContent>
          <ItemTitle>{SELF_ORDER_VI.tableLabel(batch.tableNumber)}</ItemTitle>
          <ItemDescription>
            {SELF_ORDER_VI.staffPendingBatches} · {formatCount(quantity)}
            {requestedAtSuffix(batch.createdAt)}
          </ItemDescription>
        </ItemContent>
        <Badge variant="warning">{SELF_ORDER_VI.statusPendingApproval}</Badge>
      </ItemHeader>

      <ul className="flex flex-col gap-1 text-sm">
        {batch.items.map((item, index) => {
          const optionSummary = batchItemOptionSummary(item);
          return (
            <li
              key={`${batch.id}:${item.menu_item_id}:${index}`}
              className="flex min-w-0 flex-col gap-1"
            >
              <div className="flex min-w-0 justify-between gap-3">
                <span className="min-w-0 break-words">
                  {item.variant_name
                    ? `${item.item_name} ${item.variant_name}`
                    : item.item_name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  x{formatCount(item.quantity)}
                </span>
              </div>
              {optionSummary ? (
                <p className="break-words text-xs text-muted-foreground">
                  {optionSummary}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {batch.customerNote ? (
        <NoteCallout tone="muted" className="text-xs">
          {batch.customerNote}
        </NoteCallout>
      ) : null}

      {batch.deviceId ? (
        <PairingCodeField
          deviceId={batch.deviceId}
          value={pairingCode}
          error={pairingError}
          inputRef={pairingInputRef}
          disabled={isPending}
          onChange={onPairingCodeChange}
        />
      ) : null}

      {batch.deviceId && expiresAtLabel(batch.pairingExpiresAt) ? (
        <ItemDescription>
          {expiresAtLabel(batch.pairingExpiresAt)}
        </ItemDescription>
      ) : null}

      <div className="grid gap-2">
        {batch.canonicalOrderId ? (
          <NoteCallout tone="muted">
            {SELF_ORDER_VI.staffCanonicalTarget} · #
            {batch.canonicalOrderNumber ?? batch.canonicalOrderId}
          </NoteCallout>
        ) : (
          <>
            <TargetButton
              active={selected === "new"}
              onClick={() => onSelectedChange("new")}
            >
              {SELF_ORDER_VI.staffApproveNewOrder}
            </TargetButton>
            {tableOrders.map((order) => (
              <TargetButton
                key={order.id}
                active={selected === `order:${order.id}`}
                onClick={() => onSelectedChange(`order:${order.id}`)}
              >
                {SELF_ORDER_VI.staffApproveAppend} #{order.order_number} ·{" "}
                {formatVND(order.total_amount)}
              </TargetButton>
            ))}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={isPending}
          onClick={onReject}
        >
          <IconX data-icon="inline-start" />
          {SELF_ORDER_VI.staffReject}
        </Button>
        <Button
          type="button"
          size="touch"
          disabled={isPending}
          onClick={onApprove}
        >
          <IconCheck data-icon="inline-start" />
          {SELF_ORDER_VI.staffApprove}
        </Button>
      </div>
    </Item>
  );
}

function DeviceRequestCard({
  request,
  pairingCode,
  pairingError,
  pairingInputRef,
  isPending,
  onPairingCodeChange,
  onApprove,
  onReject,
}: {
  request: SelfOrderDeviceRequest;
  pairingCode: string;
  pairingError?: string;
  pairingInputRef: (node: HTMLInputElement | null) => void;
  isPending: boolean;
  onPairingCodeChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Item variant="outline" className="flex-col items-stretch">
      <ItemHeader>
        <ItemContent>
          <ItemTitle>{SELF_ORDER_VI.tableLabel(request.tableNumber)}</ItemTitle>
          <ItemDescription>
            {SELF_ORDER_VI.joinRequiredTitle}
            {requestedAtSuffix(request.createdAt)}
          </ItemDescription>
          {expiresAtLabel(request.pairingExpiresAt) ? (
            <ItemDescription>
              {expiresAtLabel(request.pairingExpiresAt)}
            </ItemDescription>
          ) : null}
        </ItemContent>
        <Badge variant="warning">{SELF_ORDER_VI.statusPendingApproval}</Badge>
      </ItemHeader>
      <PairingCodeField
        deviceId={request.deviceId}
        value={pairingCode}
        error={pairingError}
        inputRef={pairingInputRef}
        disabled={isPending}
        onChange={onPairingCodeChange}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={isPending}
          onClick={onReject}
        >
          <IconX data-icon="inline-start" />
          {SELF_ORDER_VI.staffReject}
        </Button>
        <Button
          type="button"
          size="touch"
          disabled={isPending}
          onClick={onApprove}
        >
          <IconCheck data-icon="inline-start" />
          {SELF_ORDER_VI.staffApproveDevice}
        </Button>
      </div>
    </Item>
  );
}

function ApprovedDeviceCard({
  device,
  isPending,
  onRevoke,
}: {
  device: SelfOrderApprovedDevice;
  isPending: boolean;
  onRevoke: () => void;
}) {
  return (
    <Item variant="outline" className="flex-col items-stretch">
      <ItemHeader>
        <ItemContent>
          <ItemTitle>{SELF_ORDER_VI.tableLabel(device.tableNumber)}</ItemTitle>
          <ItemDescription>
            {device.kind === "origin"
              ? SELF_ORDER_VI.staffOriginDevice
              : SELF_ORDER_VI.staffJoinedDevice}
            {requestedAtSuffix(device.approvedAt)}
          </ItemDescription>
          {device.lastSeenAt ? (
            <ItemDescription>
              {SELF_ORDER_VI.staffLastSeenAt(
                compactClock(device.lastSeenAt) ?? "—",
              )}
            </ItemDescription>
          ) : null}
        </ItemContent>
        <Badge variant="success">{SELF_ORDER_VI.statusActive}</Badge>
      </ItemHeader>
      <Button
        type="button"
        variant="destructive"
        size="touch"
        disabled={isPending}
        onClick={onRevoke}
      >
        <IconX data-icon="inline-start" />
        {SELF_ORDER_VI.staffRevokeDevice}
      </Button>
    </Item>
  );
}

function PairingCodeField({
  deviceId,
  value,
  error,
  inputRef,
  disabled,
  onChange,
}: {
  deviceId: number;
  value: string;
  error?: string;
  inputRef: (node: HTMLInputElement | null) => void;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `self-order-pairing-code-${deviceId}`;
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{SELF_ORDER_VI.pairingCodeLabel}</FieldLabel>
      <Input
        ref={inputRef}
        id={id}
        name={id}
        className="h-12 font-mono text-lg tracking-[0.2em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={12}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 12))
        }
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function TargetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="touch"
      className="w-full justify-start whitespace-normal text-left"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
