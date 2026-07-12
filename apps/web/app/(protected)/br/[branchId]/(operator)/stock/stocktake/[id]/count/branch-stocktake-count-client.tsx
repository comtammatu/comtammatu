/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCount } from "@comtammatu/shared/format";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDetailFooter } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import {
  type BranchStocktakeCountData,
  type BranchStocktakeCountUnit,
} from "@lib/inventory/stocktake-model";
import { messages } from "@lib/messages";
import { formatQty } from "@/(protected)/inventory/_lib/format";
import {
  StocktakeDraftSaverBadge,
  type DraftCounts,
  useStocktakeDraftSaver,
} from "@/(protected)/inventory/_components/stocktake-draft-saver";
import { ZoneLockIndicator } from "@/(protected)/inventory/_components/zone-lock-indicator";
import { StocktakeCountWizard } from "@/(protected)/inventory/stocktake/[id]/count/stocktake-count-wizard";
import { submitCountRound } from "@/(protected)/inventory/stocktake-actions";

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
      ? baseUnit
      : (options.find((option) => option.unitId === selectedUnitId) ??
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
    Object.fromEntries(
      data.lines
        .filter(
          (line) =>
            line.roundNo === data.currentRound && line.countedQuantity !== null,
        )
        .map((line) => [
          String(line.ingredientId),
          { qty: line.countedQuantity ?? 0, savedAt: line.countedAt ?? "" },
        ]),
    ),
  );
  const [unitByIngredient, setUnitByIngredient] = useState<
    Record<number, number>
  >(() => {
    const next: Record<number, number> = {};
    for (const [ingredientId, options] of Object.entries(
      data.unitOptionsByIngredient,
    )) {
      const base = options.find((option) => option.isBase) ?? options[0];
      if (base) next[Number(ingredientId)] = base.unitId;
    }
    return next;
  });
  const [lockState, setLockState] = useState<
    "idle" | "acquiring" | "held" | "blocked" | "lost" | "error"
  >("idle");
  const [isPending, startTransition] = useTransition();
  const currentRoundLines = useMemo(
    () => lines.filter((line) => line.roundNo === data.currentRound),
    [data.currentRound, lines],
  );
  const editable = data.status === "in_progress" && lockState === "held";
  const countedLines = currentRoundLines.filter(
    (line) => typeof counts[String(line.ingredientId)]?.qty === "number",
  ).length;
  const {
    status: saveStatus,
    lastSavedAt,
    flush,
  } = useStocktakeDraftSaver({
    sessionId: data.sessionId,
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
        ) ??
        options.find((option) => option.isBase) ??
        options[0];
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
      return [
        {
          ingredient_id: line.ingredientId,
          counted_quantity: entry.qty,
          entry_unit_id: unitByIngredient[line.ingredientId] ?? null,
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
        toast.error(result.error ?? "Không submit được vòng đếm");
        return;
      }
      toast.success(`Đã lưu ${formatCount(result.data.appliedCount)} dòng đếm`);
      router.push(`${stocktakeBasePath}/${data.sessionId}?view=detail`);
    });
  }

  const stocktakeCopy = messages.inventory.stocktake;
  const safetyChrome = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StocktakeDraftSaverBadge
          status={saveStatus}
          lastSavedAt={lastSavedAt}
        />
      </div>
      {data.status === "in_progress" ? (
        <ZoneLockIndicator
          sessionId={data.sessionId}
          zoneId={`session-${data.sessionId}`}
          onStateChange={setLockState}
          onLost={() => toast.error(stocktakeCopy.zoneLockLost)}
          className="data-[kind=held]:sr-only"
        />
      ) : null}
    </div>
  );

  return (
    <BranchOperatorPage
      title={`KK-${data.sessionId}`}
      description={`${data.blindMode ? "Đếm mù" : "Đếm kiểm kê"} · Round R${data.currentRound}`}
      backHref={`${stocktakeBasePath}/${data.sessionId}?view=detail`}
      backLabel="Phiên kiểm kê"
      action={
        <Button asChild variant="outline" size="touch">
          <Link href={`${stocktakeBasePath}/${data.sessionId}?view=detail`}>
            Xem & chốt
          </Link>
        </Button>
      }
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <StocktakeCountWizard
          lines={currentRoundLines}
          counts={counts}
          onCountChange={onCountChange}
          onUnitChange={onUnitChange}
          unitOptionsByIngredient={data.unitOptionsByIngredient}
          unitByIngredient={unitByIngredient}
          showFooter={false}
          onSubmit={submit}
          submitting={isPending}
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
                ? "Đang lưu"
                : countedLines < currentRoundLines.length
                  ? `Nộp ${formatCount(countedLines)}/${formatCount(
                      currentRoundLines.length,
                    )} dòng`
                  : "Nộp vòng đếm"}
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
