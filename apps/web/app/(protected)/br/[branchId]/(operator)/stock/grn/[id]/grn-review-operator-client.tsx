"use client";

import { useState, useTransition } from "react";
import {
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
  ClipboardCheck as IconClipboardCheck,
  Plus as IconPlus,
  Save as IconDeviceFloppy,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import type { IngredientRow } from "@/(protected)/inventory/_lib/types";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  GRN_DETAIL_COPY as grnCopy,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";
import { useGrnDetailActions } from "@lib/inventory/use-grn-detail-actions";
import { useGrnDetailLines } from "@lib/inventory/use-grn-detail-lines";
import {
  BranchGrnAddLineSheet,
  BranchGrnReviewLineSheet,
} from "@/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet";

interface GrnReviewOperatorClientProps {
  grn: GrnDetail;
  ingredients: IngredientRow[];
  canEditDraft: boolean;
  canConfirm: boolean;
  grnListBasePath: string;
}

export function GrnReviewOperatorClient({
  grn,
  ingredients,
  canEditDraft,
  canConfirm,
  grnListBasePath,
}: GrnReviewOperatorClientProps) {
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const statusBadge = getStatusBadgeMeta("inventory", grn.status);
  const { lines, setLines, patch, stats, dirtyLines } = useGrnDetailLines(
    grn.items,
    grn.qcSettings.priceVarianceReviewPct,
  );
  const { handleSave, handleDeleteLine, upsertLocalLine, handleConfirmGrn } =
    useGrnDetailActions({
      grn,
      isMobile: true,
      lines,
      dirtyLines,
      setLines,
      startSave,
      startConfirm,
      grnListBasePath,
      grnMobileBackPath: grnListBasePath,
    });
  const editingLine =
    lines.find((line) => line.lineId === editingLineId) ?? null;

  function patchEditingLine(patchValue: Parameters<typeof patch>[1]) {
    const index = lines.findIndex((line) => line.lineId === editingLineId);
    if (index >= 0) patch(index, patchValue);
  }

  return (
    <BranchOperatorPage
      title={grn.code}
      description={`${grn.supplier} · ${grn.branchName} · ${grn.date}`}
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
      backHref={grnListBasePath}
      backLabel={grnCopy.back}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorPanel
          title={grnCopy.inspectionItemsTitle}
          icon={IconClipboardCheck}
          size="sm"
          contentClassName="gap-2"
          action={
            canEditDraft ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setAddLineOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                {grnCopy.addLine}
              </Button>
            ) : null
          }
        >
          {lines.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-data"
              icon={<IconClipboardCheck />}
              title={grnCopy.addDialog.title}
              description={grnCopy.draftSavedReviewHint}
            />
          ) : (
            <ItemGroup className="gap-2" role="list">
              {lines.map((line) => (
                <div key={line.lineId} role="listitem">
                  <Item
                    asChild
                    variant="outline"
                    className="min-h-20 touch-manipulation"
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setEditingLineId(line.lineId)}
                      disabled={!canEditDraft}
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle className="line-clamp-none text-sm font-semibold">
                          {line.name}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none text-xs">
                          {grnCopy.line.orderedDeliveredAccepted(
                            line.required,
                            line.actual,
                            line.actual - line.rejected,
                            line.rejected,
                            line.unit,
                          )}
                        </ItemDescription>
                        {line.dirty ? (
                          <span className="text-xs font-medium text-warning">
                            {grnCopy.line.unsaved}
                          </span>
                        ) : null}
                      </ItemContent>
                      <ItemActions className="shrink-0">
                        {line.rejected > 0 ||
                        line.qualityStatus === "rejected" ? (
                          <IconAlertTriangle className="size-5 text-warning" />
                        ) : (
                          <IconCircleCheck className="size-5 text-success" />
                        )}
                        {canEditDraft ? (
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        ) : null}
                      </ItemActions>
                    </button>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>

        <BranchGrnReviewLineSheet
          grn={grn}
          line={canEditDraft ? editingLine : null}
          isPending={isSaving}
          onClose={() => setEditingLineId(null)}
          onPatch={patchEditingLine}
          onDelete={handleDeleteLine}
        />
        <BranchGrnAddLineSheet
          grn={grn}
          ingredients={ingredients}
          open={canEditDraft && addLineOpen}
          isPending={isSaving}
          onOpenChange={setAddLineOpen}
          onSaved={upsertLocalLine}
          startTransition={startSave}
        />

        <AppDetailFooter
          sticky
          trailing={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-80">
              {canEditDraft && dirtyLines.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Spinner className="size-4" />
                  ) : (
                    <IconDeviceFloppy />
                  )}
                  {grnCopy.saveChanges(dirtyLines.length)}
                </Button>
              ) : null}
              {canConfirm ? (
                <Button
                  type="button"
                  size="touch-lg"
                  disabled={
                    isConfirming || dirtyLines.length > 0 || lines.length === 0
                  }
                  onClick={() => void handleConfirmGrn()}
                >
                  {isConfirming ? (
                    <Spinner className="size-5" />
                  ) : (
                    <IconCircleCheck />
                  )}
                  {grnCopy.confirmGrnAction} · {formatVND(stats.total)}
                </Button>
              ) : null}
            </div>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
