"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { confirm } from "@/components/confirm-dialog";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog } from "@/components/form";

import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Info as IconInfoCircle,
  Receipt as IconReceipt,
  Save as IconDeviceFloppy,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import {
  AppBackLink,
  AppDetailFooter,
  AppPageHeader,
  AppSection,
  DescriptionList,
  AppSheet,
  DocumentFormFrame,
} from "@/components/surface";
import { ResponsiveActionButton } from "@/components/responsive-action-button";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { AuditHistoryList } from "@/components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { tRoute } from "../../_lib/dictionary";
import type { IngredientRow } from "@lib/inventory/types";
import { useGrnDetailActions as useGrnLineActions } from "@lib/inventory/use-grn-detail-actions";
import { useGrnDetailLines as useGrnLines } from "@lib/inventory/use-grn-detail-lines";
import {
  allLinkedPosApproved,
  GRN_DETAIL_COPY as grnCopy,
  acceptedGrnQuantity,
  calculateGrnQuantities,
  formatGrnPersistQty,
  formatGrnPoQty,
  formatGrnLineUnitPrice,
  grnLineQuantityConversion,
  confirmableGrnSuppliers,
  isGrnLineBooked,
} from "@lib/inventory/grn-detail-model";
import { supplierInvoiceHrefForGrn } from "@lib/inventory/grn-list-model";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  grnHasCostPendingLines,
  resolveGrnValuationDisplay,
} from "@lib/inventory/valuation-display";
import { messages } from "@lib/messages";
import { AddGrnLineDialog } from "./views/add-grn-line-dialog";
import { AmendOwnerDialog } from "./views/amend-owner-dialog";
import { DraftGrnLineCard } from "./views/draft-grn-line-card";
import { LineRow } from "./views/grn-line-row";
import { getPurchaseUnitOptions } from "@lib/inventory/purchase-units";
import {
  confirmedGrnUnitCostTargetFromDetail,
  isUnpricedConfirmedGrnLine,
  type ConfirmedGrnUnitCostTarget,
} from "@lib/inventory/grn-unpriced-queue-model";
import { ConfirmedGrnUnitCostDialog } from "./views/confirmed-grn-unit-cost-dialog";
import { DraftReceivingSiteDialog } from "./views/draft-receiving-site-dialog";
import { discardGrnDraft } from "../../grn-actions";

export type { GrnDetail as GRNDetail } from "@lib/inventory/grn-detail-model";

import type {
  EditableGrnLine as EditableLine,
  GrnDetail as GRNDetail,
  ReceivingLocationOption,
} from "@lib/inventory/grn-detail-model";

const DESK_LINE_EDIT_BREAKPOINT = 1024;
const grnMessages = messages.inventory.grn;
const valuationCopy = messages.inventory.valuationDisplay;

export function GRNDetailClient({
  grn,
  ingredients,
  canAdjustStock,
  canAmendConfirmed = false,
  canPatchConfirmedUnitCost = false,
  canEditDraft = false,
  canConfirm = true,
  canManageSupplierInvoice = false,
  receivingLocationOptions = [],
  auditLogs = [],
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  supplierInvoicesBasePath = "/finance/supplier-invoices",
  embedded = false,
  presentation = "page",
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
  canAmendConfirmed?: boolean;
  canPatchConfirmedUnitCost?: boolean;
  canEditDraft?: boolean;
  canConfirm?: boolean;
  canManageSupplierInvoice?: boolean;
  receivingLocationOptions?: ReceivingLocationOption[];
  auditLogs?: AuditLogRow[];
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  supplierInvoicesBasePath?: string;
  embedded?: boolean;
  presentation?: "page" | "dialog";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = embedded;
  const isDesktopLineEdit = !useIsMobile(DESK_LINE_EDIT_BREAKPOINT);
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isAmending, startAmend] = useTransition();
  const [isCancelling, startCancel] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [amendingLine, setAmendingLine] = useState<EditableLine | null>(null);
  const [unitCostTarget, setUnitCostTarget] =
    useState<ConfirmedGrnUnitCostTarget | null>(null);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const isDraft = grn.status === "draft";
  const isConfirmed = grn.status === "confirmed";
  const canMutateDraft = canEditDraft && isDraft;
  const canChangeLineSet =
    canMutateDraft && grn.poId == null && grn.linkedPos.length === 0;
  const statusBadgeMeta = getStatusBadgeMeta("inventory", grn.status);
  const statusBadge = {
    ...statusBadgeMeta,
    label: isDraft
      ? "Chờ nhập hàng"
      : isConfirmed
        ? "Đã nhập kho"
        : statusBadgeMeta.label,
  };
  const showAmendAffordance = canAmendConfirmed && isConfirmed;

  const { lines, setLines, patch, dirtyLines } = useGrnLines(grn.items);
  const ingredientById = useMemo(
    () => new Map(ingredients.map((item) => [item.id, item])),
    [ingredients],
  );

  const openConfirmedUnitCostDialog = useCallback(
    (line: EditableLine) => {
      const ingredient = ingredientById.get(line.ingredientId);
      const unitOptions = getPurchaseUnitOptions(ingredient).map((option) => ({
        unitId: option.unitId,
        label: option.label,
      }));
      setUnitCostTarget(
        confirmedGrnUnitCostTargetFromDetail(grn, line, unitOptions),
      );
    },
    [grn, ingredientById],
  );
  const confirmableSuppliers = confirmableGrnSuppliers(lines);
  const hasBookedLines = lines.some((line) => isGrnLineBooked(line));
  const valuationKind = resolveGrnValuationDisplay({
    status: grn.status,
    invoiceId: grn.invoiceId,
    hasCostPendingLines: grnHasCostPendingLines(lines),
  });

  function closeOwnerDialogUrl() {
    const params = new URLSearchParams(window.location.search);
    const returnTo = getSafeInternalReturnTo(params.get("returnTo"));
    params.delete("grnId");
    params.delete("mode");
    params.delete("returnTo");
    if (returnTo) {
      router.push(returnTo, { scroll: false });
      return;
    }
    const q = params.toString();
    window.history.replaceState(
      null,
      "",
      q ? `${pathname}?${q}` : pathname,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

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
      onConfirmed: presentation === "dialog" ? closeOwnerDialogUrl : undefined,
    });

  const confirmButtons =
    confirmableSuppliers.length === 0 ? (
      <Button
        type="button"
        size="default"
        className="sm:min-w-80"
        disabled
        aria-disabled
      >
        <IconCircleCheck className="size-5" />
        {grnCopy.confirmGrnAction}
      </Button>
    ) : (
      confirmableSuppliers.map((supplier) => (
        <Button
          key={supplier.id}
          type="button"
          size="default"
          className="sm:min-w-80"
          disabled={!canConfirm || isConfirming}
          aria-disabled={!canConfirm || isConfirming}
          onClick={() => void handleConfirmGrn(supplier.id)}
        >
          <IconCircleCheck className="size-5" />
          {grnCopy.confirmSupplierAction(supplier.name)}
        </Button>
      ))
    );

  function cancelDraft() {
    startCancel(async () => {
      const result = await discardGrnDraft({
        grnId: grn.id,
        reason: cancelReason,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(grnMessages.cancelledToast);
      setCancelOpen(false);
      setCancelReason("");
      if (presentation === "dialog") closeOwnerDialogUrl();
      else router.push(grnListBasePath);
      router.refresh();
    });
  }

  const backHref = grnListBasePath;
  const editingIdx =
    editingLineId == null
      ? -1
      : lines.findIndex((line) => line.lineId === editingLineId);
  const editingLine = editingIdx >= 0 ? lines[editingIdx] : null;
  const receivingLocationName = grn.locationName;
  const linkedPoApproved = allLinkedPosApproved(
    grn.linkedPos,
    grn.poStatus ?? null,
  );

  const closeLineEdit = () => setEditingLineId(null);

  const nextStepBanner = (() => {
    if (isConfirmed && valuationKind === "pending_invoice") {
      return {
        title: valuationCopy.pendingInvoice,
        body: valuationCopy.hintReceivedAwaitingInvoice,
        action: canManageSupplierInvoice ? (
          <Button
            size="sm"
            render={
              <Link
                href={supplierInvoiceHrefForGrn({
                  basePath: supplierInvoicesBasePath,
                  grnId: grn.id,
                  invoiceId: grn.invoiceId,
                })}
              />
            }
          >
            <IconReceipt className="size-4" />
            {grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice}
          </Button>
        ) : null,
      };
    }
    if (!isDraft) return null;
    if (dirtyLines.length > 0) {
      return {
        title: grnCopy.nextStepSaveFirstTitle,
        body: grnCopy.nextStepSaveFirstBody,
        action: null as ReactNode,
      };
    }
    if (
      (grn.poId != null || grn.linkedPos.length > 0) &&
      !linkedPoApproved
    ) {
      return {
        title: grnCopy.nextStepAwaitingPoTitle,
        body: grnCopy.nextStepAwaitingPoBody,
        action:
          grn.linkedPos.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {grn.linkedPos.map((po) => (
                <Button
                  key={po.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      href={`/inventory/purchase-orders?tab=orders&poId=${po.id}&mode=view`}
                    />
                  }
                >
                  {po.poNumber}
                </Button>
              ))}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={
                <Link
                  href={`/inventory/purchase-orders?tab=orders&poId=${grn.poId}&mode=view`}
                />
              }
            >
              {grnCopy.openLinkedPo}
            </Button>
          ),
      };
    }
    if (canConfirm) return null;
    if (grn.poId == null) {
      return {
        title: grnCopy.nextStepNeedPoTitle,
        body: grnCopy.nextStepWaitingAccountant,
        action: null,
      };
    }
    return null;
  })();

  const draftColumns = useMemo<DataTableColumn<EditableLine>[]>(
    () => [
      {
        key: "name",
        header: grnCopy.lineHeaderName,
        className: "min-w-56 max-w-72 align-top",
        render: (line) => (
          <div className="min-w-0">
            <p className="min-w-0 truncate font-medium">{line.name}</p>
            {line.supplierName ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {line.supplierName}
              </p>
            ) : null}
            {isGrnLineBooked(line) ? (
              <Badge variant="secondary" className="mt-1 text-2xs">
                {grnCopy.line.bookedLine}
              </Badge>
            ) : null}
            {line.dirty ? (
              <Badge variant="outline" className="mt-1 text-2xs">
                {grnCopy.line.unsaved}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        key: "ordered",
        header: grnCopy.lineHeaderOrdered,
        className: "w-28 min-w-24 align-top",
        render: (line) => {
          const orderedQty = line.poQuantity ?? line.remainingQuantity;
          return (
            <div>
              <p className="font-mono font-medium tabular-nums">
                {formatGrnPoQty(orderedQty, line)}
              </p>
              {line.previouslyReceived > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {grnCopy.line.receivedBeforeText(
                    formatGrnPoQty(line.previouslyReceived, line),
                  )}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "actual",
        header: grnCopy.lineHeaderQty,
        className: "min-w-56 align-top",
        render: (line, idx) =>
          canMutateDraft && isDesktopLineEdit ? (
            <LineRow
              tenantId={grn.tenantId}
              grnId={grn.id}
              line={line}
              idx={idx}
              isDraft={isDraft && !isGrnLineBooked(line)}
              showAmendAffordance={false}
              showHeader={false}
              section="quantity"
              compactLabels
              chrome="plain"
              ingredient={ingredientById.get(line.ingredientId)}
              onChange={(p) => patch(idx, p)}
              onAmend={() => undefined}
            />
          ) : (
            <p
              className={
                acceptedGrnQuantity(line.actual, line.rejected) > 0
                  ? "font-mono font-medium tabular-nums"
                  : "text-muted-foreground"
              }
            >
              {acceptedGrnQuantity(line.actual, line.rejected) > 0
                ? formatGrnPersistQty(
                    acceptedGrnQuantity(line.actual, line.rejected),
                    line,
                  )
                : grnCopy.line.enterQuantity}
            </p>
          ),
      },
      {
        key: "unitPrice",
        header: grnCopy.lineHeaderUnitPrice,
        className: "min-w-44 align-top",
        render: (line, idx) =>
          canMutateDraft && isDesktopLineEdit ? (
            <LineRow
              tenantId={grn.tenantId}
              grnId={grn.id}
              line={line}
              idx={idx}
              isDraft={isDraft && !isGrnLineBooked(line)}
              showAmendAffordance={false}
              showHeader={false}
              section="unitPrice"
              compactLabels
              chrome="plain"
              ingredient={ingredientById.get(line.ingredientId)}
              onChange={(p) => patch(idx, p)}
              onAmend={() => undefined}
            />
          ) : formatGrnLineUnitPrice(line) ? (
            <p className="font-mono font-medium tabular-nums">
              {formatGrnLineUnitPrice(line)}
            </p>
          ) : (
            <p className="text-muted-foreground">—</p>
          ),
      },
      {
        key: "applied",
        header: "Kết quả",
        className: "min-w-44 max-w-sm align-top",
        render: (line, idx) => {
          const quantities = calculateGrnQuantities(
            line.actual,
            line.rejected,
            line.remainingQuantity,
            grnLineQuantityConversion(line),
          );
          const applied = isDraft
            ? quantities.poAppliedQuantity
            : line.poAppliedQuantity;
          const excess = isDraft
            ? quantities.excessQuantity
            : line.excessQuantity;
          const shortage = isDraft
            ? quantities.shortageQuantity
            : line.shortageQuantity;
          if (line.actual <= 0) {
            return (
              <div className="flex flex-col gap-2">
                <Badge variant="outline">{grnCopy.line.notInspected}</Badge>
                {canMutateDraft && isDesktopLineEdit && !isGrnLineBooked(line) ? (
                  <LineRow
                    tenantId={grn.tenantId}
                    grnId={grn.id}
                    line={line}
                    idx={idx}
                    isDraft={isDraft}
                    showAmendAffordance={false}
                    showHeader={false}
                    section="rejection"
                    compactLabels
                    chrome="plain"
                    ingredient={ingredientById.get(line.ingredientId)}
                    onChange={(p) => patch(idx, p)}
                    onAmend={() => undefined}
                  />
                ) : null}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-2">
              <div>
                <p className="font-mono font-medium tabular-nums">
                  {grnCopy.line.acceptedShortText(formatGrnPoQty(applied, line))}
                </p>
                {shortage > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {grnCopy.line.shortageShortText(
                      formatGrnPoQty(shortage, line),
                    )}
                  </p>
                ) : null}
                {excess > 0 ? (
                  <Badge variant="warning" className="mt-1">
                    {grnCopy.line.excessShortText(
                      formatGrnPersistQty(excess, line),
                    )}
                  </Badge>
                ) : null}
                {!isDraft && line.costPending ? (
                  <Badge variant="warning" className="mt-1">
                    {valuationCopy.pendingInvoice}
                  </Badge>
                ) : null}
              </div>
              {canMutateDraft && isDesktopLineEdit && !isGrnLineBooked(line) ? (
                <LineRow
                  tenantId={grn.tenantId}
                  grnId={grn.id}
                  line={line}
                  idx={idx}
                  isDraft={isDraft}
                  showAmendAffordance={false}
                  showHeader={false}
                  section="rejection"
                  compactLabels
                  chrome="plain"
                  ingredient={ingredientById.get(line.ingredientId)}
                  onChange={(p) => patch(idx, p)}
                  onAmend={() => undefined}
                />
              ) : null}
            </div>
          );
        },
      },
      {
        key: "actions",
        header: (
          <span className="sr-only">{GRN_CREATE_COPY.lineActionsAria}</span>
        ),
        className: "w-20 align-top text-right",
        render: (line) => {
          const showUnitCostPatch =
            canPatchConfirmedUnitCost &&
            !isDraft &&
            isUnpricedConfirmedGrnLine(line);
          if (!canChangeLineSet && !showUnitCostPatch) return null;
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {showUnitCostPatch ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openConfirmedUnitCostDialog(line)}
                >
                  {grnCopy.confirmedUnitCost.confirmAction}
                </Button>
              ) : null}
              {canChangeLineSet ? (
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
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      canChangeLineSet,
      canMutateDraft,
      canPatchConfirmedUnitCost,
      handleDeleteLine,
      ingredientById,
      isDesktopLineEdit,
      isDraft,
      openConfirmedUnitCostDialog,
    ],
  );

  const confirmedColumns = draftColumns;

  const footer = (
    <AppDetailFooter
      sticky
      leading={
        <>
          {/* Back lives in AppPageHeader — not duplicated here. */}
          {isDraft ? (
            <>
              {canMutateDraft ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="default"
                  disabled={isCancelling}
                  onClick={() => setCancelOpen(true)}
                >
                  {grnMessages.cancelAction}
                </Button>
              ) : null}
              {lines.length > 0 ? (
                <p className="min-w-0 font-mono text-sm font-semibold tabular-nums">
                  {GRN_CREATE_COPY.footerLineSummary(lines.length)}
                </p>
              ) : null}
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
          {(!isDraft || hasBookedLines) && canManageSupplierInvoice ? (
            <Button
              variant={
                valuationKind === "pending_invoice" ? "default" : "outline"
              }
              size="default"
              render={
                <Link
                  href={supplierInvoiceHrefForGrn({
                    basePath: supplierInvoicesBasePath,
                    grnId: grn.id,
                    invoiceId: grn.invoiceId,
                  })}
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
          canMutateDraft && dirtyLines.length > 0 ? (
            <Button
              type="button"
              size="default"
              onClick={handleSave}
              disabled={isSaving}
            >
              <IconDeviceFloppy className="size-5" />
              {grnCopy.saveChanges(dirtyLines.length)}
            </Button>
          ) : (
            confirmButtons
          )
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
          ...(grn.linkedPos.length > 0
            ? [
                {
                  term: grnCopy.linkedPo,
                  description: (
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      {grn.linkedPos.map((po) => (
                        <Link
                          key={po.id}
                          href={`/inventory/purchase-orders?tab=orders&poId=${po.id}&mode=view`}
                          className="font-mono text-primary hover:underline"
                        >
                          {po.poNumber}
                          {grn.linkedPos.length > 1
                            ? ` · ${po.supplierName}`
                            : ""}
                        </Link>
                      ))}
                    </span>
                  ),
                },
              ]
            : grn.poCode
              ? [
                  {
                    term: grnCopy.linkedPo,
                    description:
                      grn.poId != null ? (
                        <Link
                          href={`/inventory/purchase-orders?tab=orders&poId=${grn.poId}&mode=view`}
                          className="font-mono text-primary hover:underline"
                        >
                          {grn.poCode}
                        </Link>
                      ) : (
                        <span className="font-mono">{grn.poCode}</span>
                      ),
                  },
                ]
              : []),
          {
            term: "Ngày dự kiến",
            description: grn.expectedReceiveDate ?? "—",
          },
        ]}
      />
      {canChangeLineSet ? (
        <DraftReceivingSiteDialog
          grnId={grn.id}
          grnCode={grn.code}
          currentLocationId={grn.locationId}
          locationOptions={receivingLocationOptions}
          buttonSize="default"
          disabledReason={
            dirtyLines.length > 0
              ? grnCopy.draftReceiving.saveBeforeSwitch
              : undefined
          }
        />
      ) : null}
    </div>
  );

  const draftLinesSection = (
    <AppSection
      className="overflow-hidden"
      title={grnCopy.inspectionItemsTitle}
      contentFlush
      action={
        canChangeLineSet ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={() => setAddDialogOpen(true)}
          >
            <IconPlus className="size-4" />
            {grnCopy.addLine}
          </Button>
        ) : null
      }
    >
      <DataTable
        columns={draftColumns}
        data={lines}
        getRowKey={(line) => line.lineId}
        onRowClick={
          canMutateDraft && !isDesktopLineEdit
            ? (line) => {
                if (isGrnLineBooked(line)) return;
                setEditingLineId(line.lineId);
              }
            : undefined
        }
        emptyTitle={grnCopy.overviewLinesEmpty}
        mobileCardRender={(line, idx) =>
          canMutateDraft ? (
            <DraftGrnLineCard
              line={line}
              onEdit={
                isGrnLineBooked(line)
                  ? undefined
                  : () => setEditingLineId(line.lineId)
              }
              onRemove={
                canChangeLineSet && !isGrnLineBooked(line)
                  ? () => void handleDeleteLine(line)
                  : undefined
              }
            />
          ) : (
            <LineRow
              tenantId={grn.tenantId}
              grnId={grn.id}
              line={line}
              idx={idx}
              isDraft={false}
              showAmendAffordance={false}
              ingredient={ingredientById.get(line.ingredientId)}
              onChange={() => undefined}
              onDelete={() => undefined}
              onAmend={() => undefined}
            />
          )
        }
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
            showAmendAffordance={showAmendAffordance}
            ingredient={ingredientById.get(line.ingredientId)}
            onChange={(p) => patch(idx, p)}
            onDelete={() => void handleDeleteLine(line)}
            onAmend={() => setAmendingLine(line)}
            onPatchUnitCost={
              canPatchConfirmedUnitCost && isUnpricedConfirmedGrnLine(line)
                ? () => openConfirmedUnitCostDialog(line)
                : undefined
            }
          />
        )}
      />
    </AppSection>
  );

  const exceptionLineCount = lines.filter(
    (line) =>
      line.shortageQuantity > 0 ||
      line.excessQuantity > 0 ||
      line.rejected > 0,
  ).length;
  const inspectedLineCount = lines.filter(
    (line) => line.actual > 0 || line.rejected > 0,
  ).length;

  const documentBody = (
    <div className="flex flex-col gap-6">
      {nextStepBanner ? (
        <Alert>
          <IconInfoCircle className="size-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="font-medium">{nextStepBanner.title}. </span>
              {nextStepBanner.body}
            </span>
            {nextStepBanner.action}
          </AlertDescription>
        </Alert>
      ) : null}

      <Item
        variant="outline"
        className="grid grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-4"
      >
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {grnMessages.kpiLines}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {lines.length}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {grnMessages.kpiInspected}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {inspectedLineCount}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {grnMessages.kpiExceptions}
          </span>
          <span
            className={
              exceptionLineCount > 0
                ? "mt-1 block font-mono text-base font-semibold tabular-nums text-destructive"
                : "mt-1 block font-mono text-base font-semibold tabular-nums text-foreground"
            }
          >
            {exceptionLineCount}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {grnMessages.kpiExpected}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {grn.expectedReceiveDate ?? "—"}
          </span>
        </div>
      </Item>

      {presentation === "dialog" ? (
        canChangeLineSet ? (
          <DraftReceivingSiteDialog
            grnId={grn.id}
            grnCode={grn.code}
            currentLocationId={grn.locationId}
            locationOptions={receivingLocationOptions}
            buttonSize="default"
            disabledReason={
              dirtyLines.length > 0
                ? grnCopy.draftReceiving.saveBeforeSwitch
                : undefined
            }
          />
        ) : null
      ) : (
        contextStrip
      )}

      {isDraft ? (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-3">{draftLinesSection}</div>
        </div>
      ) : (
        confirmedLinesSection
      )}
    </div>
  );

  const draftLineSheet =
    canMutateDraft && !isDesktopLineEdit ? (
      <AppSheet
        open={editingLine != null}
        onOpenChange={(open) => {
          if (!open) closeLineEdit();
        }}
        title={editingLine?.name ?? GRN_CREATE_COPY.editItem}
        description={
          editingLine
            ? `${editingLine.sku ? `${editingLine.sku} · ` : ""}${editingLine.unit}`
            : GRN_CREATE_COPY.editItem
        }
        side="bottom"
        showCloseButton={false}
        contentClassName="h-auto max-h-dvh-95 gap-1 bg-background text-foreground"
        footer={
          editingLine && editingIdx >= 0 ? (
            <>
              {canChangeLineSet ? (
                <ResponsiveActionButton
                  type="button"
                  variant="destructive"
                  density="hero"
                  onClick={() => {
                    void handleDeleteLine(editingLine);
                    closeLineEdit();
                  }}
                  className="w-full"
                >
                  {ACTIONS_VI.delete}
                </ResponsiveActionButton>
              ) : null}
              <ResponsiveActionButton
                type="button"
                variant="outline"
                density="hero"
                onClick={closeLineEdit}
                className="w-full"
              >
                {ACTIONS_VI.close}
              </ResponsiveActionButton>
            </>
          ) : null
        }
      >
        {editingLine && editingIdx >= 0 ? (
          <>
            <SectionLabel density="dense">{GRN_CREATE_COPY.editItem}</SectionLabel>
            <LineRow
              tenantId={grn.tenantId}
              grnId={grn.id}
              line={editingLine}
              idx={editingIdx}
              isDraft={isDraft && !isGrnLineBooked(editingLine)}
              showAmendAffordance={false}
              chrome="plain"
              ingredient={ingredientById.get(editingLine.ingredientId)}
              onChange={(p) => patch(editingIdx, p)}
              onDelete={
                canChangeLineSet
                  ? () => {
                      void handleDeleteLine(editingLine);
                      closeLineEdit();
                    }
                  : undefined
              }
              onAmend={() => undefined}
            />
          </>
        ) : null}
      </AppSheet>
    ) : null;

  const dialogs = (
    <>
      {canChangeLineSet ? (
        <AddGrnLineDialog
          grn={grn}
          ingredients={ingredients}
          isOpen={addDialogOpen}
          isPending={isSaving}
          onOpenChange={setAddDialogOpen}
          onSaved={upsertLocalLine}
          startTransition={startSave}
        />
      ) : null}
      <AmendOwnerDialog
        tenantId={grn.tenantId}
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
      <ConfirmedGrnUnitCostDialog
        target={unitCostTarget}
        onClose={() => setUnitCostTarget(null)}
        onPatched={(patch) => {
          setLines((prev) =>
            prev.map((item) =>
              item.lineId === patch.grnItemId
                ? {
                    ...item,
                    unitCostUnitId: patch.unitCostUnitId,
                    unitCostUnitLabel: patch.unitCostUnitLabel,
                    costPending: false,
                    suggestedUnitCost: null,
                    suggestedUnitCostUnitId: null,
                    suggestedUnitName: null,
                    suggestedSourceGrnId: null,
                    suggestedSourceGrnNumber: null,
                    monetary: {
                      unitPrice: patch.unitCost,
                      lineTotal: patch.totalCost,
                    },
                  }
                : item,
            ),
          );
          router.refresh();
        }}
      />
      {draftLineSheet}
      <ReasonConfirmDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelReason("");
        }}
        title={grnMessages.cancelTitle}
        description={grnMessages.cancelDraftDescription}
        reasonId="grn-cancel-reason"
        reason={cancelReason}
        onReasonChange={setCancelReason}
        reasonLabel={grnMessages.cancelReason}
        reasonPlaceholder={grnMessages.cancelReasonPlaceholder}
        cancelLabel={ACTIONS_VI.back}
        confirmLabel={grnMessages.cancelAction}
        onConfirm={cancelDraft}
        isPending={isCancelling}
      />
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
      stickyList={!embedded && presentation !== "dialog"}
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
              {grn.supplier} • {grn.poCode || "—"} • {grn.branchName}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            {valuationKind === "pending_invoice" ? (
              <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
            ) : null}
          </div>
        </div>
        {tabs}
        {footer}
        {dialogs}
      </div>
    );
  }

  if (presentation === "dialog") {
    const closeDialog = async () => {
      if (
        dirtyLines.length > 0 &&
        !(await confirm({
          title: messages.common.unsavedChangesTitle,
          description: messages.common.unsavedChangesDescription,
          variant: "destructive",
        }))
      ) {
        return;
      }
      closeOwnerDialogUrl();
    };

    const invoiceIsPrimary =
      (!isDraft || hasBookedLines) &&
      canManageSupplierInvoice &&
      valuationKind === "pending_invoice";
    const dialogOverflowItems: RowActionItem[] = [];
    if (isDraft && canMutateDraft) {
      dialogOverflowItems.push({
        key: "cancel",
        label: grnMessages.cancelAction,
        destructive: true,
        disabled: isCancelling,
        onSelect: () => setCancelOpen(true),
      });
    }
    if ((!isDraft || hasBookedLines) && canManageSupplierInvoice && !invoiceIsPrimary) {
      dialogOverflowItems.push({
        key: "invoice",
        label: grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice,
        href: supplierInvoiceHrefForGrn({
          basePath: supplierInvoicesBasePath,
          grnId: grn.id,
          invoiceId: grn.invoiceId,
        }),
      });
    }

    const dialogFooter = (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={() => void closeDialog()}
        >
          {ACTIONS_VI.close}
        </Button>
        {dialogOverflowItems.length > 0 ? (
          <RowActionsMenu items={dialogOverflowItems} />
        ) : null}
        {!isDraft && canAdjustStock && lines.length > 0 && !invoiceIsPrimary ? (
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
        {isDraft && canMutateDraft && dirtyLines.length > 0 ? (
          <Button
            type="button"
            size="default"
            onClick={handleSave}
            disabled={isSaving}
          >
            <IconDeviceFloppy className="size-5" />
            {grnCopy.saveChanges(dirtyLines.length)}
          </Button>
        ) : null}
        {isDraft && !(canMutateDraft && dirtyLines.length > 0)
          ? confirmButtons
          : null}
        {invoiceIsPrimary ? (
          <Button
            variant="default"
            size="default"
            render={
              <Link
                href={supplierInvoiceHrefForGrn({
                  basePath: supplierInvoicesBasePath,
                  grnId: grn.id,
                  invoiceId: grn.invoiceId,
                })}
              />
            }
          >
            <IconReceipt className="size-5" />
            {grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice}
          </Button>
        ) : null}
      </div>
    );

    return (
      <>
        <AppDialog
          open
          onOpenChange={(open) => {
            if (!open) void closeDialog();
          }}
          variant="document"
          title={
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{grn.code}</span>
              <StatusBadge
                domain="inventory"
                value={grn.status}
                label={statusBadge.label}
              />
              {valuationKind === "pending_invoice" ? (
                <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
              ) : null}
            </div>
          }
          description={
            <span>
              {grn.supplier}
              <span className="text-muted-foreground">
                {" "}
                · {grn.branchName}
                {grn.poCode ? ` · ${grn.poCode}` : ""}
              </span>
            </span>
          }
          footer={dialogFooter}
        >
          {tabs}
        </AppDialog>
        {dialogs}
      </>
    );
  }

  return (
    <DocumentFormFrame
      width="xwide"
      density="compact"
      footer={footer}
      header={
        <AppPageHeader
          title={grn.code}
          badge={{
            children:
              valuationKind === "pending_invoice"
                ? `${statusBadge.label} · ${valuationCopy.pendingInvoice}`
                : statusBadge.label,
            variant: statusBadge.variant,
          }}
          breadcrumb={
            <AppBackLink href={backHref}>
              {tRoute("/inventory/grn", "heading")}
            </AppBackLink>
          }
        />
      }
    >
      {tabs}
      {dialogs}
    </DocumentFormFrame>
  );
}
