"use client";

import { useRouter } from "next/navigation";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  Landmark as IconLandmark,
  RotateCcw as IconRotateCcw,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import type { ActionResult } from "@comtammatu/shared/types";
import { FormDialog } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import {
  canCorrectExpensePaymentMethod,
  classifyExpensePaymentState,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import {
  createExpense,
  transitionExpensePayment,
  updateExpense,
  type ExpenseRow,
} from "../expense-actions";
import { ExpenseFormFields } from "./expense-form-fields";
import {
  buildExpenseVatBreakdown,
  copy,
  EMPTY_EXPENSE_LINE,
  expenseFormSchema,
  expensePaymentMethod,
  expenseToFormValues,
  TENANT_LEVEL_BRANCH_VALUE,
  type ExpenseFormValues,
} from "./expense-form-schema";

type LockedListCopy = {
  formTitle: string;
  formEditTitle: string;
};

export function ExpenseFormDialog({
  open,
  editingExpense,
  todayBusinessDate,
  defaultBranchId,
  lockedCategory,
  isLockedCategoryList,
  lockedCopy,
  isTouchLayout,
  isMutating,
  tenantId,
  branchOptions,
  onClose,
  onSuccess,
  onPayCash,
  onPayTransfer,
  onCancelTransfer,
  onCopyTransferContent,
}: {
  open: boolean;
  editingExpense: ExpenseRow | null;
  todayBusinessDate: string;
  defaultBranchId: string;
  lockedCategory?: ExpenseCategory;
  isLockedCategoryList: boolean;
  lockedCopy: LockedListCopy;
  isTouchLayout: boolean;
  isMutating: boolean;
  tenantId: number;
  branchOptions: readonly { value: string; label: string }[];
  onClose: () => void;
  onSuccess: () => void;
  onPayCash: (row: ExpenseRow) => void;
  onPayTransfer: (row: ExpenseRow) => void;
  onCancelTransfer: (row: ExpenseRow) => void;
  onCopyTransferContent: (content: string) => void;
}) {
  const router = useRouter();
  const editingPaymentState = editingExpense
    ? classifyExpensePaymentState(editingExpense)
    : null;
  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId: defaultBranchId,
    category: lockedCategory ?? "",
    paymentMethod: "cash",
    note: "",
    invoiceAttachmentUrl: "",
    lines: [EMPTY_EXPENSE_LINE],
  };
  const formDefaultValues: ExpenseFormValues = editingExpense
    ? expenseToFormValues(editingExpense)
    : defaultValues;

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const branchId =
      !values.branchId || values.branchId === TENANT_LEVEL_BRANCH_VALUE
        ? null
        : Number(values.branchId);
    const vatBreakdown = buildExpenseVatBreakdown(values);
    const attachment = values.invoiceAttachmentUrl?.trim();
    const nextMethod = values.paymentMethod as ExpensePaymentMethod;

    if (!editingExpense) {
      const result = await createExpense({
        branchId,
        expenseDate: values.expenseDate,
        category: values.category as ExpenseCategory,
        vatBreakdown,
        paymentMethod: nextMethod,
        note: values.note,
        invoiceAttachmentUrl: attachment || undefined,
      });
      if (result.success) router.refresh();
      return result;
    }

    const result = await updateExpense({
      expenseId: editingExpense.id,
      branchId,
      expenseDate: values.expenseDate,
      category: values.category as ExpenseCategory,
      vatBreakdown,
      note: values.note,
      invoiceAttachmentUrl: attachment || undefined,
    });
    if (!result.success) return result;

    const previousMethod = expensePaymentMethod(
      editingExpense,
    ) as ExpensePaymentMethod;
    if (
      nextMethod !== previousMethod &&
      canCorrectExpensePaymentMethod(editingExpense)
    ) {
      const transition = await transitionExpensePayment({
        expenseId: editingExpense.id,
        targetMethod: nextMethod,
      });
      if (!transition.success) {
        return {
          success: false,
          error: transition.error ?? copy.actions.updateFailed,
        };
      }
    }

    router.refresh();
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={
        editingExpense && editingPaymentState ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{copy.form.editTitle}</span>
            <StatusBadge
              domain="expense-payment"
              value={editingPaymentState}
            />
          </div>
        ) : editingExpense ? (
          isLockedCategoryList
            ? lockedCopy.formEditTitle
            : copy.form.editTitle
        ) : (
          isLockedCategoryList ? lockedCopy.formTitle : copy.form.title
        )
      }
      schema={expenseFormSchema}
      defaultValues={formDefaultValues}
      entityKey={editingExpense?.id ?? "create"}
      onSubmit={onSubmit}
      onSuccess={() => onSuccess()}
      submitLabel={editingExpense ? copy.form.editSubmit : copy.form.submit}
      actionSize={isTouchLayout ? "touch" : "default"}
      variant="document"
      renderFooter={
        editingExpense &&
        (editingPaymentState === "unpaid" ||
          editingPaymentState === "transfer_needs_match")
          ? ({
              formId,
              isPending,
              requestClose,
              submitLabel,
              actionSize,
              cancelLabel,
            }) => (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size={actionSize}
                  onClick={requestClose}
                  disabled={isPending || isMutating}
                >
                  {cancelLabel}
                </Button>
                {editingPaymentState === "unpaid" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size={actionSize}
                      disabled={isPending || isMutating}
                      onClick={() => void onPayCash(editingExpense)}
                    >
                      {isMutating ? <Spinner /> : null}
                      <IconBanknote data-icon="inline-start" />
                      {copy.actions.cash}
                    </Button>
                    <Button
                      type="button"
                      size={actionSize}
                      disabled={isPending || isMutating}
                      onClick={() => void onPayTransfer(editingExpense)}
                    >
                      {isMutating ? <Spinner /> : null}
                      <IconLandmark data-icon="inline-start" />
                      {copy.actions.transfer}
                    </Button>
                  </>
                ) : null}
                {editingPaymentState === "transfer_needs_match" &&
                editingExpense.transfer_content ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size={actionSize}
                      disabled={isPending || isMutating}
                      onClick={() =>
                        void onCopyTransferContent(
                          editingExpense.transfer_content!,
                        )
                      }
                    >
                      <IconCopy data-icon="inline-start" />
                      {copy.transferInstruction.copy}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size={actionSize}
                      disabled={isPending || isMutating}
                      onClick={() => void onCancelTransfer(editingExpense)}
                    >
                      {isMutating ? <Spinner /> : null}
                      <IconRotateCcw data-icon="inline-start" />
                      {copy.actions.cancelTransfer}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="submit"
                  form={formId}
                  variant="outline"
                  size={actionSize}
                  disabled={isPending || isMutating}
                >
                  {isPending ? <Spinner /> : null}
                  {submitLabel}
                </Button>
              </div>
            )
          : undefined
      }
    >
      {(form) => {
        const canEditPaymentMethod =
          editingExpense == null ||
          canCorrectExpensePaymentMethod(editingExpense);
        return (
          <ExpenseFormFields
            form={form}
            branchOptions={branchOptions}
            tenantId={tenantId}
            isTouchLayout={isTouchLayout}
            paymentMethodReadOnly={!canEditPaymentMethod}
            transferContent={editingExpense?.transfer_content}
            onCopyTransferContent={onCopyTransferContent}
            lockedCategory={lockedCategory}
          />
        );
      }}
    </FormDialog>
  );
}
