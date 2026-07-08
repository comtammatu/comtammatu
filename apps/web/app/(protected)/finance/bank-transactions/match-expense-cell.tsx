"use client";

import * as React from "react";
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
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import type { ExpenseMatchOption } from "../expense-actions";
import { matchSepayTransactionWithExpenses } from "../expense-actions";

const copy = messages.finance.bankTransactions;

interface MatchExpenseCellProps {
  eventId: number;
  paymentId: number | null;
  expenseIds: number[];
  transferType: "in" | "out";
  expenseOptions: ExpenseMatchOption[];
}

function formatDate(value: string): string {
  return value.split("-").reverse().join("/");
}

function expenseDetail(expense: ExpenseMatchOption): string {
  return expense.note || expense.vendor_name || expense.category;
}

function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((id) => left.has(id));
}

export function MatchExpenseCell({
  eventId,
  paymentId,
  expenseIds,
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

  if (transferType === "in") {
    return <span className="text-muted-foreground">—</span>;
  }

  const selectedSet = new Set(selectedIds);
  const availableExpenses = expenseOptions.filter(
    (exp) =>
      exp.matchedEventId == null ||
      exp.matchedEventId === eventId ||
      selectedSet.has(exp.id),
  );
  const selectedExpenses = availableExpenses.filter((exp) =>
    selectedSet.has(exp.id),
  );
  const selectedTotal = selectedExpenses.reduce(
    (sum, exp) => sum + exp.amount,
    0,
  );
  const hasChanges = !sameIds(selectedIds, expenseIds);

  const triggerLabel =
    selectedIds.length > 0
      ? `${selectedIds.length} chi${
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
                ? `${selectedIds.length} chi`
                : "—"}
          </span>
        </div>
        <ScrollArea className="max-h-72">
          <div className="flex flex-col gap-1">
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
        </ScrollArea>
        <div className="flex items-center justify-between gap-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
            disabled={isPending || selectedIds.length === 0}
          >
            {copy.clearExpenseMatch}
          </Button>
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
