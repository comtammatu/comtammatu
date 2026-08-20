"use client";

import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/confirm-dialog";
import { notify } from "@comtammatu/ui/lib/notify";
import { m, messages } from "@lib/messages";
import {
  deleteGrnLine,
  saveGoodsReceiptNote,
} from "@/(protected)/inventory/grn-actions";
import { confirmGrn } from "@/(protected)/inventory/procurement-actions";
import {
  GRN_DETAIL_COPY,
  acceptedGrnQuantity,
  calculateGrnQuantities,
  hasAcceptedGrnQuantity,
  type EditableGrnLine,
  type GrnDetail,
} from "./grn-detail-model";

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
  onConfirmed?: () => void;
}

interface UseGrnDetailActionsReturn {
  handleSave: () => Promise<void>;
  handleDeleteLine: (line: EditableGrnLine) => Promise<boolean>;
  upsertLocalLine: (line: EditableGrnLine) => void;
  handleConfirmGrn: (supplierId?: number | null) => Promise<void>;
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
  onConfirmed,
}: UseGrnDetailActionsArgs): UseGrnDetailActionsReturn {
  const router = useRouter();

  async function handleSave() {
    if (dirtyLines.length === 0) {
      notify.info(messages.inventory.grn.saveEmpty);
      return;
    }

    startSave(async () => {
      const result = await saveGoodsReceiptNote({
        grnId: grn.id,
        lines: lines.map((line) => ({
          lineId: line.lineId,
          receivedQuantity: line.actual,
          rejectedQuantity: line.rejected,
          rejectionReason: line.rejectionReason || null,
          rejectedPhotoUrl: line.rejectedPhotoUrl || null,
          entryUnitId: line.entryUnitId,
          unitCost: line.monetary?.unitPrice ?? 0,
          unitCostUnitId: line.unitCostUnitId,
        })),
      });
      if (!result.success) {
        notify.error(result.error ?? GRN_DETAIL_COPY.saveLineFailed);
        return;
      }
      notify.success(
        m(messages.inventory.grn.saveLinesOk, {
          ok: dirtyLines.length,
          total: dirtyLines.length,
        }),
      );
      setLines((previous) =>
        previous.map((line) => ({ ...line, dirty: false })),
      );
      router.refresh();
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
        (item) => item.lineId === line.lineId,
      );
      if (existingIndex < 0) return [...previous, line];
      return previous.map((item, index) =>
        index === existingIndex ? line : item,
      );
    });
  }

  function targetConfirmLines(supplierId?: number | null) {
    return lines.filter(
      (line) =>
        line.confirmedAt == null &&
        (supplierId == null || line.supplierId === supplierId),
    );
  }

  function validateBeforeConfirm(supplierId?: number | null): string | null {
    const target = targetConfirmLines(supplierId);
    if (!hasAcceptedGrnQuantity(target)) {
      return GRN_DETAIL_COPY.confirmNoAcceptedQuantity;
    }
    for (const line of target) {
      if (line.rejected > line.actual) {
        return GRN_DETAIL_COPY.validation.rejectedExceedsDelivered(line.name);
      }
      if (line.rejected > 0 && !line.rejectionReason.trim()) {
        return GRN_DETAIL_COPY.validation.rejectReasonRequired(line.name);
      }
      if (line.rejected > 0 && !line.rejectedPhotoUrl.trim()) {
        return GRN_DETAIL_COPY.validation.rejectPhotoRequired(line.name);
      }
      if (
        acceptedGrnQuantity(line.actual, line.rejected) > 0 &&
        !(Number(line.monetary?.unitPrice ?? 0) > 0)
      ) {
        return GRN_DETAIL_COPY.line.unitPriceRequired(line.name);
      }
      if (
        acceptedGrnQuantity(line.actual, line.rejected) > 0 &&
        Number(line.monetary?.unitPrice ?? 0) > 0 &&
        line.unitCostUnitId == null
      ) {
        return GRN_DETAIL_COPY.line.unitPriceUnitRequired(line.name);
      }
    }
    return null;
  }

  async function handleConfirmGrn(supplierId?: number | null) {
    if (dirtyLines.length > 0) {
      notify.error(messages.inventory.grn.confirmBlockedByDirty);
      return;
    }
    const target = targetConfirmLines(supplierId);
    const validationError = validateBeforeConfirm(supplierId);
    if (validationError) {
      notify.error(validationError);
      return;
    }
    const supplierName =
      supplierId != null
        ? (target.find((line) => line.supplierId === supplierId)?.supplierName ??
          "")
        : "";
    const summary = target.reduce(
      (result, line) => {
        const quantities = calculateGrnQuantities(
          line.actual,
          line.rejected,
          line.remainingQuantity,
          {
            persistToBase: line.persistToBaseFactor,
            poToBase: line.poToBaseFactor,
          },
        );
        if (quantities.acceptedQuantity > 0) result.acceptedLines += 1;
        if (quantities.shortageQuantity > 0) result.shortageLines += 1;
        if (quantities.excessQuantity > 0) result.excessLines += 1;
        if (line.rejected > 0) result.rejectedLines += 1;
        return result;
      },
      {
        acceptedLines: 0,
        shortageLines: 0,
        excessLines: 0,
        rejectedLines: 0,
      },
    );
    const shouldConfirm = await confirm({
      title: messages.inventory.grn.confirmGrnTitle,
      description: messages.inventory.grn.confirmGrnDesc,
      details: [
        {
          label: messages.inventory.grn.confirmDetailAccepted,
          value: `${summary.acceptedLines} dòng`,
        },
        {
          label: messages.inventory.grn.confirmDetailShortage,
          value: `${summary.shortageLines} dòng`,
        },
        {
          label: messages.inventory.grn.confirmDetailExcess,
          value: `${summary.excessLines} dòng`,
        },
        {
          label: messages.inventory.grn.confirmDetailRejected,
          value: `${summary.rejectedLines} dòng`,
        },
      ],
      confirmText:
        supplierName !== ""
          ? messages.inventory.grn.confirmSupplierAction(supplierName)
          : GRN_DETAIL_COPY.confirmGrnAction,
    });
    if (!shouldConfirm) return;

    startConfirm(async () => {
      const result = await confirmGrn(grn.id, supplierId ?? null);
      if (!result.success) {
        notify.error(result.error ?? messages.inventory.grn.confirmFailed);
        return;
      }
      notify.success(messages.inventory.grn.confirmed);
      if (onConfirmed) {
        onConfirmed();
        return;
      }
      if (isMobile) {
        router.push(grnMobileBackPath);
      } else {
        router.push(grnListBasePath);
      }
    });
  }

  return { handleSave, handleDeleteLine, upsertLocalLine, handleConfirmGrn };
}
