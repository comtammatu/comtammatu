"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PackagePlus as IconPackagePlus,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { Item } from "@comtammatu/ui/components/item";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog } from "@/components/form";
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
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  createGrnDraftFromPurchaseOrder,
} from "../purchase-order-actions";

const copy = messages.inventory.po;
const ORDER_OVERLAY_KEYS = [
  "poId",
  "demandId",
  "mode",
  "ordersQ",
  "ordersStatus",
  "ordersSite",
  "ordersPage",
] as const;

export type PurchaseOrderLineRow = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  receivedQuantity: number;
  entryUnitId: number;
  unitLabel: string;
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
  groupKey: string | null;
  groupCode: string | null;
  groupSequence: number | null;
  status: string;
  statusReason: string | null;
  orderedAt: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  supplierId: number;
  supplierName: string;
  branchId: number;
  branchName: string;
  lines: PurchaseOrderLineRow[];
  linkedGrns: PurchaseOrderLinkedGrn[];
  activeDraftGrnId: number | null;
};

type ReasonAction = {
  kind: "cancel" | "close";
  row: PurchaseOrderRow;
};

export function PurchaseOrdersClient({
  rows,
  branches,
  canManage,
  canReceive,
}: {
  rows: PurchaseOrderRow[];
  branches: Array<{ id: number; name: string }>;
  canManage: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const overlay = useDocumentOverlayUrl(ORDER_OVERLAY_KEYS);
  const [search, setSearch] = useState(() => overlay.get("ordersQ") ?? "");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction>();
  const [isPending, startTransition] = useTransition();

  const statusFilter = overlay.get("ordersStatus") ?? "all";
  const siteFilter = overlay.get("ordersSite") ?? "all";
  const currentPage = Math.max(Number(overlay.get("ordersPage")) || 1, 1);
  const parsedPoId = Number(overlay.get("poId"));
  const selectedPoId =
    Number.isInteger(parsedPoId) && parsedPoId > 0 ? parsedPoId : null;
  const mode = overlay.get("mode");
  const selectedRow =
    selectedPoId == null
      ? null
      : (rows.find((row) => row.id === selectedPoId) ?? null);
  const viewOpen = mode === "view" && selectedRow != null;
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (statusFilter === "all" || row.status === statusFilter) &&
          (siteFilter === "all" || row.branchId === Number(siteFilter)) &&
          matchesSearch(
            [
              row.code,
              row.groupCode ?? "",
              row.supplierName,
              row.branchName,
              row.notes ?? "",
              getStatusBadgeMeta("purchase-order", row.status).label,
            ],
            search,
          ),
      ),
    [rows, search, siteFilter, statusFilter],
  );

  const updateUrl = useCallback(
    (
      poId: number | null,
      nextMode: "view" | null,
      history: "push" | "replace" = "push",
    ) => {
      overlay.patchOverlay(
        {
          tab: "orders",
          demandId: null,
          poId,
          mode: nextMode,
        },
        history,
      );
    },
    [overlay.patchOverlay],
  );

  useEffect(() => {
    setSearch(overlay.get("ordersQ") ?? "");
  }, [overlay.get, overlay.values]);

  useEffect(() => {
    if (mode !== "view" || selectedPoId == null || selectedRow != null) return;
    toast.error("Không tìm thấy đơn mua.");
    updateUrl(null, null, "replace");
  }, [mode, selectedPoId, selectedRow, updateUrl]);

  function openReceipt(row: PurchaseOrderRow) {
    if (row.activeDraftGrnId != null) {
      router.push(
        `/inventory/grn?grnId=${row.activeDraftGrnId}&mode=receive`,
        { scroll: false },
      );
      return;
    }
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await createGrnDraftFromPurchaseOrder({
          poId: row.id,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Không thể mở phiếu nhập.");
          return;
        }
        router.push(
          `/inventory/grn?grnId=${result.data.id}&mode=receive`,
          { scroll: false },
        );
        router.refresh();
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
        const result =
          reasonAction.kind === "cancel"
            ? await cancelPurchaseOrder({
                poId: reasonAction.row.id,
                reason,
              })
            : await closePurchaseOrder({
                poId: reasonAction.row.id,
                reason,
              });
        if (!result.success) {
          toast.error(result.error ?? "Không thể xử lý đơn mua.");
          return;
        }
        toast.success(
          reasonAction.kind === "cancel"
            ? copy.cancelledToast
            : copy.closedToast,
        );
        setReasonAction(undefined);
        setReason("");
        updateUrl(null, null, "replace");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function rowActions(row: PurchaseOrderRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.view,
        onSelect: () => updateUrl(row.id, "view"),
      },
    ];
    if (
      canReceive &&
      (row.status === "approved" || row.status === "partially_received")
    ) {
      actions.push({
        key: "receive",
        label:
          row.status === "partially_received"
            ? copy.receiveMoreAction
            : copy.continueGrn,
        icon: <IconPackagePlus data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => openReceipt(row),
      });
    }
    if (
      canManage &&
      row.status === "approved" &&
      !row.linkedGrns.some((grn) => grn.status === "confirmed")
    ) {
      actions.push({
        key: "cancel",
        label: copy.cancelAction,
        onSelect: () => setReasonAction({ kind: "cancel", row }),
      });
    }
    if (canManage && row.status === "partially_received") {
      actions.push({
        key: "close",
        label: copy.closeRemainingAction,
        onSelect: () => setReasonAction({ kind: "close", row }),
      });
    }
    return actions;
  }

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "code",
      header: copy.codeColumn,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-mono font-medium">{row.code}</span>
          {row.groupCode ? (
            <span className="text-xs text-muted-foreground">
              {row.groupCode}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "supplier",
      header: copy.supplierRequired,
      render: (row) => row.supplierName,
    },
    { key: "branch", header: copy.warehouse, render: (row) => row.branchName },
    {
      key: "status",
      header: copy.statusColumn,
      render: (row) => (
        <StatusBadge domain="purchase-order" value={row.status} />
      ),
    },
    {
      key: "needed",
      header: copy.expectedDeliveryDate,
      render: (row) =>
        row.expectedDeliveryDate
          ? formatVNDate(row.expectedDeliveryDate)
          : "—",
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu items={rowActions(row)} label={row.code} />
        </div>
      ),
    },
  ];

  const list = (
    <AppListFrame
      toolbar={
        <AppToolbar
          variant="inline"
          search={
            <InputGroup className="min-w-0 flex-1 sm:min-w-72">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearch(value);
                  overlay.patchOverlay(
                    {
                      ordersQ: value || null,
                      ordersPage: null,
                    },
                    "replace",
                  );
                }}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.searchPlaceholder}
              />
            </InputGroup>
          }
          filters={
            <>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  overlay.patchOverlay(
                    {
                      ordersStatus: value === "all" ? null : value,
                      ordersPage: null,
                    },
                    "replace",
                  );
                }}
              >
                <SelectTrigger
                  size="field"
                  aria-label={copy.statusFilterAria}
                >
                  <SelectValue placeholder={copy.statusFilterPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allStatuses}</SelectItem>
                  {[...new Set(rows.map((row) => row.status))].map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusBadgeMeta("purchase-order", status).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {branches.length > 1 ? (
                <Select
                  value={siteFilter}
                  onValueChange={(value) => {
                    overlay.patchOverlay(
                      {
                        ordersSite: value === "all" ? null : value,
                        ordersPage: null,
                      },
                      "replace",
                    );
                  }}
                >
                  <SelectTrigger
                    size="field"
                    aria-label={copy.warehouseFilterAria}
                  >
                    <SelectValue placeholder={copy.warehouseFilterPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.allWarehouses}</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={filteredRows}
        getRowKey={(row) => row.id}
        onRowClick={(row) => updateUrl(row.id, "view")}
        pageSize={50}
        currentPage={currentPage}
        onPageChange={(page) => {
          overlay.patchOverlay(
            { ordersPage: page <= 1 ? null : page },
            "replace",
          );
        }}
        emptyTitle={copy.emptyInitialTitle}
        emptyDescription={copy.emptyInitialDescription}
        emptyIcon={<IconShoppingCart className="size-8 text-muted-foreground" />}
        mobileCardRender={(row) => (
          <InteractiveCard
            minHeight="mobile"
            padding="default"
            className="w-full flex-col items-stretch gap-2 text-left"
            render={<button type="button" />}
            onClick={() => updateUrl(row.id, "view")}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold">{row.code}</span>
              <StatusBadge domain="purchase-order" value={row.status} />
            </span>
            <span className="text-sm">{row.supplierName}</span>
            <span className="text-xs text-muted-foreground">
              {row.branchName} · {copy.lineCount(row.lines.length)}
            </span>
          </InteractiveCard>
        )}
      />
    </AppListFrame>
  );

  return (
    <>
      {list}
      <AppDialog
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) updateUrl(null, null, "replace");
        }}
        variant="document"
        title={selectedRow?.code ?? copy.pageTitle}
        description={
          selectedRow
            ? `${selectedRow.supplierName} · ${selectedRow.branchName}`
            : undefined
        }
        footer={
          viewOpen && selectedRow ? (
            <>
              {canManage &&
              selectedRow.status === "approved" &&
              !selectedRow.linkedGrns.some(
                (grn) => grn.status === "confirmed",
              ) ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    setReasonAction({ kind: "cancel", row: selectedRow })
                  }
                >
                  {copy.cancelAction}
                </Button>
              ) : null}
              {canManage && selectedRow.status === "partially_received" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setReasonAction({ kind: "close", row: selectedRow })
                  }
                >
                  {copy.closeRemainingAction}
                </Button>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateUrl(null, null, "replace")}
                >
                  {ACTIONS_VI.close}
                </Button>
                {canReceive &&
                (selectedRow.status === "approved" ||
                  selectedRow.status === "partially_received") ? (
                  <Button
                    type="button"
                    disabled={isPending || pendingId === selectedRow.id}
                    onClick={() => openReceipt(selectedRow)}
                  >
                    {selectedRow.status === "partially_received"
                      ? copy.receiveMoreAction
                      : copy.continueGrn}
                  </Button>
                ) : null}
              </div>
            </>
          ) : null
        }
      >
        {viewOpen && selectedRow ? (
          <div className="flex flex-col gap-4">
            <DescriptionList
              className="sm:grid sm:grid-cols-4 sm:gap-4"
              items={[
                {
                  term: copy.statusColumn,
                  description: getStatusBadgeMeta(
                    "purchase-order",
                    selectedRow.status,
                  ).label,
                },
                {
                  term: copy.groupCode,
                  description: selectedRow.groupCode ?? "—",
                },
                {
                  term: copy.expectedDeliveryDate,
                  description: selectedRow.expectedDeliveryDate
                    ? formatVNDate(selectedRow.expectedDeliveryDate)
                    : "—",
                },
                {
                  term: copy.relatedReceipts,
                  description: String(selectedRow.linkedGrns.length),
                },
              ]}
            />
            {selectedRow.statusReason ? (
              <Item variant="muted" size="sm">
                {selectedRow.statusReason}
              </Item>
            ) : null}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                {copy.detail.overviewLinesTitle}
              </p>
              {selectedRow.lines.map((line) => (
                <Item
                  key={line.id}
                  variant="outline"
                  size="sm"
                  className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span>{line.ingredientName}</span>
                  <span className="font-mono tabular-nums">
                    {copy.lineReceiptSummary(
                      line.quantity,
                      line.receivedQuantity,
                      Math.max(line.quantity - line.receivedQuantity, 0),
                      line.unitLabel,
                    )}
                  </span>
                </Item>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                {copy.detail.linkedGrnsTitle}
              </p>
              {selectedRow.linkedGrns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {copy.emptyLinkedGrnsHint}
                </p>
              ) : (
                selectedRow.linkedGrns.map((grn) => (
                  <Button
                    key={grn.id}
                    type="button"
                    variant="outline"
                    className="justify-between"
                    render={
                      <Link
                        href={`/inventory/grn?grnId=${grn.id}&mode=${
                          grn.status === "draft" ? "receive" : "view"
                        }`}
                      />
                    }
                  >
                    <span className="font-mono">{grn.code}</span>
                    <span>{grn.status === "draft" ? "Nháp" : "Đã xác nhận"}</span>
                  </Button>
                ))
              )}
            </div>
          </div>
        ) : null}
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
            ? copy.closeRemainingTitle
            : copy.cancelTitle
        }
        description={reasonAction?.row.code}
        reasonId="purchase-order-status-reason"
        reason={reason}
        onReasonChange={setReason}
        reasonLabel={copy.reasonLabel}
        reasonPlaceholder={copy.reasonPlaceholder}
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel="Xác nhận"
        confirmVariant="destructive"
        isPending={isPending}
        onConfirm={runReasonAction}
      />
    </>
  );
}
