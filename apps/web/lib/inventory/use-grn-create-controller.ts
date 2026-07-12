"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import {
  createGrnDraft,
  confirmGrn,
  deleteGrnLine,
  discardGrnDraft,
  updateDraftGrnReceivingSite,
  upsertGrnLine,
} from "@/(protected)/inventory/grn-actions";
import {
  draftTotal,
  type GrnDraft,
  type GrnDraftLine,
} from "@/(protected)/inventory/_lib/grn-draft";
import { getDefaultPurchaseUnit } from "@/(protected)/inventory/_lib/purchase-units";
import { GRN_CREATE_COPY } from "./grn-create-copy";
import {
  getGrnLocationKindLabel,
  pickGrnReceivingLocation,
  type GrnCreatePageData,
  type GrnCreateServerDraftLine,
  type GrnLineEditState,
} from "./grn-create-model";

export type UseGrnCreateControllerOptions = GrnCreatePageData & {
  basePath: string;
  grnBasePath: string;
  returnTo?: string;
};

export function useGrnCreateController({
  supplier,
  branchId: initialBranchId,
  procurementBranches,
  locationOptions,
  initialLocationId,
  canSwitchBranch,
  ingredients,
  recentLines,
  existingDraft,
  canConfirm,
  basePath,
  grnBasePath,
  returnTo,
}: UseGrnCreateControllerOptions) {
  const router = useRouter();
  const initialLocation = pickGrnReceivingLocation(
    locationOptions,
    initialBranchId,
    initialLocationId,
  );
  const initialDraftBranchId = initialLocation?.branchId ?? initialBranchId;
  const [draft, setDraft] = useState<GrnDraft>(() => ({
    draftId: existingDraft
      ? `srv-${existingDraft.id}`
      : `pending-${supplier.id}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    branchId: initialDraftBranchId,
    lines: existingDraft?.lines ?? recentLines,
    updatedAt: new Date().toISOString(),
  }));
  const [serverGrnId, setServerGrnId] = useState<number | null>(
    existingDraft?.id ?? null,
  );
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

  async function ensureServerDraft(): Promise<number | null> {
    if (serverGrnId !== null) return serverGrnId;
    if (serverDraftPromiseRef.current) return serverDraftPromiseRef.current;
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return null;
    }
    if (!locationId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseLocation);
      return null;
    }

    const createPromise = (async () => {
      const created = await createGrnDraft({
        supplierId: supplier.id,
        branchId,
        locationId,
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

  function applyLines(
    nextLines:
      | GrnDraftLine[]
      | ((currentLines: GrnDraftLine[]) => GrnDraftLine[]),
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
    const unitCost = existing?.unitCost ?? null;
    setEdit({
      ingredient,
      line: existing ?? null,
      quantity,
      unit,
      entryUnitId,
      unitCost,
      note: existing?.note ?? "",
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
        unitCost: null,
      };
    });
  }

  async function saveLine() {
    if (
      !edit ||
      edit.quantity <= 0 ||
      edit.unitCost == null ||
      edit.unitCost <= 0
    ) {
      return;
    }

    const unitCost = edit.unitCost;
    setSubmitError(null);
    try {
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      const lineRes = await upsertGrnLine({
        grnId,
        ingredientId: edit.ingredient.id,
        receivedQuantity: edit.quantity,
        entryUnitId: edit.entryUnitId,
        unitCost,
        qualityStatus: "accepted",
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
        unitCost,
        note: edit.note.trim() ? edit.note.trim() : undefined,
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
      const result = await discardGrnDraft({ grnId: serverGrnId });
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
    if (draft.lines.some((line) => line.unitCost == null || line.unitCost <= 0)) {
      setSubmitError(GRN_CREATE_COPY.toastMissingPrices);
      return;
    }
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return;
    }
    if (!locationId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseLocation);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      const params = new URLSearchParams({ review: "1" });
      if (returnTo) params.set("returnTo", returnTo);
      router.push(`${grnBasePath}/${grnId}?${params.toString()}`);
      router.refresh();
    } catch {
      setSubmitError("Không thể gửi phiếu. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmNow() {
    if (draft.lines.length === 0) {
      setSubmitError(GRN_CREATE_COPY.toastNoLines);
      return;
    }
    if (draft.lines.some((line) => line.unitCost == null || line.unitCost <= 0)) {
      setSubmitError(GRN_CREATE_COPY.toastMissingPrices);
      return;
    }
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return;
    }
    if (!locationId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseLocation);
      return;
    }
    const ok = await confirm({
      title: messages.inventory.grn.confirmGrnTitle,
      description: messages.inventory.grn.confirmGrnDesc,
      variant: "destructive",
      confirmText: GRN_CREATE_COPY.confirmNowAction,
    });
    if (!ok) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      const result = await confirmGrn(grnId);
      if (!result.success) {
        setSubmitError(result.error ?? messages.inventory.grn.confirmFailed);
        return;
      }
      router.push(returnTo ?? grnBasePath);
      router.refresh();
    } catch {
      setSubmitError(messages.inventory.grn.confirmFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const total = draftTotal(draft);
  const lineCount = draft.lines.length;
  const hasMissingPrice = draft.lines.some(
    (line) => line.unitCost == null || line.unitCost <= 0,
  );
  const canSubmit =
    lineCount > 0 &&
    !hasMissingPrice &&
    !submitting &&
    !receivingSiteSaving;
  const branchLocations = locationOptions.filter(
    (location) => location.branchId === branchId,
  );
  const showBranchPicker = canSwitchBranch && procurementBranches.length > 1;
  const showLocationPicker = branchLocations.length > 1;
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
    canConfirm,
    canSubmit,
    closeEdit,
    confirmNow,
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
    supplier,
    total,
    updateEditUnit,
    removeLine,
    setQuery,
  };
}
