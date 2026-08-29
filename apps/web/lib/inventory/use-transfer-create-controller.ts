"use client";

import type { FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getIssueUnitOptions,
} from "@/(protected)/inventory/_lib/issue-units";
import { createStockTransfer } from "@/(protected)/inventory/transfer-actions";
import { messages } from "@lib/messages";
import {
  applyInventoryActionError,
  inventoryShortageToastMessage,
} from "@lib/inventory/apply-inventory-action-error";
import {
  buildTransferLinesPayload,
  clampTransferLineForSource,
  createAllAvailableTransferLines,
  createPrefilledTransferDraftLine,
  createTransferDraftLine,
  getDefaultTransferSourceLocation,
  getTransferSelectableIngredients,
  getTransferSourceLocationOptions,
  getTransferOutboundDestinationOptions,
  formatTransferLocationLabel,
  getTransferLineMaxEntryQuantity,
  ingredientMatchesPullFromSite,
  parseTransferTargetValue,
  resolveTransferCreatePolicy,
  withTransferBranchQuery,
  type BranchForTransfer,
  type TransferDraftLine,
  type TransferIngredientOption,
  type TransferSourceLocation,
} from "./transfer-create-model";
import { preferPullFromSite } from "./fulfill-site";

export type TransferCreateDirection = "pull" | "outbound";

export interface TransferPrefillLine {
  ingredientId: number;
  quantity?: number;
  entryUnitId?: number;
}

interface UseTransferCreateControllerOptions {
  branches: BranchForTransfer[];
  ingredients: TransferIngredientOption[];
  sourceLocationsByBranch: Record<number, TransferSourceLocation[]>;
  sourceStockByLocation: Record<number, Record<number, number>>;
  userBranchId: number | null;
  loadFailed: boolean;
  basePath: string;
  initialDirection?: TransferCreateDirection;
  initialPrefillLine?: TransferPrefillLine;
}

export function useTransferCreateController({
  branches,
  ingredients,
  sourceLocationsByBranch,
  sourceStockByLocation,
  userBranchId,
  loadFailed,
  basePath,
  initialDirection,
  initialPrefillLine,
}: UseTransferCreateControllerOptions) {
  const router = useRouter();
  const policy = useMemo(
    () => resolveTransferCreatePolicy({ branches, userBranchId }),
    [branches, userBranchId],
  );
  const defaultDirection: TransferCreateDirection =
    initialDirection === "outbound"
      ? "outbound"
      : policy.canCreatePull
        ? "pull"
        : "outbound";
  const [direction, setDirectionState] =
    useState<TransferCreateDirection>(defaultDirection);
  const [outboundToBranchId, setOutboundToBranchIdState] = useState("");
  const [pullFromBranchId, setPullFromBranchIdState] = useState("");
  const [outboundSourceLocationId, setOutboundSourceLocationId] = useState("");
  const [draftLines, setDraftLines] = useState<TransferDraftLine[]>(() => {
    if (!initialPrefillLine?.ingredientId) return [];
    const ingredient = ingredients.find(
      (item) => item.id === initialPrefillLine.ingredientId,
    );
    if (!ingredient) return [];
    return [
      createPrefilledTransferDraftLine({
        ingredient,
        key: `prefill-${ingredient.id}`,
        quantity: initialPrefillLine.quantity,
        entryUnitId: initialPrefillLine.entryUnitId,
      }),
    ];
  });
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();
  const isPull = direction === "pull" && policy.canCreatePull;
  const defaultPullFromValue =
    policy.pullSourceOptions.find(
      (option) => option.branch.branch_kind === "central_supply",
    )?.value ??
    policy.pullSourceOptions[0]?.value ??
    "";
  const resolvedPullFromValue = pullFromBranchId || defaultPullFromValue;
  const selectedSourceBranchId = isPull
    ? (parseTransferTargetValue(resolvedPullFromValue)?.branchId ?? null)
    : policy.outboundSourceBranchId;
  const selectedSourceBranch =
    selectedSourceBranchId == null
      ? null
      : (branches.find((branch) => branch.id === selectedSourceBranchId) ??
        null);
  const sourceLocationOptions =
    selectedSourceBranchId == null
      ? []
      : getTransferSourceLocationOptions({
          locations: sourceLocationsByBranch[selectedSourceBranchId] ?? [],
        });
  const selectedSourceLocation =
    sourceLocationOptions.find(
      (location) => String(location.id) === outboundSourceLocationId,
    ) ?? getDefaultTransferSourceLocation(sourceLocationOptions);
  const selectedSourceLocationId = selectedSourceLocation?.id ?? null;
  const selectedSourceLocationValue = selectedSourceLocation
    ? String(selectedSourceLocation.id)
    : "";
  const outboundDestinationOptions = useMemo(
    () =>
      getTransferOutboundDestinationOptions({
        branches,
        sourceBranchId: policy.outboundSourceBranchId,
        sourceBranchKind: policy.currentBranchKind,
        sourceLocationKind: selectedSourceLocation?.kind ?? "warehouse",
      }),
    [
      branches,
      policy.currentBranchKind,
      policy.outboundSourceBranchId,
      selectedSourceLocation?.kind,
    ],
  );
  const selectedTarget = parseTransferTargetValue(outboundToBranchId);
  const selectedTargetBranchKind =
    selectedTarget == null
      ? null
      : (branches.find((branch) => branch.id === selectedTarget.branchId)
          ?.branch_kind ?? null);
  const activeIngredients = useMemo(() => {
    const selectable = getTransferSelectableIngredients({
      ingredients,
      sourceBranchKind: selectedSourceBranch?.branch_kind ?? null,
      targetBranchKind: isPull
        ? (policy.currentBranchKind ?? null)
        : selectedTargetBranchKind,
    });
    if (!isPull) return selectable;
    return selectable.filter((ingredient) =>
      ingredientMatchesPullFromSite(
        ingredient,
        selectedSourceBranch?.branch_kind ?? null,
      ),
    );
  }, [
    ingredients,
    isPull,
    policy.currentBranchKind,
    selectedSourceBranch?.branch_kind,
    selectedTargetBranchKind,
  ]);
  const myBranchName = policy.currentBranch
    ? formatTransferLocationLabel(
        policy.currentBranch,
        selectedSourceLocation?.kind ?? "warehouse",
      )
    : null;
  const listHref = withTransferBranchQuery(basePath, userBranchId);

  function resetForm() {
    setOutboundToBranchIdState("");
    setPullFromBranchIdState("");
    setOutboundSourceLocationId("");
    setDraftLines([]);
    setPickerIngredientId("");
  }

  function setDirection(next: TransferCreateDirection) {
    if (next === direction) return;
    if (next === "pull" && !policy.canCreatePull) return;
    if (next === "outbound" && !policy.canCreateOutbound) return;
    setDirectionState(next);
    resetForm();
  }

  function setPullFromBranchId(value: string) {
    setPullFromBranchIdState(value);
    setDraftLines([]);
    setPickerIngredientId("");
    setOutboundSourceLocationId("");
  }

  function onHandAtKind(
    kind: "central_supply" | "central_kitchen",
    ingredientId: number,
  ): number {
    const branch = branches.find((item) => item.branch_kind === kind);
    if (!branch) return 0;
    const location = getDefaultTransferSourceLocation(
      sourceLocationsByBranch[branch.id] ?? [],
    );
    if (!location) return 0;
    return sourceStockByLocation[location.id]?.[ingredientId] ?? 0;
  }

  function setOutboundToBranchId(value: string) {
    const nextTarget = parseTransferTargetValue(value);
    const nextTargetBranchKind =
      nextTarget == null
        ? null
        : (branches.find((branch) => branch.id === nextTarget.branchId)
            ?.branch_kind ?? null);
    const nextSelectable = getTransferSelectableIngredients({
      ingredients,
      sourceBranchKind: selectedSourceBranch?.branch_kind ?? null,
      targetBranchKind: nextTargetBranchKind,
    });
    const selectableIds = new Set(nextSelectable.map((item) => item.id));
    setOutboundToBranchIdState(value);
    setDraftLines((current) =>
      current.filter((line) => selectableIds.has(line.ingredientId)),
    );
    setPickerIngredientId("");
  }

  function getLineIngredient(line: TransferDraftLine) {
    return ingredients.find((item) => item.id === line.ingredientId);
  }

  function getLineUnitOptions(line: TransferDraftLine) {
    return getIssueUnitOptions(getLineIngredient(line));
  }

  function getLineMaxQuantity(line: TransferDraftLine): number {
    if (isPull) return Number.POSITIVE_INFINITY;
    return getTransferLineMaxEntryQuantity({
      line,
      ingredients,
      sourceStockByLocation,
      sourceLocationId: selectedSourceLocationId,
    });
  }

  function getLineMaxQuantityValue(line: TransferDraftLine): string {
    if (isPull) return "";
    return formatIssueMaxEntryQuantity(getLineMaxQuantity(line));
  }

  function handleOutboundSourceLocationChange(value: string) {
    const nextSourceLocation = sourceLocationOptions.find(
      (location) => String(location.id) === value,
    );
    if (!nextSourceLocation) return;
    const nextDestinationOptions = getTransferOutboundDestinationOptions({
      branches,
      sourceBranchId: policy.outboundSourceBranchId,
      sourceBranchKind: policy.currentBranchKind,
      sourceLocationKind: nextSourceLocation.kind,
    });
    setOutboundSourceLocationId(value);
    if (isPull) return;
    const nextTargetValue = nextDestinationOptions.some(
      (option) => option.value === outboundToBranchId,
    )
      ? outboundToBranchId
      : "";
    if (nextTargetValue !== outboundToBranchId) {
      setOutboundToBranchId(nextTargetValue);
    }
    setDraftLines((current) =>
      current.map((line) =>
        clampTransferLineForSource({
          line,
          ingredients,
          sourceStockByLocation,
          sourceLocationId: nextSourceLocation.id,
        }),
      ),
    );
  }

  function addIngredientLine() {
    const ingredientId = Number(pickerIngredientId);
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) {
      toast.error(messages.inventory.transfer.chooseIngredientError);
      return;
    }
    if (draftLines.some((line) => line.ingredientId === ingredientId)) {
      toast.error(messages.inventory.transfer.ingredientAlreadyAdded);
      return;
    }
    if (isPull && !pullFromBranchId) {
      const preferred = preferPullFromSite({
        allowSupply: ingredient.fulfillFromCentralSupply === true,
        allowKitchen: ingredient.fulfillFromCentralKitchen === true,
        supplyOnHand: onHandAtKind("central_supply", ingredient.id),
        kitchenOnHand: onHandAtKind("central_kitchen", ingredient.id),
      });
      const option = policy.pullSourceOptions.find(
        (item) => item.branch.branch_kind === preferred,
      );
      if (option) setPullFromBranchIdState(option.value);
    }
    const key = `${ingredient.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    setDraftLines((current) => [
      ...current,
      createTransferDraftLine(ingredient, key),
    ]);
    setPickerIngredientId("");
  }

  function addAllAvailableStockLines() {
    if (selectedSourceLocationId == null) {
      toast.error(messages.inventory.transfer.chooseSourceError);
      return;
    }
    const nextLines = createAllAvailableTransferLines({
      ingredients: activeIngredients,
      sourceStock: sourceStockByLocation[selectedSourceLocationId] ?? {},
    });
    if (nextLines.length === 0) {
      toast.error(messages.inventory.transfer.noStockToTransfer);
      return;
    }
    setDraftLines(nextLines);
    setPickerIngredientId("");
  }

  function removeLine(key: string) {
    setDraftLines((current) => current.filter((line) => line.key !== key));
  }

  function updateLine(
    key: string,
    patch: Partial<
      Pick<TransferDraftLine, "quantity" | "unit" | "entryUnitId">
    >,
  ) {
    setDraftLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function updateLineQuantity(line: TransferDraftLine, value: string) {
    updateLine(line.key, {
      quantity: clampIssueEntryQuantity(value, getLineMaxQuantity(line)),
    });
  }

  function updateLineUnit(line: TransferDraftLine, value: string) {
    const option = getLineUnitOptions(line).find(
      (item) => String(item.unitId) === value,
    );
    const nextLine = {
      ...line,
      entryUnitId: value,
      unit: option?.label ?? line.unit,
    };
    updateLine(line.key, {
      entryUnitId: value,
      unit: nextLine.unit,
      quantity: clampIssueEntryQuantity(
        line.quantity,
        getLineMaxQuantity(nextLine),
      ),
    });
  }

  function fillLineMax(line: TransferDraftLine) {
    const maxQuantity = getLineMaxQuantityValue(line);
    if (maxQuantity) updateLine(line.key, { quantity: maxQuantity });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const notes = String(formData.get("notes") ?? "") || undefined;

    if (loadFailed) {
      toast.error(messages.inventory.transfer.createDataLoadFailedDescription);
      return;
    }

    const canCreate = isPull ? policy.canCreatePull : policy.canCreateOutbound;
    if (!canCreate) {
      toast.error(messages.inventory.transfer.createForbidden);
      return;
    }

    const fromBranchId = isPull
      ? (selectedSourceBranchId ?? undefined)
      : (policy.outboundSourceBranchId ?? undefined);
    const toBranchId = isPull
      ? (userBranchId ?? undefined)
      : parseTransferTargetValue(outboundToBranchId)?.branchId;
    if (!isPull) {
      const target = parseTransferTargetValue(outboundToBranchId);
      if (!target) {
        toast.error(messages.inventory.transfer.chooseTargetError);
        return;
      }
      if (target.branchId === fromBranchId) {
        toast.error(messages.inventory.transfer.chooseTargetError);
        return;
      }
    }
    if (!fromBranchId || !toBranchId || selectedSourceLocationId == null) {
      toast.error(
        isPull
          ? messages.inventory.transfer.chooseSourceError
          : messages.inventory.transfer.chooseTargetError,
      );
      return;
    }
    if (fromBranchId === toBranchId) {
      toast.error(messages.inventory.transfer.chooseTargetError);
      return;
    }

    const linesResult = buildTransferLinesPayload({
      lines: draftLines,
      ingredients,
      sourceStockByLocation,
      sourceLocationId: selectedSourceLocationId,
      skipSourceStockCheck: isPull,
    });
    if (!linesResult.success) {
      toast.error(
        linesResult.error === "exceeds_stock"
          ? messages.inventory.transfer.stockExceeded
          : linesResult.error === "empty_lines"
            ? messages.inventory.transfer.emptyIngredientsDescription
            : messages.inventory.transfer.invalidLine,
      );
      return;
    }

    startTransition(async () => {
      const result = await createStockTransfer({
        fromBranchId,
        toBranchId,
        fromLocationId: selectedSourceLocationId,
        notes,
        lines: linesResult.lines,
      });
      if (!result.success || !result.data) {
        const applied = applyInventoryActionError(
          result,
          messages.inventory.transfer.createFailed,
        );
        const named =
          applied.lineTarget == null
            ? null
            : ingredients.find(
                (item) => item.id === applied.lineTarget?.ingredientId,
              )?.name;
        toast.error(
          inventoryShortageToastMessage(
            applied,
            named,
            messages.inventory.transfer.shortageNamed,
          ),
        );
        return;
      }
      toast.success(messages.inventory.transfer.createSuccess);
      resetForm();
      const id = (result.data as { id: number }).id;
      const detailPath = `${basePath}/${id}`;
      router.push(withTransferBranchQuery(detailPath, userBranchId));
      router.refresh();
    });
  }

  const canCreate = isPull ? policy.canCreatePull : policy.canCreateOutbound;
  const destinationReady = isPull
    ? userBranchId != null
    : Boolean(outboundToBranchId);
  const submitDisabled =
    isPending ||
    loadFailed ||
    !canCreate ||
    !destinationReady ||
    selectedSourceLocationId == null ||
    draftLines.length === 0;

  return {
    ...policy,
    activeIngredients,
    addAllAvailableStockLines,
    addIngredientLine,
    canCreate,
    direction,
    draftLines,
    fillLineMax,
    getLineMaxQuantityValue,
    getLineUnitOptions,
    handleOutboundSourceLocationChange,
    isPending,
    isPull,
    listHref,
    loadFailed,
    myBranchName,
    outboundDestinationOptions,
    outboundSourceLocationId: selectedSourceLocationValue,
    outboundSourceLocationOptions: sourceLocationOptions,
    outboundToBranchId,
    pickerIngredientId,
    pullFromBranchId: resolvedPullFromValue,
    removeLine,
    selectedSourceBranch,
    selectedSourceLocationId,
    setDirection,
    setOutboundToBranchId,
    setPickerIngredientId,
    setPullFromBranchId,
    submit,
    submitDisabled,
    updateLineQuantity,
    updateLineUnit,
  };
}
