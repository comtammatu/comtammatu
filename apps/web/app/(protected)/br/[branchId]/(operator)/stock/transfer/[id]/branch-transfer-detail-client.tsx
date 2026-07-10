"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  ClipboardList as IconClipboardList,
  PackageCheck as IconPackageCheck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  getTransferActionConfig,
  type TransferActionKind,
  type TransferDetail,
} from "@lib/inventory/transfer-detail-model";
import {
  transferConfirmShip,
  transferMarkInTransit,
} from "@/(protected)/inventory/transfer-actions";
import { messages } from "@lib/messages";

interface BranchTransferDetailClientProps {
  branchId: number;
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
}

function getActionLabel(kind: TransferActionKind): string {
  const actions = messages.inventory.transfer.actions;
  if (kind === "confirm_kitchen") return actions.confirmKitchen;
  if (kind === "confirm_ship") return actions.confirmShip;
  if (kind === "mark_in_transit") return actions.markInTransit;
  return actions.receive;
}

export function BranchTransferDetailClient({
  branchId,
  transfer,
  userRole,
  userBranchId,
}: BranchTransferDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const copy = messages.inventory.transfer;
  const listHref = `/br/${branchId}/stock/transfer`;
  const receiveHref = `/br/${branchId}/stock/receive/${transfer.id}`;
  const actionConfig = useMemo(
    () => getTransferActionConfig({ transfer, userRole, userBranchId }),
    [transfer, userBranchId, userRole],
  );
  const actionLabel = actionConfig ? getActionLabel(actionConfig.kind) : null;

  function handlePrimaryAction() {
    if (
      !actionConfig?.enabled ||
      actionConfig.kind === "receive" ||
      isPending
    ) {
      return;
    }

    startTransition(async () => {
      const result =
        actionConfig.kind === "mark_in_transit"
          ? await transferMarkInTransit(transfer.id)
          : await transferConfirmShip(transfer.id);

      if (!result.success) {
        toast.error(result.error ?? copy.updateFailed);
        return;
      }

      toast.success(actionLabel ?? copy.completedSlip);
      router.refresh();
    });
  }

  const primaryAction =
    actionConfig && actionLabel ? (
      actionConfig.kind === "receive" ? (
        actionConfig.enabled ? (
          <Button size="touch-lg" asChild>
            <Link href={receiveHref}>
              <IconPackageCheck data-icon="inline-start" />
              {actionLabel}
            </Link>
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
          disabled={isPending || !actionConfig.enabled}
          onClick={handlePrimaryAction}
        >
          {isPending ? <Spinner className="size-5" /> : null}
          {actionLabel}
        </Button>
      )
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <BranchOperatorControlBar className="sm:hidden">
        <Button asChild variant="ghost" size="icon-touch">
          <Link href={listHref} aria-label={ACTIONS_VI.back}>
            <IconArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold tabular-nums">
            {transfer.code}
          </p>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{transfer.fromLocation}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{transfer.toLocation}</span>
          </p>
        </div>
        <StatusBadge domain="inventory" value={transfer.status} size="sm" />
      </BranchOperatorControlBar>

      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] md:items-start">
        <div className="flex min-w-0 flex-col gap-3 md:col-start-2 md:row-start-1">
          <BranchOperatorPanel
            title={copy.internalTransferTitle}
            icon={IconClipboardList}
            size="sm"
          >
            <BranchOperatorDetailList
              rows={[
                { label: copy.sourceBranchLabel, value: transfer.fromLocation },
                { label: copy.targetBranchLabel, value: transfer.toLocation },
                { label: copy.latestTimeLabel, value: transfer.date },
                {
                  label: copy.totalItems,
                  value: String(transfer.items.length),
                },
              ]}
              columns={1}
            />
          </BranchOperatorPanel>

          {transfer.note ? (
            <BranchOperatorPanel title={copy.transportNote} size="sm">
              <p className="break-words text-sm text-muted-foreground">
                {transfer.note}
              </p>
            </BranchOperatorPanel>
          ) : null}
        </div>

        <BranchOperatorPanel
          title={copy.itemsTitle}
          description={transfer.code}
          icon={IconPackageCheck}
          size="sm"
          className="min-w-0 md:col-start-1 md:row-start-1"
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
              {transfer.items.map((item) => (
                <Item
                  key={item.ingredientId}
                  variant="outline"
                  className="min-h-16 flex-col items-stretch gap-3 p-3"
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle className="line-clamp-none break-words">
                      {item.name}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {copy.sentQty}: {item.qty} {item.unit}
                    </ItemDescription>
                  </ItemContent>
                  {item.received != null ? (
                    <div className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-muted/50 px-3 text-sm">
                      <span className="text-muted-foreground">
                        {copy.receivedQty}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {item.received} {item.unit}
                      </span>
                    </div>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>

      {primaryAction ? (
        <AppDetailFooter sticky trailing={primaryAction} />
      ) : null}
    </div>
  );
}
