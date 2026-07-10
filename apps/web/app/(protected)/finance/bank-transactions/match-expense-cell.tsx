"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown as IconChevronDown } from "lucide-react";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import type { SepaySupplierPaymentMatch } from "../_lib/sepay-bank-transaction-model";
import type { ExpenseMatchOption } from "../expense-actions";
import { matchSepayTransactionWithExpenses } from "../expense-actions";

const copy = messages.finance.bankTransactions;

interface MatchExpenseCellProps {
  eventId: number;
  amount: number;
  paymentId: number | null;
  expenseIds: number[];
  supplierPaymentMatches: SepaySupplierPaymentMatch[];
  transferType: "in" | "out";
  expenseOptions: ExpenseMatchOption[];
}

function formatDate(value: string): string {
  return formatVNBusinessDate(value);
}

function expenseDetail(expense: ExpenseMatchOption): string {
  return expense.note || expense.vendor_name || expense.category;
}

function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((id) => left.has(id));
}

function supplierInvoiceHref(invoiceId: number): string {
  return `/finance/supplier-invoices?invoiceId=${invoiceId}`;
}

export function MatchExpenseCell({
  eventId,
  amount,
  paymentId,
  expenseIds,
  supplierPaymentMatches,
  transferType,
  expenseOptions,
}: MatchExpenseCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<number[]>(expenseIds);

  React.useEffect(() => {
    setSelectedIds(expenseIds);
  }, [expenseIds]);

  if (paymentId != null) {
    return (
      <Badge variant="outline" className="text-success font-normal">
        {copy.matchedOrder(paymentId)}
      </Badge>
    );
  }

  if (supplierPaymentMatches.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        {supplierPaymentMatches.map((match) => (
          <Badge
            key={match.id}
            asChild
            variant="outline"
            className="w-fit text-success font-normal"
          >
            <Link href={supplierInvoiceHref(match.invoiceId)}>
              {copy.matchedSupplierPayment(match.id)}
            </Link>
          </Badge>
        ))}
        <span className="truncate text-xs text-muted-foreground">
          {copy.matchedSupplierPaymentDetail(
            supplierPaymentMatches[0]?.supplierName ?? "—",
            supplierPaymentMatches[0]?.invoiceNumber ?? "—",
          )}
        </span>
      </div>
    );
  }

  if (transferType === "in") {
    return <span className="text-muted-foreground">—</span>;
  }

  const selectedSet = new Set(selectedIds);
  const availableExpenses = [...expenseOptions].sort(
    (left, right) =>
      Math.abs(left.amount - amount) - Math.abs(right.amount - amount),
  );
  const selectedExpenses = expenseOptions.filter((exp) =>
    selectedSet.has(exp.id),
  );
  const selectedTotal = selectedExpenses.reduce(
    (sum, exp) => sum + exp.amount,
    0,
  );
  const delta = selectedTotal - amount;
  const hasChanges = !sameIds(selectedIds, expenseIds);

  const triggerLabel =
    selectedIds.length > 0
      ? `${copy.matchedExpenseCount(formatCount(selectedIds.length))}${
          selectedExpenses.length > 0 ? ` · -${formatVND(selectedTotal)}` : ""
        }`
      : copy.matchExpensePlaceholder;

  const toggleExpense = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await matchSepayTransactionWithExpenses({
        eventId,
        expenseIds: selectedIds,
      });

      if (!res.success) {
        toast.error(res.error || copy.matchError);
      } else {
        toast.success(copy.matchSuccess);
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full max-w-64 justify-between gap-2 text-xs"
        >
          <span className="truncate">{triggerLabel}</span>
          <IconChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{copy.matchExpenseTitle}</span>
          <span className="font-mono text-warning">
            {selectedExpenses.length > 0
              ? `-${formatVND(selectedTotal)}`
              : selectedIds.length > 0
                ? `${formatCount(selectedIds.length)} chi`
                : "—"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <span className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {copy.bankTransactionAmount}
            </span>
            <span className="font-mono font-medium text-warning">
              -{formatVND(amount)}
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {copy.selectedExpenseAmount}
            </span>
            <span className="font-mono font-medium text-warning">
              -{formatVND(selectedTotal)}
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {copy.expenseMatchDelta}
            </span>
            <span className="font-mono font-medium">
              {delta === 0 ? formatVND(0) : formatVND(Math.abs(delta))}
            </span>
          </span>
        </div>
        <div className="max-h-72 overflow-x-hidden overflow-y-auto">
          <div className="flex flex-col gap-1 pr-1">
            {availableExpenses.map((exp) => {
              const checked = selectedSet.has(exp.id);
              return (
                <label
                  key={exp.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md hover:bg-muted/30"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleExpense(exp.id)}
                    disabled={isPending}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {expenseDetail(exp)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(exp.expense_date)}
                    </span>
                  </span>
                  <span className="font-mono text-xs font-medium text-warning">
                    -{formatVND(exp.amount)}
                  </span>
                </label>
              );
            })}
            {availableExpenses.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground">
                {copy.noUnmatchedExpenses}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t">
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="ghost" size="sm">
              <Link href="/finance/expenses">{copy.openExpenses}</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              disabled={isPending || selectedIds.length === 0}
            >
              {copy.clearExpenseMatch}
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
          >
            {copy.saveExpenseMatch}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
