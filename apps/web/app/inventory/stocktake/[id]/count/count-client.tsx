"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { toast } from "@comtammatu/ui/components/sonner";
import { InventoryHeader } from "../../../_components/inventory-header";
import { InventoryPageContent } from "../../../_components/inventory-page-layout";
import { RoundProgressStepper } from "../../../_components/round-progress-stepper";
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
import {
  submitCountRound,
  type StocktakeLineBlind,
} from "../../../stocktake-actions";

interface Props {
  sessionId: number;
  branchId: number;
  status: string;
  currentRound: 1 | 2 | 3 | 4;
  initialLines: StocktakeLineBlind[];
}

export function StocktakeCountClient({
  sessionId,
  branchId,
  status,
  currentRound,
  initialLines,
}: Props) {
  const router = useRouter();
  const [lines] = useState<StocktakeLineBlind[]>(initialLines);
  const [counts, setCounts] = useState<DraftCounts>({});
  const [onlyRecount, setOnlyRecount] = useState(false);
  const [lockLost, setLockLost] = useState(false);
  const [pending, startTransition] = useTransition();

  const editable = status === "in_progress" && !lockLost;

  const { status: saveStatus, lastSavedAt, flush } = useStocktakeDraftSaver({
    sessionId,
    counts,
    enabled: editable,
  });

  // Session-wide zone id. Future: per-zone breakdown when layout supports it.
  const zoneId = `session-${sessionId}`;

  // Blind mode flag — derived per-round (R1 blind by mode default, R2+ counter
  // should see variance). For now we treat all as blind; R4 flips when escalated.
  const blindMode = currentRound < 4;

  const finalByRound: Partial<Record<1 | 2 | 3 | 4, number>> = useMemo(() => {
    const out: Record<number, number> = {};
    for (const l of lines) {
      if (l.isFinal) out[l.roundNo] = (out[l.roundNo] ?? 0) + 1;
    }
    return out as Partial<Record<1 | 2 | 3 | 4, number>>;
  }, [lines]);

  const needsRecountByRound: Partial<Record<1 | 2 | 3 | 4, number>> = useMemo(() => {
    const out: Record<number, number> = {};
    for (const l of lines) {
      if (l.needsRecount) out[l.roundNo] = (out[l.roundNo] ?? 0) + 1;
    }
    return out as Partial<Record<1 | 2 | 3 | 4, number>>;
  }, [lines]);

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

  function submit() {
    const payload = Object.entries(counts)
      .filter(([, v]) => typeof v?.qty === "number")
      .map(([ingredientId, v]) => ({
        ingredient_id: Number(ingredientId),
        counted_quantity: v.qty,
      }));

    if (payload.length === 0) {
      toast.error("Chưa nhập số đếm nào");
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
        toast.error(res.error ?? "Không submit được round");
        return;
      }
      toast.success(
        `Round ${res.data.roundNo} — áp dụng ${res.data.appliedCount}, conflict ${res.data.conflictCount}`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <InventoryHeader
        title={`Đếm kiểm kê #${sessionId}`}
        description={`CN #${branchId} · Round R${currentRound}`}
      />
      <InventoryPageContent>
        <div className="flex flex-wrap items-center gap-3">
          <RoundProgressStepper
            currentRound={currentRound}
            finalByRound={finalByRound}
            needsRecountByRound={needsRecountByRound}
            round4Escalated={currentRound === 4}
          />
          <StocktakeDraftSaverBadge
            status={saveStatus}
            lastSavedAt={lastSavedAt}
          />
        </div>

        {editable ? (
          <ZoneLockIndicator
            sessionId={sessionId}
            zoneId={zoneId}
            onLost={() => {
              setLockLost(true);
              toast.error("Mất zone lock — ngừng nhập số đếm");
            }}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Danh sách đếm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BlindCountingGrid
              lines={lines}
              counts={counts}
              onCountChange={onCountChange}
              blindMode={blindMode}
              readOnly={!editable}
              onlyNeedsRecount={onlyRecount}
            />
            <BlindCountingGridToolbar
              onSubmit={submit}
              submitting={pending}
              canSubmit={editable && Object.keys(counts).length > 0}
              onToggleOnlyRecount={
                currentRound > 1
                  ? () => setOnlyRecount((v) => !v)
                  : undefined
              }
              onlyRecount={onlyRecount}
            >
              {!editable ? (
                <Button variant="outline" size="sm" disabled>
                  {status === "completed" ? "Đã hoàn thành" : "Không thể sửa"}
                </Button>
              ) : null}
            </BlindCountingGridToolbar>
          </CardContent>
        </Card>
      </InventoryPageContent>
    </>
  );
}
