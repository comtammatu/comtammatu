"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  formatVNDate,
  formatVNDateTime,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Combobox } from "@comtammatu/ui/components/combobox";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Item, ItemHeader, ItemTitle } from "@comtammatu/ui/components/item";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppDialog,
  BusinessDatePicker,
  FormattedNumberInput,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  cancelPurchaseRequest,
  closePurchaseRequest,
  reviewPurchaseDemand,
  savePurchaseDemand,
  savePurchaseDemandAllocations,
} from "../purchase-order-actions";
import {
  buildAutomaticPurchaseDemandAllocations,
  buildPurchaseOrderDrafts,
  findUnassignedPurchaseRequestItemIds,
  type PurchaseDemandAllocation,
  type PurchaseOrderDraft,
  type PurchaseOrderDraftLine,
  type PurchaseOrderSupplier,
} from "./purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;
const comboFilter = (
  option: { label: string; keywords?: string[] },
  query: string,
) => matchesSearch([option.label, ...(option.keywords ?? [])], query);

export type PurchaseRequestItemRow = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  orderedQuantity: number;
  remainingQuantity: number;
  entryUnitId: number;
  unitLabel: string;
  notes: string | null;
};

export type PurchaseRequestRow = {
  id: number;
  code: string;
  branchId: number;
  branchName: string;
  status: string;
  statusReason: string | null;
  neededBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  orderedLineCount: number;
  items: PurchaseRequestItemRow[];
  allocations: Array<{
    requestItemId: number;
    supplierId: number;
    quantity: number;
  }>;
  purchaseOrders: Array<{
    id: number;
    code: string;
    status: string;
    supplierName: string;
  }>;
};

export type PurchaseRequestIngredientOption = {
  id: number;
  name: string;
  units: Array<{ id: number; label: string; factor: number }>;
};

type RequestDraftLine = {
  key: string;
  ingredientId: string;
  quantity: string;
  entryUnitId: string;
};

type ReasonAction = {
  kind: "cancel" | "close" | "request_changes" | "reject";
  row: PurchaseRequestRow;
};

function statusVariant(status: string) {
  if (status === "ordered") return "success" as const;
  if (
    status === "pending_allocation" ||
    status === "partially_ordered" ||
    status === "changes_requested"
  ) {
    return "warning" as const;
  }
  if (status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

function defaultUnit(ingredient?: PurchaseRequestIngredientOption) {
  return ingredient?.units.reduce<
    PurchaseRequestIngredientOption["units"][number] | undefined
  >(
    (selected, unit) =>
      selected == null || unit.factor > selected.factor ? unit : selected,
    undefined,
  );
}

function blankRequestLine(): RequestDraftLine {
  return {
    key: crypto.randomUUID(),
    ingredientId: "",
    quantity: "",
    entryUnitId: "",
  };
}

export function PurchaseRequestsClient({
  rows,
  branches,
  ingredients,
  suppliers,
  mappedIngredientIds,
  canCreateRequest,
  canAllocate,
  embedded = false,
}: {
  rows: PurchaseRequestRow[];
  branches: Array<{ id: number; name: string }>;
  ingredients: PurchaseRequestIngredientOption[];
  suppliers: PurchaseOrderSupplier[];
  mappedIngredientIds: number[];
  canCreateRequest: boolean;
  canAllocate: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(
    () => searchParams.get("needsQ") ?? "",
  );
  const [branchId, setBranchId] = useState(String(branches[0]?.id ?? ""));
  const [neededBy, setNeededBy] = useState(() => getVNDateString());
  const [requestLines, setRequestLines] = useState<RequestDraftLine[]>([
    blankRequestLine(),
  ]);
  const [allocationDrafts, setAllocationDrafts] = useState<
    PurchaseOrderDraft[]
  >([]);
  const [requestIdempotencyKey, setRequestIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [allocationIdempotencyKey, setAllocationIdempotencyKey] = useState(
    () => crypto.randomUUID(),
  );
  const [requestBaseline, setRequestBaseline] = useState("");
  const [allocationBaseline, setAllocationBaseline] = useState("");
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction>();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const mode = searchParams.get("mode");
  const statusFilter = searchParams.get("needsStatus") ?? "all";
  const siteFilter = searchParams.get("needsSite") ?? "all";
  const currentPage = Math.max(
    Number(searchParams.get("needsPage")) || 1,
    1,
  );
  const demandId = Number(searchParams.get("demandId"));
  const selectedId =
    Number.isInteger(demandId) && demandId > 0 ? demandId : null;
  const selected =
    selectedId == null
      ? null
      : (rows.find((row) => row.id === selectedId) ?? null);
  const editingPendingDemand =
    mode === "edit" && selected?.status === "pending_allocation";
  const createOpen =
    mode === "create" || (mode === "edit" && selected != null);
  const allocateOpen = mode === "allocate" && selected != null;
  const recordMode =
    mode === "view" || mode === "edit" || mode === "allocate";
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (statusFilter === "all" || row.status === statusFilter) &&
          (siteFilter === "all" || row.branchId === Number(siteFilter)) &&
          matchesSearch(
            [
              row.code,
              row.branchName,
              copy.statusLabel(row.status),
              ...row.items.map((item) => item.ingredientName),
            ],
            search,
          ),
      ),
    [rows, search, siteFilter, statusFilter],
  );

  const requestSnapshot = useCallback(
    (
      nextBranchId = branchId,
      nextNeededBy = neededBy,
      nextLines = requestLines,
    ) => JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
    [branchId, neededBy, requestLines],
  );
  const allocationSnapshot = useCallback(
    (drafts = allocationDrafts) => JSON.stringify(drafts),
    [allocationDrafts],
  );
  const updateUrl = useCallback(
    (
      nextDemandId: number | null,
      nextMode: "view" | "edit" | "create" | "allocate" | null,
      method: "push" | "replace" = "push",
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "needs");
      params.delete("poId");
      if (nextDemandId == null) params.delete("demandId");
      else params.set("demandId", String(nextDemandId));
      if (nextMode == null) params.delete("mode");
      else params.set("mode", nextMode);
      router[method](`${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setSearch(searchParams.get("needsQ") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!recordMode || selectedId == null || selected != null) return;
    toast.error(copy.notFound);
    updateUrl(null, null, "replace");
  }, [recordMode, selected, selectedId, updateUrl]);

  useEffect(() => {
    if (mode !== "edit" || !selected) return;
    const nextBranchId = String(selected.branchId);
    const nextNeededBy = selected.neededBy ?? getVNDateString();
    const nextLines = selected.items.map((item) => ({
      key: String(item.id),
      ingredientId: String(item.ingredientId),
      quantity: String(item.quantity),
      entryUnitId: String(item.entryUnitId),
    }));
    setBranchId(nextBranchId);
    setNeededBy(nextNeededBy);
    setRequestLines(nextLines);
    setRequestBaseline(
      JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
    );
  }, [mode, selected]);

  useEffect(() => {
    if (mode !== "allocate" || !selected) return;
    const drafts = buildPurchaseOrderDrafts(
      selected.items,
      suppliers,
      selected.allocations,
    );
    setAllocationDrafts(drafts);
    setAllocationBaseline(JSON.stringify(drafts));
    setAllocationIdempotencyKey(crypto.randomUUID());
  }, [mode, selected, suppliers]);

  function resetCreate() {
    setBranchId(String(branches[0]?.id ?? ""));
    setNeededBy(getVNDateString());
    setRequestLines([blankRequestLine()]);
    setRequestBaseline("");
  }

  async function closeRequestForm() {
    if (
      requestBaseline &&
      requestSnapshot() !== requestBaseline &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    updateUrl(null, null, "replace");
    resetCreate();
  }

  async function closeAllocation() {
    if (
      allocationBaseline &&
      allocationSnapshot() !== allocationBaseline &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    updateUrl(selected?.id ?? null, selected ? "view" : null, "replace");
  }

  function patchRequestLine(key: string, patch: Partial<RequestDraftLine>) {
    setRequestLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function chooseIngredient(line: RequestDraftLine, value: string) {
    const ingredient = ingredients.find((item) => item.id === Number(value));
    patchRequestLine(line.key, {
      ingredientId: value,
      entryUnitId: String(defaultUnit(ingredient)?.id ?? ""),
    });
  }

  function saveRequest(submit: boolean) {
    const lines = requestLines.map((line) => ({
      ingredientId: Number(line.ingredientId),
      quantity: Number(line.quantity),
      entryUnitId: Number(line.entryUnitId),
    }));
    if (
      !Number(branchId) ||
      lines.some(
        (line) =>
          !line.ingredientId ||
          !line.entryUnitId ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0,
      )
    ) {
      toast.error(copy.createFailed);
      return;
    }
    startTransition(async () => {
      const result = await savePurchaseDemand({
        demandId: mode === "edit" ? selected?.id : null,
        branchId: Number(branchId),
        neededBy: neededBy || null,
        lines,
        submit,
        idempotencyKey:
          mode === "create" ? requestIdempotencyKey : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? copy.createFailed);
        return;
      }
      toast.success(submit ? copy.submitSuccess : copy.createSuccess);
      setRequestIdempotencyKey(crypto.randomUUID());
      resetCreate();
      updateUrl(result.data.id, "view", "replace");
      router.refresh();
    });
  }

  function openAllocation(row: PurchaseRequestRow) {
    const drafts = buildPurchaseOrderDrafts(
      row.items,
      suppliers,
      row.allocations,
    );
    setAllocationDrafts(drafts);
    setAllocationBaseline(JSON.stringify(drafts));
    setAllocationIdempotencyKey(crypto.randomUUID());
    updateUrl(row.id, "allocate", mode === "view" ? "replace" : "push");
  }

  function patchAllocation(
    supplierId: number,
    key: string,
    patch: Partial<PurchaseOrderDraftLine>,
  ) {
    setAllocationDrafts((current) =>
      current.map((draft) =>
        draft.supplierId === supplierId
          ? {
              ...draft,
              lines: draft.lines.map((line) =>
                line.key === key ? { ...line, ...patch } : line,
              ),
            }
          : draft,
      ),
    );
  }

  function normalizedAllocations() {
    return allocationDrafts.flatMap((draft) =>
      draft.lines.flatMap((line) => {
        const quantity = Number(line.quantity);
        return line.quantity.trim() !== "" &&
          Number.isFinite(quantity) &&
          quantity > 0
          ? [
              {
                requestItemId: line.requestItemId,
                supplierId: draft.supplierId,
                quantity,
              },
            ]
          : [];
      }),
    );
  }

  function allocationTotals() {
    const totals = new Map<number, number>();
    for (const allocation of normalizedAllocations()) {
      totals.set(
        allocation.requestItemId,
        (totals.get(allocation.requestItemId) ?? 0) + allocation.quantity,
      );
    }
    return totals;
  }

  function approveDemand(
    row: PurchaseRequestRow,
    allocations: PurchaseDemandAllocation[],
    idempotencyKey: string,
  ) {
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await reviewPurchaseDemand({
          demandId: row.id,
          action: "approve",
          allocations,
          idempotencyKey,
        });
        if (!result.success) {
          toast.error(result.error ?? copy.allocationFailed);
          return;
        }
        const purchaseOrders = result.data?.purchaseOrders ?? [];
        toast.success(copy.approveSuccess(purchaseOrders.map((po) => po.code)));
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "orders");
        params.delete("demandId");
        if (purchaseOrders[0]) params.set("poId", String(purchaseOrders[0].id));
        else params.delete("poId");
        params.set("mode", "view");
        router.replace(`${pathname}?${params}`, { scroll: false });
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleSupplierDecision(row: PurchaseRequestRow) {
    const allocations = buildAutomaticPurchaseDemandAllocations(
      row.items,
      suppliers,
    );
    if (allocations == null) {
      openAllocation(row);
      return;
    }
    approveDemand(row, allocations, crypto.randomUUID());
  }

  function saveAllocations(approve: boolean) {
    if (!selected) return;
    const allocations = normalizedAllocations();
    const totals = allocationTotals();
    const invalid =
      allocations.some((allocation) => allocation.quantity <= 0) ||
      selected.items.some((item) => {
        const allocated = totals.get(item.id) ?? 0;
        return approve
          ? Math.abs(allocated - item.remainingQuantity) > 0.0005
          : allocated - item.remainingQuantity > 0.0005;
      });
    if (invalid || (approve && allocations.length === 0)) {
      toast.error(copy.allocationInvalid);
      return;
    }

    if (approve) {
      approveDemand(selected, allocations, allocationIdempotencyKey);
      return;
    }

    startTransition(async () => {
      const result = await savePurchaseDemandAllocations({
        demandId: selected.id,
        allocations,
        idempotencyKey: allocationIdempotencyKey,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.allocationFailed);
        return;
      }
      toast.success(copy.allocationSaved);
      setAllocationBaseline(allocationSnapshot());
      setAllocationIdempotencyKey(crypto.randomUUID());
      router.refresh();
    });
  }

  function runReasonAction() {
    if (!reasonAction) return;
    setPendingId(reasonAction.row.id);
    startTransition(async () => {
      try {
        const result =
          reasonAction.kind === "cancel"
            ? await cancelPurchaseRequest({
                requestId: reasonAction.row.id,
                reason,
              })
            : reasonAction.kind === "close"
              ? await closePurchaseRequest({
                  requestId: reasonAction.row.id,
                  reason,
                })
              : await reviewPurchaseDemand({
                  demandId: reasonAction.row.id,
                  action: reasonAction.kind,
                  reason,
                });
        if (!result.success) {
          toast.error(result.error ?? copy.loadFailed);
          return;
        }
        setReasonAction(undefined);
        setReason("");
        updateUrl(null, null, "replace");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function rowActions(row: PurchaseRequestRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.view,
        onSelect: () => updateUrl(row.id, "view"),
      },
    ];
    if (
      canCreateRequest &&
      (row.status === "draft" ||
        row.status === "changes_requested" ||
        row.status === "pending_allocation")
    ) {
      actions.push({
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil data-icon="inline-start" />,
        onSelect: () => updateUrl(row.id, "edit"),
      });
    }
    if (
      canCreateRequest &&
      (row.status === "draft" || row.status === "changes_requested")
    ) {
      actions.push({
        key: "cancel",
        label: "Bỏ phiếu",
        icon: <IconTrash data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => setReasonAction({ kind: "cancel", row }),
      });
    }
    if (
      canAllocate &&
      (row.status === "submitted" ||
        row.status === "pending_allocation" ||
        row.status === "partially_ordered")
    ) {
      actions.push({
        key: "allocate",
        label:
          buildAutomaticPurchaseDemandAllocations(row.items, suppliers) == null
            ? copy.allocateAction
            : copy.approveAllocationAction,
        disabled: isPending || pendingId === row.id,
        onSelect: () => handleSupplierDecision(row),
      });
    }
    if (row.status === "partially_ordered" && canAllocate) {
      actions.push({
        key: "close",
        label: "Đóng phần còn lại",
        onSelect: () => setReasonAction({ kind: "close", row }),
      });
    }
    return actions;
  }

  const columns: DataTableColumn<PurchaseRequestRow>[] = [
    {
      key: "code",
      header: copy.codeColumn,
      render: (row) => (
        <span className="font-mono font-medium">{row.code}</span>
      ),
    },
    { key: "branch", header: copy.branchColumn, render: (row) => row.branchName },
    {
      key: "status",
      header: copy.statusColumn,
      render: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {copy.statusLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "needed",
      header: copy.neededByColumn,
      render: (row) => (row.neededBy ? formatVNDate(row.neededBy) : "—"),
    },
    {
      key: "progress",
      header: copy.progressColumn,
      render: (row) =>
        copy.orderedProgress(row.orderedLineCount, row.lineCount),
    },
    {
      key: "updated",
      header: copy.updatedColumn,
      render: (row) => formatVNDateTime(row.updatedAt),
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

  const toolbar = (
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
              const params = new URLSearchParams(searchParams.toString());
              if (value) params.set("needsQ", value);
              else params.delete("needsQ");
              params.delete("needsPage");
              router.replace(`${pathname}?${params}`, { scroll: false });
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
              const params = new URLSearchParams(searchParams.toString());
              if (value === "all") params.delete("needsStatus");
              else params.set("needsStatus", value);
              params.delete("needsPage");
              router.replace(`${pathname}?${params}`, { scroll: false });
            }}
          >
            <SelectTrigger size="field" aria-label={copy.statusFilterAria}>
              <SelectValue placeholder={copy.statusFilterPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allStatuses}</SelectItem>
              {[...new Set(rows.map((row) => row.status))].map((status) => (
                <SelectItem key={status} value={status}>
                  {copy.statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {branches.length > 1 ? (
            <Select
              value={siteFilter}
              onValueChange={(value) => {
                const params = new URLSearchParams(searchParams.toString());
                if (value === "all") params.delete("needsSite");
                else params.set("needsSite", value);
                params.delete("needsPage");
                router.replace(`${pathname}?${params}`, { scroll: false });
              }}
            >
              <SelectTrigger size="field" aria-label={copy.warehouseFilterAria}>
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
      actions={
        canCreateRequest ? (
          <Button
            type="button"
            onClick={() => {
              const nextBranchId = String(branches[0]?.id ?? "");
              const nextNeededBy = getVNDateString();
              const nextLines = [blankRequestLine()];
              setBranchId(nextBranchId);
              setNeededBy(nextNeededBy);
              setRequestLines(nextLines);
              setRequestBaseline(
                JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
              );
              updateUrl(null, "create");
            }}
          >
            <IconPlus data-icon="inline-start" />
            {copy.createAction}
          </Button>
        ) : null
      }
    />
  );

  const list = (
    <AppListFrame toolbar={toolbar}>
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        pageSize={50}
        currentPage={currentPage}
        onPageChange={(page) => {
          const params = new URLSearchParams(searchParams.toString());
          if (page <= 1) params.delete("needsPage");
          else params.set("needsPage", String(page));
          router.replace(`${pathname}?${params}`, { scroll: false });
        }}
        onRowClick={(row) => updateUrl(row.id, "view")}
        emptyTitle={copy.emptyTitle}
        emptyDescription={copy.emptyDescription}
        emptyIcon={
          <IconClipboardList className="size-8 text-muted-foreground" />
        }
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
              <Badge variant={statusVariant(row.status)}>
                {copy.statusLabel(row.status)}
              </Badge>
            </span>
            <span className="text-sm">{row.branchName}</span>
            <span className="text-xs text-muted-foreground">
              {copy.lineCount(row.lineCount)} ·{" "}
              {copy.orderedProgress(row.orderedLineCount, row.lineCount)}
            </span>
          </InteractiveCard>
        )}
      />
    </AppListFrame>
  );

  const content = embedded ? (
    list
  ) : (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title={copy.title} description={copy.description} />
      {list}
    </AppPage>
  );

  const totals = allocationTotals();
  const missingSupplierItems =
    selected == null
      ? []
      : selected.items.filter((item) =>
          findUnassignedPurchaseRequestItemIds([item], suppliers).includes(
            item.id,
          ),
        );
  const allocationComplete =
    selected != null &&
    missingSupplierItems.length === 0 &&
    selected.items.every(
      (item) =>
        Math.abs((totals.get(item.id) ?? 0) - item.remainingQuantity) <=
        0.0005,
    );
  const canReviewSelected =
    canAllocate &&
    selected != null &&
    (selected.status === "submitted" ||
      selected.status === "pending_allocation");

  return (
    <>
      {content}

      <AppDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) void closeRequestForm();
        }}
        variant="document"
        title={mode === "edit" && selected ? selected.code : copy.createTitle}
        description={
          mode === "edit" && selected
            ? copy.statusLabel(selected.status)
            : copy.description
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void closeRequestForm()}
            >
              {ACTIONS_VI.cancel}
            </Button>
            {editingPendingDemand ? (
              <Button
                type="button"
                disabled={isPending}
                onClick={() => saveRequest(true)}
              >
                {ACTIONS_VI.saveChanges}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => saveRequest(false)}
                >
                  {copy.saveDraft}
                </Button>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => saveRequest(true)}
                >
                  {copy.submitAction}
                </Button>
              </>
            )}
          </>
        }
      >
        {selected?.status === "changes_requested" &&
        selected.statusReason ? (
          <Item variant="muted" size="sm">
            <span className="font-medium">{copy.returnedReasonLabel}</span>{" "}
            {selected.statusReason}
          </Item>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger
              size="field"
              className="w-full"
              aria-label={copy.branchRequired}
            >
              <SelectValue placeholder={copy.branchRequired} />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BusinessDatePicker
            value={neededBy}
            onValueChange={setNeededBy}
            aria-label={copy.neededBy}
          />
        </div>
        <div className="flex flex-col gap-2">
          {requestLines.map((line) => {
            const ingredient = ingredients.find(
              (item) => item.id === Number(line.ingredientId),
            );
            const hasSupplier = mappedIngredientIds.includes(
              Number(line.ingredientId),
            );
            return (
              <Item
                key={line.key}
                variant="outline"
                size="sm"
                className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_10rem_auto]"
              >
                <div className="min-w-0">
                  <Combobox
                    filter={comboFilter}
                    size="field"
                    value={line.ingredientId}
                    onValueChange={(value) => chooseIngredient(line, value)}
                    options={ingredients.map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    }))}
                    placeholder={copy.ingredient}
                    searchPlaceholder={copy.searchPlaceholder}
                  />
                  {line.ingredientId && !hasSupplier ? (
                    <span className="mt-1 block text-xs text-warning-foreground">
                      {copy.missingSupplierShort}
                    </span>
                  ) : null}
                </div>
                <FormattedNumberInput
                  controlSize="field"
                  value={line.quantity}
                  onValueChange={(value) =>
                    patchRequestLine(line.key, { quantity: value })
                  }
                  maxFractionDigits={3}
                  placeholder={copy.quantity}
                  aria-label={copy.quantity}
                />
                <Select
                  value={line.entryUnitId}
                  onValueChange={(value) =>
                    patchRequestLine(line.key, { entryUnitId: value })
                  }
                >
                  <SelectTrigger
                    size="field"
                    className="w-full"
                    aria-label={copy.unit}
                  >
                    <SelectValue placeholder={copy.unit} />
                  </SelectTrigger>
                  <SelectContent>
                    {(ingredient?.units ?? []).map((unit) => (
                      <SelectItem key={unit.id} value={String(unit.id)}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  disabled={requestLines.length === 1}
                  onClick={() =>
                    setRequestLines((current) =>
                      current.filter((item) => item.key !== line.key),
                    )
                  }
                  aria-label={ACTIONS_VI.delete}
                >
                  <IconTrash />
                </Button>
              </Item>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setRequestLines((current) => [...current, blankRequestLine()])
            }
          >
            <IconPlus data-icon="inline-start" />
            {copy.addLine}
          </Button>
        </div>
      </AppDialog>

      <AppDialog
        open={selected != null && mode === "view"}
        onOpenChange={(open) => {
          if (!open) updateUrl(null, null, "replace");
        }}
        variant="document"
        title={selected?.code ?? copy.title}
        description={selected?.branchName}
        footer={
          selected ? (
            <>
              {canReviewSelected ? (
                <div className="mr-auto flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      setReasonAction({
                        kind: "request_changes",
                        row: selected,
                      })
                    }
                  >
                    {copy.requestChangesAction}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() =>
                      setReasonAction({ kind: "reject", row: selected })
                    }
                  >
                    {copy.rejectAction}
                  </Button>
                </div>
              ) : null}
              {canCreateRequest &&
              (selected.status === "draft" ||
                selected.status === "changes_requested" ||
                selected.status === "pending_allocation") ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateUrl(selected.id, "edit", "replace")}
                >
                  {ACTIONS_VI.edit}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => updateUrl(null, null, "replace")}
              >
                {ACTIONS_VI.close}
              </Button>
              {canAllocate &&
              (selected.status === "submitted" ||
                selected.status === "pending_allocation" ||
                selected.status === "partially_ordered") ? (
                <Button
                  type="button"
                  disabled={isPending || pendingId === selected.id}
                  onClick={() => handleSupplierDecision(selected)}
                >
                  {buildAutomaticPurchaseDemandAllocations(
                    selected.items,
                    suppliers,
                  ) == null
                    ? copy.allocateAction
                    : copy.approveAllocationAction}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            {selected.statusReason ? (
              <Item variant="muted" size="sm">
                {selected.statusReason}
              </Item>
            ) : null}
            <DescriptionList
              className="sm:grid sm:grid-cols-3 sm:gap-4"
              items={[
                {
                  term: copy.statusColumn,
                  description: copy.statusLabel(selected.status),
                },
                {
                  term: copy.neededBy,
                  description: selected.neededBy
                    ? formatVNDate(selected.neededBy)
                    : "—",
                },
                {
                  term: copy.progressColumn,
                  description: copy.orderedProgress(
                    selected.orderedLineCount,
                    selected.lineCount,
                  ),
                },
              ]}
            />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{copy.linesTitle}</p>
              {selected.items.map((item) => (
                <Item
                  key={item.id}
                  variant="outline"
                  size="sm"
                  className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span>{item.ingredientName}</span>
                  <span className="font-mono tabular-nums">
                    {item.orderedQuantity}/{item.quantity} {item.unitLabel}
                  </span>
                </Item>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{copy.purchaseOrdersTitle}</p>
              {selected.purchaseOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {copy.noPurchaseOrders}
                </p>
              ) : (
                selected.purchaseOrders.map((po) => (
                  <Button
                    key={po.id}
                    type="button"
                    variant="outline"
                    className="justify-between"
                    render={
                      <Link
                        href={`/inventory/purchase-orders?tab=orders&poId=${po.id}&mode=view`}
                      />
                    }
                  >
                    <span className="font-mono">{po.code}</span>
                    <span>{po.supplierName}</span>
                  </Button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={allocateOpen}
        onOpenChange={(open) => {
          if (!open) void closeAllocation();
        }}
        variant="document"
        title={copy.allocateTitle}
        description={
          selected
            ? `${selected.code} · ${selected.branchName}${
                selected.neededBy
                  ? ` · Cần ${formatVNDate(selected.neededBy)}`
                  : ""
              }`
            : undefined
        }
        footer={
          <>
            <div className="mr-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  selected &&
                  setReasonAction({
                    kind: "request_changes",
                    row: selected,
                  })
                }
              >
                {copy.requestChangesAction}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() =>
                  selected &&
                  setReasonAction({ kind: "reject", row: selected })
                }
              >
                {copy.rejectAction}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => saveAllocations(false)}
            >
              {copy.saveAllocationAction}
            </Button>
            <Button
              type="button"
              disabled={isPending || !allocationComplete}
              onClick={() => saveAllocations(true)}
            >
              {copy.approveAllocationAction}
            </Button>
          </>
        }
      >
        {missingSupplierItems.length > 0 ? (
          <Item
            variant="muted"
            size="sm"
            className="items-start flex-col sm:flex-row"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-medium">
                {copy.missingSupplierMappingsTitle}
              </p>
              <p className="text-sm text-muted-foreground">
                {missingSupplierItems
                  .map((item) => item.ingredientName)
                  .join(", ")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              render={<Link href="/inventory/suppliers" />}
            >
              {copy.manageSuppliersAction}
            </Button>
          </Item>
        ) : null}
        <div className="flex flex-col gap-3">
          {selected?.items.map((item) => {
            const supplierDrafts = allocationDrafts
              .map((draft) => ({
                ...draft,
                lines: draft.lines.filter(
                  (line) => line.requestItemId === item.id,
                ),
              }))
              .filter((draft) => draft.lines.length > 0);
            const allocated = totals.get(item.id) ?? 0;
            const remaining = item.remainingQuantity - allocated;
            return (
              <Item
                key={item.id}
                variant="outline"
                className="items-stretch"
              >
                <ItemHeader>
                  <ItemTitle size="heading">{item.ingredientName}</ItemTitle>
                  <Badge
                    variant={
                      Math.abs(remaining) <= 0.0005 ? "success" : "warning"
                    }
                  >
                    {allocated}/{item.remainingQuantity} {item.unitLabel}
                  </Badge>
                </ItemHeader>
                <div className="flex basis-full flex-col gap-2">
                  {supplierDrafts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {copy.noActiveSuppliers}
                    </p>
                  ) : (
                    supplierDrafts.map((draft) => {
                      const line = draft.lines[0];
                      if (!line) return null;
                      return (
                        <div
                          key={draft.supplierId}
                          className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]"
                        >
                          <span className="text-sm">{draft.supplierName}</span>
                          <FormattedNumberInput
                            controlSize="field"
                            value={line.quantity}
                            onValueChange={(value) =>
                              patchAllocation(
                                draft.supplierId,
                                line.key,
                                { quantity: value },
                              )
                            }
                            maxFractionDigits={3}
                            placeholder={copy.quantity}
                            aria-label={`${draft.supplierName}: ${copy.quantity}`}
                          />
                        </div>
                      );
                    })
                  )}
                  <p className="text-xs text-muted-foreground">
                    {copy.allocationProgress(
                      allocated,
                      remaining,
                      item.unitLabel,
                    )}
                  </p>
                </div>
              </Item>
            );
          })}
        </div>
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
          reasonAction?.kind === "request_changes"
            ? "Gửi lại Kho để chỉnh sửa nhu cầu?"
            : reasonAction?.kind === "reject"
              ? "Từ chối nhu cầu mua?"
              : reasonAction?.kind === "close"
                ? "Đóng phần nhu cầu còn lại?"
                : "Bỏ nhu cầu mua?"
        }
        description={reasonAction?.row.code}
        reasonId="purchase-demand-status-reason"
        reason={reason}
        onReasonChange={setReason}
        reasonLabel="Lý do"
        reasonPlaceholder="Nhập lý do để lưu vết"
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel="Xác nhận"
        confirmVariant="destructive"
        isPending={isPending}
        onConfirm={runReasonAction}
      />
    </>
  );
}
