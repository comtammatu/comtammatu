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
import { VarianceHeatmapTable } from "../../../_components/variance-heatmap-row";
import {
  closeRecountRound,
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
  const [lockState, setLockState] = useState<
    "idle" | "acquiring" | "held" | "blocked" | "lost" | "error"
  >("idle");
  const [pending, startTransition] = useTransition();

  const canCount = status === "in_progress";
  const editable = canCount && lockState === "held";

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

  const currentRoundLines = useMemo(
    () => lines.filter((line) => line.roundNo === currentRound),
    [currentRound, lines],
  );

  const canCloseRound =
    editable &&
    currentRoundLines.length > 0 &&
    currentRoundLines.every(
      (line) => line.isFinal || line.countedQuantity !== null,
    );

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

  // Group lines by ingredient for the heatmap (R2+ recount view).
  const heatmapRows = useMemo(() => {
    if (currentRound < 2) return [];
    type Group = {
      ingredientId: number;
      ingredientName: string;
      unit: string;
      abcClass: "A" | "B" | "C" | null;
      rounds: Array<{
        roundNo: 1 | 2 | 3 | 4;
        countedQuantity: number | null;
        countedBy: string | null;
      }>;
      isFinal: boolean;
      needsRecount: boolean;
      thresholdPct: number;
    };
    const map = new Map<number, Group>();
    for (const l of lines) {
      const existing = map.get(l.ingredientId);
      const round = {
        roundNo: Math.min(4, Math.max(1, l.roundNo)) as 1 | 2 | 3 | 4,
        countedQuantity: l.countedQuantity,
        countedBy: l.countedBy,
      };
      if (existing) {
        existing.rounds.push(round);
        existing.isFinal = existing.isFinal || l.isFinal;
        existing.needsRecount = existing.needsRecount || l.needsRecount;
      } else {
        map.set(l.ingredientId, {
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          unit: l.unit,
          abcClass: l.abcClass,
          rounds: [round],
          isFinal: l.isFinal,
          needsRecount: l.needsRecount,
          thresholdPct: l.abcClass === "A" ? 3 : 5,
        });
      }
    }
    // Filter to rows that have any variance or need recount — hide perfectly
    // aligned rows so the counter focuses on outliers.
    return Array.from(map.values()).filter(
      (g) =>
        g.needsRecount ||
        g.rounds.filter((r) => typeof r.countedQuantity === "number").length >= 2,
    );
  }, [lines, currentRound]);

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

  function closeRound() {
    if (!canCloseRound) {
      toast.error("Còn dòng chưa submit, chưa thể đóng round.");
      return;
    }

    startTransition(async () => {
      const res = await closeRecountRound({
        sessionId,
        roundNo: currentRound,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không đóng round được");
        return;
      }
      const d = res.data;
      if (d.round4EscalationRequired) {
        toast.warning(
          `Round ${d.roundNo} đóng — còn ${d.needsRecountCount} dòng cần escalation R4`,
        );
        router.push(
          `/inventory/stocktake/${sessionId}/escalate?branchId=${branchId}`,
        );
        return;
      }
      if (d.nextRound) {
        toast.success(
          `Round ${d.roundNo} đóng — ${d.finalCount} final, ${d.needsRecountCount} chuyển sang R${d.nextRound}`,
        );
      } else {
        toast.success(
          `Round ${d.roundNo} đóng — ${d.finalCount} dòng đã final. Session sẵn sàng finalize.`,
        );
      }
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

        {canCount ? (
          <ZoneLockIndicator
            sessionId={sessionId}
            zoneId={zoneId}
            onStateChange={setLockState}
            onLost={() => {
              toast.error("Mất zone lock — ngừng nhập số đếm");
            }}
          />
        ) : null}

        {currentRound >= 2 ? (
          <Card>
            <CardHeader>
              <CardTitle>Biểu đồ variance R1→R{currentRound}</CardTitle>
            </CardHeader>
            <CardContent>
              <VarianceHeatmapTable rows={heatmapRows} showEscalateIcon />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>
              {currentRound === 1 ? "Danh sách đếm" : `Recount R${currentRound}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BlindCountingGrid
              lines={currentRoundLines}
              counts={counts}
              onCountChange={onCountChange}
              blindMode={blindMode}
              readOnly={!editable}
              onlyNeedsRecount={currentRound > 1 ? true : onlyRecount}
            />
            <BlindCountingGridToolbar
              onSubmit={submit}
              submitting={pending}
              canSubmit={editable && Object.keys(counts).length > 0}
              onToggleOnlyRecount={
                currentRound > 1
                  ? undefined
                  : () => setOnlyRecount((v) => !v)
              }
              onlyRecount={onlyRecount}
            >
              {!editable ? (
                <Button variant="outline" size="sm" disabled>
                  {status === "completed" ? "Đã hòan thành" : "Không thể sửa"}
                </Button>
              ) : null}
              {editable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeRound}
                  disabled={pending || !canCloseRound}
                >
                  {pending ? "Đang đóng…" : `Đóng round R${currentRound}`}
                </Button>
              ) : null}
            </BlindCountingGridToolbar>
          </CardContent>
        </Card>
      </InventoryPageContent>
    </>
  );
}
