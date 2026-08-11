"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Alert,
  AlertDescription,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { cn } from "@comtammatu/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import {
  formatAccountingVND as formatVND,
  formatCount,
} from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  isSepayExpenseAllocationBalanced,
  isSepayRefundAllocationBalanced,
  nextSepayExpenseSelection,
  type SepayRefundMatchOption,
  type SepaySupplierPaymentMatch,
} from "../_lib/sepay-bank-transaction-model";
import { isExpenseVisibleForBankMatch } from "../_lib/expense-categories";
import type {
  ExpenseMatchOption,
  SepayRefundSearchCursor,
} from "../expense-actions";
import {
  matchSepayTransactionWithExpenses,
  matchSepayTransactionWithRefunds,
  matchSepayTransactionWithSupplierPayments,
  searchSepayRefundOptions,
} from "../expense-actions";
import { FinanceAmountCell } from "../components/finance-amount-cell";
import { FinanceMoneySummary } from "../components/finance-money-summary";
import { displayBankContent } from "../_lib/display-bank-content";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const copy = messages.finance.bankTransactions;
type MatchPurpose = "expense" | "refund" | "supplier";

interface MatchExpenseCellProps {
  bankTransactionId: number | null;
  eventId: number | null;
  amount: number;
  paymentId: number | null;
  expenseIds: number[];
  supplierPaymentMatches: SepaySupplierPaymentMatch[];
  supplierPaymentMatchConfirmed: boolean;
  refundMatches: SepayRefundMatchOption[];
  refundMatchConfirmed: boolean;
  transferType: "in" | "out";
  expenseOptions: ExpenseMatchOption[];
  touch: boolean;
  evidence: {
    content: string | null;
    reference: string;
    occurredAt: string;
    accountNumber: string | null;
  };
}

function formatSignedDelta(delta: number): string {
  if (delta === 0) return formatVND(0);
  const prefix = delta > 0 ? "+" : "-";
  return `${prefix}${formatVND(Math.abs(delta))}`;
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
  bankTransactionId,
  eventId,
  amount,
  paymentId,
  expenseIds,
  supplierPaymentMatches,
  supplierPaymentMatchConfirmed,
  refundMatches,
  refundMatchConfirmed,
  transferType,
  expenseOptions,
  touch,
  evidence,
}: MatchExpenseCellProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [isRefundSearchPending, startRefundSearchTransition] =
    React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [purpose, setPurpose] = React.useState<MatchPurpose | null>(
    expenseIds.length > 0 ? "expense" : null,
  );
  const [selectedIds, setSelectedIds] = React.useState<number[]>(expenseIds);
  const [refundQuery, setRefundQuery] = React.useState("");
  const [activeRefundQuery, setActiveRefundQuery] = React.useState("");
  const [refundOptions, setRefundOptions] = React.useState<
    SepayRefundMatchOption[]
  >([]);
  const [refundNextCursor, setRefundNextCursor] =
    React.useState<SepayRefundSearchCursor | null>(null);
  const [refundOptionsLoaded, setRefundOptionsLoaded] = React.useState(false);
  const [refundOptionsError, setRefundOptionsError] = React.useState<
    string | null
  >(null);
  const [selectedRefundsById, setSelectedRefundsById] = React.useState<
    Record<number, SepayRefundMatchOption>
  >({});
  const [matchError, setMatchError] = React.useState<string | null>(null);
  const matchKey = bankTransactionId ?? eventId;

  React.useEffect(() => {
    setSelectedIds(expenseIds);
  }, [expenseIds]);

  React.useEffect(() => {
    if (open) setMatchError(null);
  }, [open]);

  // When the match sheet opens on a clean slate (no saved or user-picked match),
  // pre-select a single exact-amount expense candidate so the common case — one
  // bank outflow matching one unpaid expense — is two taps (open → Save) instead
  // of four. Ambiguous cases (zero or multiple exact matches) leave selection to
  // the user, who can still change or clear the pre-selection.
  const previousOpenRef = React.useRef(false);
  React.useEffect(() => {
    const justOpened = open && !previousOpenRef.current;
    previousOpenRef.current = open;
    if (!justOpened) return;
    if (!sameIds(selectedIds, expenseIds)) return;
    const exactMatches = expenseOptions.filter(
      (expense) =>
        isExpenseVisibleForBankMatch(expense, eventId, bankTransactionId) &&
        expense.amount === amount,
    );
    const onlyExactMatch = exactMatches.length === 1 ? exactMatches[0] : null;
    if (onlyExactMatch) {
      setSelectedIds([onlyExactMatch.id]);
      if (purpose == null) setPurpose("expense");
    }
    // Intentionally minimal deps: this fires only on the open transition.
  }, [open, expenseOptions]);

  if (matchKey == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const loadRefundOptions = ({
    append,
    query,
  }: {
    append: boolean;
    query: string;
  }) => {
    const cursor = append ? refundNextCursor : null;
    const requestedQuery = append ? activeRefundQuery : query;
    setRefundOptionsError(null);
    startRefundSearchTransition(async () => {
      const result = await searchSepayRefundOptions({
        query: requestedQuery,
        cursor,
      });
      if (!result.success || !result.data) {
        setRefundOptionsError(result.error ?? copy.refundLoadError);
        return;
      }

      setRefundOptions((current) => {
        if (!append) return result.data?.items ?? [];
        const merged = new Map(current.map((refund) => [refund.id, refund]));
        for (const refund of result.data?.items ?? []) {
          merged.set(refund.id, refund);
        }
        return Array.from(merged.values());
      });
      setRefundNextCursor(result.data.nextCursor);
      setRefundOptionsLoaded(true);
      if (!append) setActiveRefundQuery(requestedQuery);
    });
  };

  const handleSupplierPaymentMatch = (supplierPaymentIds: number[]) => {
    startTransition(async () => {
      const res = await matchSepayTransactionWithSupplierPayments({
        bankTransactionId,
        eventId,
        supplierPaymentIds,
      });

      if (!res.success) {
        toast.error(res.error || copy.supplierPaymentMatchError);
      } else {
        toast.success(
          supplierPaymentIds.length > 0
            ? copy.supplierPaymentMatchSuccess
            : copy.supplierPaymentMatchCleared,
        );
        setOpen(false);
        router.refresh();
      }
    });
  };

  const handleRefundMatch = (refundIds: number[]) => {
    startTransition(async () => {
      const res = await matchSepayTransactionWithRefunds({
        bankTransactionId,
        eventId,
        refundIds,
      });

      if (!res.success) {
        toast.error(res.error || copy.refundMatchError);
      } else {
        toast.success(
          refundIds.length > 0
            ? copy.refundMatchSuccess
            : copy.refundMatchCleared,
        );
        setOpen(false);
        setSelectedRefundsById({});
        router.refresh();
      }
    });
  };

  const matchedPersistedIntent = expenseOptions.find(
    (expense) =>
      expenseIds.includes(expense.id) &&
      expense.transfer_content != null &&
      ((eventId != null && expense.matchedEventIds.includes(eventId)) ||
        (bankTransactionId != null &&
          expense.matchedBankTransactionIds.includes(bankTransactionId))),
  );

  if (paymentId != null) {
    return null;
  }

  if (supplierPaymentMatchConfirmed && supplierPaymentMatches.length > 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={touch ? "touch" : "sm"}
        disabled={isPending}
        onClick={() => handleSupplierPaymentMatch([])}
      >
        {copy.clearSupplierPaymentMatch}
      </Button>
    );
  }

  if (refundMatchConfirmed && refundMatches.length > 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={touch ? "touch" : "sm"}
        disabled={isPending}
        onClick={() => handleRefundMatch([])}
      >
        {copy.clearRefundMatch}
      </Button>
    );
  }

  if (transferType === "in" && expenseIds.length > 0) {
    return null;
  }

  if (transferType === "in") {
    return null;
  }

  if (matchedPersistedIntent) {
    return null;
  }

  const selectedSet = new Set(selectedIds);
  const availableExpenses = expenseOptions
    .filter((expense) =>
      isExpenseVisibleForBankMatch(expense, eventId, bankTransactionId),
    )
    .sort(
      (left, right) =>
        Math.abs(left.amount - amount) - Math.abs(right.amount - amount),
    );
  const persistedIntentIds = new Set(
    availableExpenses
      .filter(
        (expense) =>
          expense.transfer_content != null &&
          expense.matchedEventIds.length === 0,
      )
      .map((expense) => expense.id),
  );
  const selectedPersistedIntentId = selectedIds.find((id) =>
    persistedIntentIds.has(id),
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
  const allocationBalanced = isSepayExpenseAllocationBalanced(
    amount,
    selectedTotal,
    selectedIds.length,
  );
  const selectedRefunds = Object.values(selectedRefundsById);
  const selectedRefundIds = selectedRefunds.map((refund) => refund.id);
  const selectedRefundSet = new Set(selectedRefundIds);
  const availableRefunds = [
    ...selectedRefunds,
    ...refundOptions.filter((refund) => !selectedRefundSet.has(refund.id)),
  ];
  const selectedRefundTotal = selectedRefunds.reduce(
    (sum, refund) => sum + refund.amount,
    0,
  );
  const refundAllocationBalanced = isSepayRefundAllocationBalanced(
    amount,
    selectedRefundTotal,
    selectedRefundIds.length,
  );

  const triggerLabel = copy.matchAction;

  const toggleExpense = (expense: ExpenseMatchOption) => {
    setSelectedIds((current) =>
      nextSepayExpenseSelection(current, expense.id, persistedIntentIds),
    );
  };

  const toggleRefund = (refund: SepayRefundMatchOption) => {
    setSelectedRefundsById((current) => {
      const next = { ...current };
      if (next[refund.id]) {
        delete next[refund.id];
      } else {
        next[refund.id] = refund;
      }
      return next;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await matchSepayTransactionWithExpenses({
        bankTransactionId,
        eventId,
        expenseIds: selectedIds,
      });

      if (!res.success) {
        setMatchError(res.error || copy.matchError);
        return;
      }

      setMatchError(null);
      toast.success(copy.matchSuccess);
      setOpen(false);
      router.refresh();
    });
  };

  const selectPurpose = (nextPurpose: MatchPurpose) => {
    setPurpose(nextPurpose);
    setSelectedIds(expenseIds);
    setSelectedRefundsById({});
    if (nextPurpose === "refund" && !refundOptionsLoaded) {
      loadRefundOptions({ append: false, query: "" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size={touch ? "touch" : "sm"}
            className="shrink-0"
          >
            {triggerLabel}
          </Button>
        }
      />
      <SheetContent className="overflow-hidden">
        <SheetHeader>
          <SheetTitle>{copy.matchSheetTitle}</SheetTitle>
          <SheetDescription>{copy.matchSheetDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {matchError ? (
              <Alert variant="destructive">
                <AlertDescription>{matchError}</AlertDescription>
              </Alert>
            ) : null}
            <NoteCallout label={copy.bankEvidenceTitle}>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">{copy.moneyOut}</Badge>
                  <span className="font-mono font-medium text-warning">
                    -{formatVND(amount)}
                  </span>
                </div>
                <p className="break-words text-sm font-medium">
                  {displayBankContent(evidence.content)}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{evidence.occurredAt}</span>
                  <span className="break-all font-mono">
                    {evidence.reference}
                  </span>
                  <span className="break-all">
                    {copy.account}: {evidence.accountNumber ?? "—"}
                  </span>
                </div>
              </div>
            </NoteCallout>
            <div className="grid gap-2 border-b pb-3">
              <p className="text-xs font-medium text-muted-foreground">
                {copy.matchPurposeTitle}
              </p>
              <ToggleGroup
                type="single"
                value={purpose ?? ""}
                variant="outline"
                size={isTouchLayout ? "touch" : "default"}
                spacing={0}
                className="grid w-full grid-cols-1 min-[360px]:grid-cols-3"
                aria-label={copy.matchPurposeTitle}
                onValueChange={(value) => {
                  if (
                    value === "refund" ||
                    value === "expense" ||
                    value === "supplier"
                  ) {
                    selectPurpose(value);
                  }
                }}
              >
                <ToggleGroupItem
                  value="refund"
                  className="min-w-0 justify-center"
                  disabled={expenseIds.length > 0}
                >
                  {copy.refundPurpose}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="expense"
                  className="min-w-0 justify-center"
                >
                  {copy.expensePurpose}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="supplier"
                  className="min-w-0 justify-center"
                  disabled={
                    expenseIds.length > 0 || supplierPaymentMatches.length === 0
                  }
                >
                  {copy.supplierPurpose}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {purpose === "supplier" && supplierPaymentMatches.length > 0 ? (
              <NoteCallout label={copy.supplierPaymentSuggestion}>
                <span className="truncate text-xs text-muted-foreground">
                  {copy.matchedSupplierPaymentDetail(
                    supplierPaymentMatches[0]?.supplierName ?? "—",
                    formatVND(supplierPaymentMatches[0]?.amount ?? 0),
                  )}
                </span>
              </NoteCallout>
            ) : null}
            {purpose === "refund" ? (
              <div className="grid gap-2">
                <div>
                  <p className="font-medium">{copy.refundMatchTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.refundMatchHint}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
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
                      {copy.selectedRefundAmount}
                    </span>
                    <span className="font-mono font-medium text-warning">
                      -{formatVND(selectedRefundTotal)}
                    </span>
                  </span>
                </div>
                {!refundAllocationBalanced ? (
                  <p className="text-xs text-warning">
                    {copy.refundAllocationMismatch}
                  </p>
                ) : null}
                <form
                  className="flex flex-col gap-2 min-[360px]:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    loadRefundOptions({ append: false, query: refundQuery });
                  }}
                >
                  <Input
                    type="search"
                    name="refund-order-number"
                    value={refundQuery}
                    onChange={(event) => setRefundQuery(event.target.value)}
                    placeholder={copy.refundSearchPlaceholder}
                    aria-label={copy.refundSearchPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    disabled={isRefundSearchPending}
                  />
                  <Button
                    type="submit"
                    size={isTouchLayout ? "touch" : "default"}
                    variant="outline"
                    className="w-full min-[360px]:w-auto"
                    disabled={isRefundSearchPending}
                  >
                    {isRefundSearchPending
                      ? copy.refundLoadingAction
                      : copy.refundSearchAction}
                  </Button>
                </form>
                {refundOptionsError ? (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-xs text-destructive"
                  >
                    {refundOptionsError}
                  </p>
                ) : null}
                <div>
                  <div className="flex flex-col gap-1 pr-1">
                    {availableRefunds.map((refund) => {
                      const checkboxId = `sepay-${String(matchKey)}-refund-${refund.id}`;
                      return (
                        <label
                          key={refund.id}
                          htmlFor={checkboxId}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md py-2 hover:bg-muted/30"
                        >
                          <Checkbox
                            size={isTouchLayout ? "touch" : "default"}
                            id={checkboxId}
                            checked={selectedRefundSet.has(refund.id)}
                            onCheckedChange={() => toggleRefund(refund)}
                            disabled={isPending}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-sm">
                              {refund.orderNumber}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatVNBusinessDate(refund.approvedAt)}
                            </span>
                          </span>
                          <FinanceAmountCell
                            amount={refund.amount}
                            basis="inclVat"
                            signed
                            className="text-xs text-warning"
                          />
                        </label>
                      );
                    })}
                    {isRefundSearchPending && availableRefunds.length === 0 ? (
                      <div
                        role="status"
                        aria-live="polite"
                        className="text-center text-xs text-muted-foreground"
                      >
                        {copy.refundLoading}
                      </div>
                    ) : null}
                    {refundOptionsLoaded &&
                    !isRefundSearchPending &&
                    availableRefunds.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground">
                        {copy.noUnmatchedRefunds}
                      </div>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size={isTouchLayout ? "touch" : "default"}
                  onClick={() =>
                    loadRefundOptions({
                      append: true,
                      query: activeRefundQuery,
                    })
                  }
                  disabled={isRefundSearchPending || refundNextCursor == null}
                  className={cn(
                    "w-full sm:w-auto",
                    refundNextCursor == null && "invisible",
                  )}
                >
                  {copy.refundLoadMore}
                </Button>
              </div>
            ) : null}
            {purpose === "expense" ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{copy.matchExpenseTitle}</span>
                  {selectedIds.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {copy.selectedExpenseCount(formatCount(selectedIds.length))}
                    </span>
                  ) : null}
                </div>
                <FinanceMoneySummary
                  tone="none"
                  rows={[
                    {
                      label: copy.bankTransactionAmount,
                      display: `-${formatVND(amount)}`,
                      tone: "warning",
                    },
                    {
                      label: copy.selectedExpenseAmount,
                      display: `-${formatVND(selectedTotal)}`,
                      tone: "warning",
                    },
                    {
                      label: copy.expenseMatchDelta,
                      display: formatSignedDelta(delta),
                    },
                  ]}
                />
                {!allocationBalanced ? (
                  <p className="text-xs text-warning">
                    {copy.expenseAllocationMismatch}
                  </p>
                ) : null}
                {persistedIntentIds.size > 0 ? (
                  <NoteCallout label={copy.transferIntentLabel}>
                    {selectedPersistedIntentId != null
                      ? copy.transferIntentSelectionHint
                      : copy.transferIntentExclusiveHint}
                  </NoteCallout>
                ) : null}
                <div>
                  <div className="flex flex-col gap-1 pr-1">
                    {availableExpenses.map((exp) => {
                      const checked = selectedSet.has(exp.id);
                      const checkboxId = `sepay-${String(matchKey)}-expense-${exp.id}`;
                      const hasTransferIntent = exp.transfer_content != null;
                      const blockedBySelectedIntent =
                        selectedPersistedIntentId != null &&
                        selectedPersistedIntentId !== exp.id;
                      return (
                        <label
                          key={exp.id}
                          htmlFor={checkboxId}
                          aria-disabled={blockedBySelectedIntent || isPending}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-md py-2",
                            blockedBySelectedIntent || isPending
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-muted/30",
                          )}
                        >
                          <Checkbox
                            size={isTouchLayout ? "touch" : "default"}
                            id={checkboxId}
                            checked={checked}
                            onCheckedChange={() => toggleExpense(exp)}
                            disabled={isPending || blockedBySelectedIntent}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-sm">
                              {expenseDetail(exp)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatVNBusinessDate(exp.expense_date)}
                            </span>
                            {hasTransferIntent ? (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {copy.transferIntentLabel}:{" "}
                                <code className="break-all font-mono text-xs text-foreground">
                                  {exp.transfer_content}
                                </code>
                              </span>
                            ) : null}
                          </span>
                          <FinanceAmountCell
                            amount={exp.amount}
                            basis="inclVat"
                            signed
                            className="text-xs text-warning"
                          />
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
              </div>
            ) : null}
          </div>
          {purpose === "supplier" && supplierPaymentMatches.length > 0 ? (
            <div className="sticky bottom-0 shrink-0 border-t bg-background p-4 pt-3">
              <Button
                type="button"
                size={isTouchLayout ? "touch" : "default"}
                className="w-full"
                disabled={isPending}
                onClick={() =>
                  handleSupplierPaymentMatch(
                    supplierPaymentMatches.map((match) => match.id),
                  )
                }
              >
                {copy.confirmSupplierPaymentMatch}
              </Button>
            </div>
          ) : null}
          {purpose === "refund" ? (
            <div className="sticky bottom-0 shrink-0 border-t bg-background p-4 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size={isTouchLayout ? "touch" : "default"}
                  onClick={() => setSelectedRefundsById({})}
                  disabled={isPending || selectedRefundIds.length === 0}
                >
                  {copy.clearRefundMatch}
                </Button>
                <Button
                  type="button"
                  size={isTouchLayout ? "touch" : "default"}
                  onClick={() => handleRefundMatch(selectedRefundIds)}
                  disabled={
                    isPending ||
                    selectedRefundIds.length === 0 ||
                    !refundAllocationBalanced ||
                    expenseIds.length > 0
                  }
                >
                  {copy.saveRefundMatch}
                </Button>
              </div>
            </div>
          ) : null}
          {purpose === "expense" ? (
            <div className="sticky bottom-0 shrink-0 border-t bg-background p-4 pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size={isTouchLayout ? "touch" : "default"}
                    className="w-full sm:w-auto"
                    render={<Link href="/finance/expenses" />}
                  >
                    {copy.openExpenses}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size={isTouchLayout ? "touch" : "default"}
                    className="w-full sm:w-auto"
                    onClick={() => setSelectedIds([])}
                    disabled={isPending || selectedIds.length === 0}
                  >
                    {copy.clearExpenseMatch}
                  </Button>
                </div>
                <Button
                  type="button"
                  size={isTouchLayout ? "touch" : "default"}
                  className="w-full sm:w-auto"
                  onClick={handleSave}
                  disabled={isPending || !hasChanges || !allocationBalanced}
                >
                  {copy.saveExpenseMatch}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
