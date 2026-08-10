/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  ClipboardList as IconClipboardList,
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
import { confirm } from "@/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { Combobox } from "@/components/form/combobox";
import { BusinessDatePicker } from "@/components/form";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorDetailList,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  defaultPurchaseRequestUnit,
  purchaseRequestStatusVariant,
  type PurchaseRequestIngredientOption,
  type PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";
import {
  cancelPurchaseRequest,
  closePurchaseRequest,
  reviewPurchaseDemand,
  savePurchaseDemand,
  savePurchaseDemandAllocations,
} from "@/(protected)/inventory/purchase-order-actions";
import {
  buildAutomaticPurchaseDemandAllocations,
  buildPurchaseOrderDrafts,
  findUnassignedPurchaseRequestItemIds,
  type PurchaseDemandAllocation,
  type PurchaseOrderDraft,
  type PurchaseOrderDraftLine,
  type PurchaseOrderSupplier,
} from "@lib/inventory/purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;

const KEY_STATUSES = [
  "draft",
  "pending_allocation",
  "changes_requested",
  "partially_ordered",
  "ordered",
  "closed",
  "cancelled",
] as const;

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

type QtyPadTarget =
  | { kind: "request"; key: string; title: string; unit: string }
  | {
      kind: "allocation";
      supplierId: number;
      lineKey: string;
      title: string;
      unit: string;
    };

function blankRequestLine(): RequestDraftLine {
  return {
    key: crypto.randomUUID(),
    ingredientId: "",
    quantity: "",
    entryUnitId: "",
  };
}

function reasonTitle(kind: ReasonAction["kind"]): string {
  switch (kind) {
    case "request_changes":
      return "Gửi lại Kho để chỉnh sửa nhu cầu?";
    case "reject":
      return "Từ chối nhu cầu mua?";
    case "close":
      return "Đóng phần nhu cầu còn lại?";
    case "cancel":
      return "Bỏ nhu cầu mua?";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function BranchPurchaseRequestsClient({
  rows,
  branches,
  ingredients,
  suppliers,
  mappedIngredientIds,
  canCreateRequest,
  canAllocate,
  branchId,
  branchName,
}: {
  rows: PurchaseRequestRow[];
  branches: Array<{ id: number; name: string }>;
  ingredients: PurchaseRequestIngredientOption[];
  suppliers: PurchaseOrderSupplier[];
  mappedIngredientIds: number[];
  canCreateRequest: boolean;
  canAllocate: boolean;
  branchId: number;
  branchName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [draftBranchId, setDraftBranchId] = useState(String(branchId));
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
  const [allocationIdempotencyKey, setAllocationIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [requestBaseline, setRequestBaseline] = useState("");
  const [allocationBaseline, setAllocationBaseline] = useState("");
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction>();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [qtyPad, setQtyPad] = useState<QtyPadTarget | null>(null);
  const [copyFromRequestId, setCopyFromRequestId] = useState<number | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const mode = searchParams.get("mode");
  const statusFilter = searchParams.get("status") ?? "all";
  const demandId = Number(searchParams.get("demandId"));
  const selectedId =
    Number.isInteger(demandId) && demandId > 0 ? demandId : null;
  const selected =
    selectedId == null
      ? null
      : (rows.find((row) => row.id === selectedId) ?? null);
  const editingPendingDemand =
    mode === "edit" && selected?.status === "pending_allocation";
  const createOpen = mode === "create" || (mode === "edit" && selected != null);
  const allocateOpen = mode === "allocate" && selected != null;
  const viewOpen = mode === "view" && selected != null;
  const recordMode = mode === "view" || mode === "edit" || mode === "allocate";

  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((row) => row.status));
    const ordered = [
      ...KEY_STATUSES.filter((status) => present.has(status)),
      ...[...present].filter(
        (status) =>
          !(KEY_STATUSES as readonly string[]).includes(status),
      ),
    ];
    return ordered;
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (statusFilter === "all" || row.status === statusFilter) &&
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
    [rows, search, statusFilter],
  );

  const requestSnapshot = useCallback(
    (
      nextBranchId = draftBranchId,
      nextNeededBy = neededBy,
      nextLines = requestLines,
    ) => JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
    [draftBranchId, neededBy, requestLines],
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
      if (nextDemandId == null) params.delete("demandId");
      else params.set("demandId", String(nextDemandId));
      if (nextMode == null) params.delete("mode");
      else params.set("mode", nextMode);
      const q = params.toString();
      router[method](q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setStatusFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete("status");
      else params.set("status", value);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
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
    setDraftBranchId(nextBranchId);
    setNeededBy(nextNeededBy);
    setRequestLines(nextLines);
    setRequestBaseline(JSON.stringify([nextBranchId, nextNeededBy, nextLines]));
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
    setDraftBranchId(String(branchId));
    setNeededBy(getVNDateString());
    setRequestLines([blankRequestLine()]);
    setRequestBaseline("");
    setCopyFromRequestId(null);
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
    const shouldPrefill =
      line.quantity.trim() === "" || Number(line.quantity) <= 0;
    const suggested =
      ingredient != null && ingredient.suggestedOrderQty > 0
        ? String(ingredient.suggestedOrderQty)
        : line.quantity;
    patchRequestLine(line.key, {
      ingredientId: value,
      entryUnitId: String(defaultPurchaseRequestUnit(ingredient)?.id ?? ""),
      ...(shouldPrefill ? { quantity: suggested } : {}),
    });
  }

  function saveRequest(submit: boolean) {
    const lines = requestLines.map((line) => ({
      ingredientId: Number(line.ingredientId),
      quantity: Number(line.quantity),
      entryUnitId: Number(line.entryUnitId),
    }));
    const missingSupplierNames = lines.flatMap((line) =>
      line.ingredientId > 0 && !mappedIngredientIds.includes(line.ingredientId)
        ? [
            ingredients.find((item) => item.id === line.ingredientId)?.name ??
              copy.ingredient,
          ]
        : [],
    );
    if (
      !Number(draftBranchId) ||
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
    if (submit && missingSupplierNames.length > 0) {
      toast.error(copy.missingSupplierMappings(missingSupplierNames));
      return;
    }
    startTransition(async () => {
      const result = await savePurchaseDemand({
        demandId: mode === "edit" ? selected?.id : null,
        branchId: Number(draftBranchId),
        neededBy: neededBy || null,
        lines,
        submit,
        idempotencyKey: mode === "create" ? requestIdempotencyKey : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(
          applyInventoryActionError(result, copy.createFailed).toastMessage,
        );
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
          toast.error(
            applyInventoryActionError(result, copy.allocationFailed)
              .toastMessage,
          );
          return;
        }
        const purchaseOrders = result.data?.purchaseOrders ?? [];
        toast.success(copy.approveSuccess(purchaseOrders.map((po) => po.code)));
        updateUrl(row.id, "view", "replace");
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
        toast.error(
          applyInventoryActionError(result, copy.allocationFailed).toastMessage,
        );
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
          toast.error(
            applyInventoryActionError(result, copy.loadFailed).toastMessage,
          );
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

  function openCreate() {
    const nextBranchId = String(branchId);
    const nextNeededBy = getVNDateString();
    const nextLines = [blankRequestLine()];
    setDraftBranchId(nextBranchId);
    setNeededBy(nextNeededBy);
    setRequestLines(nextLines);
    setRequestBaseline(
      JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
    );
    setCopyFromRequestId(null);
    updateUrl(null, "create");
  }

  function openCopyFromSelected() {
    if (!selected || !canCreateRequest) return;
    const nextBranchId = String(selected.branchId);
    const nextNeededBy = selected.neededBy ?? getVNDateString();
    const nextLines =
      selected.items.length > 0
        ? selected.items.map((item) => ({
            key: crypto.randomUUID(),
            ingredientId: String(item.ingredientId),
            quantity: String(item.quantity),
            entryUnitId: String(item.entryUnitId),
          }))
        : [blankRequestLine()];
    setDraftBranchId(nextBranchId);
    setNeededBy(nextNeededBy);
    setRequestLines(nextLines);
    setRequestBaseline(
      JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
    );
    setCopyFromRequestId(selected.id);
    updateUrl(null, "create");
  }

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
        Math.abs((totals.get(item.id) ?? 0) - item.remainingQuantity) <= 0.0005,
    );
  const canReviewSelected =
    canAllocate &&
    selected != null &&
    (selected.status === "submitted" ||
      selected.status === "pending_allocation");

  const qtyPadInitial =
    qtyPad == null
      ? null
      : qtyPad.kind === "request"
        ? Number(
            requestLines.find((line) => line.key === qtyPad.key)?.quantity ??
              "",
          )
        : Number(
            allocationDrafts
              .find((draft) => draft.supplierId === qtyPad.supplierId)
              ?.lines.find((line) => line.key === qtyPad.lineKey)?.quantity ??
              "",
          );

  return (
    <BranchOperatorPage
      title={messages.settings.branch.centralPurchaseRequestsJob}
      description={messages.inventory.po.workspaceDescription}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-[6rem]">
        <BranchOperatorPanel
          title={copy.title}
          description={branchName}
          icon={IconClipboardList}
          badge={{ children: `${filtered.length}/${rows.length}` }}
          contentClassName="gap-3"
        >
          <InputGroup size="touch" className="w-full">
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
                if (value) params.set("q", value);
                else params.delete("q");
                const q = params.toString();
                router.replace(q ? `${pathname}?${q}` : pathname, {
                  scroll: false,
                });
              }}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
              autoComplete="off"
              inputMode="search"
            />
          </InputGroup>

          {statusOptions.length <= 5 ? (
            <ToggleGroup
              type="single"
              value={statusFilter}
              onValueChange={(value) => {
                if (value) setStatusFilter(value);
              }}
              variant="outline"
              size="touch"
              className="w-full justify-start overflow-x-auto"
              aria-label={copy.statusFilterAria}
            >
              <ToggleGroupItem value="all">{copy.allStatuses}</ToggleGroupItem>
              {statusOptions.map((status) => (
                <ToggleGroupItem key={status} value={status}>
                  {copy.statusLabel(status)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                size="touch"
                className="w-full"
                aria-label={copy.statusFilterAria}
              >
                <SelectValue placeholder={copy.statusFilterPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" size="touch">
                  {copy.allStatuses}
                </SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status} size="touch">
                    {copy.statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {filtered.length === 0 ? (
            <AppEmptyState
              compact
              mode={search || statusFilter !== "all" ? "no-results" : "no-data"}
              icon={<IconClipboardList aria-hidden="true" />}
              title={copy.emptyTitle}
              description={copy.emptyDescription}
            />
          ) : (
            <ItemGroup role="list">
              {filtered.map((row) => (
                <Item
                  key={row.id}
                  role="listitem"
                  variant="default"
                  className="min-h-20 touch-manipulation gap-2 rounded-none border-x-0 border-t-0 border-b border-border px-2 py-1.5 last:border-b-0"
                  render={
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => updateUrl(row.id, "view")}
                    />
                  }
                >
                  <ItemContent className="min-w-0 gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <ItemTitle
                        size="heading"
                        className="min-w-0 flex-1 font-mono"
                      >
                        {row.code}
                      </ItemTitle>
                      <Badge variant={purchaseRequestStatusVariant(row.status)}>
                        {copy.statusLabel(row.status)}
                      </Badge>
                    </div>
                    <ItemDescription className="line-clamp-none">
                      {copy.lineCount(row.lineCount)} ·{" "}
                      {copy.orderedProgress(
                        row.orderedLineCount,
                        row.lineCount,
                      )}
                      {row.neededBy
                        ? ` · ${formatVNDate(row.neededBy)}`
                        : ""}
                    </ItemDescription>
                    <ItemDescription className="line-clamp-none text-xs">
                      {formatVNDateTime(row.updatedAt)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="shrink-0">
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>

      {canCreateRequest ? (
        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size="touch-lg"
              className="w-full"
              onClick={openCreate}
            >
              <IconPlus className="size-4" />
              {copy.createAction}
            </Button>
          }
        />
      ) : null}

      <Sheet
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) updateUrl(null, null, "replace");
        }}
      >
        <SheetContent
          side="bottom"
          className="flex max-h-dvh-95 flex-col overflow-hidden bg-background p-0 text-foreground"
          showCloseButton={false}
        >
          {selected ? (
            <>
              <SheetHeader className="shrink-0">
                <SheetTitle className="font-mono text-lg">
                  {selected.code}
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge
                    variant={purchaseRequestStatusVariant(selected.status)}
                  >
                    {copy.statusLabel(selected.status)}
                  </Badge>
                  <span>{selected.branchName}</span>
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                <div className="flex flex-col gap-4">
                  {selected.statusReason ? (
                    <Item variant="muted" size="sm">
                      {selected.statusReason}
                    </Item>
                  ) : null}
                  <BranchOperatorDetailList
                    columns={2}
                    rows={[
                      {
                        label: copy.statusColumn,
                        value: copy.statusLabel(selected.status),
                      },
                      {
                        label: copy.neededBy,
                        value: selected.neededBy
                          ? formatVNDate(selected.neededBy)
                          : "—",
                      },
                      {
                        label: copy.progressColumn,
                        value: copy.orderedProgress(
                          selected.orderedLineCount,
                          selected.lineCount,
                        ),
                      },
                      {
                        label: copy.updatedColumn,
                        value: formatVNDateTime(selected.updatedAt),
                      },
                    ]}
                  />
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{copy.linesTitle}</p>
                    <ItemGroup className="gap-2">
                      {selected.items.map((item) => (
                        <Item key={item.id} variant="outline" size="sm">
                          <ItemContent className="min-w-0 gap-1">
                            <ItemTitle className="line-clamp-none text-sm">
                              {item.ingredientName}
                            </ItemTitle>
                            <ItemDescription className="font-mono tabular-nums">
                              {item.orderedQuantity}/{item.quantity}{" "}
                              {item.unitLabel}
                            </ItemDescription>
                          </ItemContent>
                        </Item>
                      ))}
                    </ItemGroup>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                      {copy.purchaseOrdersTitle}
                    </p>
                    {selected.purchaseOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {copy.noPurchaseOrders}
                      </p>
                    ) : (
                      <ItemGroup className="gap-2">
                        {selected.purchaseOrders.map((po) => (
                          <Item key={po.id} variant="outline" size="sm">
                            <ItemContent className="min-w-0 gap-1">
                              <ItemTitle className="font-mono text-sm">
                                {po.code}
                              </ItemTitle>
                              <ItemDescription>
                                {po.supplierName}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              <Badge variant="secondary">{po.status}</Badge>
                            </ItemActions>
                          </Item>
                        ))}
                      </ItemGroup>
                    )}
                  </div>
                </div>
              </div>

              <SheetFooter className="z-10 shrink-0 border-t bg-background/95 backdrop-blur">
                {canReviewSelected ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
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
                      size="touch"
                      disabled={isPending}
                      onClick={() =>
                        setReasonAction({ kind: "reject", row: selected })
                      }
                    >
                      {copy.rejectAction}
                    </Button>
                  </>
                ) : null}
                {canCreateRequest &&
                (selected.status === "draft" ||
                  selected.status === "changes_requested" ||
                  selected.status === "pending_allocation") ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={() => updateUrl(selected.id, "edit", "replace")}
                  >
                    {ACTIONS_VI.edit}
                  </Button>
                ) : null}
                {canCreateRequest &&
                (selected.status === "draft" ||
                  selected.status === "changes_requested") ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={isPending || pendingId === selected.id}
                    onClick={() =>
                      setReasonAction({ kind: "cancel", row: selected })
                    }
                  >
                    Bỏ phiếu
                  </Button>
                ) : null}
                {selected.status === "partially_ordered" && canAllocate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={() =>
                      setReasonAction({ kind: "close", row: selected })
                    }
                  >
                    Đóng phần còn lại
                  </Button>
                ) : null}
                {canCreateRequest && selected.status === "cancelled" ? (
                  <Button
                    type="button"
                    size="touch"
                    onClick={openCopyFromSelected}
                  >
                    {copy.copyToNewAction}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
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
                    size="touch-lg"
                    disabled={isPending || pendingId === selected.id}
                    onClick={() => handleSupplierDecision(selected)}
                  >
                    {pendingId === selected.id ? (
                      <Spinner className="size-5" />
                    ) : null}
                    {buildAutomaticPurchaseDemandAllocations(
                      selected.items,
                      suppliers,
                    ) == null
                      ? copy.allocateAction
                      : copy.approveAllocationAction}
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) void closeRequestForm();
        }}
      >
        <SheetContent
          side="bottom"
          className="flex max-h-dvh-95 flex-col overflow-hidden bg-background p-0 text-foreground"
          showCloseButton={false}
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>
              {mode === "edit" && selected
                ? selected.code
                : copyFromRequestId != null
                  ? copy.copyToNewAction
                  : copy.createTitle}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {mode === "edit" && selected
                ? copy.statusLabel(selected.status)
                : copyFromRequestId != null
                  ? copy.copyToNewBanner
                  : copy.description}
            </p>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="flex flex-col gap-3">
              {copyFromRequestId != null ? (
                <Item variant="muted" size="sm">
                  {copy.copyToNewBanner}
                </Item>
              ) : null}
              {selected?.status === "changes_requested" &&
              selected.statusReason ? (
                <Item variant="muted" size="sm">
                  <span className="font-medium">{copy.returnedReasonLabel}</span>{" "}
                  {selected.statusReason}
                </Item>
              ) : null}

              {branches.length > 1 ? (
                <Select value={draftBranchId} onValueChange={setDraftBranchId}>
                  <SelectTrigger
                    size="touch"
                    className="w-full"
                    aria-label={copy.branchRequired}
                  >
                    <SelectValue placeholder={copy.branchRequired} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem
                        key={branch.id}
                        value={String(branch.id)}
                        size="touch"
                      >
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">
                    {copy.branchRequired}
                  </span>
                  <span className="font-semibold">{branchName}</span>
                </div>
              )}

              <BusinessDatePicker
                value={neededBy}
                onValueChange={setNeededBy}
                aria-label={copy.neededBy}
                className="min-h-12"
              />

              {requestLines.map((line) => {
                const ingredient = ingredients.find(
                  (item) => item.id === Number(line.ingredientId),
                );
                const hasSupplier = mappedIngredientIds.includes(
                  Number(line.ingredientId),
                );
                return (
                  <Item key={line.key} variant="outline" className="items-start">
                    <ItemContent className="min-w-0 gap-2">
                      <Combobox
                        size="touch"
                        value={line.ingredientId}
                        onValueChange={(value) =>
                          chooseIngredient(line, value)
                        }
                        options={ingredients.map((item) => ({
                          value: String(item.id),
                          label: item.name,
                        }))}
                        placeholder={copy.ingredient}
                        searchPlaceholder={copy.searchPlaceholder}
                      />
                      {line.ingredientId && !hasSupplier ? (
                        <span className="text-xs text-warning-foreground">
                          {copy.missingSupplierShort}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="w-full justify-between font-mono tabular-nums"
                        onClick={() =>
                          setQtyPad({
                            kind: "request",
                            key: line.key,
                            title:
                              ingredient?.name ?? copy.quantity,
                            unit:
                              ingredient?.units.find(
                                (unit) =>
                                  String(unit.id) === line.entryUnitId,
                              )?.label ?? copy.unit,
                          })
                        }
                      >
                        <span>
                          {line.quantity.trim() !== ""
                            ? line.quantity
                            : copy.quantity}
                        </span>
                        <span className="text-muted-foreground">
                          {ingredient?.units.find(
                            (unit) => String(unit.id) === line.entryUnitId,
                          )?.label ?? copy.unit}
                        </span>
                      </Button>
                      <Select
                        value={line.entryUnitId}
                        onValueChange={(value) =>
                          patchRequestLine(line.key, { entryUnitId: value })
                        }
                      >
                        <SelectTrigger
                          size="touch"
                          className="w-full"
                          aria-label={copy.unit}
                        >
                          <SelectValue placeholder={copy.unit} />
                        </SelectTrigger>
                        <SelectContent>
                          {(ingredient?.units ?? []).map((unit) => (
                            <SelectItem
                              key={unit.id}
                              value={String(unit.id)}
                              size="touch"
                            >
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-touch"
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
                    </ItemActions>
                  </Item>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="touch"
                className="self-start"
                onClick={() =>
                  setRequestLines((current) => [
                    ...current,
                    blankRequestLine(),
                  ])
                }
              >
                <IconPlus data-icon="inline-start" />
                {copy.addLine}
              </Button>
            </div>
          </div>

          <SheetFooter className="z-10 shrink-0 border-t bg-background/95 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => void closeRequestForm()}
            >
              {ACTIONS_VI.cancel}
            </Button>
            {editingPendingDemand ? (
              <Button
                type="button"
                size="touch-lg"
                disabled={isPending}
                onClick={() => saveRequest(true)}
              >
                {isPending ? <Spinner className="size-5" /> : null}
                {ACTIONS_VI.saveChanges}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="touch"
                  disabled={isPending}
                  onClick={() => saveRequest(false)}
                >
                  {copy.saveDraft}
                </Button>
                <Button
                  type="button"
                  size="touch-lg"
                  disabled={isPending}
                  onClick={() => saveRequest(true)}
                >
                  {isPending ? <Spinner className="size-5" /> : null}
                  {copy.submitAction}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={allocateOpen}
        onOpenChange={(open) => {
          if (!open) void closeAllocation();
        }}
      >
        <SheetContent
          side="bottom"
          className="flex max-h-dvh-95 flex-col overflow-hidden bg-background p-0 text-foreground"
          showCloseButton={false}
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>{copy.allocateTitle}</SheetTitle>
            {selected ? (
              <p className="text-sm text-muted-foreground">
                {selected.code} · {selected.branchName}
                {selected.neededBy
                  ? ` · Cần ${formatVNDate(selected.neededBy)}`
                  : ""}
              </p>
            ) : null}
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="flex flex-col gap-3">
              {missingSupplierItems.length > 0 ? (
                <Item variant="muted" size="sm" className="flex-col items-start">
                  <p className="font-medium">
                    {copy.missingSupplierMappingsTitle}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {missingSupplierItems
                      .map((item) => item.ingredientName)
                      .join(", ")}
                  </p>
                </Item>
              ) : null}

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
                  <Item key={item.id} variant="outline" className="items-stretch">
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
                              className="flex flex-col gap-1"
                            >
                              <span className="text-sm">
                                {draft.supplierName}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="touch"
                                className="w-full justify-between font-mono tabular-nums"
                                onClick={() =>
                                  setQtyPad({
                                    kind: "allocation",
                                    supplierId: draft.supplierId,
                                    lineKey: line.key,
                                    title: `${item.ingredientName} · ${draft.supplierName}`,
                                    unit: item.unitLabel,
                                  })
                                }
                              >
                                <span>
                                  {line.quantity.trim() !== ""
                                    ? line.quantity
                                    : copy.quantity}
                                </span>
                                <span className="text-muted-foreground">
                                  {item.unitLabel}
                                </span>
                              </Button>
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
          </div>

          <SheetFooter className="z-10 shrink-0 border-t bg-background/95 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              size="touch"
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
              size="touch"
              disabled={isPending}
              onClick={() =>
                selected && setReasonAction({ kind: "reject", row: selected })
              }
            >
              {copy.rejectAction}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="touch"
              disabled={isPending}
              onClick={() => saveAllocations(false)}
            >
              {copy.saveAllocationAction}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending || !allocationComplete}
              onClick={() => saveAllocations(true)}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {copy.approveAllocationAction}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <NumberPadSheet
        open={qtyPad != null}
        onOpenChange={(open) => {
          if (!open) setQtyPad(null);
        }}
        title={qtyPad?.title ?? ""}
        suffix={qtyPad?.unit}
        initialValue={
          qtyPadInitial != null && Number.isFinite(qtyPadInitial)
            ? qtyPadInitial
            : null
        }
        onConfirm={(value) => {
          if (!qtyPad) return;
          if (qtyPad.kind === "request") {
            patchRequestLine(qtyPad.key, { quantity: String(value) });
            return;
          }
          patchAllocation(qtyPad.supplierId, qtyPad.lineKey, {
            quantity: String(value),
          });
        }}
        allowDecimal
        maxFractionDigits={3}
      />

      <ReasonConfirmDialog
        open={reasonAction != null}
        onOpenChange={(open) => {
          if (!open) {
            setReasonAction(undefined);
            setReason("");
          }
        }}
        title={reasonAction ? reasonTitle(reasonAction.kind) : ""}
        description={reasonAction?.row.code}
        reasonId="branch-purchase-demand-status-reason"
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
    </BranchOperatorPage>
  );
}
