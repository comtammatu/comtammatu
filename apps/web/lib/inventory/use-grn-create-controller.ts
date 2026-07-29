"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { matchesSearch } from "@lib/search";
import {
  createGrnDraft,
  deleteGrnLine,
  discardGrnDraft,
  updateDraftGrnReceivingSite,
  upsertGrnLine,
} from "@/(protected)/inventory/grn-actions";
import { type GrnDraft, type GrnDraftLine } from "@lib/inventory/grn-draft";
import { getDefaultPurchaseUnit } from "@lib/inventory/purchase-units";
import { GRN_CREATE_COPY } from "./grn-create-copy";
import {
  formatGrnSupplierSummary,
  getGrnLocationKindLabel,
  pickGrnReceivingLocation,
  resolveDefaultGrnSupplier,
  type GrnCreatePageData,
  type GrnCreateServerDraftLine,
  type GrnLineEditState,
} from "./grn-create-model";
import { persistPendingGrnDraftLines } from "./persist-grn-draft-lines";

export type UseGrnCreateControllerOptions = GrnCreatePageData & {
  basePath: string;
  grnBasePath: string;
};

export function useGrnCreateController({
  branchId: initialBranchId,
  procurementBranches,
  locationOptions,
  canSwitchBranch,
  ingredients,
  recentLines,
  basePath,
  grnBasePath,
}: UseGrnCreateControllerOptions) {
  const router = useRouter();
  const initialLocation = pickGrnReceivingLocation(
    locationOptions,
    initialBranchId,
  );
  const initialDraftBranchId = initialLocation?.branchId ?? initialBranchId;
  const [draft, setDraft] = useState<GrnDraft>(() => ({
    draftId: `pending-${initialDraftBranchId ?? "new"}`,
    supplierId: null,
    supplierName: null,
    branchId: initialDraftBranchId,
    lines: recentLines,
    updatedAt: new Date().toISOString(),
  }));
  const [serverGrnId, setServerGrnId] = useState<number | null>(null);
  const serverDraftPromiseRef = useRef<Promise<number | null> | null>(null);
  const [branchId, setBranchId] = useState<number | null>(initialDraftBranchId);
  const [locationId, setLocationId] = useState<number | null>(
    initialLocation?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<GrnLineEditState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receivingSiteSaving, setReceivingSiteSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const serverResolvesLocation = !canSwitchBranch;

  async function ensureServerDraft(): Promise<number | null> {
    if (serverGrnId !== null) return serverGrnId;
    if (serverDraftPromiseRef.current) return serverDraftPromiseRef.current;
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return null;
    }
    if (!locationId && !serverResolvesLocation) {
      setSubmitError(GRN_CREATE_COPY.toastChooseLocation);
      return null;
    }

    const createPromise = (async () => {
      const created = await createGrnDraft({
        branchId,
        ...(serverResolvesLocation
          ? {}
          : { locationId: locationId ?? undefined }),
      });
      if (!created.success) {
        setSubmitError(created.error ?? GRN_CREATE_COPY.toastCreateDraftFailed);
        return null;
      }
      const id = (created.data as { id: number } | undefined)?.id ?? null;
      if (id !== null) setServerGrnId(id);
      return id;
    })();
    serverDraftPromiseRef.current = createPromise;
    try {
      return await createPromise;
    } finally {
      serverDraftPromiseRef.current = null;
    }
  }

  const addedMap = useMemo(() => {
    const map = new Map<number, GrnDraftLine>();
    draft.lines.forEach((line) => map.set(line.ingredientId, line));
    return map;
  }, [draft]);

  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return ingredients;
    return ingredients.filter((item) =>
      matchesSearch([item.name, item.sku], needle),
    );
  }, [ingredients, query]);

  const supplierSummary = formatGrnSupplierSummary(draft.lines);

  function applyLines(
    nextLines:
      GrnDraftLine[] | ((currentLines: GrnDraftLine[]) => GrnDraftLine[]),
  ) {
    setDraft((current) => ({
      ...current,
      lines:
        typeof nextLines === "function" ? nextLines(current.lines) : nextLines,
      updatedAt: new Date().toISOString(),
    }));
  }

  function openEdit(ingredientId: number) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return;

    const existing = addedMap.get(ingredient.id);
    const defaultUnit = getDefaultPurchaseUnit(ingredient);
    const entryUnitId = existing
      ? (existing.entryUnitId ?? null)
      : (defaultUnit?.unitId ?? null);
    const unit = existing?.unit ?? defaultUnit?.label ?? ingredient.unit;
    const quantity = existing?.quantity ?? 0;
    const defaultSupplier = resolveDefaultGrnSupplier(ingredient.suppliers);
    const supplierId =
      existing?.supplierId ?? defaultSupplier?.id ?? null;
    setEdit({
      ingredient,
      line: existing ?? null,
      quantity,
      unit,
      entryUnitId,
      supplierId,
      note: "",
    });
  }

  function closeEdit() {
    setEdit(null);
  }

  function patchEdit(patch: Partial<GrnLineEditState>) {
    setEdit((current) => (current ? { ...current, ...patch } : current));
  }

  function updateEditUnit(unitId: number, label: string) {
    setEdit((current) => {
      if (!current) return current;

      return {
        ...current,
        entryUnitId: unitId,
        unit: label,
      };
    });
  }

  async function saveLine() {
    if (!edit || edit.quantity <= 0) {
      return;
    }
    if (edit.supplierId == null) {
      setSubmitError(GRN_CREATE_COPY.toastChooseSupplier);
      return;
    }
    const supplier = edit.ingredient.suppliers.find(
      (item) => item.id === edit.supplierId,
    );
    if (!supplier) {
      setSubmitError(GRN_CREATE_COPY.toastChooseSupplier);
      return;
    }

    setSubmitError(null);
    try {
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      const lineRes = await upsertGrnLine({
        grnId,
        ingredientId: edit.ingredient.id,
        supplierId: edit.supplierId,
        receivedQuantity: edit.quantity,
        entryUnitId: edit.entryUnitId,
      });
      if (!lineRes.success) {
        setSubmitError(lineRes.error ?? GRN_CREATE_COPY.toastSaveLineFailed);
        return;
      }
      const lineId = (lineRes.data as { id: number } | undefined)?.id ?? 0;
      const nextLine: GrnDraftLine & { lineId?: number } = {
        ingredientId: edit.ingredient.id,
        ingredientName: edit.ingredient.name,
        unit: edit.unit,
        entryUnitId: edit.entryUnitId,
        quantity: edit.quantity,
        supplierId: supplier.id,
        supplierName: supplier.name,
      };
      if (lineId) (nextLine as GrnCreateServerDraftLine).lineId = lineId;
      applyLines((currentLines) => {
        const index = currentLines.findIndex(
          (line) => line.ingredientId === edit.ingredient.id,
        );
        return index >= 0
          ? currentLines.map((line, lineIndex) =>
              lineIndex === index ? { ...line, ...nextLine } : line,
            )
          : [...currentLines, nextLine as GrnCreateServerDraftLine];
      });
      closeEdit();
    } catch {
      setSubmitError(GRN_CREATE_COPY.toastSaveLineFailed);
    }
  }

  async function removeLine(ingredientId: number) {
    const target = draft.lines.find(
      (line) => line.ingredientId === ingredientId,
    ) as GrnCreateServerDraftLine | undefined;
    if (target?.lineId && serverGrnId !== null) {
      const result = await deleteGrnLine({
        grnId: serverGrnId,
        lineId: target.lineId,
      });
      if (!result.success) {
        setSubmitError(result.error ?? GRN_CREATE_COPY.toastDeleteLineFailed);
        return;
      }
    }
    applyLines((currentLines) =>
      currentLines.filter((line) => line.ingredientId !== ingredientId),
    );
  }

  async function discardDraft() {
    const ok = await confirm({
      title: GRN_CREATE_COPY.toastDiscardDraftTitle,
      description: GRN_CREATE_COPY.toastDiscardDraftDesc,
      variant: "destructive",
    });
    if (!ok) return;
    if (serverGrnId !== null) {
      const result = await discardGrnDraft({
        grnId: serverGrnId,
        reason: "Người dùng hủy phiếu nháp.",
      });
      if (!result.success) {
        setSubmitError(result.error ?? GRN_CREATE_COPY.toastDiscardDraftFailed);
        return;
      }
    }
    router.push(basePath);
  }

  async function submit() {
    if (draft.lines.length === 0) {
      setSubmitError(GRN_CREATE_COPY.toastNoLines);
      return;
    }
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return;
    }
    if (!locationId && !serverResolvesLocation) {
      setSubmitError(GRN_CREATE_COPY.toastChooseLocation);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      const persisted = await persistPendingGrnDraftLines(
        grnId,
        draft.lines,
        upsertGrnLine,
      );
      if (!persisted.success) {
        setSubmitError(persisted.error ?? GRN_CREATE_COPY.toastSaveLineFailed);
        return;
      }
      applyLines(persisted.lines);
      router.push(`${grnBasePath}/${grnId}`);
      router.refresh();
    } catch {
      setSubmitError("Không thể gửi phiếu. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  const lineCount = draft.lines.length;
  const canSubmit = lineCount > 0 && !submitting && !receivingSiteSaving;
  const branchLocations = locationOptions.filter(
    (location) => location.branchId === branchId,
  );
  const showBranchPicker = canSwitchBranch && procurementBranches.length > 1;
  const showLocationPicker = canSwitchBranch && branchLocations.length > 1;
  const showWarehouseEditor = showBranchPicker || showLocationPicker;
  const selectedBranchName =
    procurementBranches.find((branch) => branch.id === branchId)?.name ??
    (branchId ? `#${branchId}` : GRN_CREATE_COPY.branchUnselected);
  const selectedLocation = locationOptions.find(
    (location) => location.id === locationId,
  );
  const selectedLocationName = selectedLocation
    ? getGrnLocationKindLabel(selectedLocation)
    : locationId
      ? `#${locationId}`
      : GRN_CREATE_COPY.locationUnselected;

  async function commitReceivingSite(
    nextBranchId: number | null,
    nextLocationId: number | null,
  ) {
    if (!nextBranchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return;
    }
    if (!nextLocationId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseLocation);
      return;
    }
    if (serverGrnId === null) {
      setBranchId(nextBranchId);
      setLocationId(nextLocationId);
      setSubmitError(null);
      return;
    }

    setReceivingSiteSaving(true);
    setSubmitError(null);
    try {
      const result = await updateDraftGrnReceivingSite({
        grnId: serverGrnId,
        targetBranchId: nextBranchId,
        targetLocationId: nextLocationId,
      });
      if (!result.success) {
        setSubmitError(result.error ?? "Không thể đổi nơi nhập phiếu nháp.");
        return;
      }
      setBranchId(nextBranchId);
      setLocationId(nextLocationId);
      router.refresh();
    } catch {
      setSubmitError("Không thể đổi nơi nhập phiếu nháp.");
    } finally {
      setReceivingSiteSaving(false);
    }
  }

  function handleBranchChange(value: string) {
    const nextBranchId = Number(value) || null;
    const nextLocationId =
      pickGrnReceivingLocation(locationOptions, nextBranchId)?.id ?? null;
    void commitReceivingSite(nextBranchId, nextLocationId);
  }

  function handleLocationChange(value: string) {
    void commitReceivingSite(branchId, Number(value) || null);
  }

  return {
    addedMap,
    branchId,
    branchLocations,
    canSubmit,
    closeEdit,
    discardDraft,
    draft,
    edit,
    filtered,
    handleBranchChange,
    handleLocationChange,
    lineCount,
    locationId,
    openEdit,
    patchEdit,
    query,
    receivingSiteSaving,
    saveLine,
    selectedBranchName,
    selectedLocation,
    selectedLocationName,
    showBranchPicker,
    showLocationPicker,
    showWarehouseEditor,
    submitting,
    submit,
    submitError,
    supplierSummary,
    updateEditUnit,
    removeLine,
    setQuery,
  };
}
