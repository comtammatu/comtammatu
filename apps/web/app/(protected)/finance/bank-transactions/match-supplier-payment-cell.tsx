"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import type { SepaySupplierPaymentMatch } from "../_lib/sepay-bank-transaction-model";
import { setSepaySupplierPaymentLinks } from "../supplier-payment-link-actions";

const copy = messages.finance.bankTransactions;

interface MatchSupplierPaymentCellProps {
  eventId: number;
  amount: number;
  matches: SepaySupplierPaymentMatch[];
  candidates: SepaySupplierPaymentMatch[];
  canEdit: boolean;
}

function supplierInvoiceHref(invoiceId: number): string {
  return `/finance/supplier-invoices?invoiceId=${invoiceId}`;
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function mergeSupplierPayments(
  matches: SepaySupplierPaymentMatch[],
  candidates: SepaySupplierPaymentMatch[],
  bankAmount: number,
): SepaySupplierPaymentMatch[] {
  const byId = new Map<number, SepaySupplierPaymentMatch>();
  for (const payment of [...matches, ...candidates]) {
    byId.set(payment.id, payment);
  }
  return [...byId.values()].sort((left, right) => {
    const leftMatched = matches.some((match) => match.id === left.id);
    const rightMatched = matches.some((match) => match.id === right.id);
    if (leftMatched !== rightMatched) return leftMatched ? -1 : 1;
    const leftExact = left.amount === bankAmount;
    const rightExact = right.amount === bankAmount;
    if (leftExact !== rightExact) return leftExact ? -1 : 1;
    return (
      right.paymentDate.localeCompare(left.paymentDate) || left.id - right.id
    );
  });
}

export function MatchSupplierPaymentCell({
  eventId,
  amount,
  matches,
  candidates,
  canEdit,
}: MatchSupplierPaymentCellProps) {
  const router = useRouter();
  const currentIds = React.useMemo(
    () => matches.map((match) => match.id).sort((left, right) => left - right),
    [matches],
  );
  const availablePayments = React.useMemo(
    () => mergeSupplierPayments(matches, candidates, amount),
    [amount, candidates, matches],
  );
  const [open, setOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<number[]>(currentIds);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setSelectedIds(currentIds);
  }, [currentIds]);

  const selectedSet = new Set(selectedIds);
  const selectedTotal = availablePayments.reduce(
    (total, payment) =>
      selectedSet.has(payment.id) ? total + payment.amount : total,
    0,
  );
  const delta = amount - selectedTotal;
  const hasChanges = !sameIds(selectedIds, currentIds);
  const hasExactTotal = selectedIds.length > 0 && selectedTotal === amount;

  const persist = (supplierPaymentIds: number[]) => {
    startTransition(async () => {
      const result = await setSepaySupplierPaymentLinks({
        eventId,
        supplierPaymentIds,
      });
      if (!result.success) {
        toast.error(
          result.error ?? copy.supplierPaymentLink.errors.actionError,
        );
        return;
      }

      toast.success(
        supplierPaymentIds.length === 0
          ? copy.supplierPaymentLink.clearSuccess
          : copy.supplierPaymentLink.saveSuccess,
      );
      setOpen(false);
      router.refresh();
    });
  };

  const togglePayment = (paymentId: number) => {
    setSelectedIds((current) =>
      current.includes(paymentId)
        ? current.filter((id) => id !== paymentId)
        : [...current, paymentId],
    );
  };

  if (!canEdit && matches.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col items-end gap-1.5">
      {matches.length > 0 ? (
        <div className="flex min-w-0 flex-col items-end gap-1">
          {matches.map((match) => (
            <div key={match.id} className="flex min-w-0 flex-col items-end">
              <Badge
                asChild
                variant="outline"
                className="w-fit text-success font-normal"
              >
                <Link href={supplierInvoiceHref(match.invoiceId)}>
                  {copy.matchedSupplierPayment(match.id)}
                </Link>
              </Badge>
              <span className="max-w-64 truncate text-xs text-muted-foreground">
                {copy.matchedSupplierPaymentDetail(
                  match.supplierName ?? "—",
                  match.invoiceNumber ?? "—",
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8">
              {matches.length > 0
                ? copy.supplierPaymentLink.editAction
                : copy.supplierPaymentLink.addAction}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {copy.supplierPaymentLink.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {copy.supplierPaymentLink.description}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="flex flex-col gap-1">
                  <span className="text-muted-foreground">
                    {copy.supplierPaymentLink.bankAmount}
                  </span>
                  <span className="font-mono font-medium text-warning">
                    -{formatVND(amount)}
                  </span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-muted-foreground">
                    {copy.supplierPaymentLink.selectedAmount}
                  </span>
                  <span className="font-mono font-medium text-warning">
                    -{formatVND(selectedTotal)}
                  </span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-muted-foreground">
                    {copy.supplierPaymentLink.delta}
                  </span>
                  <span className="font-mono font-medium">
                    {formatVND(Math.abs(delta))}
                  </span>
                </span>
              </div>

              {selectedIds.length > 0 && !hasExactTotal ? (
                <span className="text-xs text-warning">
                  {copy.supplierPaymentLink.amountMismatch}
                </span>
              ) : null}

              <div className="max-h-72 overflow-x-hidden overflow-y-auto">
                <div className="flex flex-col gap-1 pr-1">
                  {availablePayments.map((payment) => {
                    const inputId = `supplier-payment-${eventId}-${payment.id}`;
                    return (
                      <div
                        key={payment.id}
                        className="flex items-start gap-2 rounded-md p-1.5 hover:bg-muted/30"
                      >
                        <Checkbox
                          id={inputId}
                          checked={selectedSet.has(payment.id)}
                          onCheckedChange={() => togglePayment(payment.id)}
                          disabled={isPending}
                        />
                        <label
                          htmlFor={inputId}
                          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1"
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm">
                              {copy.matchedSupplierPaymentDetail(
                                payment.supplierName ?? "—",
                                payment.invoiceNumber ?? "—",
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-xs font-medium text-warning">
                              -{formatVND(payment.amount)}
                            </span>
                          </span>
                          <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              {copy.supplierPaymentLink.paymentDate}:{" "}
                              {formatVNBusinessDate(payment.paymentDate)}
                            </span>
                            <span className="min-w-0 truncate font-mono">
                              {payment.referenceNote ??
                                copy.supplierPaymentLink.noReference}
                            </span>
                          </span>
                        </label>
                      </div>
                    );
                  })}
                  {availablePayments.length === 0 ? (
                    <span className="py-4 text-center text-xs text-muted-foreground">
                      {copy.supplierPaymentLink.noCandidates}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => persist([])}
                  disabled={isPending || currentIds.length === 0}
                >
                  {copy.supplierPaymentLink.clearAction}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    persist([...selectedIds].sort((a, b) => a - b))
                  }
                  disabled={isPending || !hasChanges || !hasExactTotal}
                >
                  {isPending
                    ? copy.supplierPaymentLink.savePending
                    : copy.supplierPaymentLink.saveAction}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
