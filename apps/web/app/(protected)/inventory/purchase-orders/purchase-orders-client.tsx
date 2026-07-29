"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Eye as IconEye,
  PackagePlus as IconPackagePlus,
  Save as IconSave,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { useFormControlSize } from "@/components/form/control-size";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { AppDialog, FormattedNumberInput } from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  AppListFrame,
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { FORM_VI } from "@comtammatu/shared/messages";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  createGrnDraftFromPurchaseOrder,
  sendPurchaseOrder,
  updatePurchaseOrderPrices,
} from "../purchase-order-actions";

const poCopy = messages.inventory.po;

export type PurchaseOrderLineRow = {
  id: number;
  ingredientName: string;
  quantity: number;
  unitLabel: string;
  monetary: {
    unitPriceEst: number | null;
    lineTotal: number | null;
  } | null;
};

export type PurchaseOrderLinkedGrn = {
  id: number;
  code: string;
  status: string;
  receivedAt: string | null;
};

export type PurchaseOrderRow = {
  id: number;
  code: string;
  status: string;
  orderedAt: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  purchaseRequestId: number | null;
  purchaseRequestCode: string | null;
  supplierName: string;
  branchName: string;
  lineCount: number;
  monetary: { estimatedTotal: number | null } | null;
  lines: PurchaseOrderLineRow[];
  linkedGrns: PurchaseOrderLinkedGrn[];
  activeDraftGrnId: number | null;
};

export function PurchaseOrdersClient({
  rows,
  canCreate,
  canReceive,
  canViewPrices,
}: {
  rows: PurchaseOrderRow[];
  canCreate: boolean;
  canReceive: boolean;
  canViewPrices: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});
  const [pricesDirty, setPricesDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<
    { kind: "cancel" | "close"; row: PurchaseOrderRow } | undefined
  >();
  const [isPending, startTransition] = useTransition();
  const parsedPoId = Number(searchParams.get("poId"));
  const selectedPoId =
    Number.isInteger(parsedPoId) && parsedPoId > 0 ? parsedPoId : null;
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          [
            row.code,
            row.supplierName,
            row.branchName,
            row.notes ?? "",
            getStatusBadgeMeta("purchase-order", row.status).label,
          ],
          search,
        ),
      ),
    [rows, search],
  );
  const selectedRow =
    selectedPoId == null
      ? null
      : (rows.find((row) => row.id === selectedPoId) ?? null);

  function openDetail(row: PurchaseOrderRow) {
    setPriceDraft(
      Object.fromEntries(
        row.lines.map((line) => [
          line.id,
          line.monetary?.unitPriceEst == null
            ? ""
            : String(line.monetary.unitPriceEst),
        ]),
      ),
    );
    setPricesDirty(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("poId", String(row.id));
    params.set("mode", "view");
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  async function closeDetail() {
    if (
      pricesDirty &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("poId");
    params.delete("mode");
    router.replace(params.size > 0 ? `${pathname}?${params}` : pathname, {
      scroll: false,
    });
  }

  useEffect(() => {
    if (!selectedRow) return;
    setPriceDraft(
      Object.fromEntries(
        selectedRow.lines.map((line) => [
          line.id,
          line.monetary?.unitPriceEst == null
            ? ""
            : String(line.monetary.unitPriceEst),
        ]),
      ),
    );
    setPricesDirty(false);
  }, [selectedRow]);

  function linePricesMissing(row: PurchaseOrderRow) {
    return row.lines.some(
      (line) =>
        line.monetary?.unitPriceEst == null || line.monetary.unitPriceEst < 0,
    );
  }

  function savePrices(row: PurchaseOrderRow) {
    const lines = row.lines.map((line) => ({
      lineId: line.id,
      unitPrice: Number(priceDraft[line.id]),
    }));
    if (
      lines.some(
        (line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0,
      )
    ) {
      toast.error(poCopy.pricesRequiredToast);
      return;
    }

    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await updatePurchaseOrderPrices({ poId: row.id, lines });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setPricesDirty(false);
        toast.success(poCopy.pricesSavedToast);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  async function send(row: PurchaseOrderRow) {
    if (pricesDirty) {
      toast.error(poCopy.sendBlockedDirtyPrices);
      return;
    }
    if (linePricesMissing(row)) {
      toast.error(poCopy.sendBlockedMissingPrices);
      return;
    }
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await sendPurchaseOrder({ poId: row.id });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(poCopy.sentToast(row.code));
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function createGrn(row: PurchaseOrderRow) {
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await createGrnDraftFromPurchaseOrder({
          poId: row.id,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        const grnId = result.data?.id;
        if (grnId != null) {
          router.push(`/inventory/grn?grnId=${grnId}&mode=receive`, {
            scroll: false,
          });
        }
      } finally {
        setPendingId(null);
      }
    });
  }

  function runReasonAction() {
    if (!reasonAction) return;
    setPendingId(reasonAction.row.id);
    startTransition(async () => {
      try {
        if (reasonAction.kind === "cancel") {
          const result = await cancelPurchaseOrder({
            poId: reasonAction.row.id,
            reason,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          const cancelledDraftGrns =
            result.data?.cancelledDraftGrns ?? 0;
          toast.success(
            cancelledDraftGrns > 0
              ? poCopy.cancelledWithDraftReceiptsToast(cancelledDraftGrns)
              : poCopy.cancelledToast,
          );
        } else {
          const result = await closePurchaseOrder({
            poId: reasonAction.row.id,
            reason,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(poCopy.closedToast);
        }
        setReasonAction(undefined);
        setReason("");
        await closeDetail();
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function renderActions(row: PurchaseOrderRow, touch = false) {
    const items: RowActionItem[] = [
      {
        key: "view",
        label: poCopy.viewDetail,
        icon: <IconEye data-icon="inline-start" />,
        onSelect: () => openDetail(row),
      },
    ];
    if (row.status === "draft" && canCreate) {
      items.push({
        key: "send",
        label: poCopy.sendAction,
        disabled: isPending || pendingId === row.id,
        onSelect: () => {
          void send(row);
        },
      });
    }
    if (
      canCreate &&
      (row.status === "draft" || row.status === "sent") &&
      row.linkedGrns.every((grn) => grn.status !== "confirmed")
    ) {
      items.push({
        key: "cancel",
        label: poCopy.cancelAction,
        disabled: isPending || pendingId === row.id,
        onSelect: () => setReasonAction({ kind: "cancel", row }),
      });
    }
    if (canCreate && row.status === "partially_received") {
      items.push({
        key: "close",
        label: poCopy.closeRemainingAction,
        disabled: isPending || pendingId === row.id,
        onSelect: () => setReasonAction({ kind: "close", row }),
      });
    }
    if (
      canReceive &&
      (row.status === "sent" || row.status === "partially_received")
    ) {
      items.push(
        row.activeDraftGrnId == null
          ? {
              key: "create-grn",
              label: "Tạo phiếu nhập",
              icon: <IconPackagePlus data-icon="inline-start" />,
              disabled: isPending || pendingId === row.id,
              onSelect: () => createGrn(row),
            }
          : {
              key: "continue-grn",
              label: "Tiếp tục nhập hàng",
              icon: <IconPackagePlus data-icon="inline-start" />,
              href: `/inventory/grn?grnId=${row.activeDraftGrnId}&mode=receive`,
            },
      );
    }
    return (
      <div
        className="flex justify-end"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RowActionsMenu
          items={items}
          label={poCopy.viewDetailAria(row.code)}
          triggerSize={touch ? "icon-touch" : "icon"}
        />
      </div>
    );
  }

  const lineColumns: DataTableColumn<PurchaseOrderLineRow>[] = [
    {
      key: "item",
      header: poCopy.detail.item,
      render: (line) => line.ingredientName,
    },
    {
      key: "qty",
      header: poCopy.quantityShort,
      className: "text-right font-mono tabular-nums",
      render: (line) => `${line.quantity} ${line.unitLabel}`,
    },
    ...(canViewPrices
      ? [
          {
            key: "price",
            header: poCopy.unitPrice,
            className: "text-right font-mono tabular-nums",
            render: (line: PurchaseOrderLineRow) =>
              selectedRow?.status === "draft" && canCreate ? (
                <FormattedNumberInput
                  inputMode="numeric"
                  maxFractionDigits={0}
                  aria-label={poCopy.unitPriceAria(line.ingredientName)}
                  value={priceDraft[line.id] ?? ""}
                  onValueChange={(value) => {
                    setPriceDraft((current) => ({
                      ...current,
                      [line.id]: value,
                    }));
                    setPricesDirty(true);
                  }}
                  className="ml-auto w-32 text-right font-mono"
                />
              ) : line.monetary?.unitPriceEst == null ? (
                poCopy.noPriceYet
              ) : (
                formatVND(line.monetary.unitPriceEst)
              ),
          },
        ]
      : []),
    ...(canViewPrices
      ? [
          {
            key: "total",
            header: poCopy.estimatedTotal,
            className: "text-right font-mono tabular-nums",
            render: (line: PurchaseOrderLineRow) =>
              line.monetary?.lineTotal == null
                ? poCopy.noEstimateYet
                : formatVND(line.monetary.lineTotal),
          },
        ]
      : []),
  ];

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "code",
      header: poCopy.codeColumn,
      render: (row) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-mono font-medium"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(row);
          }}
        >
          {row.code}
        </Button>
      ),
    },
    {
      key: "supplier",
      header: poCopy.supplierRequired,
      render: (row) => row.supplierName,
    },
    {
      key: "branch",
      header: poCopy.branchLabel,
      render: (row) => row.branchName,
    },
    {
      key: "status",
      header: poCopy.statusColumn,
      render: (row) => (
        <StatusBadge domain="purchase-order" value={row.status} />
      ),
    },
    ...(canViewPrices
      ? [
          {
            key: "total",
            header: poCopy.estimatedTotalShort,
            className: "text-right font-mono",
            render: (row: PurchaseOrderRow) =>
              row.monetary?.estimatedTotal == null
                ? poCopy.noEstimateYet
                : formatVND(row.monetary.estimatedTotal),
          },
        ]
      : []),
    {
      key: "date",
      header: poCopy.orderedAtColumn,
      render: (row) => formatVNDate(row.orderedAt),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) => renderActions(row),
    },
  ];
  const listToolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup size={controlSize} className="min-w-0 flex-1 sm:min-w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={poCopy.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={poCopy.searchPlaceholder}
          />
        </InputGroup>
      }
      reset={
        <Badge variant="outline">
          {filteredRows.length}/{rows.length}
        </Badge>
      }
    />
  );

  const detailFooter =
    selectedRow == null ? null : (
      <AppDetailFooter
        sticky
        leading={
          <>
            {canCreate &&
            (selectedRow.status === "draft" ||
              selectedRow.status === "sent") &&
            selectedRow.linkedGrns.every(
              (grn) => grn.status !== "confirmed",
            ) ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending || pendingId === selectedRow.id}
                onClick={() =>
                  setReasonAction({ kind: "cancel", row: selectedRow })
                }
              >
                {poCopy.cancelAction}
              </Button>
            ) : null}
            {canCreate && selectedRow.status === "partially_received" ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending || pendingId === selectedRow.id}
                onClick={() =>
                  setReasonAction({ kind: "close", row: selectedRow })
                }
              >
                {poCopy.closeRemainingAction}
              </Button>
            ) : null}
            {selectedRow.status === "draft" &&
            canCreate &&
            !pricesDirty &&
            linePricesMissing(selectedRow) ? (
              <p className="text-sm text-muted-foreground">
                {poCopy.sendBlockedMissingPrices}
              </p>
            ) : null}
          </>
        }
        trailing={
          selectedRow.status === "draft" && canCreate && pricesDirty ? (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => savePrices(selectedRow)}
            >
              <IconSave data-icon="inline-start" />
              {poCopy.savePricesAction}
            </Button>
          ) : selectedRow.status === "draft" && canCreate ? (
            <Button
              type="button"
              disabled={
                isPending ||
                pendingId === selectedRow.id ||
                pricesDirty ||
                linePricesMissing(selectedRow)
              }
              onClick={() => {
                void send(selectedRow);
              }}
            >
              {poCopy.sendAction}
            </Button>
          ) : canReceive &&
            (selectedRow.status === "sent" ||
              selectedRow.status === "partially_received") ? (
            selectedRow.activeDraftGrnId == null ? (
              <Button
                type="button"
                disabled={isPending || pendingId === selectedRow.id}
                onClick={() => createGrn(selectedRow)}
              >
                <IconPackagePlus data-icon="inline-start" />
                {poCopy.createGrn}
              </Button>
            ) : (
              <Button
                type="button"
                render={
                  <Link
                    href={`/inventory/grn?grnId=${selectedRow.activeDraftGrnId}&mode=receive`}
                  />
                }
              >
                <IconPackagePlus data-icon="inline-start" />
                {poCopy.continueGrn}
              </Button>
            )
          ) : null
        }
      />
    );

  const detailContent = selectedRow ? (
    <>
        <DescriptionList
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          descriptionClassName="font-semibold"
          items={[
            {
              term: poCopy.supplierRequired,
              description: selectedRow.supplierName,
            },
            {
              term: poCopy.branchLabel,
              description: selectedRow.branchName,
            },
            {
              term: "Yêu cầu mua",
              description: selectedRow.purchaseRequestCode ?? "—",
            },
            {
              term: "Ngày dự kiến",
              description: selectedRow.expectedDeliveryDate
                ? formatVNDate(selectedRow.expectedDeliveryDate)
                : "—",
            },
            ...(selectedRow.monetary
              ? [
                  {
                    term: poCopy.estimatedTotal,
                    description:
                      selectedRow.monetary.estimatedTotal == null
                        ? poCopy.noEstimateYet
                        : formatVND(selectedRow.monetary.estimatedTotal),
                  },
                ]
              : []),
          ]}
        />

        <AppSection
          title={poCopy.detail.overviewLinesTitle}
          badge={{
            children: poCopy.lineCount(selectedRow.lineCount),
            variant: "outline",
          }}
          contentFlush
          className="overflow-hidden"
        >
          <DataTable
            columns={lineColumns}
            data={selectedRow.lines}
            getRowKey={(line) => line.id}
            emptyTitle={poCopy.emptyLinesTitle}
            emptyDescription={poCopy.emptyLinesDescription}
            mobileCardRender={(line) => (
              <Item variant="muted" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-words">
                    {line.ingredientName}
                  </ItemTitle>
                  <ItemDescription>
                    {line.quantity} {line.unitLabel}
                    {line.monetary?.unitPriceEst == null
                      ? ""
                      : ` · ${formatVND(line.monetary.unitPriceEst)}`}
                  </ItemDescription>
                </ItemContent>
                {line.monetary ? (
                  <ItemActions>
                    <span className="font-mono tabular-nums">
                      {line.monetary.lineTotal == null
                        ? poCopy.noEstimateYet
                        : formatVND(line.monetary.lineTotal)}
                    </span>
                  </ItemActions>
                ) : null}
              </Item>
            )}
          />
        </AppSection>

        {selectedRow.notes ? (
          <AppSection title={FORM_VI.notes} size="sm">
            <p className="break-words text-sm text-muted-foreground">
              {selectedRow.notes}
            </p>
          </AppSection>
        ) : null}

        {selectedRow.linkedGrns.length > 0 ? (
          <AppSection title={poCopy.detail.linkedGrnsTitle} size="sm">
            <div className="flex flex-col gap-2">
              {selectedRow.linkedGrns.map((grn) => (
                <Item key={grn.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle className="font-mono">{grn.code}</ItemTitle>
                    <ItemDescription>
                      {grn.receivedAt
                        ? formatVNDate(grn.receivedAt)
                        : poCopy.noReceivedDate}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="gap-2">
                    <StatusBadge
                      domain="inventory"
                      value={grn.status}
                      label={
                        grn.status === "confirmed"
                          ? messages.inventory.grn.statusConfirmedLong
                          : undefined
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      render={
                        <Link
                          href={`/inventory/grn?grnId=${grn.id}&mode=view`}
                        />
                      }
                    >
                      {poCopy.openLinkedGrn}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </div>
          </AppSection>
        ) : null}
    </>
  ) : null;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={poCopy.pageTitle}
        description={poCopy.pageDescription}
      />
      <AppListFrame toolbar={listToolbar}>
        <DataTable
          columns={columns}
          data={filteredRows}
          getRowKey={(row) => row.id}
          pageSize={50}
          onRowClick={openDetail}
          getRowAriaLabel={(row) => poCopy.viewDetailAria(row.code)}
          getRowDataState={(row) =>
            row.id === selectedPoId ? "selected" : undefined
          }
          emptyTitle={poCopy.emptyInitialTitle}
          emptyDescription={poCopy.emptyInitialDescription}
          emptyIcon={
            <IconShoppingCart className="size-8 text-muted-foreground" />
          }
          mobileCardRender={(row) => (
            <Item
              variant="outline"
              role="button"
              tabIndex={0}
              aria-label={poCopy.viewDetailAria(row.code)}
              className="cursor-pointer"
              onClick={() => openDetail(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetail(row);
                }
              }}
            >
              <ItemContent>
                <ItemTitle>{row.code}</ItemTitle>
                <ItemDescription>
                  {row.supplierName} · {row.branchName}
                </ItemDescription>
                <ItemDescription>
                  {poCopy.lineCount(row.lineCount)}
                  {row.monetary
                    ? ` · ${
                        row.monetary.estimatedTotal == null
                          ? poCopy.noEstimateYet
                          : formatVND(row.monetary.estimatedTotal)
                      }`
                    : ""}
                </ItemDescription>
              </ItemContent>
              <ItemFooter>
                <StatusBadge domain="purchase-order" value={row.status} />
                <ItemActions>{renderActions(row, true)}</ItemActions>
              </ItemFooter>
            </Item>
          )}
        />
      </AppListFrame>

      <AppDialog
        open={selectedRow != null}
        onOpenChange={(open) => {
          if (!open) void closeDetail();
        }}
        variant="document"
        title={selectedRow?.code ?? poCopy.pageTitle}
        description={
          selectedRow
            ? `${getStatusBadgeMeta("purchase-order", selectedRow.status).label} · ${selectedRow.supplierName} · ${selectedRow.branchName}`
            : poCopy.pageDescription
        }
        footer={detailFooter}
      >
        {detailContent}
      </AppDialog>

      <ReasonConfirmDialog
        open={reasonAction != null}
        onOpenChange={(open) => {
          if (!open) {
            setReasonAction(undefined);
            setReason("");
          }
        }}
        title={
          reasonAction?.kind === "close"
            ? poCopy.closeRemainingTitle
            : poCopy.cancelTitle
        }
        description={
          reasonAction?.kind === "cancel" &&
          reasonAction.row.activeDraftGrnId != null
            ? poCopy.cancelDraftReceiptsDescription
            : reasonAction?.row.code
        }
        reasonId="purchase-order-status-reason"
        reason={reason}
        onReasonChange={setReason}
        reasonLabel={poCopy.reasonLabel}
        reasonPlaceholder={poCopy.reasonPlaceholder}
        cancelLabel={poCopy.backAction}
        confirmLabel={
          reasonAction?.kind === "close"
            ? poCopy.closeRemainingAction
            : poCopy.cancelAction
        }
        confirmVariant="destructive"
        isPending={isPending}
        onConfirm={runReasonAction}
      />
    </AppPage>
  );
}
