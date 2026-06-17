"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STOCKTAKE_SESSION_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppPageHeader, AppSection } from "@/components/surface";
import { InventoryPageContent } from "../../../_components/inventory-page-layout";
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
import { messages } from "@lib/messages";
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

  // Session-wide zone id. Future: per-zone breakdown when layout supports it.
  const zoneId = `session-${sessionId}`;

  // Blind count stays defensive: the payload never includes system quantity.
  const blindMode = true;

  const currentRoundLines = useMemo(
    () => lines.filter((line) => line.roundNo === currentRound),
    [currentRound, lines],
  );

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
      toast.success(`Đã lưu ${res.data.appliedCount} dòng đếm`);
      router.refresh();
    });
  }

  return (
    <InventoryPageContent>
      <AppPageHeader
        eyebrow={messages.inventory.stocktake.title}
        title={`${messages.inventory.stocktake.startCounting} #${sessionId}`}
        description={`CN #${branchId} · Round R${currentRound}`}
      />
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
          blindMode={blindMode}
          readOnly={!editable}
          onlyNeedsRecount={currentRound > 1 ? true : undefined}
        />
        <BlindCountingGridToolbar
          onSubmit={submit}
          submitting={pending}
          canSubmit={editable && Object.keys(counts).length > 0}
        >
          <Button type="button" variant="outline" size="sm" asChild>
            <Link
              href={`/inventory/stocktake/${sessionId}?branchId=${branchId}&view=detail`}
            >
              {messages.inventory.stocktake.detail.completeAction}
            </Link>
          </Button>
          {!editable ? (
            <Button variant="outline" size="sm" disabled>
              {status === "completed"
                ? STOCKTAKE_SESSION_STATUS_LABELS_VI.completed
                : messages.inventory.stocktake.detail.updateFailed}
            </Button>
          ) : null}
        </BlindCountingGridToolbar>
      </AppSection>
    </InventoryPageContent>
  );
}
