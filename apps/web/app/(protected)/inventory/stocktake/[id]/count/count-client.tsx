"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STOCKTAKE_SESSION_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  BlindCountingGridActions,
  BlindCountingGrid,
} from "../../../_components/blind-counting-grid";
import {
  StocktakeDraftSaverBadge,
  useStocktakeDraftSaver,
  type DraftCounts,
} from "../../../_components/stocktake-draft-saver";
import { ZoneLockIndicator } from "../../../_components/zone-lock-indicator";
import { formatQty } from "@lib/inventory/format";
import { StocktakeCountWizard } from "./stocktake-count-wizard";
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
const labelWizardQuick = "Nhập nhanh từng món";
const labelSwitchTable = "Nhập theo bảng";

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
  blindMode: boolean;
  currentRound: 1 | 2 | 3 | 4;
  initialLines: StocktakeLineBlind[];
  unitOptionsByIngredient: Record<number, CountUnitOption[]>;
  routeBase?: string;
  embedded?: boolean;
}

export function StocktakeCountClient({
  sessionId,
  branchId,
  status,
  blindMode,
  currentRound,
  initialLines,
  unitOptionsByIngredient,
  routeBase = "/inventory/stocktake",
  embedded = false,
}: Props) {
  const router = useRouter();
  const [lines] = useState<StocktakeLineBlind[]>(initialLines);
  const [counts, setCounts] = useState<DraftCounts>({});
  // Per-ingredient counting unit (entry_unit_id), defaulting to purchase/pack.
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
  const [preferTableMode, setPreferTableMode] = useState<boolean>(false);

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

  // Session-wide zone id. Future: per-zone breakdown when layout supports it.
  const zoneId = `session-${sessionId}`;

  const currentRoundLines = useMemo(
    () => lines.filter((line) => line.roundNo === currentRound),
    [currentRound, lines],
  );

  // Label of the unit each count is actually recorded in (entry_unit_id), so the
  // native wizard displays the SAME unit it submits — never the purchase unit
  // while recording the base unit.
  const unitLabelByIngredient = useMemo(() => {
    const map: Record<number, string> = {};
    for (const [idStr, options] of Object.entries(unitOptionsByIngredient)) {
      const id = Number(idStr);
      const selected =
        options.find((o) => o.unitId === unitByIngredient[id]) ??
        pickDefaultCountUnit(options);
      if (selected) map[id] = selected.label;
    }
    return map;
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
      await flush(); // Force-save draft before round submit.
      const res = await submitCountRound({
        sessionId,
        roundNo: currentRound,
        counts: payload,
      });
      if (!res.success || !res.data) {
        const applied = applyInventoryActionError(
          res,
          toastSubmitRoundFailed,
        );
        toast.error(applied.toastMessage);
        return;
      }
      toast.success(toastSavedCounts(res.data.appliedCount));
      router.refresh();
    });
  }

  const header = (
    <AppPageHeader
      title={`${messages.inventory.stocktake.startCounting} #${sessionId}`}
      description={`CN #${branchId} · Round R${currentRound}`}
    />
  );

  // Safety chrome shared by both planes: draft-saver status + zone-lock
  // lifecycle. The lock indicator self-manages acquire/heartbeat/release and
  // gates `editable` through onStateChange; onLost flips it out of "held".
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
            toast.error(messages.inventory.stocktake.zoneLockLost);
          }}
        />
      ) : null}
    </>
  );

  const content = (
    <>
      {safetyChrome}

      <AppSection
        title={
          currentRound === 1
            ? messages.inventory.stocktake.startCounting
            : `R${currentRound}`
        }
        contentClassName="gap-3"
      >
        <BlindCountingGrid
          lines={currentRoundLines}
          counts={counts}
          onCountChange={onCountChange}
          unitOptionsByIngredient={unitOptionsByIngredient}
          unitByIngredient={unitByIngredient}
          unitPreviewByIngredient={unitPreviewByIngredient}
          onUnitChange={onUnitChange}
          blindMode={blindMode}
          readOnly={!editable}
          onlyNeedsRecount={currentRound > 1 ? true : undefined}
        />
        <BlindCountingGridActions
          onSubmit={submit}
          submitting={pending}
          canSubmit={editable && Object.keys(counts).length > 0}
        >
          {embedded ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setPreferTableMode(false)}
            >
              {labelWizardQuick}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size={embedded ? "touch" : "sm"}
            render={
              <Link
                href={`${routeBase}/${sessionId}?branchId=${branchId}&view=detail`}
              />
            }
          >
            {messages.inventory.stocktake.detail.completeAction}
          </Button>
          {!canCount ? (
            <Badge variant={status === "cancelled" ? "secondary" : "success"}>
              {status === "cancelled"
                ? STOCKTAKE_SESSION_STATUS_LABELS_VI.cancelled
                : STOCKTAKE_SESSION_STATUS_LABELS_VI.completed}
            </Badge>
          ) : null}
        </BlindCountingGridActions>
      </AppSection>
    </>
  );

  const showWizard = embedded && !preferTableMode;

  if (showWizard) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-end px-1">
          <Button
            type="button"
            variant="outline"
            size={embedded ? "touch" : "sm"}
            onClick={() => setPreferTableMode(true)}
          >
            {labelSwitchTable}
          </Button>
        </div>
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
          chrome={safetyChrome}
        />
      </div>
    );
  }

  return (
    <DocumentFormFrame header={header} scroll>
      {content}
    </DocumentFormFrame>
  );
}
