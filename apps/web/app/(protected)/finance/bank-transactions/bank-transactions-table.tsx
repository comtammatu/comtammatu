"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft as IconMoneyIn,
  ArrowUpRight as IconMoneyOut,
} from "lucide-react";
import {
  formatAccountingVND as formatVND,
  formatCount,
} from "@comtammatu/shared/format";
import {
  formatVNDate,
  formatVNDateTime,
  formatVNTimeSeconds,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { useFormControlSize } from "@/components/form/control-size";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppListFrame,
  AppSheet,
} from "@/components/surface";
import { messages } from "@lib/messages";
import {
  SEPAY_BANK_WEBHOOK_REVIEW_VALUES,
  canManuallyLinkSepayPayment,
  classifySepayReconciliationState,
  classifySepayUnmatchedMoneyIn,
  isOpenSepayBankWebhookReview,
  isSepayPaymentConflictReviewCode,
  resolveSepayTransactionInstant,
  type SepayBankWebhookReviewStatus,
  type SepayBankTransaction,
  type SepayMissingBankWebhookPayment,
  type SepayReconciliationState,
  type SepayUnmatchedMoneyInReason,
} from "../_lib/sepay-bank-transaction-model";
import {
  reviewMissingBankWebhookPayment,
} from "../bank-webhook-review-actions";
import type { ExpenseMatchOption } from "../expense-actions";
import type { FinanceParams } from "../_lib/finance-params";
import {
  BANK_RECONCILIATION_FILTER_DEFAULT,
  BANK_RECONCILIATION_FILTER_PARAM,
  isBankReconciliationFilter,
  parseBankReconciliationFilter,
  type BankReconciliationFilter,
} from "../_lib/bank-reconciliation-filter";
import { FilterBar } from "../components/filter-bar";
import { financeFilterReconTriggerClassName } from "../components/finance-list-filters";
import { MatchExpenseCell } from "./match-expense-cell";
import { MatchPaymentSheet } from "./match-payment-sheet";
import { displayBankContent } from "../_lib/display-bank-content";

export { displayBankContent };

const copy = messages.finance.bankTransactions;
const statusCopy = messages.finance.common.status;
const REVIEW_PENDING_VALUE = "pending";
function reconciliationStateBadgeMeta(state: SepayReconciliationState): {
  label: string;
  variant: "success" | "warning" | "destructive";
} {
  if (state === "matched") {
    return { label: copy.reconciliationStateLabels[state], variant: "success" };
  }
  if (state === "webhook_error") {
    return {
      label: copy.reconciliationStateLabels[state],
      variant: "destructive",
    };
  }
  return { label: statusCopy.unmatched, variant: "warning" };
}

interface BankTransactionsTableProps {
  params: FinanceParams;
  transactions: SepayBankTransaction[];
  missingBankWebhookPayments: SepayMissingBankWebhookPayment[];
  expenseOptions: ExpenseMatchOption[];
  canLinkPayments: boolean;
}

type BankReconciliationRow =
  | {
      kind: "bank";
      tx: SepayBankTransaction;
    }
  | {
      kind: "missing_webhook";
      payment: SepayMissingBankWebhookPayment;
    };

function referenceCode(tx: SepayBankTransaction): string {
  return tx.referenceCode ?? tx.code ?? tx.requestId;
}

function formatPaymentId(paymentId: number): string {
  return `#${paymentId}`;
}

function formatProviderRef(providerRef: string | null): string {
  return providerRef?.trim() ? providerRef : "—";
}

function isReviewStatus(value: string): value is SepayBankWebhookReviewStatus {
  return SEPAY_BANK_WEBHOOK_REVIEW_VALUES.some((status) => status === value);
}

function rowPrimaryLabel(row: BankReconciliationRow): string {
  if (row.kind === "missing_webhook") {
    return `${copy.missingWebhookTable.payment} ${formatPaymentId(
      row.payment.paymentId,
    )}`;
  }
  return displayBankContent(row.tx.content);
}

function rowSecondaryLabel(row: BankReconciliationRow): string {
  const instant = rowOccurredAt(row);
  const date = formatVNDate(instant);
  const time = formatVNTimeSeconds(instant);
  const when = time !== "—" ? `${date} ${time}` : date;
  const reference =
    row.kind === "missing_webhook"
      ? formatProviderRef(row.payment.providerRef)
      : referenceCode(row.tx);
  return reference !== "—" ? `${when} · ${reference}` : when;
}

function AmountCell({ tx }: { tx: SepayBankTransaction }) {
  return (
    <TransactionAmount amount={tx.amount} transferType={tx.transferType} />
  );
}

function TransactionAmount({
  amount,
  transferType,
}: {
  amount: number;
  transferType: "in" | "out";
}) {
  const isIn = transferType === "in";
  const Icon = isIn ? IconMoneyIn : IconMoneyOut;

  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 whitespace-nowrap font-mono text-sm font-semibold tabular-nums",
        isIn ? "text-success" : "text-warning",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{isIn ? copy.moneyIn : copy.moneyOut}</span>
      {isIn ? "+" : "-"}
      {formatVND(amount)}
    </div>
  );
}

function PaymentAmountCell({
  payment,
}: {
  payment: SepayMissingBankWebhookPayment;
}) {
  return <TransactionAmount amount={payment.amount} transferType="in" />;
}

function reasonLabel(reason: SepayUnmatchedMoneyInReason): string {
  return copy.unmatchedMoneyInTable.reasonLabels[reason];
}

function reviewStatusLabel(
  status: SepayBankWebhookReviewStatus | typeof REVIEW_PENDING_VALUE,
): string {
  return copy.missingWebhookTable.reviewStatusLabels[status];
}

function StatusBadgeButton({
  label,
  variant,
  clickable,
}: {
  label: string;
  variant: "success" | "warning" | "destructive" | "secondary";
  clickable: boolean;
}) {
  if (!clickable) {
    return <Badge variant={variant}>{label}</Badge>;
  }

  return (
    <Badge
      variant={variant}
      render={<button type="button" />}
      className="cursor-pointer hover:opacity-90"
      aria-haspopup="dialog"
    >
      {label}
    </Badge>
  );
}

function MissingWebhookStatusCell({
  payment,
  touch,
}: {
  payment: SepayMissingBankWebhookPayment;
  touch: boolean;
}) {
  const status = payment.bankWebhookReviewStatus ?? REVIEW_PENDING_VALUE;
  const variant =
    status === "resolved" || status === "ignored" ? "secondary" : "warning";
  const badge = (
    <StatusBadgeButton
      label={reviewStatusLabel(status)}
      variant={variant}
      clickable
    />
  );

  return (
    <AppSheet
      title={copy.missingWebhookTable.reviewStatus}
      trigger={badge}
    >
      <ReviewStatusSelect payment={payment} touch={touch} />
    </AppSheet>
  );
}

function hasPersistedTransferIntent(
  tx: SepayBankTransaction,
  expenseOptions: ExpenseMatchOption[],
): boolean {
  return expenseOptions.some(
    (expense) =>
      tx.expenseIds.includes(expense.id) &&
      expense.transfer_content != null &&
      ((tx.eventId != null && expense.matchedEventIds.includes(tx.eventId)) ||
        (tx.bankTransactionId != null &&
          expense.matchedBankTransactionIds.includes(tx.bankTransactionId))),
  );
}

function canOpenMoneyOutMatch(
  tx: SepayBankTransaction,
  expenseOptions: ExpenseMatchOption[],
): boolean {
  if (tx.bankTransactionId == null && tx.eventId == null) return false;
  if (tx.paymentId != null) return false;
  if (tx.transferType === "in") return false;
  if (hasPersistedTransferIntent(tx, expenseOptions)) return false;
  return true;
}

function BankRowStatus({
  tx,
  expenseOptions,
  canLinkPayments,
  touch,
}: {
  tx: SepayBankTransaction;
  expenseOptions: ExpenseMatchOption[];
  canLinkPayments: boolean;
  touch: boolean;
}) {
  const state = classifySepayReconciliationState(tx);
  const meta = reconciliationStateBadgeMeta(state);
  const moneyInMatchable =
    canLinkPayments && canManuallyLinkSepayPayment(tx);
  const moneyOutMatchable = canOpenMoneyOutMatch(tx, expenseOptions);
  const clickable = moneyInMatchable || moneyOutMatchable;
  const hasPaymentConflictDetail =
    tx.transferType === "in" && isSepayPaymentConflictReviewCode(tx.errorCode);
  const conflictOrder =
    hasPaymentConflictDetail && tx.orderId != null
      ? { id: tx.orderId, number: tx.orderNumber }
      : null;

  let tip: string | null = null;
  if (state === "matched" && tx.paymentId != null) {
    tip = copy.matchedPayment(tx.paymentId);
  } else if (state === "matched" && tx.expenseIds.length > 0) {
    tip = copy.matchedExpenseCount(formatCount(tx.expenseIds.length));
  } else if (tx.transferType === "in" && state !== "matched") {
    tip = hasPaymentConflictDetail
      ? null
      : reasonLabel(classifySepayUnmatchedMoneyIn(tx));
  }

  const statusBadge = (
    <StatusBadgeButton
      label={meta.label}
      variant={meta.variant}
      clickable={clickable}
    />
  );
  const badge =
    tip && !clickable ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex outline-none focus-visible:ring-1 focus-visible:ring-foreground" />
          }
        >
          {statusBadge}
        </TooltipTrigger>
        <TooltipContent side="top">{tip}</TooltipContent>
      </Tooltip>
    ) : (
      statusBadge
    );

  const matchControl = moneyInMatchable ? (
    <MatchPaymentSheet
      tx={tx}
      canLinkPayments={canLinkPayments}
      touch={touch}
      trigger={statusBadge}
    />
  ) : moneyOutMatchable ? (
    <MatchExpenseCell
      bankTransactionId={tx.bankTransactionId ?? null}
      eventId={tx.eventId}
      amount={tx.amount}
      paymentId={tx.paymentId}
      expenseIds={tx.expenseIds}
      supplierPaymentMatches={tx.supplierPaymentMatches}
      supplierPaymentMatchConfirmed={tx.supplierPaymentMatchConfirmed}
      refundMatches={tx.refundMatches}
      refundMatchConfirmed={tx.refundMatchConfirmed}
      transferType={tx.transferType}
      expenseOptions={expenseOptions}
      touch={touch}
      trigger={statusBadge}
      evidence={{
        content: tx.content,
        reference: referenceCode(tx),
        occurredAt: resolveSepayTransactionInstant(tx),
        accountNumber: tx.accountNumber,
      }}
    />
  ) : (
    badge
  );

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {matchControl}
      {conflictOrder ? (
        <Link
          href={`/orders?orderId=${String(conflictOrder.id)}`}
          className="truncate font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {conflictOrder.number ?? copy.unmatchedMoneyInTable.openConflictOrder}
        </Link>
      ) : null}
    </div>
  );
}

function bankRowNeedsHighlight(row: BankReconciliationRow): boolean {
  if (row.kind === "missing_webhook") {
    return isOpenSepayBankWebhookReview(row.payment.bankWebhookReviewStatus);
  }
  const state = classifySepayReconciliationState(row.tx);
  return state === "needs_review" || state === "webhook_error";
}

function rowOccurredAt(row: BankReconciliationRow): string | null {
  if (row.kind === "missing_webhook") {
    return row.payment.paidAt;
  }
  return resolveSepayTransactionInstant(row.tx);
}

function DateCell({ row }: { row: BankReconciliationRow }) {
  const instant = rowOccurredAt(row);
  const date = formatVNDate(instant);
  const time = formatVNTimeSeconds(instant);
  return (
    <time
      dateTime={instant ?? undefined}
      className="flex flex-col items-end gap-1 font-mono tabular-nums"
      title={formatVNDateTime(instant)}
    >
      <span className="text-sm text-foreground">{date}</span>
      <span className="text-xs text-muted-foreground">{time}</span>
    </time>
  );
}

function RowContentCell({ row }: { row: BankReconciliationRow }) {
  if (row.kind === "missing_webhook") {
    const content = `${copy.missingWebhookTable.payment} ${formatPaymentId(
      row.payment.paymentId,
    )}`;
    const reference = formatProviderRef(row.payment.providerRef);
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium">{content}</p>
        {reference !== "—" ? (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {reference}
          </span>
        ) : null}
      </div>
    );
  }

  const content = displayBankContent(row.tx.content);
  const reference = referenceCode(row.tx);
  const isLongContent = content.length > 80;
  const contentLabel = (
    <p className="line-clamp-2 text-sm font-medium">{content}</p>
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {isLongContent ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="min-w-0 outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                tabIndex={0}
              />
            }
          >
            {contentLabel}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm whitespace-normal">
            <p className="break-words font-medium">{content}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        contentLabel
      )}
      <span className="truncate font-mono text-xs text-muted-foreground">
        {reference}
      </span>
    </div>
  );
}

function ReviewStatusSelect({
  payment,
  touch,
}: {
  payment: SepayMissingBankWebhookPayment;
  touch: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const table = copy.missingWebhookTable;
  const value = payment.bankWebhookReviewStatus ?? REVIEW_PENDING_VALUE;

  const handleChange = (nextValue: string) => {
    if (!isReviewStatus(nextValue)) return;

    startTransition(async () => {
      const res = await reviewMissingBankWebhookPayment({
        paymentId: payment.paymentId,
        status: nextValue,
      });

      if (!res.success) {
        toast.error(res.error ?? table.reviewStatusError);
        return;
      }

      toast.success(table.reviewStatusSuccess);
      router.refresh();
    });
  };

  return (
    <Select value={value} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size={touch ? "touch" : "sm"} className="w-36">
        <SelectValue placeholder={table.reviewStatusPlaceholder} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem
          value={REVIEW_PENDING_VALUE}
          size={touch ? "touch" : "default"}
          disabled
        >
          {reviewStatusLabel(REVIEW_PENDING_VALUE)}
        </SelectItem>
        {SEPAY_BANK_WEBHOOK_REVIEW_VALUES.map((status) => (
          <SelectItem
            key={status}
            value={status}
            size={touch ? "touch" : "default"}
          >
            {reviewStatusLabel(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function rowMatchesFilter(
  row: BankReconciliationRow,
  filter: BankReconciliationFilter,
): boolean {
  if (filter === "all") return true;

  if (row.kind === "missing_webhook") {
    if (filter === "missing_webhook") return true;
    return (
      filter === "needs_review" &&
      isOpenSepayBankWebhookReview(row.payment.bankWebhookReviewStatus)
    );
  }

  const state = classifySepayReconciliationState(row.tx);

  if (filter === "needs_review") {
    return state === "needs_review";
  }
  if (filter === "matched") return state === "matched";
  if (filter === "webhook_error") return state === "webhook_error";
  if (filter === "money_in_review") {
    return row.tx.transferType === "in" && state === "needs_review";
  }
  if (filter === "money_out_review") {
    return row.tx.transferType === "out" && state === "needs_review";
  }

  return false;
}

export function BankTransactionsTable({
  params,
  transactions,
  missingBankWebhookPayments,
  expenseOptions,
  canLinkPayments,
}: BankTransactionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isFilterPending, startFilterTransition] = React.useTransition();
  const controlSize = useFormControlSize();
  const optionSize = controlSize === "touch" ? "touch" : "default";
  const isTouchLayout = controlSize === "touch";
  const filter = parseBankReconciliationFilter(
    searchParams.get(BANK_RECONCILIATION_FILTER_PARAM),
  );

  function setFilter(next: BankReconciliationFilter) {
    const usp = new URLSearchParams(searchParams.toString());
    if (next === BANK_RECONCILIATION_FILTER_DEFAULT) {
      usp.delete(BANK_RECONCILIATION_FILTER_PARAM);
    } else {
      usp.set(BANK_RECONCILIATION_FILTER_PARAM, next);
    }
    const qs = usp.toString();
    startFilterTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const rows = React.useMemo<BankReconciliationRow[]>(
    () => [
      ...transactions.map((tx) => ({ kind: "bank" as const, tx })),
      ...missingBankWebhookPayments.map((payment) => ({
        kind: "missing_webhook" as const,
        payment,
      })),
    ],
    [missingBankWebhookPayments, transactions],
  );
  const filteredRows = React.useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, filter)),
    [filter, rows],
  );
  const openQueueCount = React.useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, "needs_review")).length,
    [rows],
  );
  const hasRows = rows.length > 0;
  const isQueueView = filter === "needs_review";
  const filterOptions = [
    ["all", copy.filters.all],
    ["needs_review", copy.filters.needsReview],
    ["money_in_review", copy.filters.moneyInReview],
    ["money_out_review", copy.filters.moneyOutReview],
    ["missing_webhook", copy.filters.missingWebhook],
    ["matched", copy.filters.matched],
    ["webhook_error", copy.filters.webhookError],
  ] as const;
  const columns: DataTableColumn<BankReconciliationRow>[] = [
    {
      key: "date",
      header: copy.table.date,
      className: "w-28 text-right font-mono tabular-nums",
      render: (row) => <DateCell row={row} />,
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "w-32 text-right",
      render: (row) =>
        row.kind === "bank" ? (
          <AmountCell tx={row.tx} />
        ) : (
          <PaymentAmountCell payment={row.payment} />
        ),
    },
    {
      key: "content",
      header: copy.table.content,
      className: "min-w-48 whitespace-normal",
      render: (row) => <RowContentCell row={row} />,
    },
    {
      key: "status",
      header: copy.table.status,
      className: "w-36",
      render: (row) =>
        row.kind === "bank" ? (
          <BankRowStatus
            tx={row.tx}
            expenseOptions={expenseOptions}
            canLinkPayments={canLinkPayments}
            touch={isTouchLayout}
          />
        ) : (
          <MissingWebhookStatusCell
            payment={row.payment}
            touch={isTouchLayout}
          />
        ),
    },
  ];

  const table = (
    <DataTable
      columns={columns}
      data={filteredRows}
      getRowKey={(row) =>
        row.kind === "bank"
          ? `bank-${String(
              row.tx.bankTransactionId ?? row.tx.eventId ?? row.tx.requestId,
            )}`
          : `missing-${row.payment.paymentId}`
      }
      rowClassName={(row) =>
        bankRowNeedsHighlight(row) ? "border-l-2 border-l-warning" : undefined
      }
      emptyTitle={
        !hasRows
          ? copy.emptyTitle
          : isQueueView
            ? copy.queueEmptyTitle
            : copy.filteredEmptyTitle
      }
      emptyDescription={
        !hasRows
          ? copy.emptyDescription
          : isQueueView
            ? copy.queueEmptyDescription
            : copy.filteredEmptyDescription
      }
      emptyMode={hasRows ? "no-results" : "no-data"}
      className="[&_table]:table-fixed"
      mobileBreakpoint={1024}
      mobileCardRender={(row) => (
        <Item
          variant="outline"
          className={cn(
            bankRowNeedsHighlight(row) && "border-l-2 border-l-warning",
          )}
        >
          <ItemHeader>
            <ItemContent className="min-w-0">
              <ItemTitle className="line-clamp-2">
                {rowPrimaryLabel(row)}
              </ItemTitle>
              <ItemDescription>{rowSecondaryLabel(row)}</ItemDescription>
            </ItemContent>
            {row.kind === "bank" ? (
              <AmountCell tx={row.tx} />
            ) : (
              <PaymentAmountCell payment={row.payment} />
            )}
          </ItemHeader>
          <ItemFooter className="items-center justify-between gap-2">
            {row.kind === "bank" ? (
              <BankRowStatus
                tx={row.tx}
                expenseOptions={expenseOptions}
                canLinkPayments={canLinkPayments}
                touch={isTouchLayout}
              />
            ) : (
              <MissingWebhookStatusCell
                payment={row.payment}
                touch={isTouchLayout}
              />
            )}
          </ItemFooter>
        </Item>
      )}
    />
  );

  return (
    <AppListFrame
      title={copy.listTitle}
      contentScroll
      toolbar={
        <FilterBar
          variant="inline"
          params={params}
          branches={[]}
          basePath="/finance/bank-transactions"
          hide={["branch", "granularity", "compare"]}
          trailing={
            <>
              <span className="text-xs text-muted-foreground">
                {copy.queueCount(formatCount(openQueueCount))}
              </span>
              <Select
                value={filter}
                disabled={isFilterPending}
                onValueChange={(value) => {
                  if (isBankReconciliationFilter(value)) setFilter(value);
                }}
              >
                <SelectTrigger
                  size={controlSize}
                  className={financeFilterReconTriggerClassName}
                  aria-label={copy.filters.label}
                >
                  <SelectValue placeholder={copy.filters.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value} size={optionSize}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
      }
    >
      {table}
    </AppListFrame>
  );
}
