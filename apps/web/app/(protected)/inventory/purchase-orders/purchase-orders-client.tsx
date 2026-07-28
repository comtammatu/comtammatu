"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  Eye as IconEye,
  Save as IconSave,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
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
  AppPage,
  AppPageHeader,
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { InventoryListFrame } from "../_components/inventory-list-frame";
import {
  approvePurchaseOrder,
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
  notes: string | null;
  supplierName: string;
  branchName: string;
  lineCount: number;
  monetary: { estimatedTotal: number | null } | null;
  lines: PurchaseOrderLineRow[];
  linkedGrns: PurchaseOrderLinkedGrn[];
};

export function PurchaseOrdersClient({
  rows,
  canCreate,
  canApprove,
  canViewPrices,
}: {
  rows: PurchaseOrderRow[];
  canCreate: boolean;
  canApprove: boolean;
  canViewPrices: boolean;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});
  const [pricesDirty, setPricesDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
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
    setSelectedPoId(row.id);
  }

  function closeDetail() {
    setSelectedPoId(null);
  }

  function savePrices(row: PurchaseOrderRow) {
    const lines = row.lines.map((line) => ({
      lineId: line.id,
      unitPrice: Number(priceDraft[line.id]),
    }));
    if (
      lines.some(
        (line) => !Number.isFinite(line.unitPrice) || line.unitPrice <= 0,
      )
    ) {
      toast.error("Nhập đơn giá lớn hơn 0 cho mọi dòng.");
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
        toast.success("Đã lưu giá mua");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  async function approve(row: PurchaseOrderRow) {
    // confirm() must run outside startTransition — transition-deferred
    // setState can leave the AlertDialog closed after menu/sheet interactions.
    const accepted = await confirm({
      title: `Duyệt ${row.code}?`,
      description:
        "Sau khi duyệt, giá trên đơn mua được khóa cho phiếu nhập liên kết.",
      confirmText: "Duyệt mua",
    });
    if (!accepted) return;
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await approvePurchaseOrder({ poId: row.id });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(`Đã duyệt ${row.code}`);
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
    if (row.status === "draft" && canApprove) {
      items.push({
        key: "approve",
        label: poCopy.approveAction,
        icon: <IconCheck data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => {
          void approve(row);
        },
      });
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
                  aria-label={`Đơn giá ${line.ingredientName}`}
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
                "—"
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
                ? "—"
                : formatVND(line.monetary.lineTotal),
          },
        ]
      : []),
  ];

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "code",
      header: "Số đơn đặt hàng",
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
      header: "Nhà cung cấp",
      render: (row) => row.supplierName,
    },
    {
      key: "branch",
      header: "Chi nhánh",
      render: (row) => row.branchName,
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => (
        <StatusBadge domain="purchase-order" value={row.status} />
      ),
    },
    ...(canViewPrices
      ? [
          {
            key: "total",
            header: "Tạm tính",
            className: "text-right font-mono",
            render: (row: PurchaseOrderRow) =>
              row.monetary?.estimatedTotal == null
                ? "—"
                : formatVND(row.monetary.estimatedTotal),
          },
        ]
      : []),
    {
      key: "date",
      header: "Ngày lập",
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
      <>
        {selectedRow.status === "draft" && canCreate ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !pricesDirty}
            onClick={() => savePrices(selectedRow)}
          >
            <IconSave data-icon="inline-start" />
            {poCopy.savePricesAction}
          </Button>
        ) : null}
        {selectedRow.status === "draft" && canApprove ? (
          <Button
            type="button"
            disabled={
              isPending ||
              pendingId === selectedRow.id ||
              pricesDirty ||
              selectedRow.lines.some(
                (line) =>
                  line.monetary?.unitPriceEst == null ||
                  line.monetary.unitPriceEst <= 0,
              )
            }
            onClick={() => {
              void approve(selectedRow);
            }}
          >
            <IconCheck data-icon="inline-start" />
            {poCopy.approveAction}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={closeDetail}>
          {ACTIONS_VI.close}
        </Button>
      </>
    );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={poCopy.pageTitle}
        description={poCopy.pageDescription}
      />
      <InventoryListFrame toolbar={listToolbar}>
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
                          ? "Chưa có tạm tính"
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
      </InventoryListFrame>

      <AppDialog
        open={selectedRow != null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        title={
          selectedRow ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{selectedRow.code}</span>
              <StatusBadge domain="purchase-order" value={selectedRow.status} />
            </div>
          ) : (
            poCopy.detail.title
          )
        }
        description={
          selectedRow
            ? `${selectedRow.supplierName} · ${selectedRow.branchName} · ${formatVNDate(selectedRow.orderedAt)}`
            : undefined
        }
        contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-5xl"
        bodyClassName="min-h-0 overflow-hidden"
        footer={detailFooter}
      >
        {selectedRow ? (
          <>
            <DescriptionList
              className="sm:grid sm:grid-cols-3 sm:gap-4"
              items={[
                {
                  term: poCopy.supplierRequired,
                  description: selectedRow.supplierName,
                },
                {
                  term: poCopy.branchLabel,
                  description: selectedRow.branchName,
                },
                ...(selectedRow.monetary
                  ? [
                      {
                        term: poCopy.estimatedTotal,
                        description:
                          selectedRow.monetary.estimatedTotal == null
                            ? "—"
                            : formatVND(selectedRow.monetary.estimatedTotal),
                      },
                    ]
                  : []),
              ]}
            />

            <div className="flex min-h-0 flex-col gap-2">
              <p className="text-sm font-medium">
                {poCopy.detail.overviewLinesTitle}
              </p>
              <Frame className="h-72 min-h-0 overflow-hidden sm:h-80">
                <ScrollArea className="h-full">
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
                        <ItemActions>
                          <span className="font-mono tabular-nums">
                            {line.monetary?.lineTotal == null
                              ? "—"
                              : formatVND(line.monetary.lineTotal)}
                          </span>
                        </ItemActions>
                      </Item>
                    )}
                  />
                </ScrollArea>
              </Frame>
            </div>

            {selectedRow.notes ? (
              <p className="break-words text-sm italic text-muted-foreground">
                {selectedRow.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{poCopy.noNotes}</p>
            )}

            {selectedRow.linkedGrns.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {poCopy.detail.linkedGrnsTitle}
                </p>
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
                        <StatusBadge domain="inventory" value={grn.status} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          render={<Link href={`/inventory/grn/${grn.id}`} />}
                        >
                          {poCopy.openLinkedGrn}
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </AppDialog>
    </AppPage>
  );
}
