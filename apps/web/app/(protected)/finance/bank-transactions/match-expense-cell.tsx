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
import { MoneyVndInput } from "@/components/form";
import { messages } from "@lib/messages";
import {
  isSepayExpenseAllocationBalanced,
  type SepayExpenseAllocation,
} from "../_lib/sepay-bank-transaction-model";
import type { ExpenseMatchOption } from "../expense-actions";
import { matchSepayTransactionWithExpenses } from "../expense-actions";

const copy = messages.finance.bankTransactions;

interface MatchExpenseCellProps {
  eventId: number;
  amount: number;
  paymentId: number | null;
  expenseIds: number[];
  expenseAllocations: SepayExpenseAllocation[];
  allocationReady: boolean;
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

function buildAllocationDrafts(
  expenseIds: number[],
  allocations: SepayExpenseAllocation[],
): Record<number, string> {
  const allocationByExpense = new Map(
    allocations.map((allocation) => [allocation.expenseId, allocation.amount]),
  );
  return Object.fromEntries(
    expenseIds.map((expenseId) => {
      const allocation = allocationByExpense.get(expenseId);
      return [expenseId, allocation == null ? "" : String(allocation)];
    }),
  );
}

export function MatchExpenseCell({
  eventId,
  amount,
  paymentId,
  expenseIds,
  expenseAllocations,
  allocationReady,
  transferType,
  expenseOptions,
}: MatchExpenseCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<number[]>(expenseIds);
  const [allocationDrafts, setAllocationDrafts] = React.useState<
    Record<number, string>
  >(() => buildAllocationDrafts(expenseIds, expenseAllocations));
  const [invalidDraftIds, setInvalidDraftIds] = React.useState<Set<number>>(
    () => new Set(),
  );

  React.useEffect(() => {
    setSelectedIds(expenseIds);
    setAllocationDrafts(buildAllocationDrafts(expenseIds, expenseAllocations));
    setInvalidDraftIds(new Set());
  }, [expenseAllocations, expenseIds]);

  if (paymentId != null) {
    return (
      <Badge variant="outline" className="text-success font-normal">
        {copy.matchedOrder(paymentId)}
      </Badge>
    );
  }

  if (transferType === "in" && expenseIds.length > 0) {
    return (
      <Badge variant="outline" className="text-success font-normal">
        {copy.matchedCashDeposit}
      </Badge>
    );
  }

  if (transferType === "in") {
    return <span className="text-muted-foreground">—</span>;
  }

  const selectedSet = new Set(selectedIds);
  const currentAllocationByExpense = new Map(
    expenseAllocations.map((allocation) => [
      allocation.expenseId,
      allocation.amount,
    ]),
  );
  const availableAmount = (expense: ExpenseMatchOption) => {
    const currentAllocation = currentAllocationByExpense.get(expense.id);
    if (expense.allocatedAmount == null) return expense.amount;
    const allocatedByOtherEvents =
      expense.allocatedAmount - (currentAllocation ?? 0);
    return Math.max(0, expense.amount - allocatedByOtherEvents);
  };
  const availableExpenses = expenseOptions
    .filter(
      (expense) =>
        availableAmount(expense) > 0 ||
        currentAllocationByExpense.has(expense.id),
    )
    .sort(
      (left, right) =>
        Math.abs(availableAmount(left) - amount) -
        Math.abs(availableAmount(right) - amount),
    );
  const selectedExpenses = expenseOptions.filter((exp) =>
    selectedSet.has(exp.id),
  );
  const selectedAllocations = selectedIds.map((expenseId) => ({
    expenseId,
    amount: Number(allocationDrafts[expenseId] ?? 0),
  }));
  const selectedTotal = selectedAllocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0,
  );
  const delta = selectedTotal - amount;
  const allocationUnavailable =
    !allocationReady ||
    (expenseIds.length > 0 &&
      expenseAllocations.some((allocation) => allocation.amount == null));
  const hasValidAllocations = selectedAllocations.every((allocation) => {
    const expense = expenseOptions.find(
      (option) => option.id === allocation.expenseId,
    );
    return (
      Number.isSafeInteger(allocation.amount) &&
      allocation.amount > 0 &&
      !invalidDraftIds.has(allocation.expenseId) &&
      expense != null &&
      allocation.amount <= availableAmount(expense)
    );
  });
  const hasAllocationChanges = selectedAllocations.some((allocation) => {
    const current = currentAllocationByExpense.get(allocation.expenseId);
    const fallback = expenseOptions.find(
      (option) => option.id === allocation.expenseId,
    )?.amount;
    return allocation.amount !== (current ?? fallback ?? 0);
  });
  const hasChanges = !sameIds(selectedIds, expenseIds) || hasAllocationChanges;
  const totalBalanced = isSepayExpenseAllocationBalanced(
    amount,
    selectedTotal,
    selectedIds.length,
  );
  const allocationBalanced =
    totalBalanced && hasValidAllocations && !allocationUnavailable;

  const triggerLabel =
    selectedIds.length > 0
      ? `${copy.matchedExpenseCount(formatCount(selectedIds.length))}${
          selectedExpenses.length > 0 && !allocationUnavailable
            ? ` · -${formatVND(selectedTotal)}`
            : ""
        }`
      : copy.matchExpensePlaceholder;

  const toggleExpense = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((current) =>
        current.filter((selectedId) => selectedId !== id),
      );
      setInvalidDraftIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setAllocationDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }

    const expense = expenseOptions.find((option) => option.id === id);
    if (!expense) return;
    const remainingTransactionAmount = Math.max(0, amount - selectedTotal);
    const maximumAllocation = availableAmount(expense);
    const suggestedAllocation = Math.min(
      maximumAllocation,
      remainingTransactionAmount || maximumAllocation,
    );
    setSelectedIds((current) => [...current, id]);
    setAllocationDrafts((current) => ({
      ...current,
      [id]: String(suggestedAllocation),
    }));
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await matchSepayTransactionWithExpenses({
        eventId,
        allocations: selectedAllocations,
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
            {allocationUnavailable && selectedIds.length > 0
              ? `${formatCount(selectedIds.length)} chi`
              : selectedExpenses.length > 0
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
              {allocationUnavailable ? "—" : `-${formatVND(selectedTotal)}`}
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {copy.expenseMatchDelta}
            </span>
            <span className="font-mono font-medium">
              {allocationUnavailable
                ? "—"
                : delta === 0
                  ? formatVND(0)
                  : formatVND(Math.abs(delta))}
            </span>
          </span>
        </div>
        {allocationUnavailable ? (
          <p className="text-xs text-warning" aria-live="polite">
            {copy.expenseAllocationUnavailable}
          </p>
        ) : !totalBalanced ? (
          <p className="text-xs text-warning">
            {copy.expenseAllocationMismatch}
          </p>
        ) : null}
        <div className="max-h-72 overflow-x-hidden overflow-y-auto">
          <div className="flex flex-col gap-1 pr-1">
            {availableExpenses.map((exp) => {
              const checked = selectedSet.has(exp.id);
              const inputId = `expense-allocation-${eventId}-${exp.id}`;
              const errorId = `${inputId}-error`;
              const draftAmount = Number(allocationDrafts[exp.id] ?? 0);
              const maximumAllocation = availableAmount(exp);
              const invalidDraft =
                invalidDraftIds.has(exp.id) ||
                !Number.isSafeInteger(draftAmount) ||
                draftAmount <= 0 ||
                draftAmount > maximumAllocation;
              return (
                <div
                  key={exp.id}
                  className="flex items-center gap-2 rounded-md hover:bg-muted/30"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={() => toggleExpense(exp.id)}
                    disabled={isPending || allocationUnavailable}
                  />
                  <label htmlFor={inputId} className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {expenseDetail(exp)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(exp.expense_date)}
                    </span>
                  </label>
                  {checked ? (
                    <span className="flex w-32 flex-col items-end gap-1">
                      <MoneyVndInput
                        aria-label={`${copy.selectedExpenseAmount}: ${expenseDetail(exp)}`}
                        aria-describedby={invalidDraft ? errorId : undefined}
                        value={allocationDrafts[exp.id] ?? ""}
                        onValueChange={(value) =>
                          setAllocationDrafts((current) => ({
                            ...current,
                            [exp.id]: value,
                          }))
                        }
                        onDraftStateChange={(state) =>
                          setInvalidDraftIds((current) => {
                            const next = new Set(current);
                            if (state === "invalid" || state === "incomplete") {
                              next.add(exp.id);
                            } else {
                              next.delete(exp.id);
                            }
                            return next;
                          })
                        }
                        disabled={isPending || allocationUnavailable}
                        aria-invalid={invalidDraft}
                        className="h-10 w-full text-right font-mono"
                      />
                      {invalidDraft ? (
                        <span
                          id={errorId}
                          className="text-right text-xs text-destructive"
                        >
                          {copy.expenseAllocationInvalid}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="font-mono text-xs font-medium text-warning">
                      -{formatVND(maximumAllocation)}
                    </span>
                  )}
                </div>
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
              onClick={() => {
                setSelectedIds([]);
                setAllocationDrafts({});
                setInvalidDraftIds(new Set());
              }}
              disabled={
                isPending || allocationUnavailable || selectedIds.length === 0
              }
            >
              {copy.clearExpenseMatch}
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending || !hasChanges || !allocationBalanced}
          >
            {copy.saveExpenseMatch}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
