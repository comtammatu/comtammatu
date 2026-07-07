/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import * as React from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import type { ExpenseRow } from "../expense-actions";
import { matchSepayTransactionWithExpense } from "../expense-actions";

const copy = messages.finance.bankTransactions;

interface MatchExpenseCellProps {
  eventId: number;
  paymentId: number | null;
  expenseId: number | null;
  transferType: "in" | "out";
  unmatchedExpenses: ExpenseRow[];
}

export function MatchExpenseCell({
  eventId,
  paymentId,
  expenseId,
  transferType,
  unmatchedExpenses,
}: MatchExpenseCellProps) {
  const [isPending, startTransition] = React.useTransition();
  const [optimisticExpenseId, setOptimisticExpenseId] = React.useState<
    number | null
  >(expenseId);

  // If already matched, just show the badge
  if (paymentId != null) {
    return (
      <Badge variant="outline" className="text-success font-normal">
        {copy.matchedOrder(paymentId)}
      </Badge>
    );
  }

  if (optimisticExpenseId != null) {
    return (
      <Badge variant="outline" className="text-warning font-normal">
        {copy.matchedExpense(optimisticExpenseId)}
      </Badge>
    );
  }

  // Tiền Vào (Money In) - usually orders. We don't match expenses here.
  if (transferType === "in") {
    return <span className="text-muted-foreground">—</span>;
  }

  const handleMatch = (selectedExpenseId: string) => {
    const id = Number(selectedExpenseId);
    startTransition(async () => {
      setOptimisticExpenseId(id);
      const res = await matchSepayTransactionWithExpense({
        eventId,
        expenseId: id,
      });

      if (!res.success) {
        setOptimisticExpenseId(null);
        toast.error(res.error || copy.matchError);
      } else {
        toast.success(copy.matchSuccess);
      }
    });
  };

  return (
    <div className="w-full max-w-64">
      <Select onValueChange={handleMatch} disabled={isPending}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={copy.matchExpensePlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {unmatchedExpenses.map((exp) => (
            <SelectItem key={exp.id} value={String(exp.id)}>
              <span className="flex items-center gap-2">
                <span className="font-medium text-warning">
                  -{formatVND(exp.amount)}
                </span>
                <span className="text-muted-foreground truncate w-40">
                  ({exp.expense_date.split("-").reverse().join("/")}) {exp.note || exp.vendor_name || exp.category}
                </span>
              </span>
            </SelectItem>
          ))}
          {unmatchedExpenses.length === 0 && (
            <div className="p-2 text-xs text-muted-foreground text-center">
              Không có chi phí chưa khớp
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
