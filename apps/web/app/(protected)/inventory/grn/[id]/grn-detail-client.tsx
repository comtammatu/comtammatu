"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Info as IconInfoCircle,
  Pencil as IconPencil,
  Receipt as IconReceipt,
  Save as IconDeviceFloppy,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  AppBackLink,
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { formatQty, formatVND } from "@lib/inventory/format";
import { tRoute } from "../../_lib/dictionary";
import type { IngredientRow } from "@lib/inventory/types";
import { useGrnDetailActions as useGrnLineActions } from "@lib/inventory/use-grn-detail-actions";
import { useGrnDetailLines as useGrnLines } from "@lib/inventory/use-grn-detail-lines";
import {
  GRN_DETAIL_COPY as grnCopy,
  INVENTORY_COMMON_COPY as inventoryCommon,
} from "@lib/inventory/grn-detail-model";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import { createPurchaseOrderFromGrn } from "@/(protected)/inventory/procurement-actions";
import { notify } from "@comtammatu/ui/lib/notify";
import { AddGrnLineDialog } from "./views/add-grn-line-dialog";
import { AmendOwnerDialog } from "./views/amend-owner-dialog";
import { DraftGrnLineCard } from "./views/draft-grn-line-card";
import { LineRow } from "./views/grn-line-row";
import { RecreateReceivingSiteDialog } from "./views/recreate-receiving-site-dialog";

export type { GrnDetail as GRNDetail } from "@lib/inventory/grn-detail-model";

import type {
  EditableGrnLine as EditableLine,
  GrnDetail as GRNDetail,
  RecreateReceivingLocationOption,
} from "@lib/inventory/grn-detail-model";

const DESK_LINE_EDIT_BREAKPOINT = 1024;

export function GRNDetailClient({
  grn,
  ingredients,
  canAdjustStock,
  canAmendConfirmed = false,
  canConfirm = true,
  canCreatePoFromGrn = false,
  recreateLocationOptions = [],
  auditLogs = [],
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  supplierInvoicesBasePath = "/finance/supplier-invoices",
  embedded = false,
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
  canAmendConfirmed?: boolean;
  canConfirm?: boolean;
  canCreatePoFromGrn?: boolean;
  recreateLocationOptions?: RecreateReceivingLocationOption[];
  auditLogs?: AuditLogRow[];
  grnListBasePath?: string;
  grnMobileBackPath?: string;
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
  const isDesktopLineEdit = !useIsMobile(DESK_LINE_EDIT_BREAKPOINT);
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isCreatingPo, startCreatePo] = useTransition();
  const [isAmending, startAmend] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [amendingLine, setAmendingLine] = useState<EditableLine | null>(null);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);

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
    });

  const backHref = isMobile ? grnMobileBackPath : grnListBasePath;
  const editingIdx =
    editingLineId == null
      ? -1
      : lines.findIndex((line) => line.lineId === editingLineId);
  const editingLine = editingIdx >= 0 ? lines[editingIdx] : null;
  const showDeskEditor =
    isDraft && isDesktopLineEdit && editingLine != null && editingIdx >= 0;

  const receivingLocationName =
    recreateLocationOptions.find((option) => option.id === grn.locationId)
      ?.name ?? null;

  const closeLineEdit = () => setEditingLineId(null);

  function handleCreatePoFromGrn() {
    startCreatePo(async () => {
      const result = await createPurchaseOrderFromGrn({ grnId: grn.id });
      if (!result.success) {
        notify.error(result.error ?? grnCopy.createPoFromGrnFailed);
        return;
      }
      notify.success(grnCopy.createPoFromGrnDone);
      router.refresh();
    });
  }

  const draftColumns = useMemo<DataTableColumn<EditableLine>[]>(
    () => [
      {
        key: "name",
        header: grnCopy.lineHeaderName,
        render: (line) => (
          <div className="min-w-0">
            <p className="min-w-0 truncate font-medium">{line.name}</p>
            {line.dirty ? (
              <Badge variant="outline" className="mt-1 text-2xs">
                {grnCopy.line.unsaved}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        key: "qty",
        header: inventoryCommon.quantityShort,
        className: "w-28 text-right",
        render: (line) => (
          <span className="font-mono tabular-nums">
            {formatQty(line.actual)} {line.unit}
          </span>
        ),
      },
      {
        key: "cost",
        header: grnCopy.lineHeaderCost,
        className: "w-32 text-right",
        render: (line) =>
          line.cost > 0 ? (
            <span className="font-mono tabular-nums">
              {inventoryCommon.currency(formatVND(line.cost))}
            </span>
          ) : (
            <span className="font-medium text-warning">
              {GRN_CREATE_COPY.priceRequired}
            </span>
          ),
      },
      {
        key: "total",
        header: grnCopy.lineHeaderTotal,
        className: "w-32 text-right",
        render: (line) =>
          line.cost > 0 ? (
            <span className="font-mono font-semibold tabular-nums">
              {inventoryCommon.currency(
                formatVND(line.cost * (line.actual - line.rejected)),
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{inventoryCommon.noValue}</span>
          ),
      },
      {
        key: "status",
        header: grnCopy.lineHeaderStatus,
        className: "w-28",
        render: (line) => {
          const label =
            line.qualityStatus === "accepted"
              ? grnCopy.line.qualityAccepted
              : line.qualityStatus === "partial"
                ? grnCopy.line.qualityPartial
                : grnCopy.line.qualityRejected;
          return (
            <Badge
              variant={
                line.qualityStatus === "accepted"
                  ? "success"
                  : line.qualityStatus === "partial"
                    ? "warning"
                    : "destructive"
              }
            >
              {label}
            </Badge>
          );
        },
      },
      {
        key: "actions",
        header: (
          <span className="sr-only">{GRN_CREATE_COPY.lineActionsAria}</span>
        ),
        className: "w-24 text-right",
        render: (line) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setEditingLineId(line.lineId)}
              aria-label={GRN_CREATE_COPY.editLineAria}
            >
              <IconPencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDeleteLine(line)}
              aria-label={grnCopy.line.deleteLineAria}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDeleteLine],
  );

  const confirmedColumns = useMemo<DataTableColumn<EditableLine>[]>(
    () => [
      {
        key: "name",
        header: grnCopy.lineHeaderName,
        render: (line) => (
          <div className="min-w-0">
            <p className="font-medium">{line.name}</p>
            {line.requiresReview ? (
              <Badge variant="destructive" className="mt-1">
                {grnCopy.line.reviewNeeded}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        key: "ordered",
        header: grnCopy.lineHeaderOrdered,
        className: "w-24 text-right",
        render: (line) => (
          <span className="font-mono tabular-nums">
            {line.poQuantity ?? line.required} {line.unit}
          </span>
        ),
      },
      {
        key: "actual",
        header: grnCopy.lineHeaderQty,
        className: "w-24 text-right",
        render: (line) => (
          <span className="font-mono tabular-nums">
            {line.actual} {line.unit}
          </span>
        ),
      },
      {
        key: "rejected",
        header: grnCopy.lineHeaderRejected,
        className: "w-24 text-right",
        render: (line) => (
          <span className="font-mono tabular-nums">
            {line.rejected} {line.unit}
          </span>
        ),
      },
      {
        key: "cost",
        header: grnCopy.lineHeaderCost,
        className: "w-28 text-right",
        render: (line) => (
          <span className="font-mono tabular-nums">
            {inventoryCommon.currency(formatVND(line.cost))}
          </span>
        ),
      },
      {
        key: "total",
        header: grnCopy.lineHeaderTotal,
        className: "w-32 text-right",
        render: (line) => (
          <span className="font-mono font-semibold tabular-nums">
            {inventoryCommon.currency(
              formatVND(line.cost * (line.actual - line.rejected)),
            )}
          </span>
        ),
      },
      {
        key: "status",
        header: grnCopy.lineHeaderStatus,
        className: "w-28",
        render: (line) => {
          const label =
            line.qualityStatus === "accepted"
              ? grnCopy.line.qualityAccepted
              : line.qualityStatus === "partial"
                ? grnCopy.line.qualityPartial
                : grnCopy.line.qualityRejected;
          return (
            <Badge
              variant={
                line.qualityStatus === "accepted"
                  ? "success"
                  : line.qualityStatus === "partial"
                    ? "warning"
                    : "destructive"
              }
            >
              {label}
            </Badge>
          );
        },
      },
      {
        key: "actions",
        header: <span className="sr-only">{grnCopy.amend.action}</span>,
        className: "w-20 text-right",
        render: (line) =>
          showAmendAffordance ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAmendingLine(line)}
            >
              {grnCopy.amend.action}
            </Button>
          ) : null,
      },
    ],
    [showAmendAffordance],
  );

  const footer = (
    <AppDetailFooter
      sticky
      leading={
        <>
          {/* Back lives in AppPageHeader / embedded chrome — not duplicated here. */}
          {isDraft ? (
            <>
              {lines.length > 0 ? (
                <p className="min-w-0 font-mono text-sm font-semibold tabular-nums">
                  {GRN_CREATE_COPY.footerLineSummary(lines.length, stats.total)}
                </p>
              ) : null}
              <RecreateReceivingSiteDialog
                mode="draft"
                grnId={grn.id}
                grnCode={grn.code}
                currentLocationId={grn.locationId}
                locationOptions={recreateLocationOptions}
                grnListBasePath={grnListBasePath}
                buttonSize={isMobile ? "touch" : "default"}
                disabledReason={
                  dirtyLines.length > 0
                    ? grnCopy.draftReceiving.saveBeforeSwitch
                    : undefined
                }
              />
            </>
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
              buttonSize={isMobile ? "touch" : "default"}
            />
          ) : null}
          {!isDraft ? (
            <Button
              variant="outline"
              size={isMobile ? "touch" : "default"}
              render={
                <Link
                  href={
                    grn.invoiceId
                      ? `${supplierInvoicesBasePath}?invoiceId=${grn.invoiceId}`
                      : `${supplierInvoicesBasePath}?grnId=${grn.id}`
                  }
                />
              }
            >
              <IconReceipt className="size-5" />
              {grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice}
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
              size={isMobile ? "touch" : "default"}
              onClick={handleSave}
              disabled={isSaving || dirtyLines.length === 0}
            >
              <IconDeviceFloppy className="size-5" />
              {grnCopy.saveChanges(dirtyLines.length)}
            </Button>
            {canCreatePoFromGrn ? (
              <Button
                type="button"
                variant="outline"
                size={isMobile ? "touch" : "default"}
                disabled={isCreatingPo || lines.length === 0}
                onClick={handleCreatePoFromGrn}
              >
                {grnCopy.createPoFromGrnAction}
              </Button>
            ) : null}
            <Button
              type="button"
              size={isMobile ? "touch-lg" : "default"}
              className="sm:min-w-80"
              disabled={
                !canConfirm ||
                isConfirming ||
                dirtyLines.length > 0 ||
                lines.length === 0
              }
              title={
                !canConfirm ? grnCopy.confirmBlockedNeedsApprovedPo : undefined
              }
              onClick={handleConfirmGrn}
            >
              <IconCircleCheck className="size-5" />
              {grnCopy.confirmGrnAction}
            </Button>
          </>
        ) : null
      }
    />
  );

  const contextStrip = (
    <div className="flex flex-col gap-3">
      <DescriptionList
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        descriptionClassName="font-semibold"
        items={[
          {
            term: grnCopy.supplier,
            description: grn.supplier,
          },
          {
            term: grnCopy.receivingWarehouse,
            description: `${grn.branchName}${receivingLocationName ? ` · ${receivingLocationName}` : ""}`,
          },
          ...(grn.poCode
            ? [
                {
                  term: grnCopy.linkedPo,
                  description: (
                    <span className="font-mono">{grn.poCode}</span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="success">
            {grnCopy.acceptedLines} {stats.acceptedLines}/{lines.length}
          </Badge>
          {stats.rejectedLines > 0 ? (
            <Badge variant="warning">
              {grnCopy.rejectedLines} {stats.rejectedLines}
            </Badge>
          ) : null}
          {stats.reviewLines > 0 ? (
            <Badge variant="destructive">
              {grnCopy.priceReviewNeeded} {stats.reviewLines}
            </Badge>
          ) : null}
        </div>
        {!isDraft ? (
          <p className="ml-auto font-mono text-base font-semibold tabular-nums text-primary">
            {inventoryCommon.currency(formatVND(stats.total))}
          </p>
        ) : null}
      </div>
    </div>
  );

  const draftLinesSection = (
    <AppSection
      className="overflow-hidden"
      title={grnCopy.inspectionItemsTitle}
      contentFlush
      action={
        <Button
          type="button"
          variant="outline"
          size={isMobile ? "touch" : "default"}
          onClick={() => setAddDialogOpen(true)}
        >
          <IconPlus className="size-4" />
          {grnCopy.addLine}
        </Button>
      }
    >
      <DataTable
        className="p-4 md:p-0"
        columns={draftColumns}
        data={lines}
        getRowKey={(line) => line.lineId}
        onRowClick={(line) => setEditingLineId(line.lineId)}
        emptyTitle={grnCopy.overviewLinesEmpty}
        mobileCardRender={(line) => (
          <DraftGrnLineCard
            line={line}
            onEdit={() => setEditingLineId(line.lineId)}
            onRemove={() => void handleDeleteLine(line)}
          />
        )}
      />
    </AppSection>
  );

  const confirmedLinesSection = (
    <AppSection
      className="overflow-hidden"
      title={grnCopy.inspectionItemsTitle}
      description={grnCopy.finalizedLineCount(lines.length)}
      contentFlush
    >
      <DataTable
        className="p-4 md:p-0"
        columns={confirmedColumns}
        data={lines}
        getRowKey={(line) => line.lineId}
        emptyTitle={grnCopy.overviewLinesEmpty}
        mobileCardRender={(line, idx) => (
          <LineRow
            tenantId={grn.tenantId}
            grnId={grn.id}
            line={line}
            idx={idx}
            isDraft={false}
            qc={qc}
            showAmendAffordance={showAmendAffordance}
            onChange={(p) => patch(idx, p)}
            onDelete={() => void handleDeleteLine(line)}
            onAmend={() => setAmendingLine(line)}
          />
        )}
        mobileFooter={
          <Item
            variant="outline"
            className="flex-col items-stretch gap-2 p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {grnCopy.totalStockValue}
              </span>
              <span className="font-mono font-semibold tabular-nums text-primary">
                {inventoryCommon.currency(formatVND(stats.total))}
              </span>
            </div>
          </Item>
        }
        desktopFooterRows={[
          {
            key: "grn-total",
            className: "border-border",
            cells: [
              {
                key: "label",
                colSpan: 5,
                className: "text-right text-sm font-bold",
                content: grnCopy.totalStockValue,
              },
              {
                key: "value",
                className:
                  "text-right font-mono font-semibold tabular-nums text-primary",
                content: inventoryCommon.currency(formatVND(stats.total)),
              },
              { key: "status", content: null },
              { key: "actions", content: null },
            ],
          },
        ]}
      />
    </AppSection>
  );

  const documentBody = (
    <div className="flex flex-col gap-3">
      {isReview && isDraft ? (
        <Alert>
          <IconInfoCircle className="size-4" />
          <AlertDescription>{grnCopy.draftSavedReviewHint}</AlertDescription>
        </Alert>
      ) : null}

      {/* Dense context only — lines are the first full section. */}
      {contextStrip}

      {isDraft ? (
        <div
          className={cn(
            // pb-24 clears sticky AppDetailFooter; desk editor max-h stays above it.
            "flex min-w-0 flex-col gap-3 pb-24",
            showDeskEditor &&
              "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start lg:gap-4",
          )}
        >
          <div className="flex min-w-0 flex-col gap-3">{draftLinesSection}</div>
          {showDeskEditor && editingLine && editingIdx >= 0 ? (
            <aside className="hidden lg:sticky lg:top-3 lg:z-0 lg:flex lg:max-h-[calc(100dvh-8.5rem)] lg:flex-col lg:overflow-hidden">
              <AppSection
                size="sm"
                title={editingLine.name}
                description={
                  editingLine.sku
                    ? `${editingLine.sku} · ${editingLine.unit}`
                    : editingLine.unit
                }
                className="flex min-h-0 max-h-full flex-col overflow-hidden"
                contentClassName="min-h-0 flex-1 gap-3 overflow-y-auto"
                footer={
                  <div className="flex w-full flex-col gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        void handleDeleteLine(editingLine);
                        closeLineEdit();
                      }}
                      className="w-full"
                    >
                      {ACTIONS_VI.delete}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeLineEdit}
                      className="w-full"
                    >
                      {ACTIONS_VI.close}
                    </Button>
                  </div>
                }
              >
                <LineRow
                  tenantId={grn.tenantId}
                  grnId={grn.id}
                  line={editingLine}
                  idx={editingIdx}
                  isDraft
                  qc={qc}
                  showAmendAffordance={false}
                  chrome="plain"
                  onChange={(p) => patch(editingIdx, p)}
                  onDelete={() => {
                    void handleDeleteLine(editingLine);
                    closeLineEdit();
                  }}
                  onAmend={() => undefined}
                />
              </AppSection>
            </aside>
          ) : null}
        </div>
      ) : (
        confirmedLinesSection
      )}
    </div>
  );

  const draftLineSheet =
    isDraft && !isDesktopLineEdit ? (
      <Sheet
        open={editingLine != null}
        onOpenChange={(open) => {
          if (!open) closeLineEdit();
        }}
      >
        <SheetContent
          side="bottom"
          className="h-auto max-h-dvh-95 gap-1 bg-background p-0 text-foreground"
          showCloseButton={false}
        >
          {editingLine && editingIdx >= 0 ? (
            <>
              <SheetHeader>
                <SectionLabel density="dense">
                  {GRN_CREATE_COPY.editItem}
                </SectionLabel>
                <SheetTitle className="text-lg font-semibold">
                  {editingLine.name}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {editingLine.sku ? `${editingLine.sku} · ` : ""}
                  {editingLine.unit}
                </p>
              </SheetHeader>
              <div className="max-h-[60dvh] overflow-y-auto p-4">
                <LineRow
                  tenantId={grn.tenantId}
                  grnId={grn.id}
                  line={editingLine}
                  idx={editingIdx}
                  isDraft
                  qc={qc}
                  showAmendAffordance={false}
                  chrome="plain"
                  onChange={(p) => patch(editingIdx, p)}
                  onDelete={() => {
                    void handleDeleteLine(editingLine);
                    closeLineEdit();
                  }}
                  onAmend={() => undefined}
                />
              </div>
              <SheetFooter>
                <Button
                  type="button"
                  variant="destructive"
                  size="touch-lg"
                  onClick={() => {
                    void handleDeleteLine(editingLine);
                    closeLineEdit();
                  }}
                  className="w-full"
                >
                  {ACTIONS_VI.delete}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="touch-lg"
                  onClick={closeLineEdit}
                  className="w-full"
                >
                  {ACTIONS_VI.close}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    ) : null;

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
      {draftLineSheet}
    </>
  );

  const tabs = (
    <AppPageTabs
      items={[
        { value: "document", label: grnCopy.documentTab },
        {
          value: "history",
          label: grnCopy.historyTab,
          count: auditLogs.length,
        },
      ]}
      defaultValue="document"
      stickyList={!embedded}
    >
      <TabsContent value="document" className="mt-4">
        {documentBody}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <AppSection title={grnCopy.historySectionTitle}>
          <AuditHistoryList logs={auditLogs} />
        </AppSection>
      </TabsContent>
    </AppPageTabs>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            render={<Link href={grnMobileBackPath} aria-label={grnCopy.back} />}
          >
            <IconArrowLeft className="size-4" />
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
        {tabs}
        {footer}
        {dialogs}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact" footer={footer}>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={grn.code}
        description={`${grn.supplier} • ${grn.branchName} • ${grn.date}`}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <AppBackLink href={backHref}>
            {isMobile ? grnCopy.back : tRoute("/inventory/grn", "heading")}
          </AppBackLink>
        }
      />
      {tabs}
      {dialogs}
    </AppPage>
  );
}
