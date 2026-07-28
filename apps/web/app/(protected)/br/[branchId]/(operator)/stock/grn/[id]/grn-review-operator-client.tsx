"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
  ClipboardCheck as IconClipboardCheck,
  Plus as IconPlus,
  Save as IconDeviceFloppy,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
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
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import { OperatorFlowSteps } from "@/(protected)/inventory/_components/operator-flow-steps";
import type { IngredientRow } from "@lib/inventory/types";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  GRN_DETAIL_COPY as grnCopy,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";
import { useGrnDetailActions } from "@lib/inventory/use-grn-detail-actions";
import { useGrnDetailLines } from "@lib/inventory/use-grn-detail-lines";
import { messages } from "@lib/messages";
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
  const { lines, setLines, patch, dirtyLines } = useGrnDetailLines(
    grn.items,
    null,
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
  const operatorFlow = messages.inventory.operatorFlow;
  const reviewStep = dirtyLines.length > 0 ? 2 : 3;

  function patchEditingLine(patchValue: Parameters<typeof patch>[1]) {
    const index = lines.findIndex((line) => line.lineId === editingLineId);
    if (index >= 0) patch(index, patchValue);
  }

  return (
    <BranchOperatorPage
      title={grn.code}
      description={`${grn.supplier} · ${grn.date}`}
      hideHeaderOnMobile
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={<Link href={grnListBasePath} aria-label={grnCopy.back} />}
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold tabular-nums">
              {grn.code}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {grn.supplier} · {grn.date}
            </p>
          </div>
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
        </BranchOperatorControlBar>

        <OperatorFlowSteps
          title={grnCopy.inspectionItemsTitle}
          description={grnCopy.draftSavedReviewHint}
          steps={operatorFlow.grnSteps}
          currentStep={reviewStep}
        />

        <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
          <BranchOperatorPanel
            title={grnCopy.inspectionItemsTitle}
            description={grnCopy.draftQcHint}
            icon={IconClipboardCheck}
            size="sm"
            className="min-w-0 lg:col-start-1 lg:row-start-1"
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
                      variant="outline"
                      className="min-h-20 touch-manipulation"
                      render={
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setEditingLineId(line.lineId)}
                          disabled={!canEditDraft}
                        />
                      }
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
                        line.qualityStatus === "rejected" ||
                        line.requiresReview ? (
                          <IconAlertTriangle className="size-5 text-warning" />
                        ) : (
                          <IconCircleCheck className="size-5 text-success" />
                        )}
                        {canEditDraft ? (
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        ) : null}
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </BranchOperatorPanel>

          <BranchOperatorPanel
            title={grn.supplier}
            icon={IconClipboardCheck}
            size="sm"
            className="min-w-0 lg:col-start-2 lg:row-start-1"
          >
            <BranchOperatorDetailList
              rows={[
                { label: grnCopy.supplier, value: grn.supplier },
                { label: grnCopy.receivingWarehouse, value: grn.branchName },
                {
                  label: grnCopy.linkedPo,
                  value: grn.poCode || "—",
                  muted: !grn.poCode,
                },
                {
                  label: grnCopy.inspectionItemsTitle,
                  value: grnCopy.lineCount(lines.length),
                },
              ]}
              columns={1}
            />
          </BranchOperatorPanel>
        </div>

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
          leading={
            <Button
              variant="outline"
              size="touch"
              render={<Link href={grnListBasePath} />}
            >
              <IconArrowLeft data-icon="inline-start" />
              {grnCopy.back}
            </Button>
          }
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
                  {grnCopy.confirmGrnAction}
                </Button>
              ) : null}
            </div>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
