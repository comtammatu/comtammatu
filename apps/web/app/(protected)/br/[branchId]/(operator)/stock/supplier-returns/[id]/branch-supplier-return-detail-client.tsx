"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  FileText as IconFileText,
  X as IconX,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
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
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  confirmSupplierReturn,
  transitionSupplierReturn,
} from "@/(protected)/inventory/supplier-return-actions";
import {
  canProgressBranchSupplierReturn,
  type BranchSupplierReturnDetail,
} from "@lib/inventory/supplier-return-model";
import { messages } from "@lib/messages";

const copy = messages.inventory.supplierReturns;
const detailCopy = copy.detail;

function reasonLabel(value: string) {
  return copy.reasonLabels[value as keyof typeof copy.reasonLabels] ?? value;
}

function resolutionLabel(value: string) {
  return (
    copy.resolutionLabels[value as keyof typeof copy.resolutionLabels] ?? value
  );
}

export function BranchSupplierReturnDetailClient({
  branchId,
  data,
}: {
  branchId: number;
  data: BranchSupplierReturnDetail;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const stockBasePath = `/br/${branchId}/stock`;
  const returnsBasePath = `${stockBasePath}/supplier-returns`;
  const { returnRecord, lines, canConfirm } = data;
  const canProgress = canProgressBranchSupplierReturn({
    returnRecord,
    canConfirm,
  });

  async function sendToSupplier() {
    const approved = await confirm({
      title: detailCopy.confirmCta,
      description: detailCopy.confirmHint,
      confirmText: detailCopy.confirmCta,
      cancelText: ACTIONS_VI.cancel,
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await confirmSupplierReturn(returnRecord.id);
      if (!result.success) {
        toast.error(result.error ?? detailCopy.actionFailed);
        return;
      }

      toast.success(detailCopy.confirmedOk);
      router.refresh();
    });
  }

  async function updateReturn(
    targetStatus: "credited" | "refunded" | "cancelled",
  ) {
    if (targetStatus === "cancelled") {
      const approved = await confirm({
        title: detailCopy.cancelConfirmTitle,
        description: detailCopy.cancelConfirmBody,
        confirmText: detailCopy.cancelCta,
        cancelText: ACTIONS_VI.cancel,
        variant: "destructive",
      });
      if (!approved) return;
    }

    startTransition(async () => {
      const result = await transitionSupplierReturn({
        returnId: returnRecord.id,
        targetStatus,
      });
      if (!result.success) {
        toast.error(result.error ?? detailCopy.actionFailed);
        return;
      }

      toast.success(detailCopy.transitionedOk);
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title={returnRecord.code}
      description={returnRecord.supplierName}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            asChild
            variant="ghost"
            size="icon-touch"
            title={ACTIONS_VI.back}
          >
            <Link href={returnsBasePath} aria-label={ACTIONS_VI.back}>
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold">
              {returnRecord.code}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {returnRecord.supplierName}
            </p>
          </div>
          <StatusBadge
            domain="inventory"
            value={returnRecord.status}
            size="sm"
          />
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] lg:items-start">
          <BranchOperatorPanel
            title={copy.linesTitle}
            icon={IconFileText}
            size="sm"
            contentClassName="gap-3"
          >
            {lines.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconFileText />}
                title={copy.emptyLines}
              />
            ) : (
              <ItemGroup className="gap-2" role="list">
                {lines.map((line) => (
                  <div key={line.id} role="listitem">
                    <Item
                      variant="outline"
                      className="min-h-16 touch-manipulation"
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle className="line-clamp-none text-sm font-semibold">
                          {line.ingredientName}
                        </ItemTitle>
                        {line.reasonDetail ? (
                          <ItemDescription className="line-clamp-none text-xs">
                            {line.reasonDetail}
                          </ItemDescription>
                        ) : null}
                      </ItemContent>
                      <ItemActions className="self-center">
                        <Badge
                          variant="outline"
                          className="font-mono tabular-nums"
                        >
                          {formatQuantity(line.quantity)} {line.unit}
                        </Badge>
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </BranchOperatorPanel>

          <BranchOperatorPanel title={detailCopy.informationTitle} size="sm">
            <BranchOperatorStatusStrip
              items={[
                {
                  label: FORM_VI.status,
                  value: (
                    <StatusBadge
                      domain="inventory"
                      value={returnRecord.status}
                      size="sm"
                    />
                  ),
                },
                {
                  label: detailCopy.lineCountLabel,
                  value: String(lines.length),
                  mono: true,
                },
                {
                  label: copy.resolutionLabel,
                  value: resolutionLabel(returnRecord.resolution),
                },
              ]}
            />
            <BranchOperatorDetailList
              columns={1}
              className="mt-3"
              rows={[
                {
                  label: INVENTORY_VI.supplier,
                  value: returnRecord.supplierName,
                },
                {
                  label: detailCopy.sourceGrnLabel,
                  value:
                    returnRecord.grnId != null && returnRecord.grnNumber ? (
                      <Link
                        href={`${stockBasePath}/grn/${returnRecord.grnId}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {returnRecord.grnNumber}
                      </Link>
                    ) : (
                      "—"
                    ),
                },
                {
                  label: FORM_VI.reason,
                  value: reasonLabel(returnRecord.reason),
                },
                {
                  label: detailCopy.createdAtLabel,
                  value: formatVNDateTime(returnRecord.createdAt),
                },
                ...(returnRecord.sentAt
                  ? [
                      {
                        label: detailCopy.sentAtLabel,
                        value: formatVNDateTime(returnRecord.sentAt),
                      },
                    ]
                  : []),
                ...(returnRecord.notes
                  ? [
                      {
                        label: FORM_VI.notes,
                        value: returnRecord.notes,
                      },
                    ]
                  : []),
              ]}
            />
          </BranchOperatorPanel>
        </div>

        {canProgress ? (
          <AppDetailFooter
            sticky
            mobileReverse={false}
            stacked
            trailing={
              <>
                {returnRecord.status === "draft" ? (
                  <Button
                    type="button"
                    size="touch-lg"
                    disabled={isPending}
                    onClick={() => void sendToSupplier()}
                  >
                    {isPending ? <Spinner className="size-5" /> : null}
                    <IconCircleCheck data-icon="inline-start" />
                    {detailCopy.confirmCta}
                  </Button>
                ) : null}
                {returnRecord.status === "sent" &&
                returnRecord.resolution === "credit_note" ? (
                  <Button
                    type="button"
                    size="touch-lg"
                    disabled={isPending}
                    onClick={() => void updateReturn("credited")}
                  >
                    {isPending ? <Spinner className="size-5" /> : null}
                    {detailCopy.creditCta}
                  </Button>
                ) : null}
                {returnRecord.status === "sent" &&
                returnRecord.resolution === "cash_refund" ? (
                  <Button
                    type="button"
                    size="touch-lg"
                    disabled={isPending}
                    onClick={() => void updateReturn("refunded")}
                  >
                    {isPending ? <Spinner className="size-5" /> : null}
                    {detailCopy.refundCta}
                  </Button>
                ) : null}
                {returnRecord.status === "sent" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isPending}
                    onClick={() => void updateReturn("cancelled")}
                  >
                    <IconX data-icon="inline-start" />
                    {detailCopy.cancelCta}
                  </Button>
                ) : null}
              </>
            }
          />
        ) : null}
      </div>
    </BranchOperatorPage>
  );
}
