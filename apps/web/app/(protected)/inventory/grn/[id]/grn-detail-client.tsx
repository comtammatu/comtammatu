"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatPercent } from "@comtammatu/shared/format";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Info as IconInfoCircle,
  Receipt as IconReceipt,
  Save as IconDeviceFloppy,
  Plus as IconPlus,
} from "lucide-react";
import {
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";
import type { IngredientRow } from "../../_lib/types";
import { useGrnDetailActions as useGrnLineActions } from "@lib/inventory/use-grn-detail-actions";
import { useGrnDetailLines as useGrnLines } from "@lib/inventory/use-grn-detail-lines";
import {
  GRN_DETAIL_COPY as grnCopy,
  INVENTORY_COMMON_COPY as inventoryCommon,
} from "@lib/inventory/grn-detail-model";
import { AddGrnLineDialog } from "./views/add-grn-line-dialog";
import { AmendOwnerDialog } from "./views/amend-owner-dialog";
import { GrnSummaryRow } from "./views/grn-summary-row";
import { LineRow } from "./views/grn-line-row";
import { RecreateReceivingSiteDialog } from "./views/recreate-receiving-site-dialog";

export type { GrnDetail as GRNDetail } from "@lib/inventory/grn-detail-model";

import type {
  EditableGrnLine as EditableLine,
  GrnDetail as GRNDetail,
  RecreateReceivingLocationOption,
} from "@lib/inventory/grn-detail-model";
const qcStatusTitle = "Trạng thái kiểm kê QC";
const historySectionTitle = "Lịch sử chỉnh sửa";

export function GRNDetailClient({
  grn,
  ingredients,
  canAdjustStock,
  canAmendConfirmed = false,
  recreateLocationOptions = [],
  auditLogs = [],
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  supplierInvoicesBasePath = "/inventory/supplier-invoices",
  embedded = false,
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
  canAmendConfirmed?: boolean;
  recreateLocationOptions?: RecreateReceivingLocationOption[];
  auditLogs?: AuditLogRow[];
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  purchaseOrdersBasePath?: string;
  supplierInvoicesBasePath?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Device-derived, not param-derived: the old `?m=1` flag had no setter
  // anywhere in the codebase, so the mobile post-confirm navigation and
  // back-link paths below never activated for phone receivers.
  const isMobile = embedded;
  const isReview = searchParams.get("review") === "1";
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isAmending, startAmend] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [amendingLine, setAmendingLine] = useState<EditableLine | null>(null);

  const isDraft = grn.status === "draft";
  const isConfirmed = grn.status === "confirmed";
  const statusBadge = getStatusBadgeMeta("inventory", grn.status);
  const showAmendAffordance = canAmendConfirmed && isConfirmed;
  const qc = grn.qcSettings;

  const { lines, setLines, patch, stats, dirtyLines } = useGrnLines(
    grn.items,
    qc.priceVarianceReviewPct,
  );

  const { handleSave, handleDeleteLine, upsertLocalLine, handleConfirmGrn } =
    useGrnLineActions({
      grn,
      isMobile,
      lines,
      dirtyLines,
      setLines,
      startSave,
      startConfirm,
      grnListBasePath,
      grnMobileBackPath,
      purchaseOrdersBasePath,
    });

  const backHref = isMobile ? grnMobileBackPath : grnListBasePath;
  const pageLayout = (
    <div className="flex flex-col gap-4">
      {isReview && isDraft ? (
        <Alert>
          <IconInfoCircle className="size-4" />
          <AlertDescription>{grnCopy.draftSavedReviewHint}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Left Column: Inspection Items List + Audit History */}
        <div className="flex flex-col gap-4">
          <AppSection
            className="overflow-hidden"
            title={grnCopy.inspectionItemsTitle}
            description={
              isDraft
                ? grnCopy.draftToleranceHint(
                    formatPercent(qc.qtyShortTolerancePct),
                    formatPercent(qc.priceVarianceWarnPct),
                    formatPercent(qc.priceVarianceReviewPct),
                  )
                : grnCopy.finalizedLineCount(lines.length)
            }
            action={
              isDraft ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <IconPlus className="size-4" />
                  {grnCopy.addLine}
                </Button>
              ) : null
            }
          >
            {lines.map((line, idx) => (
              <LineRow
                key={line.lineId}
                tenantId={grn.tenantId}
                grnId={grn.id}
                line={line}
                idx={idx}
                isDraft={isDraft}
                qc={qc}
                showAmendAffordance={showAmendAffordance}
                onChange={(p) => patch(idx, p)}
                onDelete={() => void handleDeleteLine(line)}
                onAmend={() => setAmendingLine(line)}
              />
            ))}
          </AppSection>

          {/* Audit History (Collapsible) */}
          <AppSection
            title={historySectionTitle}
            collapsible={true}
            defaultOpen={false}
          >
            <AuditHistoryList logs={auditLogs} />
          </AppSection>
        </div>

        {/* Right Column: Metadata Overview + QC Summary Card + Total Stock Value Card */}
        <div className="flex flex-col gap-4">
          <AppSection title={grnCopy.qcSummary}>
            <DescriptionList
              className="grid gap-3"
              descriptionClassName="font-semibold"
              items={[
                {
                  term: grnCopy.linkedPo,
                  description:
                    grn.poCode && grn.poId ? (
                      <Link
                        href={`${purchaseOrdersBasePath}/${grn.poId}`}
                        className="text-primary hover:underline"
                      >
                        {grn.poCode}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {inventoryCommon.noValue}
                      </span>
                    ),
                },
                {
                  term: grnCopy.supplier,
                  description: grn.supplier,
                },
                {
                  term: grnCopy.receivingWarehouse,
                  description: grn.branchName,
                },
              ]}
            />
          </AppSection>

          <AppSection
            size="sm"
            title={qcStatusTitle}
            contentClassName="text-sm"
          >
            <GrnSummaryRow
              label={grnCopy.acceptedLines}
              value={`${stats.acceptedLines}/${lines.length}`}
              tone="success"
            />
            <GrnSummaryRow
              label={grnCopy.rejectedLines}
              value={String(stats.rejectedLines)}
              tone={stats.rejectedLines > 0 ? "warning" : "default"}
            />
            <GrnSummaryRow
              label={grnCopy.priceReviewNeeded}
              value={String(stats.reviewLines)}
              tone={stats.reviewLines > 0 ? "warning" : "default"}
            />
          </AppSection>

          <AppSection tone="info" size="sm" title={grnCopy.totalStockValue}>
            <p className="font-mono text-xl font-semibold tabular-nums text-primary">
              {inventoryCommon.currency(formatVND(stats.total))}
            </p>
          </AppSection>
        </div>
      </div>

      <AppDetailFooter
        leading={
          <>
            {!isDraft ? (
              <Button asChild variant="ghost">
                <Link
                  href={
                    isMobile
                      ? grnMobileBackPath
                      : grn.poId
                        ? `${purchaseOrdersBasePath}/${grn.poId}`
                        : grnListBasePath
                  }
                >
                  <IconArrowLeft className="size-5" />
                  {grnCopy.back}
                </Link>
              </Button>
            ) : null}
            {isDraft ? (
              <RecreateReceivingSiteDialog
                mode="draft"
                grnId={grn.id}
                grnCode={grn.code}
                currentLocationId={grn.locationId}
                locationOptions={recreateLocationOptions}
                grnListBasePath={grnListBasePath}
                disabledReason={
                  dirtyLines.length > 0
                    ? grnCopy.draftReceiving.saveBeforeSwitch
                    : undefined
                }
              />
            ) : null}
            {!isDraft && canAdjustStock && lines.length > 0 ? (
              <DocumentStockCorrectionDialog
                documentType="grn"
                documentId={grn.id}
                documentCode={grn.code}
                branchOptions={[
                  {
                    id: grn.branchId,
                    name: grn.branchName,
                  },
                ]}
                itemOptions={lines.map((line) => ({
                  ingredientId: line.ingredientId,
                  name: line.name,
                  unit: line.unit,
                }))}
              />
            ) : null}
            {showAmendAffordance ? (
              <RecreateReceivingSiteDialog
                grnId={grn.id}
                grnCode={grn.code}
                currentLocationId={grn.locationId}
                locationOptions={recreateLocationOptions}
                grnListBasePath={grnListBasePath}
              />
            ) : null}
            {!isDraft ? (
              <Button asChild variant="outline">
                <Link
                  href={
                    grn.invoiceId
                      ? `${supplierInvoicesBasePath}?invoiceId=${grn.invoiceId}`
                      : `${supplierInvoicesBasePath}?grnId=${grn.id}`
                  }
                >
                  <IconReceipt className="size-5" />
                  {grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice}
                </Link>
              </Button>
            ) : null}
          </>
        }
        trailing={
          isDraft ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || dirtyLines.length === 0}
              >
                <IconDeviceFloppy className="size-5" />
                {grnCopy.saveChanges(dirtyLines.length)}
              </Button>
              <Button
                type="button"
                disabled={isConfirming || dirtyLines.length > 0}
                onClick={handleConfirmGrn}
              >
                <IconCircleCheck className="size-5" />
                {grnCopy.confirmGrnAction}
              </Button>
            </>
          ) : null
        }
      />
    </div>
  );

  const mobileLayout = (
    <div className="flex flex-col gap-4">
      {isReview && isDraft ? (
        <Alert>
          <IconInfoCircle className="size-4" />
          <AlertDescription>{grnCopy.draftSavedReviewHint}</AlertDescription>
        </Alert>
      ) : null}

      {/* 1. Tổng quan nhập kho */}
      <AppSection title={grnCopy.qcSummary} size="sm">
        <DescriptionList
          className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"
          descriptionClassName="font-semibold text-right"
          items={[
            {
              term: grnCopy.linkedPo,
              description:
                grn.poCode && grn.poId ? (
                  <Link
                    href={`${purchaseOrdersBasePath}/${grn.poId}`}
                    className="text-primary hover:underline"
                  >
                    {grn.poCode}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    {inventoryCommon.noValue}
                  </span>
                ),
            },
            {
              term: grnCopy.supplier,
              description: grn.supplier,
            },
            {
              term: grnCopy.receivingWarehouse,
              description: grn.branchName,
            },
            {
              term: grnCopy.totalReceivedValue,
              description: (
                <span className="text-primary font-bold">
                  {inventoryCommon.currency(formatVND(stats.total))}
                </span>
              ),
            },
          ]}
        />
      </AppSection>

      {/* 2. Trạng thái kiểm kê QC & Tổng tiền */}
      <AppSection size="sm" title={qcStatusTitle}>
        <GrnSummaryRow
          label={grnCopy.acceptedLines}
          value={`${stats.acceptedLines}/${lines.length}`}
          tone="success"
        />
        <GrnSummaryRow
          label={grnCopy.rejectedLines}
          value={String(stats.rejectedLines)}
          tone={stats.rejectedLines > 0 ? "warning" : "default"}
        />
        <GrnSummaryRow
          label={grnCopy.priceReviewNeeded}
          value={String(stats.reviewLines)}
          tone={stats.reviewLines > 0 ? "warning" : "default"}
        />
      </AppSection>

      {/* 3. Danh sách sản phẩm kiểm tra */}
      <AppSection
        title={grnCopy.inspectionItemsTitle}
        description={
          isDraft
            ? grnCopy.draftToleranceHint(
                formatPercent(qc.qtyShortTolerancePct),
                formatPercent(qc.priceVarianceWarnPct),
                formatPercent(qc.priceVarianceReviewPct),
              )
            : grnCopy.finalizedLineCount(lines.length)
        }
        action={
          isDraft ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setAddDialogOpen(true)}
            >
              <IconPlus className="size-4" />
              {grnCopy.addLine}
            </Button>
          ) : null
        }
        size="sm"
      >
        <div className="flex flex-col gap-3">
          {lines.map((line, idx) => (
            <LineRow
              key={line.lineId}
              tenantId={grn.tenantId}
              grnId={grn.id}
              line={line}
              idx={idx}
              isDraft={isDraft}
              qc={qc}
              showAmendAffordance={showAmendAffordance}
              onChange={(p) => patch(idx, p)}
              onDelete={() => void handleDeleteLine(line)}
              onAmend={() => setAmendingLine(line)}
            />
          ))}
        </div>
      </AppSection>

      {/* 4. Lịch sử */}
      <AppSection
        title={historySectionTitle}
        size="sm"
        collapsible
        defaultOpen={false}
      >
        <AuditHistoryList logs={auditLogs} />
      </AppSection>

      {/* Action Footer */}
      <AppDetailFooter
        sticky={embedded}
        leading={
          <>
            {!isDraft ? (
              <Button asChild variant="ghost" size="touch">
                <Link href={grnMobileBackPath}>
                  <IconArrowLeft className="size-5" />
                  {grnCopy.back}
                </Link>
              </Button>
            ) : null}
            {isDraft ? (
              <RecreateReceivingSiteDialog
                mode="draft"
                grnId={grn.id}
                grnCode={grn.code}
                currentLocationId={grn.locationId}
                locationOptions={recreateLocationOptions}
                grnListBasePath={grnListBasePath}
                buttonSize="touch"
                disabledReason={
                  dirtyLines.length > 0
                    ? grnCopy.draftReceiving.saveBeforeSwitch
                    : undefined
                }
              />
            ) : null}
            {!isDraft && canAdjustStock && lines.length > 0 ? (
              <DocumentStockCorrectionDialog
                documentType="grn"
                documentId={grn.id}
                documentCode={grn.code}
                branchOptions={[
                  {
                    id: grn.branchId,
                    name: grn.branchName,
                  },
                ]}
                itemOptions={lines.map((line) => ({
                  ingredientId: line.ingredientId,
                  name: line.name,
                  unit: line.unit,
                }))}
              />
            ) : null}
            {showAmendAffordance ? (
              <RecreateReceivingSiteDialog
                grnId={grn.id}
                grnCode={grn.code}
                currentLocationId={grn.locationId}
                locationOptions={recreateLocationOptions}
                grnListBasePath={grnListBasePath}
                buttonSize="touch"
              />
            ) : null}
            {!isDraft ? (
              <Button asChild variant="outline" size="touch">
                <Link
                  href={
                    grn.invoiceId
                      ? `${supplierInvoicesBasePath}?invoiceId=${grn.invoiceId}`
                      : `${supplierInvoicesBasePath}?grnId=${grn.id}`
                  }
                >
                  <IconReceipt className="size-5" />
                  {grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice}
                </Link>
              </Button>
            ) : null}
          </>
        }
        trailing={
          isDraft ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || dirtyLines.length === 0}
                size="touch"
              >
                <IconDeviceFloppy className="size-5" />
                {grnCopy.saveChanges(dirtyLines.length)}
              </Button>
              <Button
                type="button"
                disabled={isConfirming || dirtyLines.length > 0}
                onClick={handleConfirmGrn}
                size="touch-lg"
              >
                <IconCircleCheck className="size-5" />
                {grnCopy.confirmGrnAction}
              </Button>
            </>
          ) : null
        }
      />
    </div>
  );

  const dialogs = (
    <>
      <AddGrnLineDialog
        grn={grn}
        ingredients={ingredients}
        isOpen={addDialogOpen}
        isPending={isSaving}
        onOpenChange={setAddDialogOpen}
        onSaved={upsertLocalLine}
        startTransition={startSave}
      />
      <AmendOwnerDialog
        grnId={grn.id}
        line={amendingLine}
        isPending={isAmending}
        onClose={() => setAmendingLine(null)}
        onSaved={(updatedLine) => {
          setLines((prev) =>
            prev.map((item) =>
              item.lineId === updatedLine.lineId ? updatedLine : item,
            ),
          );
          setAmendingLine(null);
          router.refresh();
        }}
        startTransition={startAmend}
      />
    </>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href={grnMobileBackPath} aria-label={grnCopy.back}>
              <IconArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold">
              {grn.code}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {grn.supplier} • {grn.branchName} • {grn.date}
            </p>
          </div>
          <Badge variant={statusBadge.variant} className="shrink-0">
            {statusBadge.label}
          </Badge>
        </div>
        {mobileLayout}
        {dialogs}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={grn.code}
        description={`${grn.supplier} • ${grn.branchName} • ${grn.date}`}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {isMobile ? grnCopy.back : tRoute("/inventory/grn", "heading")}
          </Link>
        }
      />
      {pageLayout}
      {dialogs}
    </AppPage>
  );
}
