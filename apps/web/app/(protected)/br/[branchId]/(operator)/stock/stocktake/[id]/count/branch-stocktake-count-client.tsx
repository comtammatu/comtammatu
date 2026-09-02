"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCount } from "@comtammatu/shared/format";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppBackLink, AppDetailFooter } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import {
  buildInitialStocktakeCounts,
  type BranchStocktakeCountData,
  type BranchStocktakeCountUnit,
} from "@lib/inventory/stocktake-model";
import { messages } from "@lib/messages";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";
import { formatQty } from "@lib/inventory/format";
import {
  getDefaultIngredientUnit,
  getLargestIngredientUnit,
} from "@lib/inventory/unit-options";
import {
  StocktakeDraftSaverBadge,
  type DraftCounts,
  useStocktakeDraftSaver,
} from "@/(protected)/inventory/_components/stocktake-draft-saver";
import { StocktakePrintDialog } from "@/components/inventory/stocktake-print-dialog";
import { BranchStocktakeCountList } from "./branch-stocktake-count-list";
import { submitCountRound } from "@/(protected)/inventory/stocktake-actions";

function pickBranchDefaultCountUnit(options: BranchStocktakeCountUnit[]) {
  return getLargestIngredientUnit(options) ?? getDefaultIngredientUnit(options);
}

function buildCountUnitPreview({
  quantity,
  selectedUnitId,
  options,
}: {
  quantity: number | null;
  selectedUnitId: number | null;
  options: BranchStocktakeCountUnit[];
}): string | null {
  const baseUnit =
    options.find((option) => option.isBase) ?? options[0] ?? null;
  const selectedUnit =
    selectedUnitId === null
      ? (pickBranchDefaultCountUnit(options) ?? baseUnit)
      : (options.find((option) => option.unitId === selectedUnitId) ??
        pickBranchDefaultCountUnit(options) ??
        baseUnit);
  if (!baseUnit || !selectedUnit || selectedUnit.isBase) return null;

  const factor = selectedUnit.toBaseFactor;
  if (!Number.isFinite(factor) || factor <= 0) {
    return INVENTORY_VI.conversionMissing;
  }

  const displayQuantity = quantity ?? 1;
  return `${INVENTORY_VI.convertedColon} ${formatQty(displayQuantity)} ${selectedUnit.code} = ${formatQty(displayQuantity * factor)} ${baseUnit.code}`;
}

export function BranchStocktakeCountClient({
  data,
}: {
  data: BranchStocktakeCountData;
}) {
  const router = useRouter();
  const stocktakeBasePath = `/br/${data.branchId}/stock/stocktake`;
  const [lines] = useState(data.lines);
  const [counts, setCounts] = useState<DraftCounts>(() =>
    buildInitialStocktakeCounts(
      data.lines,
      data.currentRound,
      data.initialDraftCounts,
    ),
  );
  const [unitByIngredient, setUnitByIngredient] = useState<
    Record<number, number>
  >(() => {
    const next: Record<number, number> = {};
    for (const [ingredientId, options] of Object.entries(
      data.unitOptionsByIngredient,
    )) {
      const preferred = pickBranchDefaultCountUnit(options);
      if (preferred) next[Number(ingredientId)] = preferred.unitId;
    }
    return next;
  });
  const [isPending, startTransition] = useTransition();
  const currentRoundLines = useMemo(
    () => lines.filter((line) => line.roundNo === data.currentRound),
    [data.currentRound, lines],
  );
  const editable = data.status === "in_progress";
  const countedLines = currentRoundLines.filter(
    (line) => typeof counts[String(line.ingredientId)]?.qty === "number",
  ).length;
  const {
    status: saveStatus,
    lastSavedAt,
    flush,
  } = useStocktakeDraftSaver({
    sessionId: data.sessionId,
    roundNo: data.currentRound,
    counts,
    enabled: editable,
  });

  const unitLabelByIngredient = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const [id, options] of Object.entries(data.unitOptionsByIngredient)) {
      const ingredientId = Number(id);
      const selected =
        options.find(
          (option) => option.unitId === unitByIngredient[ingredientId],
        ) ?? pickBranchDefaultCountUnit(options);
      if (selected) labels[ingredientId] = selected.label;
    }
    return labels;
  }, [data.unitOptionsByIngredient, unitByIngredient]);

  const unitPreviewByIngredient = useMemo(() => {
    const previews: Record<number, string> = {};
    for (const line of currentRoundLines) {
      const preview = buildCountUnitPreview({
        quantity: counts[String(line.ingredientId)]?.qty ?? null,
        selectedUnitId: unitByIngredient[line.ingredientId] ?? null,
        options: data.unitOptionsByIngredient[line.ingredientId] ?? [],
      });
      if (preview) previews[line.ingredientId] = preview;
    }
    return previews;
  }, [
    counts,
    currentRoundLines,
    data.unitOptionsByIngredient,
    unitByIngredient,
  ]);

  function onCountChange(ingredientId: number, quantity: number | null) {
    setCounts((current) => {
      const next = { ...current };
      if (quantity === null) {
        delete next[String(ingredientId)];
      } else {
        next[String(ingredientId)] = {
          qty: quantity,
          savedAt: new Date().toISOString(),
        };
      }
      return next;
    });
  }

  function onUnitChange(ingredientId: number, unitId: number) {
    setUnitByIngredient((current) => ({ ...current, [ingredientId]: unitId }));
  }

  function submit() {
    const payload = currentRoundLines.flatMap((line) => {
      const entry = counts[String(line.ingredientId)];
      if (typeof entry?.qty !== "number") return [];
      const options = data.unitOptionsByIngredient[line.ingredientId] ?? [];
      const baseUnit = options.find((opt) => opt.isBase) ?? options[0];
      return [
        {
          ingredient_id: line.ingredientId,
          counted_quantity: entry.qty,
          entry_unit_id: baseUnit?.unitId ?? null,
        },
      ];
    });
    if (payload.length === 0) {
      toast.error("Chưa nhập số đếm nào");
      return;
    }

    startTransition(async () => {
      await flush();
      const result = await submitCountRound({
        sessionId: data.sessionId,
        roundNo: data.currentRound,
        counts: payload,
      });
      if (!result.success || !result.data) {
        const applied = applyInventoryActionError(
          result,
          "Không gửi được vòng đếm. Kiểm tra quyền và trạng thái phiên.",
        );
        toast.error(applied.toastMessage);
        return;
      }
      toast.success(`Đã lưu ${formatCount(result.data.appliedCount)} dòng đếm`);
      router.push(`${stocktakeBasePath}/${data.sessionId}?view=detail`);
    });
  }

  const stocktakeCopy = messages.inventory.stocktake;
  const countCopy = stocktakeCopy.countNative;
  const remaining = currentRoundLines.length - countedLines;
  const safetyChrome = (
    <div className="flex flex-wrap items-center gap-2">
      <StocktakeDraftSaverBadge status={saveStatus} lastSavedAt={lastSavedAt} />
    </div>
  );

  const printLines = useMemo(
    () =>
      currentRoundLines.map((line) => ({
        id: line.lineId,
        ingredientId: line.ingredientId,
        ingredientName: line.ingredientName,
        unit: line.unit,
        countedQuantity:
          counts[String(line.ingredientId)]?.qty ?? line.countedQuantity,
      })),
    [counts, currentRoundLines],
  );

  const printSession = useMemo(
    () => ({
      id: data.sessionId,
      sessionNumber: data.sessionNumber,
      branchId: data.branchId,
      status: data.status,
      currentRound: data.currentRound,
    }),
    [
      data.branchId,
      data.currentRound,
      data.sessionId,
      data.sessionNumber,
      data.status,
    ],
  );

  return (
    <BranchOperatorPage
      title={countCopy.countMode(data.currentRound)}
      description={data.sessionNumber}
      back={
        <AppBackLink
          href={`${stocktakeBasePath}/${data.sessionId}?view=detail`}
        />
      }
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="touch"
            className="min-w-36 flex-1"
            render={
              <Link
                href={`${stocktakeBasePath}/${data.sessionId}?view=detail`}
              />
            }
          >
            {countCopy.openReview}
          </Button>
          <StocktakePrintDialog
            session={printSession}
            lines={printLines}
            unitOptionsByIngredient={data.unitOptionsByIngredient}
            buttonSize="touch"
            buttonVariant="outline"
            className="min-w-36 flex-1"
          />
        </div>

        <BranchStocktakeCountList
          lines={currentRoundLines}
          counts={counts}
          onCountChange={onCountChange}
          onUnitChange={onUnitChange}
          unitOptionsByIngredient={data.unitOptionsByIngredient}
          unitByIngredient={unitByIngredient}
          editable={editable}
          currentRound={data.currentRound}
          unitLabelByIngredient={unitLabelByIngredient}
          unitPreviewByIngredient={unitPreviewByIngredient}
          chrome={safetyChrome}
        />

        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size="touch-lg"
              onClick={submit}
              disabled={!editable || isPending || countedLines === 0}
            >
              {isPending
                ? countCopy.saving
                : remaining > 0
                  ? countCopy.countSubmitRemaining(remaining)
                  : countCopy.countSubmitAll}
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
