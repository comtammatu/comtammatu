"use client";

import Link from "next/link";
import { TriangleAlert as IconAlertTriangle, Upload as IconUpload } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";

import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
import type { FormControlSize } from "@/components/form/control-size";
import { StatusBadge } from "@/components/status-badge";
import { formatAccountingVND as formatVND, formatPercent } from "@comtammatu/shared/format";
import { parseMoneyToMinorUnits } from "@comtammatu/shared/money";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import type { SupplierInvoiceValuationSummary } from "../supplier-invoice-actions";
import { getSupplierInvoiceDisplayMatchStatus as getDisplayMatchStatus } from "./supplier-invoice-list-model";
import { isSupplierInvoiceOverdue as isInvoiceOverdue, isSupplierInvoiceMissingVatEvidence } from "./supplier-invoice-list-model";
import { getSupplierInvoiceOutstandingAmount, type SupplierInvoiceRow } from "./supplier-invoice-row";
import { DetailFact } from "./supplier-invoice-detail-fact";
import {
  formatSupplierInvoiceDate,
  getPaymentMethodLabel,
} from "./supplier-invoice-form-schema";

import { ResponsiveActionButton } from "@/components/responsive-action-button";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
export type SupplierInvoiceDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailTitle: string;
  detailSubtitle: string | null;
  selectedInvoice: SupplierInvoiceRow | null;
  invoicesInSelectedGroup: SupplierInvoiceRow[];
  selectedOutstandingAmount: number;
  selectedSupplierAdvanceAmount: string;
  paymentOutstandingAmount: string;
  valuationSummary: SupplierInvoiceValuationSummary | null;
  valuationSummaryLoading: boolean;
  missingVatAttachment: boolean;
  canShowPayAction: boolean;
  canPaySupplier: boolean;
  canCreateInvoice: boolean;
  canAttachVatEvidence: boolean;
  canAcceptDiscrepancy: boolean;
  payIsPrimary: boolean;
  uploadIsPrimary: boolean;
  showMatchProblem: boolean;
  selectedMissingMatchingEvidence: boolean;
  vatSummaryLabel: string | null;
  selectedAgingLabel: string | null;
  copy: typeof messages.inventory.supplierInvoices;
  controlSize: Exclude<FormControlSize, "responsive">;
  grnBasePath: string;
  isPending: boolean;
  vatUploading: boolean;
  onSelectInvoiceInGroup: (invoiceId: number) => void;
  onVatAttachmentUpload: (file: File) => void;
  onOpenVatAttachment: () => void;
  onConfirmInvoice: () => void;
  onEditInvoice: () => void;
  onPay: () => void;
  onAllocateAdvance: () => void;
  onVerifyService: () => void;
  onAcceptDiscrepancy: () => void;
  onCredit: () => void;
  onRecomputeMatching: () => void;
};

export function SupplierInvoiceDetailSheet({
  open,
  onOpenChange,
  detailTitle,
  detailSubtitle,
  selectedInvoice,
  invoicesInSelectedGroup,
  selectedOutstandingAmount,
  selectedSupplierAdvanceAmount,
  paymentOutstandingAmount,
  valuationSummary,
  valuationSummaryLoading,
  missingVatAttachment,
  canShowPayAction,
  canPaySupplier,
  canCreateInvoice,
  canAttachVatEvidence,
  canAcceptDiscrepancy,
  payIsPrimary,
  uploadIsPrimary,
  showMatchProblem,
  selectedMissingMatchingEvidence,
  vatSummaryLabel,
  selectedAgingLabel,
  copy,
  controlSize,
  grnBasePath,
  isPending,
  vatUploading,
  onSelectInvoiceInGroup,
  onVatAttachmentUpload,
  onOpenVatAttachment,
  onConfirmInvoice,
  onEditInvoice,
  onPay,
  onAllocateAdvance,
  onVerifyService,
  onAcceptDiscrepancy,
  onCredit,
  onRecomputeMatching,
}: SupplierInvoiceDetailSheetProps) {
  const selectedLastPayment = selectedInvoice?.lastPayment ?? null;

  const footerActions: Array<RowActionItem & { primary?: boolean }> = [];
  if (selectedInvoice) {
    if (
      canAcceptDiscrepancy &&
      selectedInvoice.documentStatus === "draft" &&
      selectedInvoice.matchStatus === "matched"
    ) {
      footerActions.push({
        key: "confirm",
        label: copy.confirmInvoiceAction,
        onSelect: onConfirmInvoice,
        disabled: isPending,
        primary: true,
      });
    }
    if (canCreateInvoice && selectedInvoice.documentStatus === "draft") {
      footerActions.push({
        key: "edit",
        label: ACTIONS_VI.edit,
        onSelect: onEditInvoice,
        disabled: isPending,
      });
    }
    if (canShowPayAction) {
      footerActions.push({
        key: "pay",
        label: copy.payAction,
        onSelect: onPay,
        disabled: isPending || missingVatAttachment,
        primary: payIsPrimary,
      });
    }
    if (
      canPaySupplier &&
      parseMoneyToMinorUnits(selectedSupplierAdvanceAmount) > 0n &&
      parseMoneyToMinorUnits(paymentOutstandingAmount) > 0n
    ) {
      footerActions.push({
        key: "allocate",
        label: copy.allocateAdvanceAction,
        onSelect: onAllocateAdvance,
        disabled: isPending,
      });
    }
    if (
      canAcceptDiscrepancy &&
      selectedInvoice.invoiceKind === "service" &&
      selectedInvoice.matchStatus === "pending"
    ) {
      footerActions.push({
        key: "verify",
        label: copy.verifyServiceAction,
        onSelect: onVerifyService,
        disabled: isPending,
        primary: true,
      });
    }
    if (
      canAcceptDiscrepancy &&
      selectedInvoice.invoiceKind === "goods" &&
      selectedInvoice.matchStatus === "discrepancy"
    ) {
      footerActions.push({
        key: "accept",
        label: copy.acceptDiscrepancy,
        onSelect: onAcceptDiscrepancy,
        disabled: isPending,
        primary: true,
      });
    }
    if (canAcceptDiscrepancy && selectedOutstandingAmount > 0) {
      footerActions.push({
        key: "credit",
        label: copy.creditAction,
        onSelect: onCredit,
        disabled: isPending,
      });
    }
    if (canAcceptDiscrepancy && selectedInvoice.invoiceKind === "goods") {
      footerActions.push({
        key: "recompute",
        label: copy.recomputeMatching,
        onSelect: onRecomputeMatching,
        disabled: isPending,
      });
    }
  }

  const primaryAction = footerActions.find((action) => action.primary) ?? null;
  const overflowItems = footerActions.filter((action) => action !== primaryAction);
  const footer = selectedInvoice ? (
    <div className="flex w-full items-center gap-2">
      {overflowItems.length > 0 ? (
        <RowActionsMenu
          items={overflowItems}
          triggerSize={controlSize === "touch" ? "icon-touch" : "icon-sm"}
        />
      ) : null}
      {primaryAction ? (
        <ResponsiveActionButton
          type="button"
          className="flex-1"
          onClick={primaryAction.onSelect}
          disabled={primaryAction.disabled}
        >
          {primaryAction.label}
        </ResponsiveActionButton>
      ) : null}
    </div>
  ) : undefined;

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{detailTitle}</span>}
      description={detailSubtitle}
      size="lg"
      contentClassName="w-full sm:max-w-xl"
      footer={footer}
    >
      {selectedInvoice ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              domain="inventory"
              value={getDisplayMatchStatus(selectedInvoice)}
            />
            <StatusBadge
              domain="inventory"
              value={selectedInvoice.paymentStatus}
            />
            {isInvoiceOverdue(selectedInvoice) && selectedOutstandingAmount > 0 ? (
              <Badge variant="destructive" className="text-xs">
                {selectedAgingLabel ?? "Quá hạn"}
              </Badge>
            ) : null}
          </div>

          {invoicesInSelectedGroup.length > 1 ? (
            <div className="flex flex-col gap-2 p-2 bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">
                {copy.selectInvoiceInGroup} ({invoicesInSelectedGroup.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {invoicesInSelectedGroup.map((invoice) => {
                  const isSelected = invoice.id === selectedInvoice.id;
                  const isOverdue = isInvoiceOverdue(invoice);
                  const isMissingVat = isSupplierInvoiceMissingVatEvidence(invoice);
                  const outstanding = getSupplierInvoiceOutstandingAmount(invoice);

                  return (
                    <Button
                      key={invoice.id}
                      type="button"
                      variant={isSelected ? "secondary" : "outline"}
                      size="xs"
                      onClick={() => onSelectInvoiceInGroup(invoice.id)}
                      className={cn(
                        "gap-1 font-normal",
                        isSelected && "font-semibold text-primary",
                      )}
                    >
                      <span>{formatSupplierInvoiceDate(invoice.invoiceDate)}</span>
                      {invoice.grnCode ? (
                        <span className="font-mono text-xs">({invoice.grnCode})</span>
                      ) : null}
                      <span className={cn("font-mono tabular-nums", isOverdue && outstanding > 0 && "text-destructive")}>
                        {messages.inventory.common.currencyCompact(formatVND(outstanding))}
                      </span>
                      {isMissingVat ? (
                        <span
                          className="size-1.5 rounded-full bg-warning"
                          title={copy.vatAttachmentMissing}
                        />
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Hero Outstanding Amount */}
          <Item variant="outline" size="sm" className="items-start bg-muted/30">
            <ItemContent className="gap-1">
              <ItemDescription className="line-clamp-none">
                {copy.outstandingPayable}
              </ItemDescription>
              <ItemTitle
                size="heading"
                className={cn(
                  "line-clamp-none font-mono text-2xl font-semibold tabular-nums tracking-tight",
                  isInvoiceOverdue(selectedInvoice) &&
                    selectedOutstandingAmount > 0 &&
                    "text-destructive",
                )}
              >
                {messages.inventory.common.currencyCompact(
                  formatVND(selectedOutstandingAmount),
                )}
              </ItemTitle>
              <ItemDescription className="line-clamp-none">
                {copy.totalInvoice}{" "}
                <span className="font-mono tabular-nums font-medium text-foreground">
                  {messages.inventory.common.currencyCompact(
                    formatVND(selectedInvoice.amount),
                  )}
                </span>
                {" · "}
                {copy.paidAmount}{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {messages.inventory.common.currencyCompact(
                    formatVND(selectedInvoice.paidAmount),
                  )}
                </span>
                {selectedInvoice.creditAppliedAmount > 0 ? (
                  <>
                    {" · "}
                    {copy.supplierCredit}{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.creditAppliedAmount),
                      )}
                    </span>
                  </>
                ) : null}
              </ItemDescription>
            </ItemContent>
          </Item>

          {/* Actionable Warnings & Blockers */}
          {missingVatAttachment ? (
            <Item variant="outline" size="sm" className="items-start border-warning/20 bg-warning/10">
              <ItemContent className="gap-1">
                <ItemTitle size="heading" className="line-clamp-none text-warning font-medium">
                  {copy.vatAttachmentMissing}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {canShowPayAction
                    ? copy.paymentBlockedNoVatAttachment
                    : copy.vatAttachmentHint}
                </ItemDescription>
              </ItemContent>
              {canAttachVatEvidence ? (
                <ItemActions>
                  <Button
                    variant={uploadIsPrimary ? "default" : "outline"}
                    size={controlSize}
                    className="relative gap-1"
                    disabled={vatUploading || isPending}
                    render={<label />}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      disabled={vatUploading || isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void onVatAttachmentUpload(file);
                      }}
                    />
                    {vatUploading ? (
                      <Spinner className="size-4" />
                    ) : (
                      <IconUpload className="size-4" />
                    )}
                    {copy.vatAttachmentUpload}
                  </Button>
                </ItemActions>
              ) : null}
            </Item>
          ) : null}

          {showMatchProblem ? (
            selectedInvoice.invoiceKind === "service" ? (
              <Alert className="border-warning/20 bg-warning/10 text-warning">
                <IconAlertTriangle />
                <AlertTitle>{copy.serviceVerificationRequired}</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  {selectedInvoice.matchingNotes ??
                    copy.serviceVerificationDescription}
                </AlertDescription>
              </Alert>
            ) : selectedMissingMatchingEvidence ? (
              <Alert className="border-warning/20 bg-warning/10 text-warning">
                <IconAlertTriangle />
                <AlertTitle>{copy.missingGrnTitle}</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  {copy.missingGrnDescription}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <IconAlertTriangle />
                <AlertTitle>
                  {copy.matchingDifferenceTitle(
                    formatVND(
                      selectedInvoice.matchingDifferenceAmount ?? 0,
                    ),
                  )}
                </AlertTitle>
                <AlertDescription>
                  {selectedInvoice.matchingNotes ??
                    copy.matchingDifferenceDescription}
                </AlertDescription>
              </Alert>
            )
          ) : null}

          {parseMoneyToMinorUnits(selectedSupplierAdvanceAmount) > 0n ? (
            <Item variant="outline" size="sm" className="items-start border-success/20 bg-success/10">
              <ItemContent className="gap-1">
                <ItemDescription className="line-clamp-none text-success">
                  {copy.supplierAdvance}
                </ItemDescription>
                <ItemTitle
                  size="heading"
                  className="line-clamp-none font-mono tabular-nums text-foreground font-semibold"
                >
                  {messages.inventory.common.currencyCompact(
                    formatVND(selectedSupplierAdvanceAmount),
                  )}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {copy.supplierAdvanceDescription}
                </ItemDescription>
              </ItemContent>
            </Item>
          ) : null}

          {/* Core Invoice Facts */}
          <ItemGroup className="grid grid-cols-2 gap-2">
            <DetailFact
              label={copy.invoiceKind}
              value={copy.invoiceKinds[selectedInvoice.invoiceKind]}
            />
            <DetailFact
              label={copy.invoiceDate}
              value={formatSupplierInvoiceDate(selectedInvoice.invoiceDate)}
            />
            <DetailFact
              label={copy.dueDate}
              value={formatSupplierInvoiceDate(selectedInvoice.dueDate)}
              valueClassName={
                isInvoiceOverdue(selectedInvoice) && selectedOutstandingAmount > 0
                  ? "text-destructive font-medium"
                  : undefined
              }
            />
            {vatSummaryLabel ? (
              <DetailFact
                label={copy.vat}
                value={
                  <span className="flex items-center gap-1">
                    <span>{vatSummaryLabel}</span>
                    <span className="font-mono tabular-nums text-xs text-muted-foreground">
                      ({messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.vatAmount),
                      )})
                    </span>
                  </span>
                }
              />
            ) : null}
            <DetailFact
              label={copy.linkedGrn}
              value={
                selectedInvoice.grnId != null && selectedInvoice.grnCode ? (
                  <Link
                    href={`${grnBasePath}?grnId=${selectedInvoice.grnId}&mode=view`}
                    className="font-mono text-primary underline-offset-2 hover:underline"
                  >
                    {selectedInvoice.grnCode}
                  </Link>
                ) : (
                  copy.notLinked
                )
              }
            />
            <DetailFact
              label={copy.linkedPo}
              value={
                selectedInvoice.poCode && selectedInvoice.poId != null ? (
                  <span className="font-mono">
                    {selectedInvoice.poCode}
                  </span>
                ) : (
                  copy.notLinked
                )
              }
            />
            {!missingVatAttachment ? (
              <DetailFact
                label={copy.vatAttachmentLabel}
                value={
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="p-0 text-primary"
                    onClick={() => void onOpenVatAttachment()}
                  >
                    {copy.vatAttachmentOpen}
                  </Button>
                }
              />
            ) : null}
            {selectedLastPayment ? (
              <DetailFact
                className="col-span-2"
                label={copy.lastPayment}
                value={copy.lastPaymentSummary(
                  formatSupplierInvoiceDate(selectedLastPayment.paymentDate),
                  getPaymentMethodLabel(
                    selectedLastPayment.paymentMethod,
                    copy,
                  ),
                  messages.inventory.common.currencyCompact(
                    formatVND(selectedLastPayment.amount),
                  ),
                )}
              />
            ) : null}
            {selectedInvoice.serviceVerificationReason ? (
              <DetailFact
                className="col-span-2"
                label={copy.serviceVerificationReason}
                value={selectedInvoice.serviceVerificationReason}
              />
            ) : null}
          </ItemGroup>

          {/* Invoice Lines Breakdown */}
          {selectedInvoice.invoiceLines.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {copy.invoiceLines} ({selectedInvoice.invoiceLines.length})
              </span>
              <ItemGroup className="grid gap-2">
                {selectedInvoice.invoiceLines.map((line) => (
                  <Item key={line.id} variant="outline" size="sm">
                    <ItemContent className="gap-1">
                      <ItemTitle size="heading" className="font-medium">
                        {line.ingredientName}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-none text-xs">
                        {copy.invoiceLineMeta(
                          String(line.quantity),
                          line.unitLabel,
                          messages.inventory.common.currencyCompact(
                            formatVND(line.unitPrice),
                          ),
                          line.lineDiscount > 0
                            ? messages.inventory.common.currencyCompact(
                                formatVND(line.lineDiscount),
                              )
                            : null,
                          formatPercent(line.vatRate, 0),
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {messages.inventory.common.currencyCompact(
                          formatVND(line.grossLineTotal),
                        )}
                      </span>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </div>
          ) : null}

          {/* Valuation & Cost Impact Summary (Focused only on non-zero items) */}
          {valuationSummaryLoading ? (
            <Item variant="outline" size="sm">
              <ItemContent>
                <ItemTitle size="heading">{copy.valuation.title}</ItemTitle>
                <ItemDescription>{copy.valuation.loading}</ItemDescription>
              </ItemContent>
            </Item>
          ) : valuationSummary && (valuationSummary.warning || valuationSummary.foodCostVariance !== 0 || valuationSummary.inventoryAdjustment !== 0 || valuationSummary.productionInventoryAdjustment !== 0 || valuationSummary.wasteVariance !== 0) ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {copy.valuation.title}
              </span>
              <ItemGroup className="grid grid-cols-2 gap-2">
                <DetailFact
                  label="Trạng thái quyết toán"
                  value={copy.valuation.status[valuationSummary.status]}
                  valueClassName={
                    valuationSummary.warning ? "text-warning" : undefined
                  }
                />
                {valuationSummary.inventoryAdjustment !== 0 ? (
                  <DetailFact
                    label={copy.valuation.inventoryAdjustment}
                    value={formatVND(valuationSummary.inventoryAdjustment)}
                  />
                ) : null}
                {valuationSummary.productionInventoryAdjustment !== 0 ? (
                  <DetailFact
                    label={copy.valuation.productionInventoryAdjustment}
                    value={formatVND(
                      valuationSummary.productionInventoryAdjustment,
                    )}
                  />
                ) : null}
                {valuationSummary.foodCostVariance !== 0 ? (
                  <DetailFact
                    label={copy.valuation.foodCostVariance}
                    value={formatVND(valuationSummary.foodCostVariance)}
                  />
                ) : null}
                {valuationSummary.wasteVariance !== 0 ? (
                  <DetailFact
                    label={copy.valuation.wasteVariance}
                    value={formatVND(valuationSummary.wasteVariance)}
                  />
                ) : null}
              </ItemGroup>
            </div>
          ) : null}
        </div>
      ) : (
        <AppEmptyState
          compact
          title={copy.noAnalysisTitle}
          description={copy.noAnalysisDescription}
        />
      )}
    </AppSheet>
  );
}
