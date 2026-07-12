"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck as IconPackageCheck } from "lucide-react";
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
import { SectionLabel } from "@comtammatu/ui/components/section-label";
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
      {transfer.note ? (
        <p className="break-words rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {transfer.note}
        </p>
      ) : null}
      <section
        className="flex min-w-0 flex-col gap-2"
        aria-label={copy.itemsTitle}
      >
        <SectionLabel density="dense">{copy.itemsTitle}</SectionLabel>
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
      </section>

      {primaryAction ? (
        <AppDetailFooter sticky trailing={primaryAction} />
      ) : null}
    </div>
  );
}
