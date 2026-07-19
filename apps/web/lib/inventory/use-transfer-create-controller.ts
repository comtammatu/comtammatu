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
  buildTransferLinesPayload,
  clampTransferLineForSource,
  createAllAvailableTransferLines,
  createTransferDraftLine,
  getDefaultTransferSourceLocation,
  getTransferSelectableIngredients,
  getTransferSourceLocationOptions,
  getTransferOutboundDestinationOptions,
  formatTransferLocationLabel,
  formatTransferTargetOption,
  getTransferLineMaxEntryQuantity,
  parseTransferTargetValue,
  resolveTransferCreatePolicy,
  withTransferBranchQuery,
  type BranchForTransfer,
  type TransferDraftLine,
  type TransferIngredientOption,
  type TransferSourceLocation,
} from "./transfer-create-model";

interface UseTransferCreateControllerOptions {
  branches: BranchForTransfer[];
  ingredients: TransferIngredientOption[];
  sourceLocationsByBranch: Record<number, TransferSourceLocation[]>;
  sourceStockByLocation: Record<number, Record<number, number>>;
  userBranchId: number | null;
  loadFailed: boolean;
  basePath: string;
}

export function useTransferCreateController({
  branches,
  ingredients,
  sourceLocationsByBranch,
  sourceStockByLocation,
  userBranchId,
  loadFailed,
  basePath,
}: UseTransferCreateControllerOptions) {
  const router = useRouter();
  const policy = useMemo(
    () => resolveTransferCreatePolicy({ branches, userBranchId }),
    [branches, userBranchId],
  );
  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [outboundSourceLocationId, setOutboundSourceLocationId] = useState("");
  const [draftLines, setDraftLines] = useState<TransferDraftLine[]>([]);
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedSourceBranchId = policy.outboundSourceBranchId;
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
          sourceBranchKind: selectedSourceBranch?.branch_kind ?? null,
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
  const activeIngredients = useMemo(
    () =>
      getTransferSelectableIngredients({
        ingredients,
        sourceBranchKind: selectedSourceBranch?.branch_kind ?? null,
      }),
    [ingredients, selectedSourceBranch?.branch_kind],
  );
  const myBranchName = policy.currentBranch
    ? formatTransferLocationLabel(
        policy.currentBranch,
        selectedSourceLocation?.kind ?? "warehouse",
      )
    : null;
  const outboundDestinationName = useMemo(() => {
    const option = outboundDestinationOptions.find(
      (item) => item.value === outboundToBranchId,
    );
    return option ? formatTransferTargetOption(option) : null;
  }, [outboundDestinationOptions, outboundToBranchId]);
  const listHref = withTransferBranchQuery(basePath, userBranchId);

  function resetForm() {
    setOutboundToBranchId("");
    setOutboundSourceLocationId("");
    setDraftLines([]);
    setPickerIngredientId("");
  }

  function getLineIngredient(line: TransferDraftLine) {
    return ingredients.find((item) => item.id === line.ingredientId);
  }

  function getLineUnitOptions(line: TransferDraftLine) {
    return getIssueUnitOptions(getLineIngredient(line));
  }

  function getLineMaxQuantity(line: TransferDraftLine): number {
    return getTransferLineMaxEntryQuantity({
      line,
      ingredients,
      sourceStockByLocation,
      sourceLocationId: selectedSourceLocationId,
    });
  }

  function getLineMaxQuantityValue(line: TransferDraftLine): string {
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
    setOutboundToBranchId((current) =>
      nextDestinationOptions.some((option) => option.value === current)
        ? current
        : "",
    );
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
    const vehicleInfo = String(formData.get("vehicleInfo") ?? "") || undefined;

    if (loadFailed) {
      toast.error(messages.inventory.transfer.createDataLoadFailedDescription);
      return;
    }

    if (!policy.canCreateOutbound) {
      toast.error(messages.inventory.transfer.createForbidden);
      return;
    }

    const fromBranchId = policy.outboundSourceBranchId ?? undefined;
    const target = parseTransferTargetValue(outboundToBranchId);
    if (!target) {
      toast.error(messages.inventory.transfer.chooseTargetError);
      return;
    }
    if (target.kind === "kitchen" || target.branchId === fromBranchId) {
      toast.error("Bếp chi nhánh đã tắt. Chi nhánh chỉ còn một kho duy nhất.");
      return;
    }
    const toBranchId = target.branchId;
    if (!fromBranchId || !toBranchId || selectedSourceLocationId == null) {
      toast.error(messages.inventory.transfer.chooseSourceError);
      return;
    }

    const linesResult = buildTransferLinesPayload({
      lines: draftLines,
      ingredients,
      sourceStockByLocation,
      sourceLocationId: selectedSourceLocationId,
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
        vehicleInfo,
        toLocationKind: "default_receive",
        lines: linesResult.lines,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? messages.inventory.transfer.createFailed);
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

  const submitDisabled =
    isPending ||
    loadFailed ||
    !policy.canCreateOutbound ||
    !outboundToBranchId ||
    selectedSourceLocationId == null ||
    draftLines.length === 0;

  return {
    ...policy,
    activeIngredients,
    addAllAvailableStockLines,
    addIngredientLine,
    draftLines,
    fillLineMax,
    getLineMaxQuantityValue,
    getLineUnitOptions,
    handleOutboundSourceLocationChange,
    isPending,
    listHref,
    loadFailed,
    myBranchName,
    outboundDestinationName,
    outboundDestinationOptions,
    outboundSourceLocationId: selectedSourceLocationValue,
    outboundSourceLocationOptions: sourceLocationOptions,
    outboundToBranchId,
    pickerIngredientId,
    removeLine,
    selectedSourceLocationId,
    setOutboundToBranchId,
    setPickerIngredientId,
    submit,
    submitDisabled,
    updateLineQuantity,
    updateLineUnit,
  };
}
