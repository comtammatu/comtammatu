"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  ClipboardList as IconClipboardList,
  PackageCheck as IconPackageCheck,
  Truck as IconTruck,
  Warehouse as IconWarehouse,
  MapPin as IconMapPin,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { useIsOnline } from "@/components/pwa-runtime";
import {
  BranchOperatorDetailList,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  getTransferActionConfig,
  type TransferActionKind,
  type TransferDetail,
} from "@lib/inventory/transfer-detail-model";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";
import {
  transferConfirmShip,
  transferMarkInTransit,
} from "@/(protected)/inventory/transfer-actions";
import { messages } from "@lib/messages";
import { formatQuantity } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  IntraSiteTransferDialog,
  ReverseIntraSiteTransferDialog,
} from "@/components/inventory/intra-site-transfer-dialog";
import type { IntraSiteTransferData } from "@lib/inventory/intra-site-transfer-data";
import { BranchTransferReceiptDialog } from "./branch-transfer-receipt-dialog";

interface BranchTransferDetailClientProps {
  branchId: number;
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
  receiveHref?: string;
  intraSiteData?: IntraSiteTransferData | null;
}

function getActionLabel(kind: TransferActionKind): string {
  const actions = messages.inventory.transfer.actions;
  if (kind === "confirm_ship") return actions.confirmShip;
  if (kind === "mark_in_transit") return actions.markInTransit;
  if (kind === "confirm_receive") return actions.confirmReceive;
  return actions.receive;
}

export function BranchTransferDetailClient({
  branchId,
  transfer,
  userRole,
  userBranchId,
  receiveHref: receiveHrefOverride,
  intraSiteData = null,
}: BranchTransferDetailClientProps) {
  const router = useRouter();
  const isOnline = useIsOnline();
  const [isPending, startTransition] = useTransition();
  const copy = messages.inventory.transfer;
  const receiveHref =
    receiveHrefOverride ?? `/br/${branchId}/stock/receive/${transfer.id}`;
  const actionConfig = useMemo(
    () => getTransferActionConfig({ transfer, userRole, userBranchId }),
    [transfer, userBranchId, userRole],
  );
  const actionLabel = actionConfig ? getActionLabel(actionConfig.kind) : null;
  const canReverse =
    transfer.transferScope === "intra_site" &&
    transfer.status === "received" &&
    (userRole === "owner" ||
      (userRole === "branch_manager" && userBranchId === branchId));

  const totalSentQty = useMemo(
    () => transfer.items.reduce((sum, item) => sum + item.qty, 0),
    [transfer.items],
  );

  const hasReceived = useMemo(
    () => transfer.items.some((item) => item.received != null),
    [transfer.items],
  );

  const totalReceivedQty = useMemo(
    () =>
      transfer.items.reduce((sum, item) => sum + (item.received ?? 0), 0),
    [transfer.items],
  );

  const shortfallLines = useMemo(
    () =>
      transfer.items.filter(
        (item) => item.received != null && item.received < item.qty,
      ).length,
    [transfer.items],
  );

  const statusStripItems = useMemo(
    () => [
      {
        label: copy.totalItems,
        value: `${transfer.items.length} dòng`,
        mono: true,
      },
      {
        label: copy.sentQty,
        value: formatQuantity(totalSentQty),
        mono: true,
      },
      {
        label: copy.receivedQty,
        value: hasReceived ? formatQuantity(totalReceivedQty) : "—",
        mono: true,
        muted: !hasReceived,
      },
      {
        label: copy.reconciliationLabel,
        value: !hasReceived
          ? copy.steps.inTransit
          : shortfallLines > 0
            ? copy.reconciliationShort(shortfallLines)
            : copy.reconciliationMatch,
        muted: !hasReceived,
      },
    ],
    [copy, hasReceived, shortfallLines, totalReceivedQty, totalSentQty, transfer.items.length],
  );

  function handlePrimaryAction() {
    if (
      !actionConfig?.enabled ||
      actionConfig.kind === "receive" ||
      actionConfig.kind === "confirm_receive" ||
      isPending
    ) {
      return;
    }
    if (!isOnline) {
      toast.error(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }

    startTransition(async () => {
      const result =
        actionConfig.kind === "mark_in_transit"
          ? await transferMarkInTransit(transfer.id)
          : await transferConfirmShip(transfer.id);

      if (!result.success) {
        const applied = applyInventoryActionError(result, copy.updateFailed);
        toast.error(applied.toastMessage);
        return;
      }

      toast.success(actionLabel ?? copy.completedSlip);
      router.refresh();
    });
  }

  const opensReceiveWorkspace =
    actionConfig?.kind === "receive" ||
    actionConfig?.kind === "confirm_receive";

  const primaryAction =
    actionConfig && actionLabel ? (
      opensReceiveWorkspace ? (
        actionConfig.enabled ? (
          <Button size="touch-lg" render={<Link href={receiveHref} />}>
            <IconPackageCheck data-icon="inline-start" />
            {actionLabel}
          </Button>
        ) : (
          <Button type="button" size="touch-lg" disabled>
            <IconPackageCheck data-icon="inline-start" />
            {actionLabel}
          </Button>
        )
      ) : (
        <Button
          type="button"
          size="touch-lg"
          disabled={isPending || !isOnline || !actionConfig.enabled}
          onClick={handlePrimaryAction}
        >
          {isPending ? <Spinner className="size-5" /> : null}
          {actionLabel}
        </Button>
      )
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Operational KPI summary strip */}
      <BranchOperatorStatusStrip items={statusStripItems} />

      <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
        {/* Route and transfer info panel */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-start-1">
          <BranchOperatorPanel
            title={copy.internalTransferTitle}
            icon={IconClipboardList}
            size="sm"
          >
            {/* Visual Route Flow */}
            <Item variant="outline" className="flex-col items-stretch gap-2 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <Badge variant="outline" className="text-3xs font-semibold uppercase">
                  {transfer.transferScope === "intra_site"
                    ? copy.scopeIntraSite
                    : copy.scopeInterSite}
                </Badge>
                <span className="font-mono text-2xs text-muted-foreground">
                  {transfer.code}
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <IconWarehouse className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-3xs font-medium uppercase text-muted-foreground">
                      {copy.sourceBranchLabel}
                    </p>
                    <p className="truncate text-xs font-semibold text-foreground">
                      {transfer.fromLocation || transfer.fromBranch}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center px-2 text-muted-foreground max-sm:py-1">
                  <IconArrowRight className="size-4 max-sm:rotate-90" />
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <IconMapPin className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-3xs font-medium uppercase text-muted-foreground">
                      {copy.targetBranchLabel}
                    </p>
                    <p className="truncate text-xs font-semibold text-foreground">
                      {transfer.toLocation || transfer.toBranch}
                    </p>
                  </div>
                </div>
              </div>
            </Item>

            <BranchOperatorDetailList
              rows={[
                {
                  label: copy.latestTimeLabel,
                  value: transfer.date
                    ? formatVNDateTime(transfer.date)
                    : "—",
                },
                ...(transfer.createdBy
                  ? [
                      {
                        label: copy.creatorLabel,
                        value: transfer.createdBy,
                      },
                    ]
                  : []),
                ...(transfer.stockRequestNumber
                  ? [
                      {
                        label: copy.requestNumberLabel,
                        value: transfer.stockRequestNumber,
                      },
                    ]
                  : []),
              ]}
              columns={1}
            />
          </BranchOperatorPanel>

          {transfer.note ? (
            <BranchOperatorPanel
              title={copy.transportNote}
              icon={IconTruck}
              size="sm"
            >
              <p className="break-words text-sm text-muted-foreground">
                {transfer.note}
              </p>
            </BranchOperatorPanel>
          ) : null}
        </div>

        {/* Transfer Items Panel */}
        <BranchOperatorPanel
          title={copy.itemsTitle}
          description={transfer.code}
          icon={IconPackageCheck}
          size="sm"
          action={
            <BranchTransferReceiptDialog
              transfer={transfer}
              buttonSize="sm"
              buttonVariant="outline"
            />
          }
          className="min-w-0 lg:col-start-1 lg:row-start-1"
        >
          {transfer.items.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-data"
              title={copy.emptyTransferItemsTitle}
              description={copy.emptyTransferItemsDescription}
            />
          ) : (
            <ItemGroup className="gap-2">
              {transfer.items.map((item, idx) => {
                const receivedQty = item.received;
                const hasLineReceived = receivedQty != null;
                const isShort = hasLineReceived && receivedQty < item.qty;
                const isOver = hasLineReceived && receivedQty > item.qty;

                return (
                  <Item
                    key={item.ingredientId ?? idx}
                    variant="outline"
                    className="min-h-16 flex-col items-stretch gap-3 bg-card p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                            #{idx + 1}
                          </span>
                          <ItemTitle className="line-clamp-none break-words text-sm font-semibold">
                            {item.name}
                          </ItemTitle>
                        </div>
                        {item.sku ? (
                          <p className="mt-0.5 font-mono text-2xs text-muted-foreground">
                            SKU: {item.sku}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          !hasLineReceived
                            ? "secondary"
                            : isShort
                              ? "destructive"
                              : isOver
                                ? "warning"
                                : "success"
                        }
                        className="shrink-0 font-medium"
                      >
                        {!hasLineReceived || receivedQty == null
                          ? copy.statusPendingReceive
                          : isShort
                            ? copy.statusShort(formatQuantity(item.qty - receivedQty))
                            : isOver
                              ? copy.statusOver(formatQuantity(receivedQty - item.qty))
                              : copy.statusMatched}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-2 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-3xs font-medium uppercase text-muted-foreground">
                          {copy.sentQty}
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {formatQuantity(item.qty)} {item.unit}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-right">
                        <span className="text-3xs font-medium uppercase text-muted-foreground">
                          {copy.receivedQty}
                        </span>
                        <span
                          className={cn(
                            "font-mono font-semibold tabular-nums",
                            !hasLineReceived
                              ? "text-muted-foreground"
                              : isShort
                                ? "text-destructive"
                                : isOver
                                  ? "text-warning"
                                  : "text-primary",
                          )}
                        >
                          {hasLineReceived && receivedQty != null
                            ? `${formatQuantity(receivedQty)} ${item.unit}`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>

      {/* Detail Footer */}
      <AppDetailFooter
        sticky
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <BranchTransferReceiptDialog
              transfer={transfer}
              buttonSize="touch-lg"
              buttonVariant="outline"
            />
            {canReverse ? (
              <ReverseIntraSiteTransferDialog
                transfer={transfer}
                triggerSize="touch-lg"
              />
            ) : intraSiteData ? (
              <IntraSiteTransferDialog
                data={intraSiteData}
                triggerSize="touch-lg"
                detailBasePath={`/br/${branchId}/stock/transfer`}
                triggerLabel="Cấp xuống Bếp"
                initialQuantities={Object.fromEntries(
                  transfer.items.map((item) => [
                    item.ingredientId,
                    item.received ?? item.qty,
                  ]),
                )}
              />
            ) : null}
          </div>
        }
        trailing={primaryAction ?? undefined}
      />
    </div>
  );
}
