"use client";

import {
  Banknote as IconBanknote,
  Landmark as IconLandmark,
  Pencil as IconPencil,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { classifyExpensePaymentState } from "../_lib/expense-categories";
import type { ExpenseRow } from "../expense-actions";
import { ExpenseDocumentView } from "./expense-document-view";
import { canDeleteExpense, copy } from "./expense-form-schema";

export function ExpenseViewDialog({
  expense,
  branchOptions,
  isTouchLayout,
  canManageExpenses = true,
  onClose,
  onEdit,
  onPayCash,
  onPayTransfer,
  onCopyTransferContent,
}: {
  expense: ExpenseRow | null;
  branchOptions: readonly { value: string; label: string }[];
  isTouchLayout: boolean;
  canManageExpenses?: boolean;
  onClose: () => void;
  onEdit?: (expense: ExpenseRow) => void;
  onPayCash?: (expense: ExpenseRow) => void;
  onPayTransfer?: (expense: ExpenseRow) => void;
  onCopyTransferContent: (content: string) => void;
}) {
  const paymentState = expense ? classifyExpensePaymentState(expense) : null;
  const canEdit = expense && canManageExpenses && canDeleteExpense(expense);
  const isUnpaid = paymentState === "unpaid";
  const actionSize = isTouchLayout ? "touch" : "default";

  return (
    <AppDialog
      open={expense != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        expense && paymentState ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{copy.form.viewTitle}</span>
            <StatusBadge domain="expense-payment" value={paymentState} />
          </div>
        ) : (
          copy.form.viewTitle
        )
      }
      variant="document"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size={actionSize}
            onClick={onClose}
          >
            {ACTIONS_VI.close}
          </Button>

          {canManageExpenses && expense ? (
            <>
              {canEdit && onEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size={actionSize}
                  onClick={() => onEdit(expense)}
                >
                  <IconPencil data-icon="inline-start" />
                  {copy.table.edit}
                </Button>
              ) : null}

              {isUnpaid && onPayCash ? (
                <Button
                  type="button"
                  variant="outline"
                  size={actionSize}
                  onClick={() => onPayCash(expense)}
                >
                  <IconBanknote data-icon="inline-start" />
                  {copy.actions.cash}
                </Button>
              ) : null}

              {isUnpaid && onPayTransfer ? (
                <Button
                  type="button"
                  size={actionSize}
                  onClick={() => onPayTransfer(expense)}
                >
                  <IconLandmark data-icon="inline-start" />
                  {copy.actions.transfer}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      }
    >
      {expense ? (
        <ExpenseDocumentView
          expense={expense}
          branchOptions={branchOptions}
          isTouchLayout={isTouchLayout}
          onCopyTransferContent={onCopyTransferContent}
        />
      ) : null}
    </AppDialog>
  );
}
