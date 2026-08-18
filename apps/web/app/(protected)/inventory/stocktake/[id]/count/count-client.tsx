"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppBackLink,
  AppPageHeader,
  DocumentFormFrame,
} from "@/components/surface";
import { StocktakeCountWizard } from "./stocktake-count-wizard";
import {
  StocktakeDraftSaverBadge,
  useStocktakeDraftSaver,
  type DraftCounts,
} from "../../../_components/stocktake-draft-saver";
import { ZoneLockIndicator } from "../../../_components/zone-lock-indicator";
import { formatQty } from "@lib/inventory/format";
import { messages } from "@lib/messages";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";
import {
  submitCountRound,
  type StocktakeLineBlind,
} from "../../../stocktake-actions";
import {
  pickDefaultCountUnit,
  type CountUnitOption,
} from "../../../_lib/count-units";

const toastNoCountsInput = "Chưa nhập số đếm nào";
const toastSubmitRoundFailed = "Không thể gửi kết quả đếm";
const toastSavedCounts = (count: number) => `Đã lưu ${count} dòng đếm`;

function buildCountUnitPreview({
  quantity,
  selectedUnitId,
  options,
}: {
  quantity: number | null;
  selectedUnitId: number | null;
  options: CountUnitOption[];
}): string | null {
  const baseUnit =
    options.find((option) => option.isBase) ?? options[0] ?? null;
  const selectedUnit =
    selectedUnitId == null
      ? (pickDefaultCountUnit(options) ?? baseUnit)
      : (options.find((option) => option.unitId === selectedUnitId) ??
        pickDefaultCountUnit(options) ??
        baseUnit);
  if (!baseUnit || !selectedUnit || selectedUnit.isBase) return null;

  const factor = selectedUnit.toBaseFactor;
  if (!Number.isFinite(factor) || factor <= 0) {
    return INVENTORY_VI.conversionMissing;
  }

  const displayQuantity = quantity ?? 1;
  return `${INVENTORY_VI.convertedColon} ${formatQty(displayQuantity)} ${selectedUnit.code} = ${formatQty(displayQuantity * factor)} ${baseUnit.code}`;
}

interface Props {
  sessionId: number;
  branchId: number;
  status: string;
  /** RPC flag; pad never shows book qty regardless of this value. */
  blindMode: boolean;
  currentRound: 1 | 2 | 3 | 4;
  initialLines: StocktakeLineBlind[];
  unitOptionsByIngredient: Record<number, CountUnitOption[]>;
  routeBase?: string;
}

export function StocktakeCountClient({
  sessionId,
  branchId,
  status,
  currentRound,
  initialLines,
  unitOptionsByIngredient,
  routeBase = "/inventory/stocktake",
}: Props) {
  const router = useRouter();
  const stocktakeCopy = messages.inventory.stocktake;
  const [lines] = useState<StocktakeLineBlind[]>(initialLines);
  const [counts, setCounts] = useState<DraftCounts>({});
  const [unitByIngredient, setUnitByIngredient] = useState<
    Record<number, number>
  >(() => {
    const next: Record<number, number> = {};
    for (const [ingredientId, options] of Object.entries(
      unitOptionsByIngredient,
    )) {
      const preferred = pickDefaultCountUnit(options);
      if (preferred) next[Number(ingredientId)] = preferred.unitId;
    }
    return next;
  });
  const [lockState, setLockState] = useState<
    "idle" | "acquiring" | "held" | "blocked" | "lost" | "error"
  >("idle");
  const [pending, startTransition] = useTransition();
  const canCount = status === "in_progress";
  const editable = canCount && lockState === "held";

  const {
    status: saveStatus,
    lastSavedAt,
    flush,
  } = useStocktakeDraftSaver({
    sessionId,
    counts,
    enabled: editable,
  });

  const zoneId = `session-${sessionId}`;
  const detailHref = `${routeBase}/${sessionId}?branch=${branchId}&view=detail`;

  const currentRoundLines = useMemo(
    () => lines.filter((line) => line.roundNo === currentRound),
    [currentRound, lines],
  );

  const unitLabelByIngredient = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const [id, options] of Object.entries(unitOptionsByIngredient)) {
      const ingredientId = Number(id);
      const selected =
        options.find(
          (option) => option.unitId === unitByIngredient[ingredientId],
        ) ?? pickDefaultCountUnit(options);
      if (selected) labels[ingredientId] = selected.label;
    }
    return labels;
  }, [unitOptionsByIngredient, unitByIngredient]);

  const unitPreviewByIngredient = useMemo(() => {
    const map: Record<number, string> = {};
    for (const line of currentRoundLines) {
      const preview = buildCountUnitPreview({
        quantity: counts[String(line.ingredientId)]?.qty ?? null,
        selectedUnitId: unitByIngredient[line.ingredientId] ?? null,
        options: unitOptionsByIngredient[line.ingredientId] ?? [],
      });
      if (preview) map[line.ingredientId] = preview;
    }
    return map;
  }, [counts, currentRoundLines, unitOptionsByIngredient, unitByIngredient]);

  function onCountChange(ingredientId: number, qty: number | null) {
    setCounts((prev) => {
      const next = { ...prev };
      if (qty === null) {
        delete next[String(ingredientId)];
      } else {
        next[String(ingredientId)] = {
          qty,
          savedAt: new Date().toISOString(),
        };
      }
      return next;
    });
  }

  function onUnitChange(ingredientId: number, unitId: number) {
    setUnitByIngredient((prev) => ({ ...prev, [ingredientId]: unitId }));
  }

  function submit() {
    const payload = Object.entries(counts)
      .filter(([, v]) => typeof v?.qty === "number")
      .map(([ingredientId, v]) => ({
        ingredient_id: Number(ingredientId),
        counted_quantity: v.qty,
        entry_unit_id: unitByIngredient[Number(ingredientId)] ?? null,
      }));

    if (payload.length === 0) {
      toast.error(toastNoCountsInput);
      return;
    }

    startTransition(async () => {
      await flush();
      const res = await submitCountRound({
        sessionId,
        roundNo: currentRound,
        counts: payload,
      });
      if (!res.success || !res.data) {
        const applied = applyInventoryActionError(res, toastSubmitRoundFailed);
        toast.error(applied.toastMessage);
        return;
      }
      toast.success(toastSavedCounts(res.data.appliedCount));
      router.push(detailHref);
    });
  }

  const safetyChrome = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <StocktakeDraftSaverBadge
          status={saveStatus}
          lastSavedAt={lastSavedAt}
        />
      </div>
      {canCount ? (
        <ZoneLockIndicator
          sessionId={sessionId}
          zoneId={zoneId}
          onStateChange={setLockState}
          onLost={() => {
            toast.error(stocktakeCopy.zoneLockLost);
          }}
        />
      ) : null}
    </>
  );

  return (
    <DocumentFormFrame
      header={
        <AppPageHeader
          breadcrumb={
            <AppBackLink href={detailHref}>
              {stocktakeCopy.detail.reviewTitle}
            </AppBackLink>
          }
          title={stocktakeCopy.countNative.countMode(currentRound)}
          meta={`KK-${sessionId}`}
        />
      }
      scroll
    >
      <StocktakeCountWizard
        lines={currentRoundLines}
        counts={counts}
        onCountChange={onCountChange}
        onSubmit={submit}
        submitting={pending}
        editable={editable}
        currentRound={currentRound}
        unitLabelByIngredient={unitLabelByIngredient}
        unitPreviewByIngredient={unitPreviewByIngredient}
        unitOptionsByIngredient={unitOptionsByIngredient}
        unitByIngredient={unitByIngredient}
        onUnitChange={onUnitChange}
        chrome={safetyChrome}
      />
    </DocumentFormFrame>
  );
}
