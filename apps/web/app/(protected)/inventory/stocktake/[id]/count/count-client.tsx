"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STOCKTAKE_SESSION_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  BlindCountingGrid,
  BlindCountingGridToolbar,
} from "../../../_components/blind-counting-grid";
import {
  StocktakeDraftSaverBadge,
  useStocktakeDraftSaver,
  type DraftCounts,
} from "../../../_components/stocktake-draft-saver";
import { ZoneLockIndicator } from "../../../_components/zone-lock-indicator";
import { StocktakeCountWizard } from "./stocktake-count-wizard";
import { messages } from "@lib/messages";
import {
  submitCountRound,
  type StocktakeLineBlind,
} from "../../../stocktake-actions";
import type { CountUnitOption } from "../../../_lib/count-units";

const toastNoCountsInput = "Chưa nhập số đếm nào";
const toastSubmitRoundFailed = "Không submit được round";
const toastSavedCounts = (count: number) => `Đã lưu ${count} dòng đếm`;
const labelWizardQuick = "Nhập nhanh (Wizard)";
const labelSwitchTable = "Chuyển sang Nhập Bảng";

interface Props {
  sessionId: number;
  branchId: number;
  status: string;
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
  currentRound,
  initialLines,
  unitOptionsByIngredient,
  routeBase = "/inventory/stocktake",
  embedded = false,
}: Props) {
  const router = useRouter();
  const [lines] = useState<StocktakeLineBlind[]>(initialLines);
  const [counts, setCounts] = useState<DraftCounts>({});
  // Per-ingredient counting unit (entry_unit_id), defaulting to the base unit.
  const [unitByIngredient, setUnitByIngredient] = useState<
    Record<number, number>
  >(() => {
    const next: Record<number, number> = {};
    for (const [ingredientId, options] of Object.entries(
      unitOptionsByIngredient,
    )) {
      const base = options.find((o) => o.isBase) ?? options[0];
      if (base) next[Number(ingredientId)] = base.unitId;
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

  // Blind count stays defensive: the payload never includes system quantity.
  const blindMode = true;

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
        options.find((o) => o.isBase) ??
        options[0];
      if (selected) map[id] = selected.label;
    }
    return map;
  }, [unitOptionsByIngredient, unitByIngredient]);

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
        toast.error(res.error ?? toastSubmitRoundFailed);
        return;
      }
      toast.success(toastSavedCounts(res.data.appliedCount));
      router.refresh();
    });
  }

  const header = (
    <AppPageHeader
      eyebrow={messages.inventory.stocktake.title}
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
          onUnitChange={onUnitChange}
          blindMode={blindMode}
          readOnly={!editable}
          onlyNeedsRecount={currentRound > 1 ? true : undefined}
        />
        <BlindCountingGridToolbar
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
            asChild
          >
            <Link
              href={`${routeBase}/${sessionId}?branchId=${branchId}&view=detail`}
            >
              {messages.inventory.stocktake.detail.completeAction}
            </Link>
          </Button>
          {!editable ? (
            <Button variant="outline" size={embedded ? "touch" : "sm"} disabled>
              {status === "completed"
                ? STOCKTAKE_SESSION_STATUS_LABELS_VI.completed
                : messages.inventory.stocktake.detail.updateFailed}
            </Button>
          ) : null}
        </BlindCountingGridToolbar>
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
