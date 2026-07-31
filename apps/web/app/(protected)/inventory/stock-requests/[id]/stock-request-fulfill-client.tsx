"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getInventorySiteKindLabelVi,
  type SiteKind,
} from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsOnline } from "@/components/pwa-runtime";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialogFooter } from "@/components/form";
import {
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { messages } from "@lib/messages";
import {
  closeStockRequest,
  fulfillStockRequestLines,
  rejectStockRequestLines,
} from "@/(protected)/inventory/stock-request-actions";
import type { StockRequestFulfillGroup } from "@lib/inventory/stock-request-fulfillment-detail-data";

const stockRequestCopy = messages.inventory.stockRequests;
const copy = stockRequestCopy.fulfill;

interface StockRequestFulfillClientProps {
  requestId: number;
  requestNumber: string;
  status: string;
  branchLabel: string;
  groups: StockRequestFulfillGroup[];
  embedded?: boolean;
  canClose?: boolean;
  onTransferCreated?: (transferId: number) => void;
}

type FulfillSiteKind = StockRequestFulfillGroup["fulfillSiteKind"];
type FulfillLine = StockRequestFulfillGroup["lines"][number];

function siteKindLabel(kind: SiteKind): string {
  return getInventorySiteKindLabelVi(kind);
}

function pendingLineIds(group: StockRequestFulfillGroup): number[] {
  return group.lines
    .filter((line) => line.status === "pending")
    .map((line) => line.id);
}

function seedPendingSelection(
  groups: StockRequestFulfillGroup[],
): Record<string, Set<number>> {
  return Object.fromEntries(
    groups.map((group) => [
      group.fulfillSiteKind,
      new Set(pendingLineIds(group)),
    ]),
  );
}

export function StockRequestFulfillClient({
  requestId,
  requestNumber,
  status,
  branchLabel,
  groups,
  embedded = false,
  canClose = false,
  onTransferCreated,
}: StockRequestFulfillClientProps) {
  const router = useRouter();
  const isOnline = useIsOnline();
  const [isPending, startTransition] = useTransition();
  const [selectedByGroup, setSelectedByGroup] = useState<
    Record<string, Set<number>>
  >(() => seedPendingSelection(groups));
  const [locationByGroup, setLocationByGroup] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.fulfillSiteKind,
        group.locations[0] ? String(group.locations[0].id) : "",
      ]),
    ),
  );
  const [reasonAction, setReasonAction] = useState<
    | { kind: "reject"; group: StockRequestFulfillGroup }
    | { kind: "close" }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [activeGroupKind, setActiveGroupKind] = useState(
    () =>
      groups.find((group) =>
        group.lines.some((line) => line.status === "pending"),
      )?.fulfillSiteKind ??
      groups[0]?.fulfillSiteKind ??
      null,
  );
  const activeGroup =
    groups.find((group) => group.fulfillSiteKind === activeGroupKind) ??
    groups[0];

  function activateSource(groupKind: FulfillSiteKind) {
    const group = groups.find((entry) => entry.fulfillSiteKind === groupKind);
    setActiveGroupKind(groupKind);
    if (!group) return;
    setSelectedByGroup((current) => ({
      ...current,
      [groupKind]: new Set(pendingLineIds(group)),
    }));
  }

  function toggleLine(
    groupKind: FulfillSiteKind,
    lineId: number,
    checked: boolean,
  ) {
    setActiveGroupKind(groupKind);
    setSelectedByGroup((current) => {
      const next = new Set(current[groupKind] ?? []);
      if (checked) next.add(lineId);
      else next.delete(lineId);
      return { ...current, [groupKind]: next };
    });
  }

  function selectAllPending(groupKind: FulfillSiteKind, lineIds: number[]) {
    setActiveGroupKind(groupKind);
    setSelectedByGroup((current) => ({
      ...current,
      [groupKind]: new Set(lineIds),
    }));
  }

  function handleFulfill(group: StockRequestFulfillGroup) {
    if (!isOnline) {
      toast.error(stockRequestCopy.journey.offlineMutation);
      return;
    }
    const selected = [...(selectedByGroup[group.fulfillSiteKind] ?? [])];
    const fromLocationId = Number(locationByGroup[group.fulfillSiteKind]);

    if (selected.length === 0) {
      toast.error(copy.toastSelectLine);
      return;
    }
    if (!Number.isInteger(fromLocationId) || fromLocationId <= 0) {
      toast.error(copy.toastSelectLocation);
      return;
    }

    startTransition(async () => {
      const result = await fulfillStockRequestLines({
        requestId,
        fulfillSiteKind: group.fulfillSiteKind,
        fromBranchId: group.fromBranchId,
        fromLocationId,
        itemIds: selected,
      });

      if (!result.success || !result.data) {
        toast.error(result.error ?? copy.toastFulfillFailed);
        return;
      }

      toast.success(copy.toastTransferCreated);
      if (onTransferCreated) onTransferCreated(result.data.transferId);
      else router.push(`/inventory/transfers/${result.data.transferId}`);
      router.refresh();
    });
  }

  function handleReasonAction() {
    if (!reasonAction) return;
    if (!isOnline) {
      toast.error(stockRequestCopy.journey.offlineMutation);
      return;
    }
    startTransition(async () => {
      const result =
        reasonAction.kind === "close"
          ? await closeStockRequest({ requestId, reason })
          : await rejectStockRequestLines({
              requestId,
              fulfillSiteKind: reasonAction.group.fulfillSiteKind,
              itemIds: [
                ...(selectedByGroup[reasonAction.group.fulfillSiteKind] ?? []),
              ],
              reason,
            });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        reasonAction.kind === "close" ? copy.closeSuccess : copy.rejectSuccess,
      );
      setReasonAction(null);
      setReason("");
      router.refresh();
    });
  }

  function lineColumns(
    group: StockRequestFulfillGroup,
  ): DataTableColumn<FulfillLine>[] {
    return [
      {
        key: "select",
        header: copy.selectColumn,
        className: "w-14",
        render: (line) =>
          line.status === "pending" ? (
            <Checkbox
              size="touch"
              checked={
                selectedByGroup[group.fulfillSiteKind]?.has(line.id) ?? false
              }
              onCheckedChange={(value) =>
                toggleLine(group.fulfillSiteKind, line.id, value === true)
              }
              disabled={isPending}
              aria-label={copy.selectLineAria(line.ingredientName)}
            />
          ) : null,
      },
      {
        key: "ingredient",
        header: copy.ingredientColumn,
        render: (line) => (
          <span className="font-medium">{line.ingredientName}</span>
        ),
      },
      {
        key: "quantity",
        header: copy.quantityColumn,
        className: "text-right font-mono tabular-nums",
        render: (line) => copy.lineQtyUnit(line.quantity, line.unitLabel),
      },
      {
        key: "status",
        header: copy.statusColumn,
        className: "w-36",
        render: (line) => (
          <Badge variant="secondary">
            {stockRequestCopy.statusLabel(line.status)}
          </Badge>
        ),
      },
    ];
  }

  const content = (
    <>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noLinesInScope}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-col gap-2"
            aria-label={copy.sourceSelectorAria}
          >
            {groups.map((group) => {
              const pendingLines = group.lines.filter(
                (line) => line.status === "pending",
              );
              const isActive =
                group.fulfillSiteKind === activeGroup?.fulfillSiteKind;
              return (
                <AppSection
                  key={group.fulfillSiteKind}
                  title={
                    <Button
                      type="button"
                      variant={isActive ? "secondary" : "ghost"}
                      size="touch"
                      className="-mx-2 w-[calc(100%+1rem)] justify-between px-2 text-left"
                      aria-pressed={isActive}
                      onClick={() => activateSource(group.fulfillSiteKind)}
                    >
                      <span>
                        {copy.sourceTitle(siteKindLabel(group.fulfillSiteKind))}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {copy.sourcePendingSummary(
                          pendingLines.length,
                          group.lines.length,
                        )}
                      </span>
                    </Button>
                  }
                  contentFlush
                >
                  <DataTable
                    columns={lineColumns(group)}
                    data={group.lines}
                    getRowKey={(line) => line.id}
                    emptyTitle={copy.emptyLinesTitle}
                    emptyDescription={copy.emptyLinesDescription}
                    mobileCardRender={(line) => (
                      <Item variant="outline" size="sm">
                        {line.status === "pending" ? (
                          <Checkbox
                            size="touch"
                            checked={
                              selectedByGroup[group.fulfillSiteKind]?.has(
                                line.id,
                              ) ?? false
                            }
                            onCheckedChange={(value) =>
                              toggleLine(
                                group.fulfillSiteKind,
                                line.id,
                                value === true,
                              )
                            }
                            disabled={isPending}
                            aria-label={copy.selectLineAria(line.ingredientName)}
                          />
                        ) : null}
                        <ItemContent>
                          <ItemTitle>{line.ingredientName}</ItemTitle>
                        </ItemContent>
                        <ItemActions className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-mono text-sm tabular-nums">
                            {copy.lineQtyUnit(line.quantity, line.unitLabel)}
                          </span>
                          <Badge variant="secondary">
                            {stockRequestCopy.statusLabel(line.status)}
                          </Badge>
                        </ItemActions>
                      </Item>
                    )}
                  />

                  {pendingLines.length > 0 ? (
                    <div className="flex flex-col gap-2 p-3 pt-0 md:p-0 md:pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        disabled={isPending}
                        onClick={() =>
                          selectAllPending(
                            group.fulfillSiteKind,
                            pendingLines.map((line) => line.id),
                          )
                        }
                      >
                        {copy.selectAllPending}
                      </Button>

                      {group.locations.length > 1 ? (
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`fulfill-location-${group.fulfillSiteKind}`}
                          >
                            {copy.exportLocation}
                          </Label>
                          <Select
                            value={locationByGroup[group.fulfillSiteKind] ?? ""}
                            onValueChange={(value) => {
                              setActiveGroupKind(group.fulfillSiteKind);
                              setLocationByGroup((current) => ({
                                ...current,
                                [group.fulfillSiteKind]: value,
                              }));
                            }}
                          >
                            <SelectTrigger
                              id={`fulfill-location-${group.fulfillSiteKind}`}
                              size="touch"
                              className="w-full"
                            >
                              <SelectValue
                                placeholder={copy.chooseExportLocation}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {group.locations.map((location) => (
                                <SelectItem
                                  key={location.id}
                                  value={String(location.id)}
                                  size="touch"
                                >
                                  {location.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : group.locations.length === 1 ? (
                        <p className="text-sm text-muted-foreground">
                          {copy.exportFrom(group.locations[0]!.label)}
                        </p>
                      ) : (
                        <p className="text-sm text-destructive">
                          {copy.noStockLocation}
                        </p>
                      )}
                    </div>
                  ) : null}
                </AppSection>
              );
            })}
          </div>
        </div>
      )}
      {activeGroup &&
      status === "submitted" &&
      activeGroup.lines.some((line) => line.status === "pending") ? (
        embedded ? (
          <AppDialogFooter>
            <AppDetailFooter
              sticky
              leading={
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={
                      isPending ||
                      !isOnline ||
                      (selectedByGroup[activeGroup.fulfillSiteKind]?.size ??
                        0) === 0
                    }
                    onClick={() =>
                      setReasonAction({ kind: "reject", group: activeGroup })
                    }
                  >
                    {copy.rejectSelected}
                  </Button>
                  {canClose ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="touch"
                      disabled={isPending || !isOnline}
                      onClick={() => setReasonAction({ kind: "close" })}
                    >
                      {copy.closeRemaining}
                    </Button>
                  ) : null}
                </div>
              }
              trailing={
                <Button
                  type="button"
                  size="touch"
                  disabled={
                    isPending ||
                    !isOnline ||
                    activeGroup.locations.length === 0 ||
                    (selectedByGroup[activeGroup.fulfillSiteKind]?.size ??
                      0) === 0
                  }
                  onClick={() => handleFulfill(activeGroup)}
                >
                  {isPending
                    ? copy.processing
                    : copy.fulfillButton(
                        siteKindLabel(activeGroup.fulfillSiteKind),
                      )}
                </Button>
              }
            />
          </AppDialogFooter>
        ) : (
          <AppDetailFooter
            sticky={false}
            leading={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  disabled={
                    isPending ||
                    !isOnline ||
                    (selectedByGroup[activeGroup.fulfillSiteKind]?.size ??
                      0) === 0
                  }
                  onClick={() =>
                    setReasonAction({ kind: "reject", group: activeGroup })
                  }
                >
                  {copy.rejectSelected}
                </Button>
                {canClose ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="touch"
                    disabled={isPending || !isOnline}
                    onClick={() => setReasonAction({ kind: "close" })}
                  >
                    {copy.closeRemaining}
                  </Button>
                ) : null}
              </div>
            }
            trailing={
              <Button
                type="button"
                size="touch"
                disabled={
                  isPending ||
                  !isOnline ||
                  activeGroup.locations.length === 0 ||
                  (selectedByGroup[activeGroup.fulfillSiteKind]?.size ?? 0) ===
                    0
                }
                onClick={() => handleFulfill(activeGroup)}
              >
                {isPending
                  ? copy.processing
                  : copy.fulfillButton(
                      siteKindLabel(activeGroup.fulfillSiteKind),
                    )}
              </Button>
            }
          />
        )
      ) : null}
      <ReasonConfirmDialog
        open={reasonAction != null}
        onOpenChange={(open) => {
          if (!open) {
            setReasonAction(null);
            setReason("");
          }
        }}
        title={
          reasonAction?.kind === "close" ? copy.closeTitle : copy.rejectTitle
        }
        description={copy.reasonDescription}
        reasonId="stock-request-source-reason"
        reason={reason}
        onReasonChange={setReason}
        reasonLabel={copy.reasonLabel}
        reasonPlaceholder={copy.reasonPlaceholder}
        cancelLabel={copy.reasonCancel}
        confirmLabel={copy.reasonConfirm}
        onConfirm={handleReasonAction}
        isPending={isPending || !isOnline}
      />
    </>
  );

  if (embedded) return content;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={requestNumber}
        description={copy.headerDescription(
          branchLabel,
          stockRequestCopy.statusLabel(status),
        )}
        actions={
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/inventory/transfers?work=request" />}
          >
            {copy.back}
          </Button>
        }
      />
      {content}
    </AppPage>
  );
}
