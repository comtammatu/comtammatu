"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  PackageCheck as IconPackageCheck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
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
import { useIsOnline } from "@/components/pwa-runtime";
import {
  BranchOperatorDetailList,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorPanel,
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
import {
  IntraSiteTransferDialog,
  ReverseIntraSiteTransferDialog,
} from "@/components/inventory/intra-site-transfer-dialog";
import type { IntraSiteTransferData } from "@lib/inventory/intra-site-transfer-data";

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
      <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
        <div className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-start-1">
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

      {primaryAction || canReverse || intraSiteData ? (
        <AppDetailFooter
          sticky
          leading={
            canReverse ? (
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
            ) : undefined
          }
          trailing={primaryAction ?? undefined}
        />
      ) : null}
    </div>
  );
}
