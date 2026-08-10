"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { EXPENSE_PAYMENT_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import {
  classifyExpensePaymentState,
} from "../_lib/expense-categories";
import type { ExpenseRow } from "../expense-actions";
import { ExpenseFormFields } from "./expense-form-fields";
import {
  copy,
  expenseToFormValues,
  type ExpenseFormValues,
} from "./expense-form-schema";

export function ExpenseViewDialog({
  expense,
  branchOptions,
  tenantId,
  isTouchLayout,
  onClose,
  onCopyTransferContent,
}: {
  expense: ExpenseRow | null;
  branchOptions: readonly { value: string; label: string }[];
  tenantId: number;
  isTouchLayout: boolean;
  onClose: () => void;
  onCopyTransferContent: (content: string) => void;
}) {
  const form = useForm<ExpenseFormValues>({
    defaultValues: expense ? expenseToFormValues(expense) : undefined,
  });

  useEffect(() => {
    if (expense) form.reset(expenseToFormValues(expense));
  }, [expense, form]);

  return (
    <AppDialog
      open={expense != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.form.viewTitle}
      description={
        expense
          ? `${formatVNBusinessDate(expense.expense_date)} · ${
              EXPENSE_PAYMENT_STATE_LABELS_VI[
                classifyExpensePaymentState(expense)
              ]
            }`
          : undefined
      }
      variant="document"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {ACTIONS_VI.close}
        </Button>
      }
    >
      {expense ? (
        <ExpenseFormFields
          form={form}
          branchOptions={branchOptions}
          tenantId={tenantId}
          isTouchLayout={isTouchLayout}
          readOnly
          paymentMethodReadOnly
          transferContent={expense.transfer_content}
          paymentState={classifyExpensePaymentState(expense)}
          onCopyTransferContent={onCopyTransferContent}
        />
      ) : null}
    </AppDialog>
  );
}
