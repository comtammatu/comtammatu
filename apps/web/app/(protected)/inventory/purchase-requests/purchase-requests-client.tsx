"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { getVNDateString } from "@comtammatu/shared/time";
import { confirm } from "@/components/confirm-dialog";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  defaultPurchaseRequestUnit,
  type PurchaseRequestIngredientOption,
  type PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
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
  addPurchaseDemandAllocationRow,
  buildAutomaticPurchaseDemandAllocations,
  buildPurchaseOrderDrafts,
  findUnassignedPurchaseRequestItemIds,
  reassignPurchaseDemandAllocationSupplier,
  removePurchaseDemandAllocationRow,
  type PurchaseDemandAllocation,
  type PurchaseOrderDraft,
  type PurchaseOrderDraftLine,
  type PurchaseOrderSupplier,
} from "./purchase-order-drafts";
import { PurchaseRequestAllocateDialog } from "./purchase-request-allocate-dialog";
import {
  blankRequestLine,
  type ReasonAction,
  type RequestDraftLine,
} from "./purchase-request-draft-types";
import { PurchaseRequestFormDialog } from "./purchase-request-form-dialog";
import { PurchaseRequestViewDialog } from "./purchase-request-view-dialog";
import {
  buildCreateDraftState,
  PurchaseRequestsList,
} from "./purchase-requests-list";

export type {
  PurchaseRequestItemRow,
  PurchaseRequestRow,
  PurchaseRequestIngredientOption,
} from "@lib/inventory/purchase-request-model";

const copy = messages.inventory.purchaseRequests;
const DEMAND_OVERLAY_KEYS = [
  "demandId",
  "poId",
  "mode",
  "needsQ",
  "needsStatus",
  "needsSite",
  "needsPage",
] as const;

export function PurchaseRequestsClient({
  rows,
  branches,
  ingredients,
  suppliers,
  mappedIngredientIds,
  canCreateRequest,
  canAllocate,
}: {
  rows: PurchaseRequestRow[];
  branches: Array<{ id: number; name: string }>;
  ingredients: PurchaseRequestIngredientOption[];
  suppliers: PurchaseOrderSupplier[];
  mappedIngredientIds: number[];
  canCreateRequest: boolean;
  canAllocate: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const overlay = useDocumentOverlayUrl(DEMAND_OVERLAY_KEYS);
  const [search, setSearch] = useState(() => overlay.get("needsQ") ?? "");
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
  const [allocationIdempotencyKey, setAllocationIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [requestBaseline, setRequestBaseline] = useState("");
  const [allocationBaseline, setAllocationBaseline] = useState("");
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction>();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [copyFromRequestId, setCopyFromRequestId] = useState<number | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const mode = overlay.get("mode");
  const statusFilter = overlay.get("needsStatus") ?? "all";
  const siteFilter = overlay.get("needsSite") ?? "all";
  const currentPage = Math.max(Number(overlay.get("needsPage")) || 1, 1);
  const demandId = Number(overlay.get("demandId"));
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
  const recordMode = mode === "view" || mode === "edit" || mode === "allocate";
  const ingredientOptions = useMemo(
    () =>
      ingredients.map((item) => ({
        value: String(item.id),
        label: item.name,
      })),
    [ingredients],
  );
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
      overlay.patchOverlay(
        {
          tab: "needs",
          poId: null,
          demandId: nextDemandId,
          mode: nextMode,
        },
        method,
      );
    },
    [overlay.patchOverlay],
  );

  useEffect(() => {
    setSearch(overlay.get("needsQ") ?? "");
  }, [overlay.get, overlay.values]);

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
    setBranchId(String(branches[0]?.id ?? ""));
    setNeededBy(getVNDateString());
    setRequestLines([blankRequestLine()]);
    setRequestBaseline("");
    setCopyFromRequestId(null);
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
    setBranchId(nextBranchId);
    setNeededBy(nextNeededBy);
    setRequestLines(nextLines);
    setRequestBaseline(
      JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
    );
    setCopyFromRequestId(selected.id);
    updateUrl(null, "create");
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
    if (mode === "edit" && selected) {
      updateUrl(selected.id, "view", "replace");
      resetCreate();
      return;
    }
    if (mode === "create" && copyFromRequestId != null) {
      const sourceId = copyFromRequestId;
      resetCreate();
      updateUrl(sourceId, "view", "replace");
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
    if (submit && missingSupplierNames.length > 0) {
      toast.error(copy.missingSupplierMappings(missingSupplierNames));
      return;
    }
    startTransition(async () => {
      const result = await savePurchaseDemand({
        demandId: mode === "edit" ? selected?.id : null,
        branchId: Number(branchId),
        neededBy: neededBy || null,
        lines,
        submit,
        idempotencyKey: mode === "create" ? requestIdempotencyKey : undefined,
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
    supplierId: number | null,
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
        return draft.supplierId != null &&
          line.quantity.trim() !== "" &&
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
        const params = new URLSearchParams(window.location.search);
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

  return (
    <>
      <PurchaseRequestsList
        rows={rows}
        branches={branches}
        filtered={filtered}
        search={search}
        statusFilter={statusFilter}
        siteFilter={siteFilter}
        currentPage={currentPage}
        suppliers={suppliers}
        canCreateRequest={canCreateRequest}
        canAllocate={canAllocate}
        isPending={isPending}
        pendingId={pendingId}
        onSearchChange={(value) => {
          setSearch(value);
          overlay.patchOverlay(
            { needsQ: value || null, needsPage: null },
            "replace",
          );
        }}
        onStatusFilterChange={(value) => {
          overlay.patchOverlay(
            {
              needsStatus: value === "all" ? null : value,
              needsPage: null,
            },
            "replace",
          );
        }}
        onSiteFilterChange={(value) => {
          overlay.patchOverlay(
            {
              needsSite: value === "all" ? null : value,
              needsPage: null,
            },
            "replace",
          );
        }}
        onPageChange={(page) => {
          overlay.patchOverlay(
            { needsPage: page <= 1 ? null : page },
            "replace",
          );
        }}
        onOpenCreate={() => {
          const draft = buildCreateDraftState(branches);
          setBranchId(draft.branchId);
          setNeededBy(draft.neededBy);
          setRequestLines(draft.requestLines);
          setRequestBaseline(draft.baseline);
          setCopyFromRequestId(null);
          updateUrl(null, "create");
        }}
        onOpenView={(rowId) => updateUrl(rowId, "view")}
        onOpenEdit={(rowId) => updateUrl(rowId, "edit")}
        onCancelRow={(row) => setReasonAction({ kind: "cancel", row })}
        onCloseRow={(row) => setReasonAction({ kind: "close", row })}
        onSupplierDecision={handleSupplierDecision}
      />

      <PurchaseRequestFormDialog
        open={createOpen}
        mode={mode}
        selected={selected}
        copyFromRequestId={copyFromRequestId}
        editingPendingDemand={editingPendingDemand}
        branchId={branchId}
        neededBy={neededBy}
        requestLines={requestLines}
        branches={branches}
        ingredients={ingredients}
        ingredientOptions={ingredientOptions}
        mappedIngredientIds={mappedIngredientIds}
        isPending={isPending}
        onOpenChange={(open) => {
          if (!open) void closeRequestForm();
        }}
        onBranchIdChange={setBranchId}
        onNeededByChange={setNeededBy}
        onChooseIngredient={chooseIngredient}
        onPatchRequestLine={patchRequestLine}
        onRemoveLine={(key) =>
          setRequestLines((current) => current.filter((item) => item.key !== key))
        }
        onAddLine={() =>
          setRequestLines((current) => [...current, blankRequestLine()])
        }
        onClose={() => void closeRequestForm()}
        onSaveDraft={() => saveRequest(false)}
        onSaveSubmit={() => saveRequest(true)}
      />

      <PurchaseRequestViewDialog
        open={selected != null && mode === "view"}
        selected={selected}
        canCreateRequest={canCreateRequest}
        canAllocate={canAllocate}
        canReviewSelected={canReviewSelected}
        isPending={isPending}
        pendingId={pendingId}
        suppliers={suppliers}
        onOpenChange={(open) => {
          if (!open) updateUrl(null, null, "replace");
        }}
        onEdit={() => selected && updateUrl(selected.id, "edit", "replace")}
        onClose={() => updateUrl(null, null, "replace")}
        onCopyFromSelected={openCopyFromSelected}
        onRequestChanges={() =>
          selected &&
          setReasonAction({ kind: "request_changes", row: selected })
        }
        onReject={() =>
          selected && setReasonAction({ kind: "reject", row: selected })
        }
        onSupplierDecision={() => selected && handleSupplierDecision(selected)}
      />

      <PurchaseRequestAllocateDialog
        open={allocateOpen}
        selected={selected}
        allocationDrafts={allocationDrafts}
        suppliers={suppliers}
        missingSupplierItems={missingSupplierItems}
        allocationComplete={allocationComplete}
        totals={totals}
        isPending={isPending}
        onOpenChange={(open) => {
          if (!open) void closeAllocation();
        }}
        onRequestChanges={() =>
          selected &&
          setReasonAction({ kind: "request_changes", row: selected })
        }
        onReject={() =>
          selected && setReasonAction({ kind: "reject", row: selected })
        }
        onSaveDraft={() => saveAllocations(false)}
        onApprove={() => saveAllocations(true)}
        onPatchAllocation={patchAllocation}
        onAddAllocationRow={(requestItemId, ingredientId) =>
          setAllocationDrafts((current) =>
            addPurchaseDemandAllocationRow(
              current,
              requestItemId,
              ingredientId,
              suppliers,
            ),
          )
        }
        onRemoveAllocationRow={(supplierId, key) =>
          setAllocationDrafts((current) =>
            removePurchaseDemandAllocationRow(current, supplierId, key),
          )
        }
        onChangeAllocationSupplier={(fromSupplierId, key, toSupplierId) =>
          setAllocationDrafts((current) =>
            reassignPurchaseDemandAllocationSupplier(
              current,
              fromSupplierId,
              key,
              toSupplierId,
              suppliers,
            ),
          )
        }
      />

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
