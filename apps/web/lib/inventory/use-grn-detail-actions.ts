"use client";

import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { notify } from "@comtammatu/ui/lib/notify";
import { m, messages } from "@lib/messages";
import {
  deleteGrnLine,
  upsertGrnLine,
} from "@/(protected)/inventory/grn-actions";
import { confirmGrn } from "@/(protected)/inventory/procurement-actions";
import {
  GRN_DETAIL_COPY,
  type EditableGrnLine,
  type GrnDetail,
} from "./grn-detail-model";
import {
  deriveGrnQualityStatus,
  isGrnBaselineReviewRequired,
} from "./grn-quality";

interface UseGrnDetailActionsArgs {
  grn: GrnDetail;
  lines: EditableGrnLine[];
  dirtyLines: EditableGrnLine[];
  setLines: Dispatch<SetStateAction<EditableGrnLine[]>>;
  startSave: TransitionStartFunction;
  startConfirm: TransitionStartFunction;
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  isMobile: boolean;
}

interface UseGrnDetailActionsReturn {
  handleSave: () => Promise<void>;
  handleDeleteLine: (line: EditableGrnLine) => Promise<boolean>;
  upsertLocalLine: (line: EditableGrnLine) => void;
  handleConfirmGrn: () => Promise<void>;
}

export function useGrnDetailActions({
  grn,
  lines,
  dirtyLines,
  setLines,
  startSave,
  startConfirm,
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  isMobile,
}: UseGrnDetailActionsArgs): UseGrnDetailActionsReturn {
  const router = useRouter();

  async function handleSave() {
    if (dirtyLines.length === 0) {
      notify.info(messages.inventory.grn.saveEmpty);
      return;
    }

    startSave(async () => {
      let okCount = 0;
      const savedLines = new Map<
        number,
        { baselineVariancePct: number | null; baselineSampleN: number | null }
      >();
      for (const line of dirtyLines) {
        const result = await upsertGrnLine({
          grnId: grn.id,
          ingredientId: line.ingredientId,
          receivedQuantity: line.actual,
          entryUnitId: line.entryUnitId,
          unitCost: line.cost,
          qualityStatus: line.qualityStatus,
          rejectedQuantity: line.rejected,
          rejectionReason: line.rejectionReason || null,
          rejectedPhotoUrl: line.rejectedPhotoUrl || null,
          priceOverrideNote: line.priceOverrideNote || null,
          priceOverridePhotoUrl: line.priceOverridePhotoUrl || null,
          shortDeliveryAction: line.shortDeliveryAction,
        });
        if (!result.success) {
          notify.error(
            m(messages.inventory.grn.saveLinesFailed, {
              name: line.name,
              reason: result.error ?? GRN_DETAIL_COPY.saveLineFailed,
            }),
          );
          continue;
        }
        okCount += 1;
        const saved = result.data as {
          baseline_variance_pct?: number | null;
          baseline_sample_n?: number | null;
        };
        savedLines.set(line.lineId, {
          baselineVariancePct:
            saved.baseline_variance_pct == null
              ? null
              : Number(saved.baseline_variance_pct),
          baselineSampleN:
            saved.baseline_sample_n == null
              ? null
              : Number(saved.baseline_sample_n),
        });
      }
      if (okCount > 0) {
        notify.success(
          m(messages.inventory.grn.saveLinesOk, {
            ok: okCount,
            total: dirtyLines.length,
          }),
        );
        setLines((previous) =>
          previous.map((line) =>
            savedLines.has(line.lineId)
              ? { ...line, ...savedLines.get(line.lineId), dirty: false }
              : line,
          ),
        );
        router.refresh();
      }
    });
  }

  async function handleDeleteLine(line: EditableGrnLine): Promise<boolean> {
    const shouldDelete = await confirm({
      title: GRN_DETAIL_COPY.deleteLineTitle,
      description: line.name,
      variant: "destructive",
      confirmText: GRN_DETAIL_COPY.deleteLineAction,
    });
    if (!shouldDelete) return false;

    startSave(async () => {
      const result = await deleteGrnLine({
        grnId: grn.id,
        lineId: line.lineId,
      });
      if (!result.success) {
        notify.error(result.error ?? GRN_DETAIL_COPY.deleteLineFailed);
        return;
      }
      setLines((previous) =>
        previous.filter((item) => item.lineId !== line.lineId),
      );
      notify.success(GRN_DETAIL_COPY.deleteLineOk);
      router.refresh();
    });
    return true;
  }

  function upsertLocalLine(line: EditableGrnLine) {
    setLines((previous) => {
      const existingIndex = previous.findIndex(
        (item) => item.ingredientId === line.ingredientId,
      );
      if (existingIndex < 0) return [...previous, line];
      return previous.map((item, index) =>
        index === existingIndex ? line : item,
      );
    });
  }

  function validateBeforeConfirm(): string | null {
    for (const line of lines) {
      if (line.rejected > line.actual) {
        return GRN_DETAIL_COPY.validation.rejectedExceedsDelivered(line.name);
      }
      if (
        deriveGrnQualityStatus(line.actual, line.rejected) !==
        line.qualityStatus
      ) {
        return GRN_DETAIL_COPY.validation.qualityStatusMismatch(line.name);
      }
      if (line.qualityStatus !== "accepted" && !line.rejectionReason.trim()) {
        return GRN_DETAIL_COPY.validation.rejectReasonRequired(line.name);
      }
      if (line.qualityStatus !== "accepted" && !line.rejectedPhotoUrl.trim()) {
        return GRN_DETAIL_COPY.validation.rejectPhotoRequired(line.name);
      }
      if (
        (line.requiresReview ||
          isGrnBaselineReviewRequired(line.baselineVariancePct)) &&
        !line.priceOverrideNote.trim()
      ) {
        return GRN_DETAIL_COPY.validation.priceReviewReasonRequired(line.name);
      }
      if (
        (line.requiresReview ||
          isGrnBaselineReviewRequired(line.baselineVariancePct)) &&
        !line.priceOverridePhotoUrl.trim()
      ) {
        return GRN_DETAIL_COPY.validation.pricePhotoRequired(line.name);
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
    const shouldConfirm = await confirm({
      title: messages.inventory.grn.confirmGrnTitle,
      description: messages.inventory.grn.confirmGrnDesc,
      variant: "destructive",
      confirmText: GRN_DETAIL_COPY.confirmGrnAction,
    });
    if (!shouldConfirm) return;

    startConfirm(async () => {
      const result = await confirmGrn(grn.id);
      if (!result.success) {
        notify.error(result.error ?? messages.inventory.grn.confirmFailed);
        return;
      }
      const reviewCount =
        (result.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
          ? (result.data as { review_count?: number }).review_count
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
      } else {
        router.push(grnListBasePath);
      }
    });
  }

  return { handleSave, handleDeleteLine, upsertLocalLine, handleConfirmGrn };
}
