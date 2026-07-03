"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
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
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";
import type { IngredientRow } from "../../page";
import { useGrnLines } from "./_hooks/use-grn-lines";
import { useGrnLineActions } from "./_hooks/use-grn-line-actions";
import { grnCopy, inventoryCommon } from "./views/grn-detail-types";
import { AddGrnLineDialog } from "./views/add-grn-line-dialog";
import { AmendOwnerDialog } from "./views/amend-owner-dialog";
import { GrnSummaryRow } from "./views/grn-summary-row";
import { LineRow } from "./views/grn-line-row";
import { OverviewLinesPreview } from "./views/overview-lines-preview";

export type { GRNDetail } from "./views/grn-detail-types";

import type { EditableLine, GRNDetail } from "./views/grn-detail-types";

export function GRNDetailClient({
  grn,
  ingredients,
  canAdjustStock,
  canAmendConfirmed = false,
  auditLogs = [],
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  supplierInvoicesBasePath = "/inventory/supplier-invoices",
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
  canAmendConfirmed?: boolean;
  auditLogs?: AuditLogRow[];
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  purchaseOrdersBasePath?: string;
  supplierInvoicesBasePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Device-derived, not param-derived: the old `?m=1` flag had no setter
  // anywhere in the codebase, so the mobile post-confirm navigation and
  // back-link paths below never activated for phone receivers.
  const isMobile = useIsMobile() === true;
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
      qc,
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

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={grn.code}
        description={`${grn.supplier} • ${grn.date}`}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <Link
            href={isMobile ? grnMobileBackPath : grnListBasePath}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {isMobile ? grnCopy.back : tRoute("/inventory/grn", "heading")}
          </Link>
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "lines", label: "Dòng", count: lines.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview">
              <div className="flex flex-col gap-4">
                {isReview && isDraft ? (
                  <Alert>
                    <IconInfoCircle className="size-4" />
                    <AlertDescription>
                      {grnCopy.draftSavedReviewHint}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <AppSection title={grnCopy.qcSummary}>
                  <DescriptionList
                    className="grid gap-3 md:grid-cols-4"
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
                        term: grnCopy.totalReceivedValue,
                        description: (
                          <span className="text-primary">
                            {inventoryCommon.currency(formatVND(stats.total))}
                          </span>
                        ),
                      },
                      {
                        term: grnCopy.priceReviewNeeded,
                        description: (
                          <span
                            className={
                              stats.reviewLines > 0 ? "text-destructive" : ""
                            }
                          >
                            {grnCopy.reviewRatio(
                              stats.reviewLines,
                              lines.length,
                            )}
                          </span>
                        ),
                      },
                    ]}
                  />
                </AppSection>

                <OverviewLinesPreview lines={lines} />
              </div>
            </TabsContent>

            <TabsContent value="lines">
              <div className="flex flex-col gap-4">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <AppSection
                      className="overflow-hidden"
                      title={grnCopy.inspectionItemsTitle}
                      description={
                        isDraft
                          ? grnCopy.draftToleranceHint(
                              qc.qtyShortTolerancePct,
                              qc.priceVarianceWarnPct,
                              qc.priceVarianceReviewPct,
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
                  </div>

                  <div className="flex flex-col gap-4">
                    <AppSection
                      size="sm"
                      title={grnCopy.qcSummary}
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

                    <AppSection
                      tone="info"
                      size="sm"
                      title={grnCopy.totalStockValue}
                    >
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
                      {!isDraft && canAdjustStock && lines.length > 0 ? (
                        <DocumentStockCorrectionDialog
                          documentType="grn"
                          documentId={grn.id}
                          documentCode={grn.code}
                          branchOptions={[
                            {
                              id: grn.branchId,
                              name: grnCopy.receivingWarehouse,
                            },
                          ]}
                          itemOptions={lines.map((line) => ({
                            ingredientId: line.ingredientId,
                            name: line.name,
                            unit: line.unit,
                          }))}
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
                            {grn.invoiceId
                              ? grnCopy.viewInvoice
                              : grnCopy.createInvoice}
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
            </TabsContent>

            <TabsContent value="history">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
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
    </AppPage>
  );
}
