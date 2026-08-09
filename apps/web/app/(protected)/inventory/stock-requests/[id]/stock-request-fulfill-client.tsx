"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getInventorySiteKindLabelVi,
  type SiteKind,
} from "@comtammatu/shared/labels";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
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
} from "@/components/surface";
import { messages } from "@lib/messages";
import {
  closeStockRequest,
  fulfillStockRequestLines,
  rejectStockRequestLines,
} from "@/(protected)/inventory/stock-request-actions";
import {
  isFulfillLineShort,
  lineOnHandInEntryUnit,
  type StockRequestFulfillGroup,
  type StockRequestFulfillLine,
} from "@lib/inventory/stock-request-fulfillment-model";

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

function selectedLocationId(
  group: StockRequestFulfillGroup,
  locationByGroup: Record<string, string>,
): number | null {
  const raw = Number(locationByGroup[group.fulfillSiteKind]);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

function selectedShortLines(
  group: StockRequestFulfillGroup,
  selectedIds: Set<number> | undefined,
  locationId: number | null,
): StockRequestFulfillLine[] {
  return group.lines.filter(
    (line) =>
      line.status === "pending" &&
      (selectedIds?.has(line.id) ?? false) &&
      isFulfillLineShort(line, locationId, group.stockByLocation),
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
  const [shortageFocusIngredientId, setShortageFocusIngredientId] = useState<
    number | null
  >(null);
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
  const activeLocationId = activeGroup
    ? selectedLocationId(activeGroup, locationByGroup)
    : null;
  const activeShortages = activeGroup
    ? selectedShortLines(
        activeGroup,
        selectedByGroup[activeGroup.fulfillSiteKind],
        activeLocationId,
      )
    : [];

  function activateSource(groupKind: FulfillSiteKind) {
    const group = groups.find((entry) => entry.fulfillSiteKind === groupKind);
    setActiveGroupKind(groupKind);
    setShortageFocusIngredientId(null);
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
    setShortageFocusIngredientId(null);
    setSelectedByGroup((current) => {
      const next = new Set(current[groupKind] ?? []);
      if (checked) next.add(lineId);
      else next.delete(lineId);
      return { ...current, [groupKind]: next };
    });
  }

  function selectAllPending(groupKind: FulfillSiteKind, lineIds: number[]) {
    setActiveGroupKind(groupKind);
    setShortageFocusIngredientId(null);
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

    const shortBeforeSubmit = selectedShortLines(
      group,
      selectedByGroup[group.fulfillSiteKind],
      fromLocationId,
    );
    if (shortBeforeSubmit.length > 0) {
      const first = shortBeforeSubmit[0]!;
      setShortageFocusIngredientId(first.ingredientId);
      setActiveGroupKind(group.fulfillSiteKind);
      toast.error(
        shortBeforeSubmit.length === 1
          ? copy.toastInsufficientNamed(first.ingredientName)
          : copy.toastInsufficientStock,
      );
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

      if (!result.success) {
        const failedIngredientId =
          result.errorCode === "insufficient_stock" &&
          typeof result.meta?.ingredientId === "number"
            ? result.meta.ingredientId
            : null;
        const failedLine =
          failedIngredientId == null
            ? null
            : group.lines.find(
                (line) => line.ingredientId === failedIngredientId,
              );
        if (failedIngredientId != null) {
          setShortageFocusIngredientId(failedIngredientId);
          setActiveGroupKind(group.fulfillSiteKind);
        }
        toast.error(
          failedLine
            ? copy.toastInsufficientNamed(failedLine.ingredientName)
            : (result.error ?? copy.toastFulfillFailed),
        );
        return;
      }

      const transferId = result.data?.transferId;
      if (transferId == null) {
        toast.error(copy.toastFulfillFailed);
        return;
      }
      setShortageFocusIngredientId(null);
      toast.success(copy.toastTransferCreated);
      if (onTransferCreated) onTransferCreated(transferId);
      else router.push(`/inventory/transfers/${transferId}`);
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

  function pendingLineColumns(
    group: StockRequestFulfillGroup,
  ): DataTableColumn<StockRequestFulfillLine>[] {
    const locationId = selectedLocationId(group, locationByGroup);
    return [
      {
        key: "select",
        header: copy.selectColumn,
        className: "w-14",
        render: (line) => (
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
        ),
      },
      {
        key: "ingredient",
        header: copy.ingredientColumn,
        render: (line) => {
          const short = isFulfillLineShort(
            line,
            locationId,
            group.stockByLocation,
          );
          const focused = line.ingredientId === shortageFocusIngredientId;
          return (
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={
                  focused || short
                    ? "font-medium text-destructive"
                    : "font-medium"
                }
              >
                {line.ingredientName}
              </span>
              {short ? (
                <Badge variant="destructive">{copy.shortageBadge}</Badge>
              ) : null}
            </span>
          );
        },
      },
      {
        key: "quantity",
        header: copy.quantityColumn,
        className: "text-right font-mono tabular-nums",
        render: (line) => copy.lineQtyUnit(line.quantity, line.unitLabel),
      },
      {
        key: "onHand",
        header: copy.onHandColumn,
        className: "text-right font-mono tabular-nums",
        render: (line) => {
          const onHand = lineOnHandInEntryUnit(
            line,
            locationId,
            group.stockByLocation,
          );
          const short = isFulfillLineShort(
            line,
            locationId,
            group.stockByLocation,
          );
          return (
            <span className={short ? "text-destructive" : undefined}>
              {copy.lineQtyUnit(onHand, line.unitLabel)}
            </span>
          );
        },
      },
    ];
  }

  function doneLineColumns(
    showStatus: boolean,
  ): DataTableColumn<StockRequestFulfillLine>[] {
    const columns: DataTableColumn<StockRequestFulfillLine>[] = [
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
    ];
    if (!showStatus) return columns;
    columns.push({
      key: "status",
      header: copy.statusColumn,
      className: "w-36",
      render: (line) => (
        <Badge variant="secondary">
          {stockRequestCopy.statusLabel(line.status)}
        </Badge>
      ),
    });
    return columns;
  }

  const multiSource = groups.length > 1;

  function fulfillLabel(group: StockRequestFulfillGroup): string {
    return multiSource
      ? copy.fulfillButton(siteKindLabel(group.fulfillSiteKind))
      : copy.fulfillPrimary;
  }

  const content = (
    <>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noLinesInScope}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {activeShortages.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>{copy.shortageAlertTitle}</AlertTitle>
              <AlertDescription>
                <p>{copy.shortageAlertHint}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {activeShortages.map((line) => {
                    const onHand = lineOnHandInEntryUnit(
                      line,
                      activeLocationId,
                      activeGroup!.stockByLocation,
                    );
                    return (
                      <li key={line.id}>
                        {copy.shortageAlertLine(
                          line.ingredientName,
                          line.quantity,
                          onHand,
                          line.unitLabel,
                        )}
                      </li>
                    );
                  })}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {multiSource ? (
            <div
              className="flex flex-wrap gap-2"
              aria-label={copy.sourceSelectorAria}
            >
              {groups.map((group) => {
                const pendingCount = group.lines.filter(
                  (line) => line.status === "pending",
                ).length;
                const isActive =
                  group.fulfillSiteKind === activeGroup?.fulfillSiteKind;
                return (
                  <Button
                    key={group.fulfillSiteKind}
                    type="button"
                    variant={isActive ? "secondary" : "outline"}
                    size="touch"
                    aria-pressed={isActive}
                    onClick={() => activateSource(group.fulfillSiteKind)}
                  >
                    {siteKindLabel(group.fulfillSiteKind)}
                    <Badge variant="secondary" className="ml-2">
                      {pendingCount}
                    </Badge>
                  </Button>
                );
              })}
            </div>
          ) : null}

          {groups.map((group) => {
            const pendingLines = group.lines.filter(
              (line) => line.status === "pending",
            );
            const doneLines = group.lines.filter(
              (line) => line.status !== "pending",
            );
            const doneStatuses = new Set(doneLines.map((line) => line.status));
            const uniformDoneStatus =
              doneStatuses.size === 1 ? [...doneStatuses][0]! : null;
            const showDoneStatus = uniformDoneStatus == null;
            const isActive =
              group.fulfillSiteKind === activeGroup?.fulfillSiteKind;
            if (multiSource && !isActive) return null;

            const locationId = selectedLocationId(group, locationByGroup);
            const sourceLabel = siteKindLabel(group.fulfillSiteKind);

            return (
              <div key={group.fulfillSiteKind} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {copy.sourceTitle(sourceLabel)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {copy.pendingOnlySummary(pendingLines.length)}
                  </p>
                </div>

                {pendingLines.length > 0 ? (
                  <div className="flex flex-col gap-2">
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
                            setShortageFocusIngredientId(null);
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
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {copy.noPendingLines}
                  </p>
                )}

                {pendingLines.length > 0 ? (
                  <DataTable
                    columns={pendingLineColumns(group)}
                    data={pendingLines}
                    getRowKey={(line) => line.id}
                    emptyTitle={copy.emptyLinesTitle}
                    emptyDescription={copy.emptyLinesDescription}
                    mobileCardRender={(line) => {
                      const short = isFulfillLineShort(
                        line,
                        locationId,
                        group.stockByLocation,
                      );
                      const onHand = lineOnHandInEntryUnit(
                        line,
                        locationId,
                        group.stockByLocation,
                      );
                      const focused =
                        line.ingredientId === shortageFocusIngredientId;
                      return (
                        <Item
                          variant="outline"
                          size="sm"
                          className={
                            focused || short ? "border-destructive" : undefined
                          }
                        >
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
                            aria-label={copy.selectLineAria(
                              line.ingredientName,
                            )}
                          />
                          <ItemContent>
                            <ItemTitle
                              className={
                                focused || short
                                  ? "text-destructive"
                                  : undefined
                              }
                            >
                              {line.ingredientName}
                            </ItemTitle>
                            <ItemDescription>
                              {copy.needVsOnHand(
                                line.quantity,
                                onHand,
                                line.unitLabel,
                              )}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions className="flex shrink-0 flex-col items-end gap-1">
                            {short ? (
                              <Badge variant="destructive">
                                {copy.shortageBadge}
                              </Badge>
                            ) : null}
                          </ItemActions>
                        </Item>
                      );
                    }}
                  />
                ) : null}

                {doneLines.length > 0 ? (
                  <Collapsible>
                    <CollapsibleTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start px-0"
                        />
                      }
                    >
                      {copy.doneLinesToggle(
                        doneLines.length,
                        uniformDoneStatus
                          ? stockRequestCopy.statusLabel(uniformDoneStatus)
                          : undefined,
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <DataTable
                        columns={doneLineColumns(showDoneStatus)}
                        data={doneLines}
                        getRowKey={(line) => line.id}
                        emptyTitle={copy.emptyLinesTitle}
                        emptyDescription={copy.emptyLinesDescription}
                        mobileCardRender={(line) => (
                          <Item variant="outline" size="sm">
                            <ItemContent>
                              <ItemTitle>{line.ingredientName}</ItemTitle>
                              <ItemDescription>
                                {copy.lineQtyUnit(
                                  line.quantity,
                                  line.unitLabel,
                                )}
                              </ItemDescription>
                            </ItemContent>
                            {showDoneStatus ? (
                              <ItemActions>
                                <Badge variant="secondary">
                                  {stockRequestCopy.statusLabel(line.status)}
                                </Badge>
                              </ItemActions>
                            ) : null}
                          </Item>
                        )}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            );
          })}
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
                  {isPending ? copy.processing : fulfillLabel(activeGroup)}
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
                {isPending ? copy.processing : fulfillLabel(activeGroup)}
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
