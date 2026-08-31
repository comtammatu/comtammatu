"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  PackagePlus as IconPackagePlus,
  Plus as IconPlus,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNDate, getVNDateString } from "@comtammatu/shared/time";
import { cn } from "@comtammatu/ui/lib/utils";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
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
import { useFormControlSize } from "@/components/form/control-size";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  createGrnDraftFromPurchaseOrder,
  createPurchaseOrder,
} from "../purchase-order-actions";
import {
  defaultPurchaseRequestUnit,
  type PurchaseRequestIngredientOption,
  type PurchaseOrderRow,
} from "@lib/inventory/purchase-request-model";
import type { PurchaseOrderSupplier } from "@lib/inventory/purchase-order-drafts";
import { pickDefaultPurchaseDemandSupplier } from "@lib/inventory/purchase-order-drafts";
import {
  blankRequestLine,
  type RequestDraftLine,
} from "../purchase-requests/purchase-request-draft-types";

const PurchaseOrderFormDialog = dynamic(
  () =>
    import("./purchase-order-form-dialog").then(
      (mod) => mod.PurchaseOrderFormDialog,
    ),
  { ssr: false },
);

export type {
  PurchaseOrderLineRow,
  PurchaseOrderLinkedGrn,
  PurchaseOrderRow,
} from "@lib/inventory/purchase-request-model";

const copy = messages.inventory.po;
const ORDER_OVERLAY_KEYS = [
  "poId",
  "demandId",
  "mode",
  "ingredientId",
  "ordersQ",
  "ordersStatus",
  "ordersSite",
  "ordersPage",
] as const;

type ReasonAction = {
  kind: "cancel" | "close";
  row: PurchaseOrderRow;
};

export function PurchaseOrdersClient({
  rows,
  branches,
  createBranches,
  suppliers,
  ingredients,
  canManage,
  canReceive,
  canCreate,
}: {
  rows: PurchaseOrderRow[];
  branches: Array<{ id: number; name: string }>;
  createBranches: Array<{ id: number; name: string }>;
  suppliers: PurchaseOrderSupplier[];
  ingredients: PurchaseRequestIngredientOption[];
  canManage: boolean;
  canReceive: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const overlay = useDocumentOverlayUrl(ORDER_OVERLAY_KEYS);
  const [search, setSearch] = useState(() => overlay.get("ordersQ") ?? "");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction>();
  const [isPending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState(() =>
    String(createBranches[0]?.id ?? ""),
  );
  const [neededBy, setNeededBy] = useState(() => getVNDateString());
  const [draftLines, setDraftLines] = useState<RequestDraftLine[]>(() => [
    blankRequestLine(),
  ]);
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());

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
  const createOpen = canCreate && mode === "create";
  const deferredSearch = useDeferredValue(search);
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
            deferredSearch,
          ),
      ),
    [rows, deferredSearch, siteFilter, statusFilter],
  );

  const updateUrl = useCallback(
    (
      poId: number | null,
      nextMode: "view" | "create" | null,
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
    const rawIngId = overlay.get("ingredientId");
    if (!rawIngId || !createOpen) return;
    const ingId = Number(rawIngId);
    if (!Number.isInteger(ingId) || ingId <= 0) return;
    const ingredient = ingredients.find((item) => item.id === ingId);
    if (!ingredient) return;
    const defaultSupplier = pickDefaultPurchaseDemandSupplier(ingId, suppliers);
    const suggested =
      ingredient.suggestedOrderQty > 0
        ? String(ingredient.suggestedOrderQty)
        : "";
    setDraftLines([
      {
        ...blankRequestLine(),
        ingredientId: String(ingId),
        supplierId: defaultSupplier != null ? String(defaultSupplier.id) : "",
        entryUnitId: String(defaultPurchaseRequestUnit(ingredient)?.id ?? ""),
        quantity: suggested,
      },
    ]);
  }, [createOpen, ingredients, overlay, suppliers]);

  function resetCreate() {
    setBranchId(String(createBranches[0]?.id ?? ""));
    setNeededBy(getVNDateString());
    setDraftLines([blankRequestLine()]);
    setCreateKey(crypto.randomUUID());
  }

  function patchDraftLine(key: string, patch: Partial<RequestDraftLine>) {
    setDraftLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function chooseIngredient(line: RequestDraftLine, value: string) {
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultSupplier = pickDefaultPurchaseDemandSupplier(
      Number(value),
      suppliers,
    );
    const shouldPrefill =
      line.quantity.trim() === "" || Number(line.quantity) <= 0;
    const suggested =
      ingredient != null && ingredient.suggestedOrderQty > 0
        ? String(ingredient.suggestedOrderQty)
        : line.quantity;
    patchDraftLine(line.key, {
      ingredientId: value,
      supplierId: defaultSupplier != null ? String(defaultSupplier.id) : "",
      entryUnitId: String(defaultPurchaseRequestUnit(ingredient)?.id ?? ""),
      ...(shouldPrefill ? { quantity: suggested } : {}),
    });
  }

  function saveOrder(submit: boolean) {
    const parsedLines = draftLines.map((line) => ({
      ingredientId: Number(line.ingredientId),
      quantity: Number(line.quantity),
      entryUnitId: Number(line.entryUnitId),
      supplierId: Number(line.supplierId),
    }));
    const unmapped = parsedLines.filter(
      (line) => line.ingredientId > 0 && !(line.supplierId > 0),
    );
    if (
      !Number(branchId) ||
      parsedLines.some(
        (line) =>
          !line.ingredientId ||
          !line.entryUnitId ||
          !line.supplierId ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0,
      )
    ) {
      toast.error(copy.emptyInitialTitle);
      return;
    }
    if (submit && unmapped.length > 0) {
      toast.error(copy.unmappedSendBlocked);
      return;
    }
    const uniqueSuppliers = [
      ...new Set(parsedLines.map((line) => line.supplierId)),
    ];
    startTransition(async () => {
      const result = await createPurchaseOrder({
        supplierId:
          uniqueSuppliers.length === 1 ? (uniqueSuppliers[0] ?? null) : null,
        branchId: Number(branchId),
        neededBy: neededBy || null,
        lines: parsedLines,
        submit,
        idempotencyKey: createKey,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Không thể lưu đơn mua.");
        return;
      }
      toast.success(
        submit ? copy.sentToast(result.data.code) : copy.createdToast,
      );
      resetCreate();
      updateUrl(result.data.id, "view", "replace");
      router.refresh();
    });
  }

  useEffect(() => {
    setSearch(overlay.get("ordersQ") ?? "");
  }, [overlay.get, overlay.values]);

  useEffect(() => {
    if (mode !== "view" || selectedPoId == null || selectedRow != null) return;
    toast.error("Không tìm thấy đơn mua.");
    updateUrl(null, null, "replace");
  }, [mode, selectedPoId, selectedRow, updateUrl]);

  function purchaseOrderReturnTo(poId: number) {
    return encodeURIComponent(
      `/inventory/purchase-orders?tab=orders&poId=${poId}&mode=view`,
    );
  }

  function openReceipt(row: PurchaseOrderRow) {
    const returnTo = purchaseOrderReturnTo(row.id);
    if (row.activeDraftGrnId != null) {
      router.push(
        `/inventory/grn?grnId=${row.activeDraftGrnId}&mode=view&returnTo=${returnTo}`,
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
          `/inventory/grn?grnId=${result.data.id}&mode=view&returnTo=${returnTo}`,
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
    if ((canManage || canReceive) && row.status === "partially_received") {
      actions.push({
        key: "close",
        label: copy.closeRemainingAction,
        onSelect: () => setReasonAction({ kind: "close", row }),
      });
    }
    return actions;
  }

  function documentOverflowActions(row: PurchaseOrderRow): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (
      canManage &&
      row.status === "approved" &&
      !row.linkedGrns.some((grn) => grn.status === "confirmed")
    ) {
      actions.push({
        key: "cancel",
        label: copy.cancelAction,
        destructive: true,
        onSelect: () => setReasonAction({ kind: "cancel", row }),
      });
    }
    if ((canManage || canReceive) && row.status === "partially_received") {
      actions.push({
        key: "close-remaining",
        label: copy.closeRemainingAction,
        onSelect: () => setReasonAction({ kind: "close", row }),
      });
    }
    return actions;
  }

  const documentOverflow = selectedRow
    ? documentOverflowActions(selectedRow)
    : [];

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "code",
      header: copy.codeColumn,
      sortable: true,
      sortValue: (row) => row.code,
      render: (row) => (
        <span className="font-mono font-medium">{row.code}</span>
      ),
    },
    {
      key: "supplier",
      header: copy.supplierRequired,
      sortable: true,
      sortValue: (row) => row.supplierName ?? "",
      render: (row) =>
        row.supplierIds.length > 1 ? (
          <Badge variant="secondary">{copy.multiSupplierBadge}</Badge>
        ) : (
          row.supplierName
        ),
    },
    {
      key: "branch",
      header: copy.warehouse,
      sortable: true,
      sortValue: (row) => row.branchName ?? "",
      render: (row) => row.branchName,
    },
    {
      key: "status",
      header: copy.statusColumn,
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => (
        <StatusBadge domain="purchase-order" value={row.status} />
      ),
    },
    {
      key: "needed",
      header: copy.expectedDeliveryDate,
      sortable: true,
      sortValue: (row) => row.expectedDeliveryDate ?? "",
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

  const poTotalCount = rows.length;
  const poOpenCount = rows.filter(
    (r) =>
      r.status === "draft" || r.status === "sent" || r.status === "approved",
  ).length;
  const poPartialCount = rows.filter(
    (r) => r.status === "partially_received",
  ).length;
  const poCompletedCount = rows.filter((r) => r.status === "completed").length;

  const list = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item
          variant="outline"
          onClick={() =>
            overlay.patchOverlay(
              { ordersStatus: null, ordersPage: null },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "all"
              ? "border-primary ring-1 ring-primary shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.total}</span>
            <span className="size-2 rounded-full bg-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatCount(poTotalCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.ordersUnit}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            overlay.patchOverlay(
              {
                ordersStatus:
                  statusFilter === "sent" ||
                  statusFilter === "approved" ||
                  statusFilter === "draft"
                    ? null
                    : "sent",
                ordersPage: null,
              },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "sent" ||
              statusFilter === "approved" ||
              statusFilter === "draft"
              ? "border-warning ring-1 ring-warning shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.open}</span>
            <span className="size-2 rounded-full bg-warning" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-warning">
              {formatCount(poOpenCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.openHint}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            overlay.patchOverlay(
              {
                ordersStatus:
                  statusFilter === "partially_received"
                    ? null
                    : "partially_received",
                ordersPage: null,
              },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "partially_received"
              ? "border-primary ring-1 ring-primary shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.partiallyReceived}</span>
            <span className="size-2 rounded-full bg-primary" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-primary">
              {formatCount(poPartialCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.partiallyReceivedHint}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            overlay.patchOverlay(
              {
                ordersStatus:
                  statusFilter === "completed" ? null : "completed",
                ordersPage: null,
              },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "completed"
              ? "border-success ring-1 ring-success shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.completed}</span>
            <span className="size-2 rounded-full bg-success" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-success">
              {formatCount(poCompletedCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.completedHint}
            </span>
          </div>
        </Item>
      </div>

      <AppListFrame
        toolbar={
          <AppToolbar
          variant="inline"
          search={
            <InputGroup
              size={controlSize}
              className="min-w-0 flex-1 sm:min-w-72"
            >
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
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
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
                  size={controlSize}
                  className={cn("w-full sm:w-44", branches.length <= 1 && "col-span-2")}
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
                    size={controlSize}
                    className="w-full sm:w-44"
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
            </div>
          }
          actions={
            canCreate ? (
              <Button
                type="button"
                size={controlSize}
                onClick={() => updateUrl(null, "create")}
              >
                <IconPlus data-icon="inline-start" />
                {copy.createAction}
              </Button>
            ) : null
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
    </div>
  );

  return (
    <>
      {list}
      <PurchaseOrderFormDialog
        open={createOpen}
        branchId={branchId}
        neededBy={neededBy}
        lines={draftLines}
        suppliers={suppliers}
        branches={createBranches}
        ingredients={ingredients}
        isPending={isPending}
        onOpenChange={(open) => {
          if (!open) {
            resetCreate();
            updateUrl(null, null, "replace");
          }
        }}
        onBranchIdChange={setBranchId}
        onNeededByChange={setNeededBy}
        onChooseIngredient={chooseIngredient}
        onPatchLine={patchDraftLine}
        onRemoveLine={(key) =>
          setDraftLines((current) =>
            current.length === 1
              ? current
              : current.filter((line) => line.key !== key),
          )
        }
        onAddLine={() => setDraftLines((current) => [...current, blankRequestLine()])}
        onClose={() => {
          resetCreate();
          updateUrl(null, null, "replace");
        }}
        onSaveDraft={() => saveOrder(false)}
        onSend={() => saveOrder(true)}
      />
      <AppDialog
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) updateUrl(null, null, "replace");
        }}
        variant="document"
        title={
          selectedRow ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{selectedRow.code}</span>
              <StatusBadge
                domain="purchase-order"
                value={selectedRow.status}
              />
            </div>
          ) : (
            copy.pageTitle
          )
        }
        description={
          selectedRow ? (
            <span>
              {selectedRow.supplierName}
              <span className="text-muted-foreground">
                {" "}
                · {selectedRow.branchName}
              </span>
            </span>
          ) : undefined
        }
        footer={
          viewOpen && selectedRow ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => updateUrl(null, null, "replace")}
              >
                {ACTIONS_VI.close}
              </Button>
              {documentOverflow.length > 0 ? (
                <RowActionsMenu items={documentOverflow} />
              ) : null}
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
          ) : null
        }
      >
        {viewOpen && selectedRow ? (
          <PurchaseOrderDocumentBody
            row={selectedRow}
            returnTo={purchaseOrderReturnTo(selectedRow.id)}
          />
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
        description={
          reasonAction?.kind === "close"
            ? `${reasonAction.row.code}. ${copy.closeRemainingDescription}`
            : reasonAction?.row.code
        }
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

function PurchaseOrderDocumentBody({
  row,
  returnTo,
}: {
  row: PurchaseOrderRow;
  returnTo: string;
}) {
  const openLineCount = row.lines.filter(
    (line) => line.receivedQuantity < line.quantity,
  ).length;
  const doneLineCount = row.lines.length - openLineCount;

  return (
    <div className="flex flex-col gap-6">
      <Item
        variant="outline"
        className="grid grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-4"
      >
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {copy.detail.kpiLines}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {row.lines.length}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {copy.detail.kpiOpenLines}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {openLineCount}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {copy.detail.kpiDoneLines}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {doneLineCount}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {copy.detail.kpiExpected}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {row.expectedDeliveryDate
              ? formatVNDate(row.expectedDeliveryDate)
              : "—"}
          </span>
        </div>
      </Item>

      {row.statusReason ? (
        <Item variant="muted" size="sm">
          {row.statusReason}
        </Item>
      ) : null}

      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">
            {copy.detail.overviewLinesTitle}
          </TabsTrigger>
          <TabsTrigger value="receipts">
            {copy.detail.linkedGrnsTitle}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lines">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              {copy.detail.sectionLineCount(row.lines.length)}
            </span>
            {row.lines.length === 0 ? (
              <Item
                variant="outline"
                className="p-4 text-center text-xs text-muted-foreground"
              >
                {copy.emptyLinesDescription}
              </Item>
            ) : (
              <ScrollArea className="h-80">
                <div className="flex flex-col gap-2 pr-2">
                  {row.lines.map((line) => {
                    const remaining = Math.max(
                      line.quantity - line.receivedQuantity,
                      0,
                    );
                    return (
                      <Item
                        key={line.id}
                        variant="outline"
                        className="flex flex-col gap-3 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {line.ingredientName}
                          </p>
                          <p className="text-muted-foreground">
                            {line.supplierName} · {line.unitLabel}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 sm:min-w-56">
                          <div className="min-w-0">
                            <span className="block text-muted-foreground">
                              {copy.detail.orderedShort}
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                              {line.quantity}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-muted-foreground">
                              {copy.detail.receivedShort}
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                              {line.receivedQuantity}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-muted-foreground">
                              {copy.detail.remainingShort}
                            </span>
                            <span
                              className={
                                remaining > 0
                                  ? "font-mono text-sm font-semibold tabular-nums text-destructive"
                                  : "font-mono text-sm font-semibold tabular-nums text-foreground"
                              }
                            >
                              {remaining}
                            </span>
                          </div>
                        </div>
                      </Item>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>
        <TabsContent value="receipts">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              {copy.detail.sectionReceiptCount(row.linkedGrns.length)}
            </span>
            {row.linkedGrns.length === 0 ? (
              <Item
                variant="outline"
                className="p-4 text-center text-xs text-muted-foreground"
              >
                {copy.emptyLinkedGrnsHint}
              </Item>
            ) : (
              <ScrollArea className="h-60">
                <div className="flex flex-col gap-2 pr-2">
                  {row.linkedGrns.map((grn) => (
                    <Item
                      key={grn.id}
                      variant="outline"
                      className="flex items-center justify-between gap-3 p-3 text-xs"
                      render={
                        <Link
                          href={`/inventory/grn?grnId=${grn.id}&mode=view&returnTo=${returnTo}`}
                        />
                      }
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-foreground">
                          {grn.code}
                        </p>
                        <p className="text-muted-foreground">
                          {grn.receivedAt ? formatVNDate(grn.receivedAt) : "—"}
                        </p>
                      </div>
                      <StatusBadge
                        domain="inventory"
                        value={grn.status}
                        label={
                          grn.status === "draft"
                            ? copy.detail.grnDraft
                            : copy.detail.grnConfirmed
                        }
                      />
                    </Item>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
