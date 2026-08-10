"use client";

import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { FormDialog } from "@/components/form";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import type { SupplierAdvanceSummary } from "../supplier-invoice-actions";
import { SupplierInvoiceCreateFields } from "./supplier-invoice-create-fields";
import {
  supplierAdvanceSchema,
  supplierCreditSchema,
  supplierInvoiceSchema,
  supplierPaymentSchema,
  type GrnOption,
  type SupplierAdvanceFormValues,
  type SupplierCreditFormValues,
  type SupplierInvoiceFormValues,
  type SupplierInvoiceMode,
  type SupplierOption,
  type SupplierPaymentFormValues,
} from "./supplier-invoice-form-schema";
import {
  SupplierAdvanceFields,
  SupplierCreditFields,
  SupplierPaymentFields,
} from "./supplier-payment-fields";

export type SupplierInvoiceDialogsProps = {
  copy: typeof messages.inventory.supplierInvoices;
  acceptDiscrepancyOpen: boolean;
  onAcceptDiscrepancyOpenChange: (open: boolean) => void;
  acceptDiscrepancyReason: string;
  onAcceptDiscrepancyReasonChange: (reason: string) => void;
  onAcceptDiscrepancy: () => void;
  serviceVerificationOpen: boolean;
  onServiceVerificationOpenChange: (open: boolean) => void;
  serviceVerificationReason: string;
  onServiceVerificationReasonChange: (reason: string) => void;
  onVerifyServiceInvoice: () => void;
  isPending: boolean;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  invoiceMode: SupplierInvoiceMode | null;
  invoiceFormDefaultValues: SupplierInvoiceFormValues;
  selectedInvoiceId: number | null;
  preselectGrnId: number | null;
  suppliers: SupplierOption[];
  grns: GrnOption[];
  canAttachVatEvidence: boolean;
  pendingCreateVatFile: File | null;
  onPendingCreateVatFileChange: (file: File | null) => void;
  onCreateInvoice: (
    values: SupplierInvoiceFormValues,
  ) => Promise<{ success: boolean; error?: string }>;
  paymentOpen: boolean;
  onPaymentOpenChange: (open: boolean) => void;
  paymentDefaultValues: SupplierPaymentFormValues;
  selectedInvoiceIdForPayment: number | undefined;
  paymentOutstandingAmount: string;
  onRecordPayment: (
    values: SupplierPaymentFormValues,
  ) => Promise<{ success: boolean; error?: string }>;
  creditOpen: boolean;
  onCreditOpenChange: (open: boolean) => void;
  creditDefaultValues: SupplierCreditFormValues;
  onCreateCredit: (
    values: SupplierCreditFormValues,
  ) => Promise<{ success: boolean; error?: string }>;
  advanceOpen: boolean;
  onAdvanceOpenChange: (open: boolean) => void;
  advanceDefaultValues: SupplierAdvanceFormValues;
  selectedSupplierAdvances: SupplierAdvanceSummary[];
  onAllocateAdvance: (
    values: SupplierAdvanceFormValues,
  ) => Promise<{ success: boolean; error?: string }>;
};

export function SupplierInvoiceDialogs({
  copy,
  acceptDiscrepancyOpen,
  onAcceptDiscrepancyOpenChange,
  acceptDiscrepancyReason,
  onAcceptDiscrepancyReasonChange,
  onAcceptDiscrepancy,
  serviceVerificationOpen,
  onServiceVerificationOpenChange,
  serviceVerificationReason,
  onServiceVerificationReasonChange,
  onVerifyServiceInvoice,
  isPending,
  createOpen,
  onCreateOpenChange,
  invoiceMode,
  invoiceFormDefaultValues,
  selectedInvoiceId,
  preselectGrnId,
  suppliers,
  grns,
  canAttachVatEvidence,
  pendingCreateVatFile,
  onPendingCreateVatFileChange,
  onCreateInvoice,
  paymentOpen,
  onPaymentOpenChange,
  paymentDefaultValues,
  selectedInvoiceIdForPayment,
  paymentOutstandingAmount,
  onRecordPayment,
  creditOpen,
  onCreditOpenChange,
  creditDefaultValues,
  onCreateCredit,
  advanceOpen,
  onAdvanceOpenChange,
  advanceDefaultValues,
  selectedSupplierAdvances,
  onAllocateAdvance,
}: SupplierInvoiceDialogsProps) {
  return (
    <>
      <ReasonConfirmDialog
        open={acceptDiscrepancyOpen}
        onOpenChange={onAcceptDiscrepancyOpenChange}
        title={copy.acceptDiscrepancy}
        description={copy.acceptDiscrepancyDescription}
        reasonId="supplier-invoice-discrepancy-reason"
        reason={acceptDiscrepancyReason}
        onReasonChange={onAcceptDiscrepancyReasonChange}
        reasonLabel={copy.discrepancyReason}
        reasonPlaceholder={copy.discrepancyReasonPlaceholder}
        reasonMinLength={5}
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel={copy.acceptDiscrepancy}
        canConfirm={acceptDiscrepancyReason.trim().length >= 5}
        isPending={isPending}
        onConfirm={onAcceptDiscrepancy}
      />

      <ReasonConfirmDialog
        open={serviceVerificationOpen}
        onOpenChange={onServiceVerificationOpenChange}
        title={copy.verifyServiceAction}
        description={copy.serviceVerificationDescription}
        reasonId="supplier-service-verification-reason"
        reason={serviceVerificationReason}
        onReasonChange={onServiceVerificationReasonChange}
        reasonLabel={copy.serviceVerificationReason}
        reasonPlaceholder={copy.serviceVerificationReasonPlaceholder}
        reasonMinLength={5}
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel={copy.verifyServiceAction}
        canConfirm={serviceVerificationReason.trim().length >= 5}
        isPending={isPending}
        onConfirm={onVerifyServiceInvoice}
      />

      <FormDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        variant="document"
        schema={supplierInvoiceSchema}
        defaultValues={invoiceFormDefaultValues}
        entityKey={
          invoiceMode === "edit"
            ? `supplier-invoice-${selectedInvoiceId}`
            : "new-supplier-invoice"
        }
        title={invoiceMode === "edit" ? "Sửa hóa đơn NCC" : copy.createAction}
        description={copy.createDescription}
        submitLabel={copy.saveInvoice}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={STATES_VI.saved}
        onSubmit={onCreateInvoice}
      >
        {(form) => (
          <SupplierInvoiceCreateFields
            key={`create-fields-${preselectGrnId ?? "none"}`}
            form={form}
            suppliers={suppliers}
            grns={grns}
            copy={copy}
            canAttachVatEvidence={canAttachVatEvidence}
            pendingVatFile={pendingCreateVatFile}
            onPendingVatFileChange={onPendingCreateVatFileChange}
          />
        )}
      </FormDialog>

      <FormDialog
        open={paymentOpen}
        onOpenChange={onPaymentOpenChange}
        schema={supplierPaymentSchema}
        defaultValues={paymentDefaultValues}
        entityKey={selectedInvoiceIdForPayment ?? "supplier-payment"}
        title={copy.recordPaymentTitle}
        description={copy.recordPaymentDescription}
        submitLabel={copy.payAction}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={copy.paymentRecorded}
        contentClassName="sm:max-w-md"
        onSubmit={onRecordPayment}
      >
        {(form) => (
          <SupplierPaymentFields
            form={form}
            copy={copy}
            outstanding={paymentOutstandingAmount}
          />
        )}
      </FormDialog>

      <FormDialog
        open={creditOpen}
        onOpenChange={onCreditOpenChange}
        schema={supplierCreditSchema}
        defaultValues={creditDefaultValues}
        entityKey={selectedInvoiceIdForPayment ?? "supplier-credit"}
        title={copy.creditTitle}
        description={copy.creditDescription}
        submitLabel={copy.creditSubmit}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={copy.creditSuccess}
        contentClassName="sm:max-w-md"
        onSubmit={onCreateCredit}
      >
        {(form) => <SupplierCreditFields form={form} copy={copy} />}
      </FormDialog>

      <FormDialog
        open={advanceOpen}
        onOpenChange={onAdvanceOpenChange}
        schema={supplierAdvanceSchema}
        defaultValues={advanceDefaultValues}
        entityKey={`${selectedSupplierAdvances[0]?.supplierId ?? "supplier"}-advance`}
        title={copy.allocateAdvanceTitle}
        description={copy.allocateAdvanceDescription}
        submitLabel={copy.allocateAdvanceAction}
        cancelLabel={ACTIONS_VI.cancel}
        successMessage={copy.allocateAdvanceSuccess}
        contentClassName="sm:max-w-md"
        onSubmit={onAllocateAdvance}
      >
        {(form) => (
          <SupplierAdvanceFields
            form={form}
            advances={selectedSupplierAdvances}
            outstanding={paymentOutstandingAmount}
            copy={copy}
          />
        )}
      </FormDialog>
    </>
  );
}
