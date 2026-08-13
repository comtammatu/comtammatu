"use client";

import Link from "next/link";
import { TriangleAlert as IconAlertTriangle, Upload as IconUpload } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

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
                </div>

                {invoicesInSelectedGroup.length > 1 ? (
                  <Select
                    value={String(selectedInvoice.id)}
                    onValueChange={(value) => onSelectInvoiceInGroup(Number(value))}
                  >
                    <SelectTrigger
                      size={controlSize}
                      className="w-full"
                      aria-label={copy.selectInvoiceInGroupAria}
                    >
                      <SelectValue placeholder={copy.selectInvoiceInGroup} />
                    </SelectTrigger>
                    <SelectContent>
                      {invoicesInSelectedGroup.map((invoice) => (
                        <SelectItem
                          key={invoice.id}
                          value={String(invoice.id)}
                          size={controlSize === "touch" ? "touch" : "default"}
                        >
                          {formatSupplierInvoiceDate(invoice.invoiceDate)}
                          {invoice.grnCode ? ` · ${invoice.grnCode}` : ""}
                          {" · "}
                          {messages.inventory.common.currencyCompact(
                            formatVND(
                              getSupplierInvoiceOutstandingAmount(invoice),
                            ),
                          )}
                          {isSupplierInvoiceMissingVatEvidence(invoice) ? (
                            <span className="text-warning">
                              {" · "}
                              {copy.vatAttachmentMissing}
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                <Item variant="outline" size="sm" className="items-start">
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
                      {messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.amount),
                      )}
                      {" · "}
                      {copy.paidAmount}{" "}
                      {messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.paidAmount),
                      )}
                      {selectedInvoice.creditAppliedAmount > 0
                        ? ` · ${copy.supplierCredit} ${messages.inventory.common.currencyCompact(
                            formatVND(selectedInvoice.creditAppliedAmount),
                          )}`
                        : null}
                    </ItemDescription>
                  </ItemContent>
                </Item>

                {parseMoneyToMinorUnits(selectedSupplierAdvanceAmount) > 0n ? (
                  <Item variant="outline" size="sm" className="items-start">
                    <ItemContent className="gap-1">
                      <ItemDescription className="line-clamp-none">
                        {copy.supplierAdvance}
                      </ItemDescription>
                      <ItemTitle
                        size="heading"
                        className="line-clamp-none font-mono tabular-nums"
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

                {missingVatAttachment ? (
                  <Item variant="outline" size="sm" className="items-start">
                    <ItemContent className="gap-1">
                      <ItemTitle size="heading" className="line-clamp-none">
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
                          className="relative"
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
                ) : (
                  <Item variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle size="heading" className="line-clamp-none">
                        {copy.vatAttachmentReady}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        variant="outline"
                        size={controlSize}
                        onClick={() => void onOpenVatAttachment()}
                      >
                        {copy.vatAttachmentOpen}
                      </Button>
                    </ItemActions>
                  </Item>
                )}

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
                      isInvoiceOverdue(selectedInvoice)
                        ? "text-destructive"
                        : undefined
                    }
                  />
                  {vatSummaryLabel ? (
                    <DetailFact
                      label={copy.vat}
                      value={
                        <span className="flex flex-col gap-1">
                          <span>{vatSummaryLabel}</span>
                          <span className="font-mono tabular-nums">
                            {messages.inventory.common.currencyCompact(
                              formatVND(selectedInvoice.vatAmount),
                            )}
                          </span>
                        </span>
                      }
                    />
                  ) : null}
                  <DetailFact
                    label={copy.aging}
                    value={selectedAgingLabel}
                    valueClassName={
                      isInvoiceOverdue(selectedInvoice)
                        ? "text-destructive"
                        : undefined
                    }
                  />
                  <DetailFact
                    label={copy.linkedGrn}
                    value={selectedInvoice.grnCode ?? copy.notLinked}
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
                  <DetailFact
                    label={copy.matchingExpectedAmount}
                    value={
                      selectedInvoice.matchingExpectedAmount != null
                        ? messages.inventory.common.currencyCompact(
                            formatVND(selectedInvoice.matchingExpectedAmount),
                          )
                        : copy.notAvailable
                    }
                  />
                  <DetailFact
                    label={copy.matchingReceivedAmount}
                    value={
                      selectedInvoice.matchingReceivedAmount != null
                        ? messages.inventory.common.currencyCompact(
                            formatVND(selectedInvoice.matchingReceivedAmount),
                          )
                        : copy.notAvailable
                    }
                  />
                  {selectedInvoice.matchingDifferenceAmount != null ? (
                    <DetailFact
                      label={copy.matchingDifferenceAmount}
                      value={messages.inventory.common.currencyCompact(
                        formatVND(selectedInvoice.matchingDifferenceAmount),
                      )}
                      valueClassName={
                        Math.abs(selectedInvoice.matchingDifferenceAmount) > 1
                          ? "text-destructive"
                          : undefined
                      }
                    />
                  ) : null}
                  {selectedInvoice.serviceVerificationReason ? (
                    <DetailFact
                      className="col-span-2"
                      label={copy.serviceVerificationReason}
                      value={selectedInvoice.serviceVerificationReason}
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
                </ItemGroup>

                {selectedInvoice.invoiceLines.length > 0 ? (
                  <ItemGroup className="grid gap-2">
                    {selectedInvoice.invoiceLines.map((line) => (
                      <Item key={line.id} variant="outline" size="sm">
                        <ItemContent className="gap-1">
                          <ItemTitle size="heading">
                            {line.ingredientName}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none">
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
                          <span className="font-mono font-semibold tabular-nums">
                            {messages.inventory.common.currencyCompact(
                              formatVND(line.grossLineTotal),
                            )}
                          </span>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                ) : null}

                {selectedInvoice.receiptAllocations.length > 0 ? (
                  <ItemGroup className="grid gap-2">
                    {selectedInvoice.receiptAllocations.map((allocation) => (
                      <Item
                        key={`${allocation.grnId}:${allocation.poId}`}
                        variant="outline"
                        size="sm"
                      >
                        <ItemContent className="gap-1">
                          <ItemTitle size="heading" className="font-mono">
                            {allocation.grnCode}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none">
                            {allocation.poCode}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            render={
                              <Link
                                href={`${grnBasePath}?grnId=${allocation.grnId}&mode=view`}
                              />
                            }
                          >
                            {ACTIONS_VI.view}
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                ) : null}

                {valuationSummaryLoading ? (
                  <Item variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle size="heading">
                        {copy.valuation.title}
                      </ItemTitle>
                      <ItemDescription>
                        {copy.valuation.loading}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ) : valuationSummary ? (
                  <ItemGroup className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <DetailFact
                      className="sm:col-span-2"
                      label={copy.valuation.title}
                      value={copy.valuation.status[valuationSummary.status]}
                      valueClassName={
                        valuationSummary.warning ? "text-warning" : undefined
                      }
                    />
                    <DetailFact
                      label={copy.valuation.provisionalValue}
                      value={formatVND(valuationSummary.provisionalValue)}
                    />
                    <DetailFact
                      label={copy.valuation.finalNetValue}
                      value={formatVND(valuationSummary.finalNetValue)}
                    />
                    <DetailFact
                      label={copy.valuation.inventoryAdjustment}
                      value={formatVND(valuationSummary.inventoryAdjustment)}
                    />
                    <DetailFact
                      label={copy.valuation.productionInventoryAdjustment}
                      value={formatVND(
                        valuationSummary.productionInventoryAdjustment,
                      )}
                    />
                    <DetailFact
                      label={copy.valuation.foodCostVariance}
                      value={formatVND(valuationSummary.foodCostVariance)}
                    />
                    <DetailFact
                      label={copy.valuation.wasteVariance}
                      value={formatVND(valuationSummary.wasteVariance)}
                    />
                    <DetailFact
                      label={copy.valuation.supplierReturnVariance}
                      value={formatVND(valuationSummary.supplierReturnVariance)}
                    />
                    <DetailFact
                      label={copy.valuation.currentPeriodVariance}
                      value={formatVND(valuationSummary.currentPeriodVariance)}
                    />
                  </ItemGroup>
                ) : null}

                {showMatchProblem ? (
                  selectedInvoice.invoiceKind === "service" ? (
                    <Alert className="border-warning/20 bg-warning/10 text-warning">
                      <IconAlertTriangle />
                      <AlertTitle>
                        {copy.serviceVerificationRequired}
                      </AlertTitle>
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
