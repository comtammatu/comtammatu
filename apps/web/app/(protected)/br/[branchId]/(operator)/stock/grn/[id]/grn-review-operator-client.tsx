"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Plus as IconPlus,
  Save as IconDeviceFloppy,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { AppDetailFooter } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { formatVND } from "@/(protected)/inventory/_lib/format";
import { OperatorFlowSteps } from "@/(protected)/inventory/_components/operator-flow-steps";
import type { IngredientRow } from "@/(protected)/inventory/page";
import { useGrnLines } from "@/(protected)/inventory/grn/[id]/_hooks/use-grn-lines";
import { useGrnLineActions } from "@/(protected)/inventory/grn/[id]/_hooks/use-grn-line-actions";
import { grnCopy } from "@/(protected)/inventory/grn/[id]/views/grn-detail-types";
import { AddGrnLineDialog } from "@/(protected)/inventory/grn/[id]/views/add-grn-line-dialog";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { LineRow } from "@/(protected)/inventory/grn/[id]/views/grn-line-row";
import type { GRNDetail } from "@/(protected)/inventory/grn/[id]/views/grn-detail-types";

interface GrnReviewOperatorClientProps {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  grnListBasePath: string;
  purchaseOrdersBasePath: string;
}

export function GrnReviewOperatorClient({
  grn,
  ingredients,
  grnListBasePath,
  purchaseOrdersBasePath,
}: GrnReviewOperatorClientProps) {
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const statusBadge = getStatusBadgeMeta("inventory", grn.status);
  const qc = grn.qcSettings;
  const { lines, setLines, patch, stats, dirtyLines } = useGrnLines(
    grn.items,
    qc.priceVarianceReviewPct,
  );
  const { handleSave, handleDeleteLine, upsertLocalLine, handleConfirmGrn } =
    useGrnLineActions({
      grn,
      qc,
      isMobile: true,
      lines,
      dirtyLines,
      setLines,
      startSave,
      startConfirm,
      grnListBasePath,
      grnMobileBackPath: grnListBasePath,
      purchaseOrdersBasePath,
    });
  const operatorFlow = messages.inventory.operatorFlow;
  const reviewStep = dirtyLines.length > 0 ? 2 : 3;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link
          href={grnListBasePath}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          aria-label={grnCopy.back}
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
          {grn.code}
        </span>
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {grn.supplier} • {grn.date}
      </p>

      <OperatorFlowSteps
        title={grnCopy.inspectionItemsTitle}
        description={grnCopy.draftSavedReviewHint}
        steps={operatorFlow.grnSteps}
        currentStep={reviewStep}
      />

      <div className="flex items-center justify-between gap-2 px-1">
        <SectionLabel density="dense">
          {INVENTORY_VI.grnReviewLinesHint}
        </SectionLabel>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddDialogOpen(true)}
        >
          <IconPlus className="size-4" />
          {grnCopy.addLine}
        </Button>
      </div>

      <ItemGroup className="gap-2">
        {lines.map((line, idx) => (
          <LineRow
            key={line.lineId}
            tenantId={grn.tenantId}
            grnId={grn.id}
            line={line}
            idx={idx}
            isDraft
            qc={qc}
            showAmendAffordance={false}
            onChange={(p) => patch(idx, p)}
            onDelete={() => void handleDeleteLine(line)}
            onAmend={() => {}}
          />
        ))}
      </ItemGroup>

      <AppDetailFooter
        sticky
        mobileReverse={false}
        stacked
        trailing={
          <>
            {dirtyLines.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Spinner className="size-4" />
                ) : (
                  <IconDeviceFloppy className="size-5" />
                )}
                {grnCopy.saveChanges(dirtyLines.length)}
              </Button>
            ) : null}
            <Button
              type="button"
              size="touch-lg"
              disabled={isConfirming || dirtyLines.length > 0}
              onClick={handleConfirmGrn}
            >
              {isConfirming ? (
                <Spinner className="size-5" />
              ) : (
                <IconCircleCheck className="size-5" />
              )}
              {grnCopy.confirmGrnAction} · {formatVND(stats.total)}
            </Button>
          </>
        }
      />

      <AddGrnLineDialog
        grn={grn}
        ingredients={ingredients}
        isOpen={addDialogOpen}
        isPending={isSaving}
        onOpenChange={setAddDialogOpen}
        onSaved={upsertLocalLine}
        startTransition={startSave}
      />
    </div>
  );
}
