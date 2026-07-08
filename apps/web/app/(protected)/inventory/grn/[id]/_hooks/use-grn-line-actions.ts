"use client";

import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { notify } from "@comtammatu/ui/lib/notify";
import { m, messages } from "@lib/messages";
import { confirmGrn } from "../../../procurement-actions";
import { deleteGrnLine, upsertGrnLine } from "../../../grn-actions";
import {
  deriveVariance,
  grnCopy,
  type EditableLine,
  type GRNDetail,
} from "../views/grn-detail-types";

interface UseGrnLineActionsArgs {
  grn: GRNDetail;
  qc: GRNDetail["qcSettings"];
  isMobile: boolean;
  lines: EditableLine[];
  dirtyLines: EditableLine[];
  setLines: Dispatch<SetStateAction<EditableLine[]>>;
  startSave: TransitionStartFunction;
  startConfirm: TransitionStartFunction;
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  purchaseOrdersBasePath?: string;
}

interface UseGrnLineActionsReturn {
  handleSave: () => Promise<void>;
  handleDeleteLine: (line: EditableLine) => Promise<void>;
  upsertLocalLine: (line: EditableLine) => void;
  handleConfirmGrn: () => Promise<void>;
}

/**
 * Mutation handlers for the GRN detail view. The `startSave`/`startConfirm`
 * transitions are owned by the orchestrator (shared with the Add dialog's
 * pending state), so they are passed in rather than created here.
 */
export function useGrnLineActions({
  grn,
  qc,
  isMobile,
  lines,
  dirtyLines,
  setLines,
  startSave,
  startConfirm,
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  purchaseOrdersBasePath = "/inventory/purchase-orders",
}: UseGrnLineActionsArgs): UseGrnLineActionsReturn {
  const router = useRouter();

  async function handleSave() {
    if (dirtyLines.length === 0) {
      notify.info(messages.inventory.grn.saveEmpty);
      return;
    }
    startSave(async () => {
      let okCount = 0;
      const savedLineIds = new Set<number>();
      for (const l of dirtyLines) {
        const res = await upsertGrnLine({
          grnId: grn.id,
          ingredientId: l.ingredientId,
          receivedQuantity: l.actual,
          entryUnitId: l.entryUnitId,
          unitCost: l.cost,
          qualityStatus: l.qualityStatus,
          rejectedQuantity: l.rejected,
          rejectionReason: l.rejectionReason || null,
          rejectedPhotoUrl: l.rejectedPhotoUrl || null,
          priceOverrideNote: l.priceOverrideNote || null,
          priceOverridePhotoUrl: l.priceOverridePhotoUrl || null,
          shortDeliveryAction: l.shortDeliveryAction,
        });
        if (!res.success) {
          notify.error(
            m(messages.inventory.grn.saveLinesFailed, {
              name: l.name,
              reason: res.error ?? grnCopy.saveLineFailed,
            }),
          );
          continue;
        }
        okCount++;
        savedLineIds.add(l.lineId);
      }
      if (okCount > 0) {
        notify.success(
          m(messages.inventory.grn.saveLinesOk, {
            ok: okCount,
            total: dirtyLines.length,
          }),
        );
        setLines((prev) =>
          prev.map((l) =>
            savedLineIds.has(l.lineId) ? { ...l, dirty: false } : l,
          ),
        );
        router.refresh();
      }
    });
  }

  async function handleDeleteLine(line: EditableLine) {
    const ok = await confirm({
      title: grnCopy.deleteLineTitle,
      description: line.name,
      variant: "destructive",
      confirmText: grnCopy.deleteLineAction,
    });
    if (!ok) return;

    startSave(async () => {
      const res = await deleteGrnLine({
        grnId: grn.id,
        lineId: line.lineId,
      });
      if (!res.success) {
        notify.error(res.error ?? grnCopy.deleteLineFailed);
        return;
      }
      setLines((prev) => prev.filter((item) => item.lineId !== line.lineId));
      notify.success(grnCopy.deleteLineOk);
      router.refresh();
    });
  }

  function upsertLocalLine(line: EditableLine) {
    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.ingredientId === line.ingredientId,
      );
      if (existingIndex < 0) return [...prev, line];
      return prev.map((item, index) => (index === existingIndex ? line : item));
    });
    router.refresh();
  }

  function validateBeforeConfirm(): string | null {
    for (const l of lines) {
      if (l.rejected > l.actual) {
        return grnCopy.validation.rejectedExceedsDelivered(l.name);
      }
      if (l.rejected > 0 && !l.rejectionReason.trim()) {
        return grnCopy.validation.rejectReasonRequired(l.name);
      }
      if (
        qc.rejectRequiresPhoto &&
        l.rejected > 0 &&
        !l.rejectedPhotoUrl.trim()
      ) {
        return grnCopy.validation.rejectPhotoRequired(l.name);
      }
      const tolerance = qc.qtyShortTolerancePct;
      // Short delivery: the supplier delivered below the threshold. Uses `actual` (gross delivered) directly.
      if (
        l.poQuantity != null &&
        l.poQuantity > 0 &&
        l.actual < l.poQuantity * (1 - tolerance / 100) &&
        !l.shortDeliveryAction
      ) {
        return grnCopy.validation.shortageActionRequired(l.name, tolerance);
      }
      const variance = deriveVariance(l.cost, l.poUnitPrice);
      if (
        variance != null &&
        Math.abs(variance) > qc.priceVarianceWarnPct &&
        !l.priceOverrideNote.trim()
      ) {
        return grnCopy.validation.priceReasonRequired(l.name, variance);
      }
    }
    return null;
  }

  async function handleConfirmGrn() {
    if (dirtyLines.length > 0) {
      notify.error(messages.inventory.grn.confirmBlockedByDirty);
      return;
    }
    const validationError = validateBeforeConfirm();
    if (validationError) {
      notify.error(validationError);
      return;
    }
    const ok = await confirm({
      title: messages.inventory.grn.confirmGrnTitle,
      description: messages.inventory.grn.confirmGrnDesc,
      variant: "destructive",
      confirmText: grnCopy.confirmGrnAction,
    });
    if (!ok) return;
    startConfirm(async () => {
      const res = await confirmGrn(grn.id);
      if (!res.success) {
        notify.error(res.error ?? messages.inventory.grn.confirmFailed);
        return;
      }
      const reviewCount =
        (res.data && typeof res.data === "object" && !Array.isArray(res.data)
          ? (res.data as { review_count?: number }).review_count
          : 0) ?? 0;
      notify.success(
        reviewCount > 0
          ? m(messages.inventory.grn.confirmedWithReview, {
              count: reviewCount,
            })
          : messages.inventory.grn.confirmed,
      );
      if (isMobile) {
        router.push(grnMobileBackPath);
      } else if (grn.poId) {
        router.push(`${purchaseOrdersBasePath}/${grn.poId}`);
      } else {
        router.push(grnListBasePath);
      }
    });
  }

  return { handleSave, handleDeleteLine, upsertLocalLine, handleConfirmGrn };
}
